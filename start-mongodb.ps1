Write-Host "Starting MongoDB Service..." -ForegroundColor Green
Write-Host ""

try {
    # Try to start MongoDB service
    Start-Service MongoDB -ErrorAction Stop
    Write-Host "✅ MongoDB service started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now start your Node.js server with: node server/index.js" -ForegroundColor Yellow
    Write-Host ""
} catch {
    Write-Host "❌ Failed to start MongoDB service." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please try one of the following:" -ForegroundColor Yellow
    Write-Host "1. Run this script as Administrator (right-click -> Run as Administrator)" -ForegroundColor White
    Write-Host "2. Start MongoDB manually from Services (services.msc)" -ForegroundColor White
    Write-Host "3. Start MongoDB manually: 'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe'" -ForegroundColor White
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Read-Host "Press Enter to continue"
