#!/usr/bin/env bash
cd "$(dirname "$0")"

echo "🛑 Arresto del servizio Petruzzi Manager in background..."
pkill -f "uvicorn main:app" || true
echo "✅ Servizio arrestato con successo."
