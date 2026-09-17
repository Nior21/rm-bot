$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$port = 3847
if (Test-Path "$Root\.env") {
  $line = Get-Content "$Root\.env" | Where-Object { $_ -match '^WEB_PORT=' } | Select-Object -First 1
  if ($line -match '^WEB_PORT=(\d+)') { $port = [int]$matches[1] }
}

$uri = "http://127.0.0.1:$port/"
try {
  $null = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2
} catch {
  Write-Host "Сервер не отвечает на $uri — запустите: npm start"
  exit 1
}

Start-Process $uri
Write-Host "Открыто: $uri"
