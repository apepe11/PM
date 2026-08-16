#!/usr/bin/env bash
# Script di avvio per Petruzzi Manager Eseguibile Standalone

cd "$(dirname "$0")"

echo "=================================================="
echo "🚀 AVVIO GESTIONALE CASEIFICIO PETRUZZI (STANDALONE)"
echo "=================================================="
echo "📌 URL Principale: http://localhost:5000"
echo "📱 Modulo Tablet:  http://localhost:5000/tablet"
echo "👑 Modulo Titolare: http://localhost:5000/titolare"
echo "=================================================="

./dist/PetruzziManager
