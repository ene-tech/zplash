@echo off
REM Mantiene "npm run dev" arriba: si se cae, lo vuelve a levantar.
REM Log: %TEMP%\zplash-dev.log   Parar: cerrar la ventana del keepalive.
cd /d "%~dp0.."
:loop
echo === arrancando next dev %date% %time% === >> "%TEMP%\zplash-dev.log"
call npm run dev >> "%TEMP%\zplash-dev.log" 2>&1
echo === se cayo (exit %errorlevel%), reintento en 3s === >> "%TEMP%\zplash-dev.log"
timeout /t 3 /nobreak >nul
goto loop
