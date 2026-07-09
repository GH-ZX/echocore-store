# Apply full ECHOCORE schema to the linked Supabase project.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$file = 'supabase_echocore_full.sql'
if (-not (Test-Path $file)) {
  throw "Missing $file — run from repo root."
}

Write-Host "Running $file ..."
supabase db query --linked -f $file
if ($LASTEXITCODE -ne 0) {
  throw "Failed: $file (exit $LASTEXITCODE)"
}

Write-Host 'Schema setup complete.'