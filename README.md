# 🧀 Caseificio Petruzzi dal 1923 — Dashboard Gestionale & Motore WhatsApp AI

Piattaforma gestionale web ad alta velocità e motore di automazione event-driven progettato per ottimizzare la ricezione, l'elaborazione, la produzione ed il confezionamento degli ordini WhatsApp per il **Caseificio Petruzzi**.

---

## 📸 Panoramica del Sistema

Il sistema intercetta in tempo reale gli ordini B2B (inviati via messaggio di testo o **messaggio vocale**) ricevuti su WhatsApp Web, analizza le richieste tramite l'IA **Groq**, consolida le quantità nel ciclo quotidiano del laboratorio (tramite pulsante manuale di chiusura ricezione ordini) e fornisce interfacce dedicate al **Casaro**, al **Reparto Confezionamento Tablet** ed all'**Amministratore / Titolare**.

---

## ✨ Funzionalità Implementate

### 🎙️ 1. Trascrizione Automatica Immediata dei Vocali & Estrazione IA Groq
- **Rilevamento Istrustantaneo Audio**: Intercettazione automatica dei messaggi vocali (audio blob, PTT, note vocali con durata) non appena arrivano su WhatsApp Web.
- **Estrazione Audio & Autoplay Trigger**: Se il tag `<audio>` non ha ancora generato l'URL del `blob:`, il motore simula in automatico il click sul pulsante di riproduzione/download del vocale per forzare il caricamento immediato da parte di WhatsApp Web prima dell'estrazione base64.
- **Trascrizione Groq Whisper**: Il file audio viene inviato a `whisper-large-v3` di Groq, che lo trascrive in modo quasi istantaneo. La trascrizione viene poi unita al testo originale del messaggio.
- **Trascrizione Parola per Parola & Estrazione Prodotti**: Il file audio viene inviato a `llama-3.3-70b-versatile` che trascrive l'audio in italiano integrale (`testo_trascritto`) ed estrae contestualmente formaggi, pesi, quantita e note d'ordine.
- **Badge Visivo Trascrizione**: In dashboard viene mostrato il testo integrale dell'audio nel badge dedicato `🎙️ Vocale Trascritto da Groq`.

### ⚡ 2. Architettura di Scansione a 2 Livelli (Priorità Assoluta in Tempo Reale)
- **LIVELLO 1 — PRIORITÀ ASSOLUTA (Nuovi Messaggi & Vocali in Arrivo)**:
  I nuovi messaggi ed i vocali in arrivo (`is_unread == True` o nuovi audio) vengono intercettati ed elaborati **all'istante (0.5s latenza max)**, scavalcando qualsiasi altra operazione.
- **LIVELLO 2 — TEMPO LIBERO / INATTIVITÀ (Messaggi Vecchi / Pregressi)**:
  Solo ed unicamente quando NON ci sono nuovi messaggi o vocali in arrivo, il motore dedica i momenti di inattività all'elaborazione in background di 1 eventuale messaggio vecchio/storico non ancora processato. Se arriva un nuovo vocale, il sistema riprende immediatamente la priorità di Livello 1.
- **Deduplicazione Dinamica Vocali Multipli**: Sostituita la chiave fissa con la chiave dinamica `mittente_testo_orario`, consentendo di elaborare correttamente anche sequenze di vocali inviati dallo stesso cliente con testo anteprima generico ("Vocale o Media" o "0:15").

### 🔄 3. Esecuzione Continua 24/7 in Background & Auto-Recovery
- **Funzionamento Silenzioso 24/7 (Headless Mode)**: Il sistema è progettato per rimanere sempre aperto e operativo in sottofondo 24 ore su 24, analizzando in modo continuo gli ordini ed i vocali che arrivano a qualsiasi ora.
- **Auto-Recovery & Riconnessione Automatica**: In caso di micro-cadute della rete Wi-Fi o disconnessioni di rete, il motore applica il retry automatico in 5 secondi, riavviando la sessione senza perdere l'autenticazione né richiedere una nuova scansione del QR code.
- **Script di Avvio/Arresto Dedicati**:
  - `avvia_server.bat` e `start_invisibile.vbs`: Avvia il servizio ed il motore WhatsApp in sottofondo continuo (headless) su Windows.
  - `crea_eseguibile.bat`: Compila automaticamente il progetto in un eseguibile `.exe` per Windows.
  - `avvia_whatsapp.bat`: Gestisce l'installazione e l'avvio automatico di Docker Desktop e del container Evolution API.

### ⏱️ 4. Aggiornamento Real-Time Dashboard (3 Secondi)
- Polling ad alta frequenza nel frontend React passato da 10s a **3s**, rendendo visibili all'istante le nuove trascrizioni vocali e gli ordini acquisiti.

### 🏭 5. Produzione Giornaliera Casaro & Stampa PDF 1-Pagina A4
- **Aggregazione Automatica dei Totali**: Somma automatica dei formaggi da produrre per la giornata selezionata (es. tutti i kg di Treccia di Scamorza ordinati da clienti diversi).
- **Chiusura Ricezione Ordini Manuale (Data Attiva)**: Lo slittamento della data di produzione avviene manualmente tramite il pulsante "Chiudi Ricezione Ordini" in dashboard, offrendo il massimo controllo rispetto agli orari flessibili di produzione. La "Data Attiva" viene salvata nel database e usata da tutto il sistema.
- **Gestione Automatica Weekend**: Quando la produzione viene chiusa di sabato, la nuova data salta automaticamente la domenica, posizionandosi sul lunedì.
- **Report PDF 1-Pagina A4 (Privacy-Compliant)**: Generazione 1-click del foglio di laboratorio A4 compatto, privo di numeri di telefono o dati sensibili dei clienti, ideale da tenere sul banco lavorazione.

### 🍕 6. Scheda Filoni Pizzeria per Cliente & PDF Dedicato
- **Sezione Filoni Pizzeria (`/filoni`)**: Tab dedicato alla lavorazione dei filoni di mozzarella (filoni classici, affumicati, fior di latte).
- **Organizzato per Pizzeria/Cliente**: Mostra la distinta esatta per ciascuna pizzeria servita, le quantità in kg/pezzi e le note particolari della cucina.
- **PDF Scheda Filoni**: Stampa 1-click della scheda di taglio e confezionamento filoni per cliente.

### 📦 7. Ordini Clienti, Filtro Giornaliero & Selezione Clienti Registrati
- **Filtro Data Ordini**: Possibilità di filtrare le schede ordini per data target di consegna (**Oggi**, **Domani**, **Data Personalizzata** o **Tutti gli Ordini**).
- **Isolamento Storico per Data**: I nuovi messaggi vengono accodati agli ordini preesistenti *solo* se le date di consegna coincidono, evitando che ordini per date future vengano sovrascritti da richieste per il giorno corrente.
- **Selezione Clienti Registrati**: In fase di inserimento o modifica ordine manuale, è possibile selezionare direttamente i clienti censiti con 1 click dal menu a tendina o tramite la ricerca automatica datalist.
- **Regola Andrea Aliandro**: Riconoscimento automatico del cliente "reale" quando l'ordine è inoltrato da Andrea Aliandro, con slittamento automatico della data di consegna al giorno successivo.

### ✅ 8. Sezione Ordini Confermati, Grammatura & Lotto per Articolo
- **Flusso Ordini Confermati**: Un ordine si sposta nel tab **ORDINI CONFERMATI** quando viene evaso dalla postazione tablet o confermato dal pulsante `✅ CONFERMA ORDINE`.
- **Grammatura & Lotto per Articolo**:
  - **Prodotti a Peso Fisso** (es. *"Bocconcini 0,250KG"*, *"Ricotta 0,500KG"*): La grammatura unitaria è riconosciuta ed impostata in automatico (es. `0.250 KG`), richiedendo solo il **Numero di Lotto**.
  - **Prodotti a Peso Variabile**: Registrano sia il peso misurato pesato che il numero di lotto.
- **PDF Ordine Confermato / Bolla di Spedizione**: Stampa 1-click della scheda ordine ufficiale recante per ogni articolo codice, descrizione, quantità, grammatura e lotto.

### 📱 9. Postazione Confezionamento Tablet (Galaxy A8 in Produzione)
- **Rotta Web Touch `/tablet`**: Interfaccia ad alta leggibilità e grandi pulsanti touch per tablet da laboratorio.
- **Inserimento Peso Reale & Lotto**: Gli operatori pesano l'ordine, inseriscono il **Peso Reale (KG)** ed il **Numero di Lotto** e confermano il confezionamento (`✅ CONFERMA CONFEZIONAMENTO`).
- **Stato Ordine Dinamico**: Passaggio automatico allo stato `CONFEZIONATO` / `CONFERMATO`.

### 🛡️ 10. Hub Amministratore Remoto & Backup DB SQLite 1-Click
- **Accesso Protetto via Token**: Autenticazione riservata al titolare tramite token o passkey configurabile (`EVOLUTION_API_KEY`).
- **Controllo Produzione in Tempo Reale**: Monitoraggio percentuale di completamento confezionamento, distinte lavorazione e log avanzamento ordini da remoto (casa o smartphone).
- **Backup DB SQLite**: Download 1-click del file completo del database (`petruzzi_backup_YYYYMMDD_HHMM.db`).

### 📊 11. Statistiche & Controllo di Gestione
- **Selettore Periodo Mese per Mese / Trimestre / Anno**: Analisi dello storico ordini e volumi lavorati.
- **KPI Formali**: Volumi totali lavorati (KG), numero ordini acquisiti, lotto medio per cliente e top account B2B.

---

## 📱 Guida all'Accesso dai Dispositivi

### 1. 🖥️ Dashboard Principale (PC Laboratorio)
- **Indirizzo**: [http://localhost:5000](http://localhost:5000) (oppure `http://192.168.1.179:5000`)
- **Utilizzo**: Gestione completa ordini, produzione casaro, filoni pizzeria, ordini confermati e statistiche.

### 2. 📲 Postazione Tablet Confezionamento (Galaxy A8)
- **Indirizzo**: `http://192.168.1.179:5000/tablet`
- **Istruzioni**: Collega il Tablet al Wi-Fi del laboratorio, apri Chrome su `http://192.168.1.179:5000/tablet` e salva l'icona in schermata Home.

### 3. 🛡️ Hub Amministratore Remoto (Titolare / Smartphone / Casa)
- **Indirizzo**: `http://192.168.1.179:5000/admin?token=petruzzi-secret-key`

---

## 🛠️ Stack Tecnologico

- **Backend Core**: FastAPI, Python 3, Uvicorn, SQLite Async (`aiosqlite`).
- **Web Automation**: Evolution API (Docker).
- **Artificial Intelligence**: Groq API (`llama-3.3-70b-versatile` e `whisper-large-v3`).
- **PDF Engine**: ReportLab 5.0 (Generazione nativa A4).
- **Frontend App**: Vite, React 18, Tailwind CSS, Lucide Icons, Recharts.
- **Deployment OS**: Ottimizzato nativamente per l'esecuzione e compilazione su ambienti Windows.

---

## 🚀 Avvio & Utilizzo

### Esecuzione Diretta
Doppio click su `PetruzziManager.exe` generato nella cartella `dist`.

### Avvio in Background 24/7 (Senza Finestra)
Eseguire il file `start_invisibile.vbs` tramite doppio click.

### Avvio Motore WhatsApp (Evolution API)
Eseguire `avvia_whatsapp.bat` per gestire Docker e l'Evolution API.

### Compilazione del File Eseguibile (.exe)
Lanciare `crea_eseguibile.bat` per installare l'ambiente e generare l'eseguibile Windows.

---

*Caseificio Petruzzi © 1923 - 2026 — Gestione Ordini & Produzione Laboratorio*