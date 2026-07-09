# Fresh start: run migrations + wipe data + deploy g2bulk + optional full sync
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$migrations = @(
  'supabase_game_regions_migration.sql',
  'supabase_g2bulk_live_catalog_migration.sql',
  'supabase_catalog_segments_migration.sql',
  'supabase_g2bulk_check_migration.sql',
  'supabase_fresh_start_migration.sql'
)

foreach ($file in $migrations) {
  if (-not (Test-Path $file)) {
    Write-Warning "Skip missing: $file"
    continue
  }
  Write-Host "Running $file ..."
  supabase db query --linked -f $file
  if ($LASTEXITCODE -ne 0) { throw "Failed: $file" }
  Write-Host "OK: $file"
}

Write-Host 'Deploying g2bulk edge function...'
supabase functions deploy g2bulk --project-ref uaiirtgzqtnrvcrlxstg
if ($LASTEXITCODE -ne 0) { throw 'Deploy failed' }

Write-Host 'Running full G2Bulk sync...'
& "$PSScriptRoot\run-full-g2bulk-sync.ps1"

Write-Host 'Fresh start pipeline complete.' -ForegroundColor Green