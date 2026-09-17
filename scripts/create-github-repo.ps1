# Создать репозиторий github.com/Nior21/rm-bot и отправить код
# Нужен GitHub Personal Access Token (repo): один раз в .env → GITHUB_TOKEN=ghp_...
param(
  [string]$RepoName = "rm-bot",
  [string]$Owner = "Nior21"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$token = $env:GITHUB_TOKEN
if (-not $token -and (Test-Path "$Root\.env")) {
  Get-Content "$Root\.env" | ForEach-Object {
    if ($_ -match '^\s*GITHUB_TOKEN=(.+)$') { $token = $matches[1].Trim().Trim('"') }
  }
}
if (-not $token) {
  Write-Host "Добавьте в .env: GITHUB_TOKEN=ghp_... (classic, scope repo)"
  exit 1
}

$headers = @{
  Authorization = "Bearer $token"
  Accept        = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
}

$body = @{
  name        = $RepoName
  description = "Telegram RM bot + admin UI"
  private     = $true
} | ConvertTo-Json

try {
  Invoke-RestMethod -Method Post -Uri "https://api.github.com/user/repos" -Headers $headers -Body $body -ContentType "application/json" | Out-Null
  Write-Host "Repo created: https://github.com/$Owner/$RepoName"
} catch {
  if ($_.Exception.Message -notmatch "name already exists") {
    throw
  }
  Write-Host "Repo already exists, pushing..."
}

if (-not (git rev-parse HEAD 2>$null)) {
  Write-Host "No commits — run git add && git commit first"
  exit 1
}

$remote = "https://github.com/$Owner/$RepoName.git"
git remote remove origin 2>$null
git remote add origin $remote

$env:GIT_TERMINAL_PROMPT = "0"
$pair = "x-access-token:$token"
$b64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
git -c "http.extraHeader=Authorization: Basic $b64" push -u origin main

Write-Host "Done. Set CURSOR_REPO_URL=https://github.com/$Owner/$RepoName in .env"
