@echo off
echo Starting RemoEdPH Server...
echo.
echo Navigating to server directory...
cd server
echo.
echo Starting main server on port 5000...
echo (Includes Socket.IO signaling server)
start "RemoEdPH Server" cmd /k "node index.js"
echo.
echo Server should now be running!
echo Main server: http://localhost:5000
echo.
echo Press any key to close this window...
pause