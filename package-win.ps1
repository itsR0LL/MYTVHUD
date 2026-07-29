[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdministrator = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdministrator) {
    Write-Host 'Administrator permission is required for electron-builder symbolic links.' -ForegroundColor Yellow
    Write-Host 'Approve the Windows UAC prompt to continue.' -ForegroundColor Yellow

    $powerShellPath = Join-Path $PSHOME 'powershell.exe'
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath
    $elevatedProcess = Start-Process -FilePath $powerShellPath -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    exit $elevatedProcess.ExitCode
}

Set-Location -LiteralPath $PSScriptRoot

$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

$failedWinCodeSignCachePath = 'C:\Users\R0L1_\AppData\Local\electron-builder\Cache\winCodeSign'
$failedWinCodeSignArchivePath = Join-Path $failedWinCodeSignCachePath '163646911.7z'

if (Test-Path -LiteralPath $failedWinCodeSignArchivePath) {
    Write-Host 'Removing the failed winCodeSign cache from the previous run...' -ForegroundColor Cyan
    Remove-Item -LiteralPath $failedWinCodeSignCachePath -Recurse -Force
}

if (-not (Test-Path -LiteralPath '.\node_modules')) {
    throw 'node_modules was not found. Run pnpm install first.'
}

if (-not (Test-Path -LiteralPath '.\node_modules\electron\dist\electron.exe')) {
    Write-Host 'Downloading Electron...' -ForegroundColor Cyan
    & node '.\node_modules\electron\install.js'
    if ($LASTEXITCODE -ne 0) {
        throw 'Electron installation failed.'
    }
}

Write-Host 'Checking Electron main process...' -ForegroundColor Cyan
& '.\node_modules\.bin\tsc.cmd' --noEmit -p 'tsconfig.node.json' --composite false
if ($LASTEXITCODE -ne 0) {
    throw 'Electron main process typecheck failed.'
}

Write-Host 'Checking renderer process...' -ForegroundColor Cyan
& '.\node_modules\.bin\vue-tsc.cmd' --noEmit -p 'tsconfig.web.json' --composite false
if ($LASTEXITCODE -ne 0) {
    throw 'Renderer process typecheck failed.'
}

Write-Host 'Building MYTVHUD Manager...' -ForegroundColor Cyan
& '.\node_modules\.bin\electron-vite.cmd' build
if ($LASTEXITCODE -ne 0) {
    throw 'Application build failed.'
}

Write-Host 'Creating Windows installer. The first run may download packaging tools...' -ForegroundColor Cyan
& '.\node_modules\.bin\electron-builder.cmd' --win nsis
if ($LASTEXITCODE -ne 0) {
    throw 'Windows installer build failed.'
}

$packageInfo = Get-Content -LiteralPath '.\package.json' -Raw | ConvertFrom-Json
$installerName = '{0}-{1}-setup.exe' -f $packageInfo.name, $packageInfo.version
$installerPath = Join-Path $PSScriptRoot ('dist\' + $installerName)

if (-not (Test-Path -LiteralPath $installerPath)) {
    throw "Installer was not found: $installerPath"
}

$installer = Get-Item -LiteralPath $installerPath
$hash = Get-FileHash -LiteralPath $installerPath -Algorithm SHA256

Write-Host ''
Write-Host 'Packaging completed.' -ForegroundColor Green
Write-Host "Installer: $($installer.FullName)"
Write-Host "Size: $([Math]::Round($installer.Length / 1MB, 2)) MB"
Write-Host "SHA256: $($hash.Hash)"
