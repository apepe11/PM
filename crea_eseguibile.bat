@echo off
echo ===================================================
echo     PETRUZZI MANAGER - COSTRUZIONE ESEGUIBILE
echo ===================================================
echo.

echo 1. Creazione dell'ambiente virtuale (venv)...
python -m venv venv

echo.
echo 2. Attivazione ambiente e installazione librerie...
call venv\Scripts\activate
pip install fastapi uvicorn aiosqlite groq python-dotenv requests pyinstaller

echo.
echo 3. Creazione del file di avvio (run.py)...
echo import uvicorn > run.py
echo. >> run.py
echo if __name__ == "__main__": >> run.py
echo     uvicorn.run("backend.main:app", host="0.0.0.0", port=5000, reload=False) >> run.py

echo.
echo 4. Compilazione dell'Eseguibile in corso (ci vorranno un paio di minuti)...
pyinstaller --name "PetruzziManager" --add-data "backend/catalogo;backend/catalogo" --add-data "frontend/dist;frontend/dist" --add-data ".env;." run.py

echo.
echo ===================================================
echo   FATTO! Il tuo gestionale e' pronto in "dist"
echo ===================================================
pause