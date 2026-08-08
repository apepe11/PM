#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Imposta modalità Headless (sfondo invisibile)
export HEADLESS=true

echo "🚀 Avvio Petruzzi Manager in BACKGROUND (Servizio 24/7)..."
nohup ./venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 > app.log 2>&1 &

PID=$!
echo "✅ Servizio avviato con successo in background!"
echo "📍 Dashboard disponibile su: http://localhost:8000"
echo "🆔 Process PID: $PID (Log salvato in app.log)"
