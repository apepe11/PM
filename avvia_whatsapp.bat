@echo off
echo ===================================================
echo     PETRUZZI MANAGER - AVVIO MOTORE WHATSAPP
echo ===================================================
echo.

echo Controllo se Docker e' installato...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVVISO] Docker non e' installato sul tuo PC!
    echo.
    echo Avvio il download automatico di Docker Desktop...
    echo Attendere prego, il file pesa circa 600 MB...
    curl -L -o "DockerInstaller.exe" "https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe"

    echo.
    echo Download completato! Avvio l'installazione...
    echo Seleziona "SI" quando Windows ti chiede i permessi di Amministratore.
    echo Lascia le spunte predefinite e vai avanti fino alla fine.
    
    start /wait DockerInstaller.exe

    echo.
    echo [IMPORTANTE] Installazione conclusa!
    echo 1. Se l'installer ti ha chiesto di riavviare il PC, FALLO ORA.
    echo 2. Apri "Docker Desktop" dal menu Start.
    echo 3. Attendi che il caricamento finisca (icona verde in basso a sinistra).
    echo 4. Riavvia questo file (avvia_whatsapp.bat).
    echo.
    
    del DockerInstaller.exe
    pause
    exit /b
)

echo.
echo Docker e' presente. Avvio del container Evolution API in background...
docker compose up -d

echo.
echo ===================================================
echo   FATTO! Motore WhatsApp avviato e pronto.
echo   Ora puoi aprire PetruzziManager.exe
echo ===================================================
pause