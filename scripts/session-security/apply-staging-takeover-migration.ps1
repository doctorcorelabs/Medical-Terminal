param(
  [Parameter(Mandatory = $true)]
  [string]$DbUrl,

  [string]$SqlFile = "migration_exclusive_session_v1.sql"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $SqlFile)) {
  throw "SQL file not found: $SqlFile"
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  throw "psql is required but not found in PATH. Install PostgreSQL client tools first."
}

Write-Host "Applying migration to staging using psql..." -ForegroundColor Cyan
& psql "$DbUrl" -v ON_ERROR_STOP=1 -f "$SqlFile"

if ($LASTEXITCODE -ne 0) {
  throw "Migration failed with exit code $LASTEXITCODE"
}

Write-Host "Migration applied successfully." -ForegroundColor Green
