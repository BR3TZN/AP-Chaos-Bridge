$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $PSScriptRoot
$bridgePort = 17381
if ($env:AP_BRIDGE_PORT) { $bridgePort = [int]$env:AP_BRIDGE_PORT }
$bridgeUrl = "http://127.0.0.1:$bridgePort"
function Test-Bridge {
    try {
        $bridgeState = Invoke-RestMethod -Uri "$bridgeUrl/api/state" -TimeoutSec 1
        return $bridgeState.name -eq 'AP Chaos Bridge'
    } catch { return $false }
}
if (Test-Bridge) { Start-Process $bridgeUrl; exit 0 }
$bridgeNode = (Get-Command node.exe).Source
$bridgeServer = Join-Path $bridgeRoot 'server.mjs'
$bridgeData = Join-Path $bridgeRoot 'data'
New-Item -ItemType Directory -Force -Path $bridgeData | Out-Null
Start-Process -FilePath $bridgeNode -ArgumentList @("`"$bridgeServer`"") -WorkingDirectory $bridgeRoot -WindowStyle Minimized -RedirectStandardOutput (Join-Path $bridgeData 'start.log') -RedirectStandardError (Join-Path $bridgeData 'error.log') | Out-Null
for ($bridgeAttempt = 0; $bridgeAttempt -lt 40; $bridgeAttempt++) {
    if (Test-Bridge) { Start-Process $bridgeUrl; exit 0 }
    Start-Sleep -Milliseconds 200
}
Write-Host 'Die Bridge konnte nicht starten. Details stehen in data\error.log.'
exit 1
