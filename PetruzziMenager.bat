title Avvio automatico applicazione Petruzzi

@echo off
setlocal

REM ============================================================
REM PETRUZZI - AVVIO AUTOMATICO
REM ============================================================

REM Vai sempre nella cartella dove si trova questo .bat
cd /d "%~dp0"

echo.
echo ==========================================
echo       AVVIO APPLICAZIONE PETRUZZI
echo ==========================================
echo.

REM ------------------------------------------------------------
REM Controllo dipendenze (Python e NPM)
REM ------------------------------------------------------------

where python >nul 2>&1
if errorlevel 1 (
    echo ERRORE: Python non trovato.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERRORE: npm non trovato.
    pause
    exit /b 1
)

if not exist "main.py" (
    echo ERRORE: main.py non trovato.
    pause
    exit /b 1
)

REM ------------------------------------------------------------
REM Ambiente Virtuale e Dipendenze
REM ------------------------------------------------------------

if not exist "venv\Scripts\python.exe" (
    echo Creazione virtual environment Python...
    python -m venv venv
)

call "venv\Scripts\activate.bat"

if not exist "venv\.dependencies_installed" (
    echo Installazione dipendenze Python...
    python -m pip install --upgrade pip setuptools wheel >nul
    python -m pip install fastapi uvicorn aiosqlite reportlab pydantic google-generativeai requests >nul
    echo. > "venv\.dependencies_installed"
)

REM ------------------------------------------------------------
REM Frontend Build
REM ------------------------------------------------------------

if exist "frontend\package.json" (
    echo Configurazione Frontend in corso...
    pushd "frontend"

    if not exist "node_modules" (
        call npm install >nul
    )

    call npm run build >nul
    popd
)

REM ------------------------------------------------------------
REM Avvio Server (Invisibile/Minimizzato)
REM ------------------------------------------------------------

echo.
echo ==========================================
echo       AVVIO SERVER PETRUZZI
echo ==========================================
echo.

REM Avvia uvicorn in una nuova finestra ridotta a icona per non dare fastidio
start "Motore Gestionale Petruzzi" /MIN python -m uvicorn main:app --host 0.0.0.0 --port 5000 --reload

echo Attendo che il server sia pronto...
:WAIT_SERVER
powershell -NoProfile -Command "$t = Test-NetConnection -ComputerName localhost -Port 5000 -WarningAction SilentlyContinue; if ($t.TcpTestSucceeded) { exit 0 } else { exit 1 }"

if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto WAIT_SERVER
)

echo.
echo Server disponibile! Avvio interfaccia...

REM ------------------------------------------------------------
REM Avvio Browser Massimizzato
REM ------------------------------------------------------------

REM Apre Edge o Chrome in finestra massimizzata (a tutto schermo ma con i tasti visibili)
start chrome --start-maximized "http://localhost:5000"

REM Chiude automaticamente questo terminale di avvio
exit