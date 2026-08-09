import importlib
import os
import re
import json
import time
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Any, Optional, cast

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY non impostata. Creare un file .env con GEMINI_API_KEY=...")

_genai_module = importlib.import_module("google.generativeai")
genai = cast(Any, _genai_module)
if hasattr(genai, "configure"):
    genai.configure(api_key=GEMINI_API_KEY)

GEMINI_LOCK = asyncio.Lock()
LAST_GEMINI_REQUEST_TIME = 0.0

def calcola_data_consegna_target(ora_attuale: Optional[datetime] = None) -> tuple[datetime, str]:
    """
    Calcola la data di consegna target in base all'orario in cui il CLIENTE ha inviato il messaggio.
    """
    if ora_attuale is None:
        ora_attuale = datetime.now()

    h = ora_attuale.hour

    if h < 8:
        data_target = ora_attuale
        desc = (
            f"📅 REGOLE TEMPORALI (< 08:00):\n"
            f"Il messaggio è stato inviato dal cliente in data {ora_attuale.strftime('%Y-%m-%d')} alle ore {ora_attuale.strftime('%H:%M:%S')}.\n"
            f"Essendo arrivato prima delle 08:00, la data di consegna di default (se il cliente dice 'oggi') è lo stesso giorno: \"{data_target.strftime('%Y-%m-%d')}\"."
        )
    else:
        data_target = ora_attuale + timedelta(days=1)
        desc = (
            f"📅 REGOLE TEMPORALI (>= 08:00):\n"
            f"Il messaggio è stato inviato dal cliente in data {ora_attuale.strftime('%Y-%m-%d')} alle ore {ora_attuale.strftime('%H:%M:%S')}.\n"
            f"Avendo superato le 08:00, l'ordine SLITTA AUTOMATICAMENTE al giorno dopo.\n"
            f"Data di consegna di default (se il cliente dice 'per domani'): \"{data_target.strftime('%Y-%m-%d')}\"."
        )

    return data_target, desc
class AIParser:
    def __init__(self, base_dir="catalogo"):
        self.base_dir = base_dir
        self.catalog = self._load_json(os.path.join(base_dir, "catalogo_prodotti.json"), [])
        
        raw_synonyms = self._load_json(os.path.join(base_dir, "catalogo_sinonimi.json"), [])
        self.synonyms_map = {}
        for item in raw_synonyms:
            cod_art = item.get("codice_articolo")
            if cod_art:
                self.synonyms_map[cod_art] = item.get("sinonimi", "")
                
        self.client_rules = self._load_json(os.path.join(base_dir, "particolarita_clienti.json"), {"clienti": []})

    def _load_json(self, file_path, default_value):
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    logging.info(f"📂 Caricato con successo: {file_path}")
                    return data
            except Exception as e:
                logging.error(f"⚠️ Errore nel caricamento di {file_path}: {e}")
        return default_value

    def is_courtesy_or_non_order(self, text: str) -> bool:
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
            'tutto ok', 'tutto bene', 'tutto a posto', 'a posto', 'aposto',
            'disponibilita', 'disponibilità', 'risposta', 'cortesia', 'gentilezza',
            'saluti', 'cordiali', 'baci', 'abbracci'
        }

        tokens = re.sub(r'[^\w\s]', ' ', t_lower).split()
        if not tokens: 
            return True

        if all(w in courtesy_words for w in tokens):
            return True

        if re.search(r'\b[a-z]{2}\d{2}[a-z0-9]{10,30}\b|\.pdf\b|\bpdf\b|\bfattura\b|\biban\b|\blistino\b|\bcatalogo\b', t_lower):
            return True

        return False

    def get_specific_client_rules(self, client_name: str) -> str:
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

    def build_system_instruction(self, client_name: str = "", campioni_passati_str: str = "", message_timestamp: Optional[datetime] = None):
        catalog_formatted = json.dumps(self.catalog, indent=2, ensure_ascii=False)
        sinonimi_formatted = json.dumps(self.synonyms_map, indent=2, ensure_ascii=False)
        
        regole_cliente = ""
        if client_name:
            client_rules = {c.get('nome_cliente', ''): c for c in self.client_rules.get('clienti', [])}
            if client_name in client_rules:
                p = client_rules[client_name]
                regole_cliente = f"\nREGOLE PARTICOLARI PER CLIENTE '{client_name}': {json.dumps(p, ensure_ascii=False)}\n"

        campioni_block = f"\nSTORICO CAMPIONI CONFERMATI PER IL CLIENTE '{client_name}':\n{campioni_passati_str}\n" if campioni_passati_str else ""

        data_target, descrizione_slot = calcola_data_consegna_target(message_timestamp)
        data_default_str = data_target.strftime('%Y-%m-%d')

        return f"""Sei l'assistente IA del Caseificio Petruzzi. 
            Il tuo compito è analizzare la conversazione WhatsApp con il cliente ed estrarre l'ordine FINALE CONSOLIDATO.

            REGOLE TASSATIVE PER L'ANALISI DELLA CONVERSAZIONE NELLA SUA INTEREZZA:
            1. ANALISI STORICO COMPLETO: Ti viene fornito lo "STORICO CONVERSAZIONE DI OGGI CON {client_name}" ed il "NUOVO MESSAGGIO". DEVI VALUTARE LA CONVERSAZIONE NELLA SUA INTEREZZA!
            2. AGGIUNTE / INTEGRAZIONI: Se il cliente invia messaggi aggiuntivi (es. "aggiungi anche 2kg trecce"), DEVI SOMMARE o AGGIUNGERE i nuovi prodotti a quelli richiesti in precedenza.
            3. CORREZIONI / SOSTITUZIONI: Se il cliente corregge un messaggio precedente (es. "cambia la mozzarella da 5kg a 3kg"), DEVI APPLICARE LA MODIFICA nel risultato finale.
            4. ANNULLAMENTO DELL'ORDINE: Se il cliente richiede di annullare o cancellare l'ordine, imposta "is_cancelled": true e svuota l'array dei prodotti.

            REGOLE TASSATIVE DATA DI CONSEGNA:
            1. SE NON SPECIFICATO -> CONSEGNA TASSATIVA: Usa la DATA DI DEFAULT: "{data_default_str}".
            {descrizione_slot}

            CATALOGO PRODOTTI UFFICIALE:
            {catalog_formatted}
            {regole_cliente}
            {campioni_block}

            REGOLE DI MAPPATURA E UNITA' DI MISURA (IMPORTANZA ESTREMA):
            1. STRACCIATELLA AD-HOC: Se il cliente è "Sole 365", la stracciatella generica DEVE ESSERE "STRACPE" (sfusa 1kg). Altrimenti, DEVE ESSERE "STRA20250PE" (vaschetta 0,250KG).
            2. UNITA' DI MISURA DA USARE:
               - Se il cliente ordina PEZZI, NUMERI INTERI O COPPIE (es. "2 stracciatella", "15 filoni", "5 coppie di silani"), DEVI INSERIRE "unita_di_misura": "pezzi" e come "quantita" il numero di pezzi (NB: 1 coppia = 2 pezzi, quindi 5 coppie = 10 pezzi).
               - Se il cliente ordina CHILI o GRAMMI (es. "2 kg di stracciatella", "1 hg di bocconcini"), DEVI INSERIRE "unita_di_misura": "kg" e convertire i grammi in kg (es. 1 hg = 0.1 kg).
               - NON ESEGUIRE TU IL CALCOLO MATEMATICO DEI PEZZI IN CHILI. Assegna semplicemente i "pezzi", Python lo farà per te!

            RISPONDI ESCLUSIVAMENTE CON UN OGGETTO JSON PURO SENZA FORMATTAZIONI MARKDOWN (NO ```json):
            {{
            "testo_trascritto": "trascrizione testuale integrale in italiano",
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

    async def parse_message(self, text_to_parse: str, client_name: str = "Cliente", storico_oggi: str = "", audio_data: Optional[str] = None, mime_type: str = "audio/ogg", message_timestamp: Optional[datetime] = None):
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
                min_pacing = 4.0
                if elapsed < min_pacing:
                    wait_time = min_pacing - elapsed
                    logging.info(f"⏳ Spaziatura rate-limit Gemini ({wait_time:.1f}s)...")
                    await asyncio.sleep(wait_time)
                LAST_GEMINI_REQUEST_TIME = time.time()

            try:
                prompt_sistema = self.build_system_instruction(client_name, campioni_str, message_timestamp)
                
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
                    qta = float(p.get("quantita", 1.0))
                    um = p.get("unita_di_misura", "kg").lower()

                    if "stracciatella" in nome or cod in ["STRACPE", "STRA20250PE"]:
                        if is_sole_365:
                            p["codice_articolo"] = "STRACPE"
                            p["nome_articolo"] = "Stracciatella Petruzzi (Sfusa 1kg)"
                            nome = "Stracciatella Petruzzi (Sfusa 1kg)".lower()
                        else:
                            p["codice_articolo"] = "STRA20250PE"
                            p["nome_articolo"] = "Stracciatella Petruzzi 0,250KG"
                            nome = "Stracciatella Petruzzi 0,250KG".lower()

                    import re
                    match_kg = re.search(r'(\d+(?:\.\d+)?)\s*kg\b', nome.replace(',', '.'))
                    peso_unitario = float(match_kg.group(1)) if match_kg else 0.0

                    if peso_unitario > 0 and um in ["pezzi", "pz", "vaschette", "unità"]:
                        p["quantita"] = round(qta * peso_unitario, 3)
                        p["unita_di_misura"] = "kg"

                return parsed_json

            except Exception as e:
                err_str = str(e)
                if "429" in err_str or "quota" in err_str.lower() or "resourceexhausted" in err_str.lower():
                    if attempt == 0:
                        logging.warning("⚠️ Quota Gemini temporanea. Pausa di 4s prima di riprovare con l'IA...")
                        await asyncio.sleep(4.0)
                        continue
                
                logging.error(f"❌ Errore IA: {e}. Attivazione Parser Locale di riserva.")
                return self.fallback_local_parse(text_to_parse, client_name, message_timestamp)

        return self.fallback_local_parse(text_to_parse, client_name, message_timestamp)

    def fallback_local_parse(self, text_to_parse: str, client_name: str, message_timestamp: Optional[datetime] = None) -> dict:
        # Scarta subito se il testo è dominato da cifre tipiche di telefono/orario
        testo_pulito_cifre = re.sub(r'[\s\-\.\(\)\+:]', '', text_to_parse)
        if testo_pulito_cifre.isdigit() and len(testo_pulito_cifre) >= 6:
            return {
                "is_order": False, "is_cancelled": False, "cliente_id": client_name,
                "prodotti": [], "note_ordine": "[Parser Locale] Testo scartato: sembra un numero/orario.",
                "da_verificare_manualmente": True
            }

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

            # Scarta quantità implausibili (probabile falso positivo, es. orario "14:30" letto come "14")
            if qta <= 0 or qta > 500:
                continue

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

        data_target, _ = calcola_data_consegna_target(message_timestamp)
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