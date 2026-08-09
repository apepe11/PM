@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo ⚠️ Python non trovato. Installa Python 3 e riprova.
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ⚠️ npm non trovato. Installa Node.js e npm e riprova.
    exit /b 1
)

echo 🔧 Creazione virtual environment Python...
python -m venv venv

call venv\Scripts\activate.bat

echo ⬆️ Aggiornamento pip, setuptools e wheel...
python -m pip install --upgrade pip setuptools wheel

echo 📦 Installazione dipendenze Python...
pip install fastapi uvicorn aiosqlite reportlab pydantic google-generativeai requests

if exist frontend\package.json (
    echo 📦 Installazione dipendenze frontend...
    pushd frontend
    npm install
    echo 📦 Building frontend...
    npm run build
    popd
)

echo 🚀 Avvio dell'app Petruzzi sulla porta 5000...
python -m uvicorn main:app --host 0.0.0.0 --port 5000