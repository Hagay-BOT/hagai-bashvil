# Connects the site to a new Supabase project. Run once, by Hagai, in a normal PowerShell window:
#   cd "C:\Users\03hag\Claude projects\hagai-bashvil"; powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
# Before: create a NEW Supabase project (not the 800+ one) and run:  npx supabase login
# Secrets never leave this window: keys go straight into GitHub/Supabase, passwords are typed here.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$ref = Read-Host 'Project ref (the short id in the project URL)'
if (-not (Test-Path supabase\config.toml)) { npx supabase init --force | Out-Null }
npx supabase link --project-ref $ref

Copy-Item data-private\stage_names.sql supabase\seed.sql -Force
npx supabase db push --include-seed
Remove-Item supabase\seed.sql

$keys = npx supabase projects api-keys --project-ref $ref -o json | ConvertFrom-Json
$anon = ($keys | Where-Object { $_.name -eq 'anon' }).api_key
$service = ($keys | Where-Object { $_.name -eq 'service_role' }).api_key
$url = "https://$ref.supabase.co"

gh variable set SUPABASE_URL --body $url
gh variable set SUPABASE_ANON_KEY --body $anon
$service | gh secret set SUPABASE_SERVICE_ROLE_KEY

$bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
npx supabase secrets set INGEST_TOKEN=$token START_DATE=2026-10-05 --project-ref $ref
npx supabase functions deploy ingest --no-verify-jwt --project-ref $ref

Write-Host "`nAdmin login for the phone (a new user just for this site)"
$email = Read-Host 'Email'
$pw = Read-Host 'Password' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
$h = @{ apikey = $service; Authorization = "Bearer $service"; 'Content-Type' = 'application/json' }
$user = Invoke-RestMethod -Method Post -Uri "$url/auth/v1/admin/users" -Headers $h -Body (@{ email = $email; password = $plain; email_confirm = $true } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$url/rest/v1/admins" -Headers $h -Body (@{ uid = $user.id } | ConvertTo-Json) | Out-Null
$plain = $null

$g = Read-Host 'Connect Garmin steps now? (y/n)'
if ($g -eq 'y') { gh secret set GARMIN_EMAIL; gh secret set GARMIN_PASSWORD; gh variable set GARMIN_ENABLED --body true }

gh workflow run deploy.yml
Write-Host "`n=== Done ==="
Write-Host "Overland > Settings > Receiver Endpoint:"
Write-Host "  $url/functions/v1/ingest?token=$token"
Write-Host "Admin page (add to the iPhone home screen): https://hagay-bot.github.io/hagai-bashvil/admin.html"
