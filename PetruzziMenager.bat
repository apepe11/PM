REM ------------------------------------------------------------
REM Avvio server
REM ------------------------------------------------------------

echo.
echo ==========================================
echo       AVVIO SERVER PETRUZZI
echo ==========================================
echo.

start "Petruzzi Server" cmd /k "cd /d "%~dp0" && call venv\Scripts\activate.bat && python -m uvicorn main:app --host 0.0.0.0 --port 5000"

echo Attendo che il server sia disponibile...

:WAIT_SERVER
powershell -NoProfile -Command "$t = Test-NetConnection -ComputerName localhost -Port 5000 -WarningAction SilentlyContinue; if ($t.TcpTestSucceeded) { exit 0 } else { exit 1 }"

if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto WAIT_SERVER
)

echo Server disponibile!
echo Apertura browser...

start "" "http://localhost:5000"

echo.
echo ==========================================
echo    PETRUZZI AVVIATO CORRETTAMENTE
echo ==========================================
echo.
echo http://localhost:5000
echo.

endlocal
exit /b 0