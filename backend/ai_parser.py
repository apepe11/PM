import importlib
import os
import re
import json
import time
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Any, Optional, cast

# Configurazione Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# INSERISCI LA TUA API KEY DI GEMINI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AQ.Ab8RN6KDCgIhFvS-6pw5UdsdqzXCKPuJK7INgERffn79e9S26w")

# Carica google.generativeai dinamicamente per evitare problemi di tipizzazione pyright/pylance
_genai_module = importlib.import_module("google.generativeai")
genai = cast(Any, _genai_module)
if hasattr(genai, "configure"):
    genai.configure(api_key=GEMINI_API_KEY)

# Lock e pacing rate-limiter per Gemini (max 15 RPM = 1 richiesta ogni 4 secondi)
GEMINI_LOCK = asyncio.Lock()
LAST_GEMINI_REQUEST_TIME = 0.0

def calcola_data_consegna_target(ora_attuale: Optional[datetime] = None) -> tuple[datetime, str]:
    """
    Calcola la data di consegna target per la produzione.
    REGOLA FERIALE: L'arco temporale per le consegne del giorno X va dalle 08:00 del giorno X-1 alle 08:00 del giorno X.
    REGOLA WEEKEND: dal Sabato alle 08:00 al Lunedì alle 08:00, tutti gli ordini senza data sono destinati a LUNEDÌ.
    """
    if ora_attuale is None:
        ora_attuale = datetime.now()

    w = ora_attuale.weekday()  # 0=Lunedì, 1=Martedì, ..., 5=Sabato, 6=Domenica
    h = ora_attuale.hour

    # 1. GESTIONE ECCEZIONE WEEKEND (Sabato 08:00 -> Lunedì 08:00 = Consegna Lunedì)
    if (w == 5 and h >= 8) or w == 6 or (w == 0 and h < 8):
        if w == 5:
            days_ahead = 2
        elif w == 6:
            days_ahead = 1
        else:
            days_ahead = 0
        data_target = ora_attuale + timedelta(days=days_ahead)
        desc = (
            f"📅 ARCO TEMPORALE FINE SETTIMANA (Dal Sabato ore 08:00 al Lunedì ore 08:00).\n"
            f"Se nel messaggio non è indicata una data espressa, l'ordine è destinato a LUNEDÌ ({data_target.strftime('%Y-%m-%d')}).\n"
            f"Data di consegna di default: \"{data_target.strftime('%Y-%m-%d')}\"."
        )
        
    # 2. GESTIONE GIORNI FERIALI (Finestra esatta di 24 ore: 08:00 -> 08:00)
    else:
        if h < 8:
            days_ahead = 0  # Ordine arrivato prima delle 8:00 -> Produzione di OGGI
        else:
            days_ahead = 1  # Ordine arrivato dopo le 8:00 -> Produzione di DOMANI
            
        data_target = ora_attuale + timedelta(days=days_ahead)
        desc = (
            f"📅 REGOLA GENERALE CONSEGNA (Finestra 24h: dalle 08:00 alle 08:00):\n"
            f"Se nel messaggio del cliente NON è indicata una data specifica, "
            f"l'ordine è destinato TASSATIVAMENTE ALLA DATA PRECALCOLATA ({data_target.strftime('%Y-%m-%d')}).\n"
            f"Data di consegna di default: \"{data_target.strftime('%Y-%m-%d')}\"."
        )

    return data_target, desc

class AIParser:
    def __init__(self, base_dir="catalogo"):
        self.base_dir = base_dir
        
        # 1. Carica il catalogo (Lista di oggetti)
        self.catalog = self._load_json(os.path.join(base_dir, "catalogo_prodotti.json"), [])
        
        # 2. Carica i sinonimi e li trasforma in un dizionario veloce per il parser
        raw_synonyms = self._load_json(os.path.join(base_dir, "catalogo_sinonimi.json"), [])
        self.synonyms_map = {}
        for item in raw_synonyms:
            cod_art = item.get("codice_articolo")
            if cod_art:
                self.synonyms_map[cod_art] = item.get("sinonimi", "")
                
        # 3. Carica le regole clienti (Oggetto con array 'clienti')
        self.client_rules = self._load_json(os.path.join(base_dir, "particolarita_clienti.json"), {"clienti": []})

    def _load_json(self, file_path, default_value):
        """Funzione sicura per caricare i JSON locali."""
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    logging.info(f"📂 Caricato con successo: {file_path}")
                    return data
            except Exception as e:
                logging.error(f"⚠️ Errore nel caricamento di {file_path}: {e}")
        else:
            logging.warning(f"⚠️ File non trovato: '{file_path}'. Verrà usato il valore di default.")
        return default_value

    def is_courtesy_or_non_order(self, text: str) -> bool:
        """Filtra i messaggi di cortesia, saluti, conferme generiche, vocali/media o PDF per non sprecare token IA."""
        if not text:
            return True
        t_lower = text.lower().strip()

        if t_lower in {'vocale o media', 'vocale', 'media', 'audio', 'foto', 'immagine', 'sticker', 'adesivo'}:
            return True

        courtesy_words = {
            'ok', 'okk', 'okey', 'oki', 'okkk', 'k', 'kk',
            'grazie', 'grz', 'grazieee', 'mille', 'ringrazio', 'ringraziamo',
            'perfetto', 'perfetti', 'perfetta', 'bene', 'vabene', 'ottimo', 'ottima',
            'ricevuto', 'confermato', 'conferma', 'confermo',
            'ciao', 'salve', 'buonasera', 'buongiorno', 'buondì', 'buondi',
            'a domani', 'domani', 'stasera', 'nulla', 'niente',
            'certamente', 'daccordo', 'd accordo', 'va bene', 'vabene', 'prego', 'buon lavoro',
            'buona giornata', 'buona serata', 'a dopo', 'a piu tardi', 'a più tardi',
            'tutto ok', 'tutto bene', 'tutto a posto', 'a posto', 'aposto', 'tutto', 'tutta', 'tutti', 'tutte',
            'ti', 'vi', 'per', 'la', 'il', 'lo', 'le', 'i', 'gli', 'di', 'del', 'della', 'd', 'dell', 'a', 'va', 'e', 'ed', 'o',
            'disponibilita', 'disponibilità', 'risposta', 'cortesia', 'gentilezza',
            'saluti', 'cordiali', 'baci', 'abbracci'
        }

        tokens = re.sub(r'[^\w\s]', ' ', t_lower).split()
        if not tokens: # Soltanto emoji o simboli (es. 👍, 🙏, 😊)
            return True

        if all(w in courtesy_words for w in tokens):
            return True

        if re.search(r'\b[a-z]{2}\d{2}[a-z0-9]{10,30}\b|\.pdf\b|\bpdf\b|\bfattura\b|\biban\b|\blistino\b|\bcatalogo\b', t_lower):
            return True

        return False

    def get_specific_client_rules(self, client_name: str) -> str:
        """Cerca il cliente nell'array 'clienti' ed estrae tutte le sue abitudini e lo storico."""
        client_name_lower = client_name.lower()
        lista_clienti = self.client_rules.get("clienti", [])
        
        for cliente in lista_clienti:
            nome_registrato = cliente.get("nome_cliente", "")
            
            if nome_registrato.lower() in client_name_lower or client_name_lower in nome_registrato.lower():
                particolarita = cliente.get("particolarita", "")
                ric_def = cliente.get("ricotta_default", "")
                mozz_def = cliente.get("mozzarella_default", "")
                storico = cliente.get("storico_ordini_esempi", [])
                
                rule_text = f"\n⚠️ ATTENZIONE - ABITUDINI E PARTICOLARITÀ DEL CLIENTE '{nome_registrato}':\n"
                if particolarita: rule_text += f"- Regole Generali: {particolarita}\n"
                if ric_def: rule_text += f"- Se ordina ricotta senza specificare, intende: {ric_def}\n"
                if mozz_def: rule_text += f"- Se ordina mozzarella senza specificare, intende: {mozz_def}\n"
                
                if storico:
                    rule_text += "- ESEMPI STORICI (TRADUCI ESATTAMENTE COSÌ I SUOI ORDINI):\n"
                    for es in storico:
                        rule_text += f"  * Messaggio: \"{es.get('messaggio_raw')}\"\n"
                        rule_text += f"    Traduzione IA Richiesta: {json.dumps(es.get('traduzione_ia'), ensure_ascii=False)}\n"
                        
                return rule_text
        return ""

    def build_system_instruction(self, client_name: str = "", campioni_passati_str: str = ""):
        catalog_formatted = json.dumps(self.catalog, indent=2, ensure_ascii=False)
        sinonimi_formatted = json.dumps(self.synonyms_map, indent=2, ensure_ascii=False)
        
        regole_cliente = ""
        if client_name:
            client_rules = {c.get('nome_cliente', ''): c for c in self.client_rules.get('clienti', [])}
            if client_name in client_rules:
                p = client_rules[client_name]
                regole_cliente = f"\nREGOLE PARTICOLARI PER CLIENTE '{client_name}': {json.dumps(p, ensure_ascii=False)}\n"

        campioni_block = f"\nSTORICO CAMPIONI CONFERMATI PER IL CLIENTE '{client_name}':\n{campioni_passati_str}\n" if campioni_passati_str else ""

        data_target, descrizione_slot = calcola_data_consegna_target()
        data_default_str = data_target.strftime('%Y-%m-%d')

        return f"""Sei l'assistente IA del Caseificio Petruzzi. 
            Il tuo compito è analizzare la conversazione WhatsApp con il cliente ed estrarre l'ordine FINALE CONSOLIDATO.

            REGOLE TASSATIVE PER L'ANALISI DELLA CONVERSAZIONE NELLA SUA INTEREZZA:
            1. ANALISI STORICO COMPLETO: Ti viene fornito lo "STORICO CONVERSAZIONE DI OGGI CON {client_name}" ed il "NUOVO MESSAGGIO". DEVI VALUTARE LA CONVERSAZIONE NELLA SUA INTEREZZA!
            2. AGGIUNTE / INTEGRAZIONI: Se il cliente invia messaggi aggiuntivi (es. "aggiungi anche 2kg trecce"), DEVI SOMMARE o AGGIUNGERE i nuovi prodotti a quelli richiesti in precedenza nello storico.
            3. CORREZIONI / SOSTITUZIONI: Se il cliente corregge un messaggio precedente (es. "no scusa anziché nodini volevo trecce", oppure "cambia la mozzarella da 5kg a 3kg"), DEVI APPLICARE LA MODIFICA/SOSTITUZIONE nel risultato finale!
            4. ANNULLAMENTO DELL'ORDINE: Se il cliente richiede di annullare o cancellare l'ordine (es. "annulla l'ordine", "cancella tutto", "scusa per oggi non mi serve più nulla", "elimina l'ordine"), DEVI IMPOSTARE:
               - "is_order": false
               - "is_cancelled": true
               - "prodotti": []
               - "note_ordine": "Ordine annullato dal cliente via WhatsApp"

            REGOLE TASSATIVE DATA DI CONSEGNA:
            1. SE NON SPECIFICATO -> GIORNO DOPO: Se nel messaggio del cliente NON è indicata espressamente un'altra data (es. "per oggi 8 agosto"), l'ordine è TASSATIVAMENTE DESTINATO AL GIORNO DOPO / PROSSIMO GIORNO DI CONSEGNA.
            2. DATA DI DEFAULT DA USARE: "{data_default_str}". Assegna questa data a meno che il cliente non richieda in modo inequivocabile un'altra data nel testo.
            {descrizione_slot}

            CATALOGO PRODOTTI UFFICIALE:
            {catalog_formatted}
            {regole_cliente}
            {campioni_block}

            REGOLE DI MAPPATURA PRODOTTI:
            1. Mappa i nomi colloquiali al codice esatto aiutandoti con i sinonimi.
            2. STRACCIATELLA AD-HOC: Se il cliente è "Sole 365", la stracciatella generica DEVE ESSERE MAPPATA A "STRACPE" (sfusa 1kg). Per TUTTI GLI ALTRI clienti, DEVE ESSERE MAPPATA A "STRA20250PE" (vaschetta 0,250KG).
            3. RICOTTA FRESCA + GIORNO PRIMA: Se nello stesso messaggio il cliente richiede sia ricotte fresche sia ricotte fredde / del giorno prima, DEVI SOMMARE le quantità totali del codice "RICOTPE" ed inserire la nota esplicativa nelle "note_ordine" (es. "5kg fresca + 5kg giorno prima").
            4. Identifica la quantità espressa (es. 2 kg, 5 pezzi). Se non specificato, prodotti a peso fisso = "pezzi", resto = "kg".

            RISPONDI ESCLUSIVAMENTE CON UN OGGETTO JSON PURO SENZA FORMATTAZIONI MARKDOWN (NO ```json):
            {{
            "testo_trascritto": "trascrizione testuale integrale in italiano (se presente messaggio vocale)",
            "is_order": true/false,
            "is_cancelled": true/false,
            "data_consegna": "YYYY-MM-DD",
            "prodotti": [
                {{
                "codice_articolo": "CODICE_ESATTO",
                "quantita": 1.0,
                "unita_di_misura": "kg" / "pezzi"
                }}
            ],
            "note_ordine": "eventuali note esplicative",
            "da_verificare_manualmente": false
            }}"""

    async def parse_message(self, text_to_parse: str, client_name: str = "Cliente", storico_oggi: str = "", audio_data: Optional[str] = None, mime_type: str = "audio/ogg"):
        global LAST_GEMINI_REQUEST_TIME

        if not audio_data and self.is_courtesy_or_non_order(text_to_parse):
            return {
                "is_order": False,
                "cliente_id": client_name,
                "prodotti": [],
                "note_ordine": "Messaggio di cortesia o informativo.",
                "da_verificare_manualmente": False
            }

        from backend.db import get_campioni_ia_cliente
        campioni = await get_campioni_ia_cliente(client_name)
        campioni_str = ""
        if campioni:
            campioni_str = "\n".join([f"- Input: \"{c['testo_originale']}\" -> Traduzione confermata: {json.dumps(c['dati_confermati'], ensure_ascii=False)}" for c in campioni])

        max_attempts = 2
        for attempt in range(max_attempts):
            async with GEMINI_LOCK:
                now = time.time()
                elapsed = now - LAST_GEMINI_REQUEST_TIME
                min_pacing = 4.0  # Garantisce max 15 richieste/minuto per non superare il rate limit Gemini
                if elapsed < min_pacing:
                    wait_time = min_pacing - elapsed
                    logging.info(f"⏳ Spaziatura rate-limit Gemini ({wait_time:.1f}s)...")
                    await asyncio.sleep(wait_time)

                LAST_GEMINI_REQUEST_TIME = time.time()

                try:
                    prompt_sistema = self.build_system_instruction(client_name, campioni_str)
                    
                    model = genai.GenerativeModel( 
                        model_name='gemini-flash-lite-latest',
                        system_instruction=prompt_sistema
                    )
                    
                    if storico_oggi:
                        prompt_utente = f"STORICO CONVERSAZIONE DI OGGI CON {client_name}:\n{storico_oggi}\n\nNUOVO MESSAGGIO DI CORREZIONE/AGGIUNTA:\n\"{text_to_parse}\""
                    else:
                        prompt_utente = f"Messaggio ricevuto da {client_name}:\n\"{text_to_parse}\""
                    
                    if audio_data:
                        prompt_utente += "\n(Ascolta l'audio allegato ed estrai i prodotti ordinati dal cliente)"
                        contents = [
                            prompt_utente,
                            {
                                "mime_type": mime_type,
                                "data": audio_data
                            }
                        ]
                    else:
                        contents = prompt_utente

                    response = await model.generate_content_async(
                        contents,
                        generation_config={"temperature": 0.0, "response_mime_type": "application/json"}
                    )
                    
                    raw_text = response.text.strip()
                    parsed_json = json.loads(raw_text)
                    parsed_json["cliente_id"] = client_name

                    is_sole_365 = "sole 365" in client_name.lower() or "sole365" in client_name.lower()
                    prodotti_parsed = parsed_json.get("prodotti", [])
                    for p in prodotti_parsed:
                        cod = p.get("codice_articolo", "")
                        nome = (p.get("nome_articolo") or "").lower()
                        if "stracciatella" in nome or cod in ["STRACPE", "STRA20250PE"]:
                            if is_sole_365:
                                p["codice_articolo"] = "STRACPE"
                                p["nome_articolo"] = "Stracciatella Petruzzi (Sfusa 1kg)"
                            else:
                                p["codice_articolo"] = "STRA20250PE"
                                p["nome_articolo"] = "Stracciatella Petruzzi 0,250KG"

                    return parsed_json

                except Exception as e:
                    err_str = str(e)
                    if "429" in err_str or "quota" in err_str.lower() or "resourceexhausted" in err_str.lower():
                        if attempt == 0:
                            logging.warning("⚠️ Quota Gemini temporanea. Pausa di 4s prima di riprovare con l'IA...")
                            await asyncio.sleep(4.0)
                            continue
                    
                    logging.error(f"❌ Errore IA: {e}. Attivazione Parser Locale di riserva.")
                    return self.fallback_local_parse(text_to_parse, client_name)

        return self.fallback_local_parse(text_to_parse, client_name)

    def fallback_local_parse(self, text_to_parse: str, client_name: str) -> dict:
        """Parser deterministico locale basato sul catalogo e sinonimi se l'API IA fallisce o quota superata."""
        prodotti_trovati = []
        raw_synonyms = self._load_json(os.path.join(self.base_dir, "catalogo_sinonimi.json"), [])
        
        syn_entries = []
        for item in raw_synonyms:
            cod = item.get("codice_articolo")
            nome = item.get("nome_articolo", "")
            um = (item.get("unita_misura") or "kg").lower()
            syns = [s.strip().lower() for s in item.get("sinonimi", "").split(",") if s.strip()]
            syn_entries.append({"cod": cod, "nome": nome, "um": um, "sinonimi": syns})

        matches = re.findall(r'(?:n[°\s]*)?(\d+(?:[.,]\d+)?)\s*([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]{2,30})', text_to_parse, re.IGNORECASE)

        for qta_str, prod_raw in matches:
            try:
                qta = float(qta_str.replace(',', '.'))
            except ValueError:
                qta = 1.0

            p_clean = prod_raw.strip().lower()
            matched_entry = None
            
            for entry in syn_entries:
                for syn in entry["sinonimi"]:
                    if syn in p_clean or p_clean in syn:
                        matched_entry = entry
                        break
                if matched_entry:
                    break

            if matched_entry:
                prodotti_trovati.append({
                    "codice_articolo": matched_entry["cod"],
                    "nome_articolo": matched_entry["nome"],
                    "quantita": qta,
                    "unita_di_misura": matched_entry["um"]
                })

        data_target, _ = calcola_data_consegna_target()

        is_canc = bool(re.search(r'\b(?:annulla|cancella|disdici|elimina|non portarmi|non mi serve)\b', text_to_parse, re.IGNORECASE))

        return {
            "is_order": not is_canc and len(prodotti_trovati) > 0,
            "is_cancelled": is_canc,
            "cliente_id": client_name,
            "data_consegna": data_target.strftime('%Y-%m-%d'),
            "prodotti": [] if is_canc else prodotti_trovati,
            "note_ordine": "[Annullato dal cliente via WhatsApp]" if is_canc else f"[Parser Locale di Riserva] {text_to_parse}",
            "da_verificare_manualmente": not is_canc and len(prodotti_trovati) == 0
        }