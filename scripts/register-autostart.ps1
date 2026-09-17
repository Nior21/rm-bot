# Автозапуск RM Bot при входе в Windows + перезапуск после сбоя (watchdog)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Watchdog = Join-Path $ProjectRoot "scripts\run-bot-watchdog.ps1"

if (-not (Test-Path (Join-Path $ProjectRoot "dist\server\index.js"))) {
  Write-Host "Сначала: cd $ProjectRoot && npm run build"
  exit 1
}

$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Watchdog`"" `
  -WorkingDirectory $ProjectRoot

$TriggerLogon = New-ScheduledTaskTrigger -AtLogOn
$TriggerBoot = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "RMBot" -Action $Action -Trigger @($TriggerLogon, $TriggerBoot) -Settings $Settings -Force -RunLevel Highest

Write-Host "Задача RMBot: watchdog при входе и после загрузки Windows."
Write-Host "Лог: $ProjectRoot\data\logs\watchdog.log"
