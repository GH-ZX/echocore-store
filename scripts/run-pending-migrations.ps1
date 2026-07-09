# Run pending Supabase SQL migrations against the linked project.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$migrations = @(
  'supabase_game_regions_migration.sql',
  'supabase_g2bulk_live_catalog_migration.sql',
  'supabase_catalog_segments_migration.sql'
)

foreach ($file in $migrations) {
  if (-not (Test-Path $file)) {
    Write-Warning "Skip missing: $file"
    continue
  }
  Write-Host "Running $file ..."
  supabase db query --linked -f $file
  if ($LASTEXITCODE -ne 0) {
    throw "Failed: $file (exit $LASTEXITCODE)"
  }
  Write-Host "OK: $file"
}

Write-Host 'All migrations completed.'