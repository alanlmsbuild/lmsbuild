# Creates (or replaces) the Windows scheduled task "Rarebit jobs", which
# starts one scheduler tick (npm run jobs) in WSL every 15 minutes, at log
# on, and on unlocking the laptop. See docs/scheduling.md.
#
# Run in PowerShell (not as administrator), as yourself:
#   powershell -ExecutionPolicy Bypass -File \\wsl.localhost\Ubuntu\home\alanlmsbuild\my-react-app\scripts\windows\install-jobs-task.ps1
# Add -DryRun to build everything and print it without creating the task.
#
# The task:
#   - runs hidden: wscript.exe with run-jobs-hidden.js (copied to
#     %LOCALAPPDATA%\Rarebit), so no window flashes up
#   - runs on battery as well as mains power, and keeps going if the
#     charger is unplugged
#   - catches up after sleep or shutdown ("run as soon as possible after a
#     missed start"); the tick then runs each overdue job once
#   - never starts a second copy while one is running
#   - only runs while you're logged on, and never wakes the laptop
param(
  [string]$Distro = 'Ubuntu',
  [string]$LinuxUser = 'alanlmsbuild',
  [string]$Launcher = '/home/alanlmsbuild/my-react-app/scripts/run-jobs.sh',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$TaskName = 'Rarebit jobs'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dir = Join-Path $env:LOCALAPPDATA 'Rarebit'
$Script = Join-Path $Dir 'run-jobs-hidden.js'
$Me = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wscript.exe" `
  -Argument "`"$Script`" $Distro $LinuxUser $Launcher"

# Every 15 minutes from now, indefinitely; at log on; on unlocking.
$every15 = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)
$atLogOn = New-ScheduledTaskTrigger -AtLogOn -User $Me
$unlockClass = Get-CimClass -Namespace 'Root/Microsoft/Windows/TaskScheduler' -ClassName 'MSFT_TaskSessionStateChangeTrigger'
$onUnlock = New-CimInstance -CimClass $unlockClass -ClientOnly -Property @{ StateChange = 8; UserId = $Me } # 8: session unlock

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$principal = New-ScheduledTaskPrincipal -UserId $Me -LogonType Interactive -RunLevel Limited

$task = New-ScheduledTask -Action $action -Trigger @($every15, $atLogOn, $onUnlock) -Settings $settings -Principal $principal `
  -Description 'Rarebit background jobs (vacancies, Companies House, Skills England): one scheduler tick in WSL. docs/scheduling.md in the repo.'

if ($DryRun) {
  "Would copy $Here\run-jobs-hidden.js to $Script"
  "Would create task '$TaskName' for $Me"
  "  runs: $($action.Execute) $($action.Arguments)"
  "  triggers: every 15 minutes; at log on; on unlock"
  "  on battery: starts $(-not $settings.DisallowStartIfOnBatteries), stops when unplugged $($settings.StopIfGoingOnBatteries)"
  "  catches up after a missed start: $($settings.StartWhenAvailable); second copy: $($settings.MultipleInstances); time limit: $($settings.ExecutionTimeLimit)"
  "  logon: $($principal.LogonType), run level $($principal.RunLevel)"
  exit 0
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Copy-Item -Force (Join-Path $Here 'run-jobs-hidden.js') $Script
Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
"Created '$TaskName'. Next run: $((Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime)"
