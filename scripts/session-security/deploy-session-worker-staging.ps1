param(
  [Parameter(Mandatory = $true)]
  [string]$AllowedOrigins,

  [ValidateSet('false', 'true')]
  [string]$EnforceReplayProtection = 'false'
)

$ErrorActionPreference = 'Stop'
$workerPath = "cloudflare/session-worker"

if (-not (Test-Path $workerPath)) {
  throw "Worker path not found: $workerPath"
}

Write-Host "Deploying session worker to staging with explicit vars..." -ForegroundColor Cyan
Push-Location $workerPath
try {
  npx wrangler deploy --env staging --var "CORS_ALLOWED_ORIGINS=$AllowedOrigins" --var "ENFORCE_HEARTBEAT_REPLAY_PROTECTION=$EnforceReplayProtection"
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler deploy failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

Write-Host "Session worker staging deploy completed." -ForegroundColor Green
