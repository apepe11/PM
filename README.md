# 🧀 Caseificio Petruzzi dal 1923 — Gestionale & Motore WhatsApp AI

Piattaforma gestionale web ad alta velocità e motore di automazione event-driven progettato per ottimizzare la ricezione, l'interpretazione IA, la produzione, il confezionamento e la distribuzione degli ordini WhatsApp per il **Caseificio Petruzzi**.

---

## 📸 Panoramica del Sistema

Il sistema intercetta in tempo reale gli ordini B2B (inviati via messaggio di testo o **messaggio vocale WhatsApp**), li analizza e struttura tramite i modelli linguistici avanzati di **Groq AI (Llama 3 e Whisper v3)**, consolida le quantità nel ciclo quotidiano del laboratorio caseario e fornisce interfacce su misura per il **Casaro**, il **Reparto Confezionamento Tablet**, il **Banco Vendita** e l'**Amministratore / Titolare**.

Include un'architettura a **singolo eseguibile chiuso (PyInstaller)** con **Sistema di Licenza Remota (Call-Home Kill-Switch)** per la gestione SaaS.

---

## 🛠️ Stack Tecnologico

- **Backend Core**: FastAPI, Python 3.11+, Uvicorn, SQLite Async (`aiosqlite` in modalità WAL anti-blocco concorrenziale).
- **Intelligenza Artificiale**: Groq API (`openai/gpt-oss-120b` ad alta precisione 120B, `openai/gpt-oss-20b` come fallback resiliente anti-429 e `whisper-large-v3` per la trascrizione vocale istantanea).
- **Integrazione WhatsApp**: Evolution API con **Architettura Ibrida** (intercettazione webhook real-time + demone di polling di riconciliazione ogni 2 minuti).
- **Motore PDF**: ReportLab 5.0 (impaginazione nativa vettoriale A4 per schede produzione, distinte Sole 365, bolle confezionamento e schede filoni pizzeria).
- **Frontend Grafico**: React 18, Vite, Vanilla CSS & Tailwind CSS, Lucide Icons, Recharts.
- **Packaging & CI/CD**: PyInstaller Standalone (`build.spec`), GitHub Actions (`.github/workflows/build_windows.yml`).
- **Controllo Licenza**: Call-Home periodico via `httpx` verso GitHub Gist crittografato.

---

## ✨ Sezioni & Funzionalità del Sistema

### 1. 🏭 Produzione Giornaliera Casaro
- **Aggregazione Automatica dei Totali**: Consolida tutte le quantità ordinate per singolo formaggio e grammatura per la data selezionata.
- **Calcolo Pezzi Automatico (PZ)**: Gli articoli a pezzo vengono calcolati e conteggiati a **pezzi interi** anziché a peso sia negli ordini in KG che in PEZZI:
  - Burrata 250g (`BURRA0250PE`)
  - Sfoglia di mozzarella classica e Delat (`SFOGLIA`, `SFOGLPE`, `SFOGLDELPE`)
  - Petruzzella da 0,250 kg (`PETRZ0250PE`)
  - Petruzzella da 1 kg (`PETRZ01PE`)
  - Ricotta in carta da 0,500 kg (`RICCARTA0500`)
  - Ricotta classica da 0,500 kg (`RICOTPE`)
- **Chiusura Ricezione Ordini Manuale (Data Attiva)**: Pulsante per slittare la data di produzione al giorno successivo (con salto automatico del weekend dal sabato al lunedì).
- **Stampa PDF 1-Pagina A4**: Foglio compatto di lavorazione senza dati sensibili per il personale di produzione.

### 2. ☀️ Produzione Totale Sole 365 (`/produzione-sole`)
- **Sezione Esclusiva per il Gruppo Sole 365**: Tab dedicato che consolida tutti gli ordini provenienti dai supermercati e responsabili del gruppo Sole 365.
- **Dashboard con KPI Dedicati**: Contatori in tempo reale di Totale KG Mozzarella, Totale Pezzi, Numero Punti Vendita Attivi e Numero Referenze ordinate.
- **Stampa PDF Dedicato**: Genera con 1-click la distinta A4 di produzione aggregata specifica per la rete Sole 365.

### 3. 🍕 Filoni Pizzeria (`/filoni`)
- **Gestione Distinta Filoni di Mozzarella (`FILMZPE`)**: I prodotti per pizza (filoni, panetti, julienne, tagju) vengono automaticamente esclusi dalla tabella generale del casaro e indirizzati in questa sezione dedicata.
- **Instradamento Automatico Clienti Pizzeria**:
  - **Pizzeria Mulnar** (numeri `347 146 1004` e `0975203278`): catalogati automaticamente nei filoni pizzeria.
  - **Agriturismo Vignola / Ciccio Brown** (`388 140 4154`): catalogati automaticamente nei filoni pizzeria.
  - **Giovanni Franzoli** (`+115131027611727`): gestione ordini filoni.
- **Stampa PDF Scheda Filoni**: Foglio di taglio e preparazione distinto cliente per cliente.

### 4. 👥 Rubrica & Particolarità Clienti IA (Gestione JSON)
- **Modifica Diretta del File `catalogo/particolarita_clienti.json`**:
  - Creazione, ricerca, modifica ed eliminazione anagrafica e regole IA direttamente dall'interfaccia web.
  - **Aggiungi / Leva Particolarità con 1-Click**: Pulsante rapido sulle schede cliente per rimuovere una regola o aggiungerne una nuova al volo.
  - **Suggerimenti Rapidi (Tag Regole Frequenti)**: Pulsanti preset nel modal per inserire rapidamente regole (*Filoni Pizzeria*, *Vaschette Fior di Latte 250g*, *Ricotta 500g*, *Senza Lattosio*, *Calcolo a Pezzi*, *Gestione Resi*).
  - **Hot-Reload in Memoria**: L'IA ricarica all'istante le nuove regole senza bisogno di riavviare il server.
  - **Normalizzazione Telefoni Nazionali**: Pulizia e match esatto dei numeri a 10 cifre (senza troncamenti e con gestione prefissi +39 / 0039).

### 5. 📦 Ricezione WhatsApp & Architettura a Doppio Livello
- **Canale 1: Webhook Real-Time (< 1 secondo)**: Ricezione push istantanea dei messaggi e vocali appena inviati dai clienti.
- **Canale 2: Polling di Riconciliazione (Ogni 2 Minuti)**: Demone asincrono di sicurezza che interroga Evolution API per recuperare eventuali messaggi sfuggiti a interruzioni di connessione o riavvii del server.
- **Deduplicazione per Message ID (`key.id`)**: Controllo su database SQLite locale; i messaggi già catturati dal Webhook vengono scartati in < 1ms a **zero chiamate e zero token IA**.
- **Buffer di Debounce Centralizzato (20 secondi)**: Se un cliente invia messaggi multipli o vocali consecutivi, vengono uniti in un unico payload prima dell'invio a Groq AI.
- **Trascrizione Vocali Groq Whisper**: Ogni vocale WhatsApp viene trascritto parola per parola e mostrato con il badge `🎙️ Vocale Trascritto`.
- **Auto-Recovery Rate Limit (429)**: Switch automatico sul modello di riserva `openai/gpt-oss-20b` in caso di rate limit temporaneo e ripristino istantaneo al modello primario `openai/gpt-oss-120b`.

### 6. 📱 Postazione Tablet Confezionamento (`/tablet`)
- **Interfaccia Touch Screen per Laboratorio**: Ottimizzata per tablet Samsung Galaxy A8 e postazioni touch di pesatura.
- **3 Macro-Sezioni Dedicate**:
  - 📋 **Tutti gli Ordini**: Vista complessiva e ordini standard (bar, ristoranti, alimentari, privati).
  - ☀️ **Gruppo Sole 365**: Scheda filtrata con tema dedicato per i supermercati Sole 365.
  - 🍕 **Filoni Pizzeria**: Scheda filtrata per pizzerie e preparazione filoni/panetti/julienne.
- **Avanzamento & Contatori Live**: Indicatori di stato in tempo reale (es. `15/20 evasi`, `4/4 evasi`, `3/5 evasi`).
- **Badge di Categoria**: Identificazione immediata di ogni ordine (`☀️ SOLE 365`, `🍕 FILONI PIZZERIA`, `🧀 STANDARD`).
- **Filtri Rapidi & Ricerca**: Filtro veloce per `Tutti`, `⏳ Da Confezionare` o `✅ Confezionati` e barra di ricerca per cliente/articolo.
- **Anti-Data Loss su Re-Render**: Preservazione automatica dei campi digitati localmente (`Lotto` e `Grammatura`) durante il cambio scheda e durante i cicli di sincronizzazione.
- **Conferma per Singola Riga & Validazione**: Controllo obbligatorio di peso e lotto prima del salvataggio finale.

### 7. ✅ Ordini Confermati & Tracciabilità Lotto
- **Flusso Confezionamento**: Gli ordini evasi si spostano automaticamente nella cronologia confermati.
- **Grammatura e Lotto per Articolo**:
  - Peso fisso con grammatura automatica e inserimento numero lotto.
  - Peso variabile con registrazione del peso effettivo pesato.
- **Stampa Bolla di Spedizione PDF**: Scheda con lotti, grammature e pesi per ogni articolo.

### 8. 📊 Statistiche & Controllo di Gestione
- Analisi per periodo (Mese, Trimestre, Anno), grafici di trend referenze, volumi totali kg e top account B2B.

---

## ⏱️ Demoni di Background & Polling di Sistema

| Processo / Demone | Frequenza | Funzione |
| :--- | :--- | :--- |
| **Sincronizzazione Schermi Frontend** | **Ogni 5 secondi** | Aggiorna in tempo reale ordini, pesi e lotti su Tablet e Dashboard PC |
| **Polling Demone Broadcast** | **Ogni 30 secondi** | Verifica e invia comunicazioni promozionali programmate via WhatsApp |
| **Polling Riconciliazione WhatsApp** | **Ogni 2 minuti** | Safety Net per recuperare messaggi sfuggiti a cadute di rete/webhook |
| **Controllo Licenza Call-Home** | **Ogni 5 minuti** | Verifica remota della validità della licenza software su GitHub Gist |

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