@echo off
set "PATH=%~dp0.tools\node-v22.14.0-win-x64;%PATH%"
echo Starting WebLTspice Dev Server...
npm run dev
pause
