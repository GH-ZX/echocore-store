# Full G2Bulk catalog sync via edge function.
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
  $json = $body | ConvertTo-Json -Compress -Depth 6
  $response = Invoke-RestMethod -Uri $baseUrl -Method POST -Headers $headers -Body $json
  if ($response.success -eq $false) {
    $msg = if ($response.message) { $response.message } else { 'G2Bulk request failed' }
    throw $msg
  }
  return $response
}

Write-Host 'G2Bulk sync: init...' -ForegroundColor Cyan
$init = Invoke-G2bulk @{ action = 'syncCatalog'; phase = 'init'; hideManual = $true }
$total = if ($null -ne $init.totalGames) { [int]$init.totalGames } else { 0 }
Write-Host "Total games to sync: $total"

$offset = 0
while ($offset -lt $total) {
  Write-Host "Syncing games $offset / $total ..."
  $batch = Invoke-G2bulk @{
    action = 'syncCatalog'
    phase = 'games'
    offset = $offset
    limit = $batchSize
  }
  if ($batch.errors -and $batch.errors.Count -gt 0) {
    Write-Warning ("Batch $offset errors: " + ($batch.errors -join '; '))
  }
  if ($null -ne $batch.nextOffset) {
    $offset = [int]$batch.nextOffset
  } else {
    $offset = $offset + $batchSize
  }
  if ($batch.gamesDone) { break }
}

Write-Host 'G2Bulk sync: vouchers...' -ForegroundColor Cyan
$vouchers = Invoke-G2bulk @{ action = 'syncCatalog'; phase = 'vouchers' }
Write-Host ("Vouchers games: {0} offers: {1}" -f $vouchers.gamesSynced, $vouchers.offersSynced)

Write-Host 'G2Bulk sync: finalize...' -ForegroundColor Cyan
$done = Invoke-G2bulk @{ action = 'syncCatalog'; phase = 'finalize' }
Write-Host ("Done at {0}. Carousel games: {1}" -f $done.syncedAt, $done.carouselGames) -ForegroundColor Green