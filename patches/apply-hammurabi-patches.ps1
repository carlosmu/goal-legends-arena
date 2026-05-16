# Re-applies the Hammurabi preview patches after npm install / SDK upgrade.
# Run from the repo root:  .\patches\apply-hammurabi-patches.ps1
# See: docs/2026-05-15_Hammurabi_Fix_Recovery.md

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

$launcherDst = Join-Path $repoRoot 'node_modules\@dcl\sdk-commands\dist\commands\start\hammurabi-server.js'
$loginDst    = Join-Path $repoRoot 'hammurabi-test\node_modules\@dcl\hammurabi-server\dist\lib\decentraland\identity\login.js'

$launcherSrc = Join-Path $PSScriptRoot 'hammurabi-server.launcher.js'
$loginSrc    = Join-Path $PSScriptRoot 'hammurabi-server.login.js'

Write-Host '== Hammurabi patch re-apply =='

# 1) Ensure hammurabi-test deps exist
if (-not (Test-Path (Join-Path $repoRoot 'hammurabi-test\node_modules'))) {
    Write-Host '[1/3] Installing hammurabi-test dependencies...'
    Push-Location (Join-Path $repoRoot 'hammurabi-test')
    try { npm install } finally { Pop-Location }
} else {
    Write-Host '[1/3] hammurabi-test/node_modules present - skipping install.'
}

# 2) Patch the sdk-commands launcher (gets wiped on root npm install)
if (-not (Test-Path (Split-Path $launcherDst))) {
    throw "sdk-commands not installed at expected path: $launcherDst"
}
Write-Host '[2/3] Copying patched launcher -> node_modules/@dcl/sdk-commands/...'
Copy-Item $launcherSrc $launcherDst -Force

# 3) Patch the hammurabi-server login.js (gets wiped on hammurabi-test reinstall)
if (-not (Test-Path (Split-Path $loginDst))) {
    throw "hammurabi-server not installed at expected path: $loginDst"
}
Write-Host '[3/3] Copying patched login.js -> hammurabi-test/.../identity/login.js...'
Copy-Item $loginSrc $loginDst -Force

Write-Host ''
Write-Host 'Done. Run "npm start" and look for:'
Write-Host '  [PATCH] Using local hammurabi-test at ...\dist\cli.js'
