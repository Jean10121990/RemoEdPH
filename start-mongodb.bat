@echo off
echo Starting MongoDB Service...
echo.

REM Try to start MongoDB service
net start MongoDB >nul 2>&1
if %errorlevel% equ 0 (
    echo MongoDB service started successfully!
    echo.
    echo You can now start your Node.js server.
    echo.
) else (
    echo Failed to start MongoDB service.
    echo.
    echo Please try one of the following:
    echo 1. Run this script as Administrator (right-click -^> Run as Administrator)
    echo 2. Start MongoDB manually from Services (services.msc)
    echo 3. Start MongoDB manually: "C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe"
    echo.
    pause
)
