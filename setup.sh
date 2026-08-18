#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PYTHON=python3
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  PYTHON=python
fi
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "⚠️ Python non trovato. Installa Python 3 e riprova."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "⚠️ npm non trovato. Installa Node.js e npm e riprova."
  exit 1
fi

if [ ! -d "venv" ]; then
  echo "🔧 Creazione virtual environment Python..."
  "$PYTHON" -m venv venv
fi

echo "📁 Attivo l'ambiente virtuale Python..."
# shellcheck source=/dev/null
. "venv/bin/activate"

echo "⬆️ Aggiornamento pip, setuptools e wheel..."
python -m pip install --upgrade pip setuptools wheel

echo "📦 Installazione dipendenze Python..."
pip install fastapi uvicorn aiosqlite reportlab pydantic google-generativeai requests

if [ -d "frontend" ]; then
  echo "📦 Installazione dipendenze frontend..."
  pushd frontend >/dev/null
  npm install
  echo "📦 Building frontend..."
  npm run build
  popd >/dev/null
fi

echo "🚀 Avvio dell'app Petruzzi sulla porta 5000..."
python -m uvicorn main:app --host 0.0.0.0 --port 5000 --reload