# Grava CIOP_GITHUB_TOKEN em incidentes.env (para git push as 04:00 sem login).
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$StateDir = Join-Path $env:USERPROFILE '.config\ciop-portal'
$EnvFile = Join-Path $StateDir 'incidentes.env'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

Write-Host ""
Write-Host "1) Abra o GitHub e crie um token com permissao 'repo':"
Write-Host "   https://github.com/settings/tokens/new?scopes=repo&description=CIOP+Portal+Incidentes"
Write-Host ""
Start-Process "https://github.com/settings/tokens/new?scopes=repo&description=CIOP+Portal+Incidentes"

$token = Read-Host "2) Cole o token (ghp_...) e pressione Enter"
$token = $token.Trim()
if (-not $token) {
    Write-Error "Token vazio."
}

$lines = @()
if (Test-Path $EnvFile) {
    $lines = Get-Content $EnvFile | Where-Object { $_ -notmatch '^\s*CIOP_GITHUB_TOKEN\s*=' }
}
$lines += "CIOP_GITHUB_TOKEN=$token"
Set-Content -Path $EnvFile -Value $lines -Encoding UTF8

Write-Host ""
Write-Host "Token salvo em: $EnvFile" -ForegroundColor Green
Write-Host "Testando push no portal-teste..."

& (Join-Path (Split-Path $MyInvocation.MyCommand.Path) 'executar-atualizacao-incidentes.ps1') manual
