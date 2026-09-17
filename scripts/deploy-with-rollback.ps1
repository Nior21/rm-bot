# Минимальный деплой на ноутбук: сборка, health-check, откат при сбое
param(
  [string]$HealthUrl = "http://127.0.0.1:3847/api/health",
  [int]$FeedbackId = 0
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$prev = git rev-parse HEAD
Write-Host "Deploy from $prev"

npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

# перезапуск процесса — предполагается внешний supervisor или ручной restart
# здесь только проверка health после того как сервер поднят с новой версией
Start-Sleep -Seconds 3
try {
  $r = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
  if (-not $r.ok) { throw "health not ok" }
  Write-Host "Deploy OK"
  exit 0
} catch {
  Write-Host "Health failed, rollback to $prev"
  git checkout $prev
  npm run build
  if ($FeedbackId -gt 0) {
    Write-Host "Comment feedback ticket $FeedbackId — deploy failed, continue work"
  }
  exit 1
}
