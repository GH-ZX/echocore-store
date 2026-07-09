# G2Bulk catalog check (diff vs live API) via edge function.
# Auth: G2BULK_CRON_SECRET header OR Supabase service_role bearer.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$projectRef = 'uaiirtgzqtnrvcrlxstg'
$batchSize = 32
$baseUrl = "https://$projectRef.supabase.co/functions/v1/g2bulk"

$anonKey = $null
$serviceRole = $env:SUPABASE_SERVICE_ROLE_KEY
$keysJson = supabase projects api-keys --project-ref $projectRef -o json 2>$null
if ($LASTEXITCODE -eq 0 -and $keysJson) {
  $keys = $keysJson | ConvertFrom-Json
  if (-not $serviceRole) {
    $match = $keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1
    if ($match) { $serviceRole = $match.api_key }
  }
  $anonMatch = $keys | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1
  if ($anonMatch) { $anonKey = $anonMatch.api_key }
}

if (-not $serviceRole) {
  throw 'Could not resolve SUPABASE_SERVICE_ROLE_KEY'
}
if (-not $anonKey) {
  throw 'Could not resolve anon API key'
}

$headers = @{
  'Content-Type' = 'application/json'
  'Authorization' = "Bearer $serviceRole"
  'apikey' = $anonKey
}
if ($env:G2BULK_CRON_SECRET) {
  $headers['x-g2bulk-cron-secret'] = $env:G2BULK_CRON_SECRET
}

function Invoke-G2bulk($body) {
  $json = $body | ConvertTo-Json -Compress -Depth 8
  $response = Invoke-RestMethod -Uri $baseUrl -Method POST -Headers $headers -Body $json
  if ($response.success -eq $false) {
    $msg = if ($response.message) { $response.message } else { 'G2Bulk request failed' }
    throw $msg
  }
  return $response
}

Write-Host 'G2Bulk check: init...' -ForegroundColor Cyan
$init = Invoke-G2bulk @{ action = 'checkCatalog'; phase = 'init' }
$total = if ($null -ne $init.totalGames) { [int]$init.totalGames } else { 0 }
Write-Host ("New games: {0}  Removed games: {1}  Total to scan: {2}" -f $init.newGames, $init.removedGames, $total)

$offset = 0
$gamesTotals = @{
  newGames = 0; removedGames = 0; newOffers = 0; priceChanges = 0
  removedOffers = 0; stockChanges = 0; unchangedOffers = 0
}
$gamesSamples = @{ priceChanges = @(); newOffers = @(); removedOffers = @() }

while ($offset -lt $total) {
  Write-Host "Checking games $offset / $total ..."
  $batch = Invoke-G2bulk @{
    action = 'checkCatalog'
    phase = 'games'
    offset = $offset
    limit = $batchSize
  }
  foreach ($key in @('newGames', 'removedGames', 'newOffers', 'priceChanges', 'removedOffers', 'stockChanges', 'unchangedOffers')) {
    if ($null -ne $batch.$key) {
      $gamesTotals[$key] = $gamesTotals[$key] + [int]$batch.$key
    }
  }
  if ($null -ne $batch.nextOffset) {
    $offset = [int]$batch.nextOffset
  } else {
    $offset = $offset + $batchSize
  }
  if ($batch.gamesDone) { break }
}

Write-Host 'G2Bulk check: vouchers...' -ForegroundColor Cyan
$vouchers = Invoke-G2bulk @{ action = 'checkCatalog'; phase = 'vouchers' }

Write-Host 'G2Bulk check: finalize...' -ForegroundColor Cyan
$done = Invoke-G2bulk @{
  action = 'checkCatalog'
  phase = 'finalize'
  initTotals = @{
    newGames = $init.newGames; removedGames = $init.removedGames
    newOffers = 0; priceChanges = 0; removedOffers = 0; stockChanges = 0; unchangedOffers = 0; errors = @()
  }
  gamesTotals = $gamesTotals
  vouchersTotals = @{
    newGames = $vouchers.newGames; removedGames = $vouchers.removedGames
    newOffers = $vouchers.newOffers; priceChanges = $vouchers.priceChanges
    removedOffers = $vouchers.removedOffers; stockChanges = $vouchers.stockChanges
    unchangedOffers = $vouchers.unchangedOffers; errors = @()
  }
  initSamples = $init.samples
  gamesSamples = $gamesSamples
  vouchersSamples = $vouchers.samples
}

$summary = $done.summary
Write-Host ("Checked at {0}" -f $done.checkedAt) -ForegroundColor Green
Write-Host ("Summary: newGames={0} removedGames={1} newOffers={2} priceChanges={3} removedOffers={4} stockChanges={5}" -f `
  $summary.newGames, $summary.removedGames, $summary.newOffers, $summary.priceChanges, $summary.removedOffers, $summary.stockChanges)