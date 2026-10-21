# Keeps the QuickPrint server, print agent or Cloudflare tunnel running, restarting it if it crashes.
# Logs go to data\logs\<app>-<date>.log. Started at login by install-autostart.ps1.
param(
  [Parameter(Mandatory = $true)][ValidateSet('server', 'agent', 'tunnel')][string]$App
)

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$logDir = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
Set-Location $root

switch ($App) {
  'server' { $cmd = 'node --disable-warning=ExperimentalWarning apps\server\src\index.js' }
  'agent' { $cmd = 'node apps\agent\src\index.js' }
  'tunnel' {
    # Tunnel settings live in %USERPROFILE%\.cloudflared\config.yml (see docs/GO-LIVE.md)
    $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
    if (-not $cf) { $cf = Join-Path $env:LOCALAPPDATA 'cloudflared\cloudflared.exe' }
    $cmd = "`"$cf`" tunnel run"
  }
}

while ($true) {
  $log = Join-Path $logDir "$App-$(Get-Date -Format yyyy-MM-dd).log"
  Add-Content -Encoding utf8 $log "==== starting $App $(Get-Date)"
  cmd /c "$cmd >> `"$log`" 2>&1"
  Add-Content -Encoding utf8 $log "==== $App exited with code $LASTEXITCODE at $(Get-Date); restarting in 5 s"
  Start-Sleep -Seconds 5
}
