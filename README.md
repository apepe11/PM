# 🧀 Caseificio Petruzzi dal 1923 — Gestionale & Motore WhatsApp AI

Piattaforma gestionale web ad alta velocità e motore di automazione event-driven progettato per ottimizzare la ricezione, l'interpretazione IA, la produzione, il confezionamento e la distribuzione degli ordini WhatsApp per il **Caseificio Petruzzi**.

---

## 📸 Panoramica del Sistema

Il sistema intercetta in tempo reale gli ordini B2B (inviati via messaggio di testo o **messaggio vocale WhatsApp**), li analizza e struttura tramite i modelli linguistici avanzati di **Groq AI (Llama 3.3 e Whisper v3)**, consolida le quantità nel ciclo quotidiano del laboratorio caseario e fornisce interfacce su misura per il **Casaro**, il **Reparto Confezionamento Tablet**, il **Banco Vendita** e l'**Amministratore / Titolare**.

Include un'architettura a **singolo eseguibile chiuso (PyInstaller)** con **Sistema di Licenza Remota (Call-Home Kill-Switch)** per la gestione SaaS.

---

## 🛠️ Stack Tecnologico

- **Backend Core**: FastAPI, Python 3.11+, Uvicorn, SQLite Async (`aiosqlite` in modalità WAL anti-blocco).
- **Intelligenza Artificiale**: Groq API (`llama-3.3-70b-versatile` per il parsing semantico degli ordini e `whisper-large-v3` per la trascrizione vocale istantanea).
- **Integrazione WhatsApp**: Evolution API (intercettazione webhook e sincronizzazione periodica contatti/chat).
- **Motore PDF**: ReportLab 5.0 (impaginazione nativa vettoriale A4 per schede produzione, bolle confezionamento e distinte pizzerie).
- **Frontend Grafico**: React 18, Vite, Tailwind CSS, Lucide Icons, Recharts.
- **Packaging & CI/CD**: PyInstaller Standalone (`build.spec`), GitHub Actions (`.github/workflows/build_windows.yml`).
- **Controllo Licenza**: Call-Home periodico via `httpx` verso GitHub Gist crittografato.

---

## ✨ Sezioni & Funzionalità del Sistema

### 1. 🏭 Produzione Giornaliera Casaro
- **Aggregazione Automatica dei Totali**: Consolida tutte le quantità ordinate per singolo formaggio e grammatura per la data selezionata.
- **Calcolo Burrata in Pezzi (PZ)**: Qualunque tipologia di burrata (classica, tartufo, pistacchio, affumicata, ecc.) viene automaticamente calcolata e conteggiata a **pezzi interi** anziché a peso, garantendo la precisione al banco di filatura.
- **Chiusura Ricezione Ordini Manuale (Data Attiva)**: Pulsante per slittare la data di produzione al giorno successivo (con salto automatico del weekend dal sabato al lunedì).
- **Stampa PDF 1-Pagina A4**: Foglio compatto di lavorazione senza dati sensibili per il personale di produzione.

### 2. ☀️ Produzione Totale Sole 365 (`/produzione-sole`)
- **Sezione Esclusiva per il Gruppo Sole 365**: Tab dedicato che consolida tutti gli ordini provenienti dai supermercati e responsabili del gruppo Sole 365.
- **Dashboard con KPI Dedicati**: Contatori in tempo reale di Totale KG Mozzarella, Totale Pezzi, Numero Punti Vendita Attivi e Numero Referenze ordinate.
- **Stampa PDF Dedicato**: Genera con 1-click la distinta A4 di produzione aggregata specifica per la rete Sole 365.

### 3. 🍕 Filoni Pizzeria (`/filoni`)
- **Gestione Distinta Filoni di Mozzarella (`FILMZPE`)**: I prodotti per pizza (filoni, panetti, julienne, tagju) vengono automaticamente esclusi dalla tabella generale del casaro e indirizzati in questa sezione dedicata.
- **Instradamento Automatico Clienti Pizzeria**:
  - **Pizzeria Mulnar** (numeri `347 146 1004` e `0975203278`): ordini catalogati automaticamente nei filoni pizzeria.
  - **Giovanni Franzoli** (`+115131027611727`): gestione ordini filoni.
- **Stampa PDF Scheda Filoni**: Foglio di taglio e preparazione distinto cliente per cliente.

### 4. 👥 Rubrica & Particolarità Clienti IA (Gestione JSON)
- **Modifica Diretta del File `catalogo/particolarita_clienti.json`**:
  - Creazione, ricerca, modifica ed eliminazione anagrafica e regole IA direttamente dall'interfaccia web.
  - **Aggiungi / Leva Particolarità con 1-Click**: Pulsante rapido sulle schede cliente per rimuovere una regola o aggiungerne una nuova al volo.
  - **Suggerimenti Rapidi (Tag Regole Frequenti)**: Pulsanti preset nel modal per inserire rapidamente regole come *Filoni Pizzeria*, *Vaschette Fior di Latte 250g*, *Ricotta 500g*, *Senza Lattosio*, *Calcolo a Pezzi*, *Gestione Resi*.
  - **Hot-Reload in Memoria**: L'IA ricarica all'istante le nuove regole senza bisogno di riavviare il server.

### 5. 📦 Ordini Clienti & Filtro Giornaliero
- **Filtro Data Avanzato**: Oggi, Domani, Selettore Calendario o Tutti gli Ordini.
- **Trascrizione Vocali Groq Whisper**: Ogni vocale WhatsApp viene trascritto parola per parola e mostrato con il badge `🎙️ Vocale Trascritto`.
- **Riconoscimento Clienti e Alias**: Integrazione con la rubrica locale per associare automaticamente i numeri WhatsApp al nome dell'attività.

### 6. ✅ Ordini Confermati & Tracciabilità Lotto
- **Flusso Confezionamento**: Gli ordini evasi dal tablet o confermati manualmente si spostano nella cronologia confermati.
- **Grammatura e Lotto per Articolo**:
  - Peso fisso con grammatura automatica e inserimento numero lotto.
  - Peso variabile con registrazione del peso effettivo pesato.
- **Stampa Bolla di Spedizione PDF**: Scheda con lotti, grammature e pesi per ogni articolo.

### 7. 📱 Postazione Tablet Confezionamento (`/tablet`)
- **Interfaccia Touch Screen per Laboratorio**: Ottimizzata per tablet Samsung Galaxy A8 e schermi touch.
- **Inserimento Peso & Lotto**: I lavoratori inseriscono i kg reali pesati e confermano l'ordine senza toccare mouse o tastiera.

### 8. 📊 Statistiche & Controllo di Gestione
- Analisi per periodo (Mese, Trimestre, Anno), grafici di trend referenze, volumi totali kg e top account B2B.

---

## 🔒 Sistema di Licenza Remota (Kill-Switch SaaS)

Il software integra un meccanismo di protezione per la vendita a canone periodico:

1. **Call-Home Periodico**:
   - All'avvio e poi **ogni 5 minuti** in background, il backend esegue una chiamata GET a:
     `https://gist.githubusercontent.com/apepe11/2e0a21543f90632b9f0e0ccf2fc14888/raw/mia.json`
2. **Blocco Immediato (HTTP 403)**:
   - Se il file JSON contiene `"status": "suspended"`:
     - Tutte le rotte API del gestionale vengono intercettate dal **Middleware FastAPI** e bloccate con codice `403 LICENSE_SUSPENDED`.
     - La ricezione e sincronizzazione automatica di WhatsApp vengono messe in pausa.
     - L'unica rotta sempre accessibile rimane `/api/status` per il monitoraggio.
3. **Sblocco Istantaneo**:
   - Modificando il Gist su `"status": "active"`, l'accesso viene ripristinato automaticamente al controllo successivo (o al riavvio).

---

## 📦 Architettura Percorsi Dinamici (PyInstaller)

Per garantire la persistenza dei dati e l'integrità del software compilato, il modulo [`backend/paths.py`](file:///home/antonio/Desktop/Petruzzi/backend/paths.py) gestisce separatamente:
- **File Bundled Temporanei (`sys._MEIPASS`)**: Frontend buildato (`frontend/dist`), immagini (`images/logo.png`), catalogo base (`catalogo/catalogo.json`).
- **File Persistenti Locali (`os.getcwd()`)**: Database SQLite (`petruzzi_ordini.db`), particolarità clienti modificate (`catalogo/particolarita_clienti.json`), archivio PDF (`reports/`).

---

## 🚀 Compilazione & Avvio

### 1. Avvio in Locale (Ambiente Linux)
```bash
# Avvio rapido con script dedicato:
./avvia_gestionale.sh

# Oppure eseguibile diretto:
./dist/PetruzziManager
```

### 2. Generazione Eseguibile Windows (.exe)
È possibile compilare il file `.exe` in due modi:

#### Metodo A — Automatico tramite GitHub Actions (Consigliato)
1. Fai il push delle modifiche su GitHub.
2. Vai nella scheda **Actions** $\rightarrow$ seleziona **"Build Windows Executable (.exe)"** $\rightarrow$ clicca **"Run workflow"**.
3. Al termine scarica il file `.zip` con **`PetruzziManager.exe`** dagli Artifacts.

#### Metodo B — Compilazione su Macchina Windows (Terminale)
```cmd
cd frontend && npm install && npm run build && cd ..
pip install -r requirements.txt pyinstaller
pyinstaller --clean build.spec
```
Il file generato sarà disponibile in: `dist\PetruzziManager.exe`.

---

## 🌐 Mappa degli Indirizzi Web

| Modulo / Funzione | Indirizzo Locale | Indirizzo Rete Caseificio |
| :--- | :--- | :--- |
| **Dashboard Principale** | `http://localhost:5000` | `http://IP_SERVER:5000` |
| **Modulo Tablet Confezionamento** | `http://localhost:5000/tablet` | `http://IP_SERVER:5000/tablet` |
| **Modulo Titolare & Admin** | `http://localhost:5000/titolare` | `http://IP_SERVER:5000/titolare` |
| **Controllo Stato & Licenza** | `http://localhost:5000/api/status` | `http://IP_SERVER:5000/api/status` |

---

*Caseificio Petruzzi © 1923 - 2026 — Gestione Ordini, Produzione & Automazione Laboratorio*