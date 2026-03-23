param(
    [string]$WorkerDir = "cloudflare-worker/sync-health"
)

$ErrorActionPreference = "Stop"

function ConvertTo-PlainText([System.Security.SecureString]$secure) {
    if ($null -eq $secure) { return "" }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

function Set-WorkerSecret([string]$name, [string]$workerPath) {
    Write-Host "Enter value for $name" -ForegroundColor Cyan
    $secure = Read-Host -AsSecureString
    $value = ConvertTo-PlainText $secure

    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-Warning "Skipped $name because value is empty."
        return
    }

    $cmd = "Push-Location '$workerPath'; `$input | npx wrangler secret put $name; Pop-Location"
    $value | powershell -NoProfile -Command $cmd | Out-Null
    Write-Host "Set secret: $name" -ForegroundColor Green
}

$root = Split-Path -Parent $PSScriptRoot
$workerPath = Join-Path $root $WorkerDir

if (-not (Test-Path $workerPath)) {
    throw "Worker directory not found: $workerPath"
}

Push-Location $workerPath
try {
    npx wrangler whoami | Out-Null
}
finally {
    Pop-Location
}

Set-WorkerSecret -name "SUPABASE_URL" -workerPath $workerPath
Set-WorkerSecret -name "SUPABASE_SERVICE_ROLE_KEY" -workerPath $workerPath
Set-WorkerSecret -name "OPS_INTERNAL_KEY" -workerPath $workerPath

Push-Location $workerPath
try {
    Write-Host "Configured secrets:" -ForegroundColor Cyan
    npx wrangler secret list
}
finally {
    Pop-Location
}

Write-Host "Done. You can now test the worker endpoint /run-sync-health." -ForegroundColor Green
