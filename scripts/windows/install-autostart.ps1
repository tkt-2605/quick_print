# Registers two Windows scheduled tasks that start the QuickPrint server and print agent
# (hidden, auto-restarting) whenever this user logs in.
#   Install:  powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
#   Remove:   powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Remove
param([switch]$Remove)

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$runner = Join-Path $root 'scripts\windows\run.ps1'

foreach ($app in 'server', 'agent') {
  $name = "QuickPrint $app"
  if ($Remove) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed $name"
    continue
  }
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -App $app" `
    -WorkingDirectory $root
  # Runs in the logged-in user's session so the agent sees the same printers as the user.
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Start-ScheduledTask -TaskName $name
  Write-Host "Installed and started $name"
}

if (-not $Remove) {
  Write-Host ''
  Write-Host "Logs: $root\data\logs"
  Write-Host 'Check: http://localhost:4000/api/status'
}
