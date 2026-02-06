# StratoSort Installer Builder Script
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  StratoSort Installer Builder" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Install dependencies
Write-Host "[1/6] Installing dependencies..." -ForegroundColor Yellow
npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[2/6] Generating assets..." -ForegroundColor Yellow
npm run generate:assets
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to generate assets" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[3/6] Building application..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[4/6] Checking model availability..." -ForegroundColor Yellow
node scripts/setup-models.js --check 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Recommended models are missing. AI features may be limited." -ForegroundColor Yellow
    Write-Host "Run 'npm run setup:models' to download models." -ForegroundColor Yellow
} else {
    Write-Host "Recommended models are available!" -ForegroundColor Green
}

Write-Host ""
Write-Host "[5/6] Creating Windows installer..." -ForegroundColor Yellow
npx electron-builder --win --publish never --config electron-builder.json
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Installer creation failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[6/6] Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  SUCCESS! Installer created" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
$pkgVersion = (Get-Content package.json | ConvertFrom-Json).version
Write-Host "Installer location:" -ForegroundColor Cyan
Write-Host "  release\build\StratoSort-Setup-$pkgVersion.exe" -ForegroundColor White
Write-Host ""
Write-Host "You can now:" -ForegroundColor Cyan
Write-Host "  1. Run the installer to install StratoSort" -ForegroundColor White
Write-Host "  2. Share it with others" -ForegroundColor White
Write-Host "  3. Upload it to GitHub Releases" -ForegroundColor White
Write-Host ""

# Open the output folder
$openFolder = Read-Host "Open output folder? (Y/N)"
if ($openFolder -eq 'Y' -or $openFolder -eq 'y') {
    Start-Process "explorer.exe" -ArgumentList "release\build"
}

Read-Host "Press Enter to exit"
