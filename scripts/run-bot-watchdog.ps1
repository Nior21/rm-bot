# Держит RM Bot запущенным: перезапуск после сбоя
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

$LogDir = Join-Path $ProjectRoot "data\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "watchdog.log"

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

if (-not (Test-Path (Join-Path $ProjectRoot "dist\server\index.js"))) {
  Write-Log "dist missing, running npm run build..."
  npm run build 2>&1 | Out-File -Append (Join-Path $LogDir "build.log")
}

$Node = (Get-Command node).Source
Write-Log "Watchdog started in $ProjectRoot"

while ($true) {
  Write-Log "Starting node dist/server/index.js"
  $p = Start-Process -FilePath $Node -ArgumentList "dist/server/index.js" -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow -Wait
  $code = $p.ExitCode
  Write-Log "Process exited with code $code, restart in 10s"
  Start-Sleep -Seconds 10
}
