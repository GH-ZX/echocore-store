# Fresh start: ensure schema, optional data wipe, deploy g2bulk, full sync
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

Write-Host 'Applying supabase_echocore_full.sql ...'
supabase db query --linked -f supabase_echocore_full.sql
if ($LASTEXITCODE -ne 0) { throw 'Schema apply failed' }

Write-Host @'

To wipe catalog/orders (DESTRUCTIVE): open supabase_echocore_full.sql in SQL Editor,
uncomment section A at the bottom, run only that block.

'@ -ForegroundColor Yellow

Write-Host 'Deploying g2bulk edge function...'
supabase functions deploy g2bulk --project-ref uaiirtgzqtnrvcrlxstg
if ($LASTEXITCODE -ne 0) { throw 'Deploy failed' }

Write-Host 'Running full G2Bulk sync...'
& "$PSScriptRoot\run-full-g2bulk-sync.ps1"

Write-Host 'Fresh start pipeline complete.' -ForegroundColor Green