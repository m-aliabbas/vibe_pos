[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:OS -ne "Windows_NT") {
    throw "The Windows backend must be built on Windows."
}

$backendDir = $PSScriptRoot
$repoDir = Split-Path -Parent $backendDir
$tauriBinDir = Join-Path $repoDir "frontend\src-tauri\bin"
$requirementsLock = Join-Path $backendDir "requirements-windows.lock"
$entryPoint = Join-Path $backendDir "run_server.py"
$credentialFile = Join-Path $backendDir "k1.json.enc"
$driveCredentialFile = Join-Path $backendDir "g1.json.enc"
$workDir = Join-Path $backendDir "build\windows"
$distDir = Join-Path $backendDir "dist\windows"
$targetExe = Join-Path $tauriBinDir "backend-server-x86_64-pc-windows-msvc.exe"

foreach ($requiredFile in @($requirementsLock, $entryPoint, $credentialFile, $driveCredentialFile)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required build input is missing: $requiredFile"
    }
}

if (-not $SkipInstall) {
    Write-Host "Installing the locked Windows dependencies..."
    & python -m pip install --disable-pip-version-check --requirement $requirementsLock
    if ($LASTEXITCODE -ne 0) {
        throw "Dependency installation failed."
    }
}

New-Item -ItemType Directory -Force -Path $tauriBinDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $tauriBinDir "data") | Out-Null

# Local builds use backend/.env. CI writes the protected value directly to bin/.env.
$localEnv = Join-Path $backendDir ".env"
$bundledEnv = Join-Path $tauriBinDir ".env"
if (Test-Path -LiteralPath $localEnv -PathType Leaf) {
    Copy-Item -LiteralPath $localEnv -Destination $bundledEnv -Force
}
if (-not (Test-Path -LiteralPath $bundledEnv -PathType Leaf)) {
    throw "Missing $bundledEnv. Add backend/.env locally or configure the CI secret."
}

foreach ($directory in @($workDir, $distDir)) {
    if (Test-Path -LiteralPath $directory) {
        Remove-Item -LiteralPath $directory -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$pyInstallerArgs = @(
    "-m", "PyInstaller",
    "--name", "backend-server",
    "--onefile",
    "--clean",
    "--noconfirm",
    "--paths", $backendDir,
    "--workpath", $workDir,
    "--specpath", $workDir,
    "--distpath", $distDir,
    "--add-data", "${credentialFile};.",
    "--add-data", "${driveCredentialFile};.",
    "--collect-all", "fastapi",
    "--collect-all", "dotenv",
    "--collect-all", "starlette",
    "--collect-all", "uvicorn",
    "--collect-all", "sqlalchemy",
    "--collect-all", "alembic",
    "--collect-all", "pydantic",
    "--collect-all", "pydantic_settings",
    "--collect-all", "requests",
    "--collect-all", "reportlab",
    "--collect-all", "PIL",
    "--collect-all", "python_multipart",
    "--collect-all", "jose",
    "--collect-all", "passlib",
    "--collect-all", "cryptography",
    "--collect-all", "neonize",
    "--collect-all", "apscheduler",
    "--collect-all", "zeroconf",
    "--collect-all", "pydrive2",
    "--collect-all", "googleapiclient",
    "--collect-all", "oauth2client",
    "--collect-all", "httplib2",
    "--hidden-import", "uvicorn.logging",
    "--hidden-import", "uvicorn.loops.auto",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.protocols.websockets.auto",
    "--hidden-import", "uvicorn.lifespan.on",
    $entryPoint
)

Write-Host "Building the Windows backend sidecar..."
& python @pyInstallerArgs
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed."
}

$builtExe = Join-Path $distDir "backend-server.exe"
if (-not (Test-Path -LiteralPath $builtExe -PathType Leaf)) {
    throw "PyInstaller completed without producing $builtExe"
}

Copy-Item -LiteralPath $builtExe -Destination $targetExe -Force
Copy-Item -LiteralPath $credentialFile -Destination (Join-Path $tauriBinDir "k1.json.enc") -Force
Copy-Item -LiteralPath $driveCredentialFile -Destination (Join-Path $tauriBinDir "g1.json.enc") -Force

Write-Host "Backend sidecar ready: $targetExe"
