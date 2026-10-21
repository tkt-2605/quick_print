# Keeps the QuickPrint server or print agent running, restarting it if it crashes.
# Logs go to data\logs\<app>-<date>.log. Started at login by install-autostart.ps1.
param(
  [Parameter(Mandatory = $true)][ValidateSet('server', 'agent')][string]$App
)

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$logDir = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$entry = if ($App -eq 'server') { 'apps\server\src\index.js' } else { 'apps\agent\src\index.js' }
Set-Location $root

while ($true) {
  $log = Join-Path $logDir "$App-$(Get-Date -Format yyyy-MM-dd).log"
  Add-Content -Encoding utf8 $log "==== starting $App $(Get-Date)"
  cmd /c "node --disable-warning=ExperimentalWarning $entry >> `"$log`" 2>&1"
  Add-Content -Encoding utf8 $log "==== $App exited with code $LASTEXITCODE at $(Get-Date); restarting in 5 s"
  Start-Sleep -Seconds 5
}
