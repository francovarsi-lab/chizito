@echo off
cd /d "%~dp0"
title Chizito - NO CIERRES ESTA VENTANA
where node >nul 2>nul || (echo Falta instalar Node.js: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Instalando por unica vez, tarda uno o dos minutos... & call npm install || (pause & exit /b 1))
start "" cmd /c "timeout /t 7 >nul & start http://localhost:5173/?creature"
call npm run dev -- --port 5173 --strictPort
pause
