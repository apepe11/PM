import os
import re
import json
import time
import logging
import asyncio
import itertools
from datetime import datetime, timedelta
from typing import Optional, Tuple, Union, Any

from dotenv import load_dotenv
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from groq import AsyncGroq

from backend.paths import get_persistent_path, get_static_path

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY non impostata. Creare un file .env con GEMINI_API_KEY=...")

# Configurazione del client Google Gemini
genai.configure(api_key=GEMINI_API_KEY)  # type: ignore

# Setup Groq (Motore di Riserva)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client_groq = None
if GROQ_API_KEY:
    try:
        client_groq = AsyncGroq(api_key=GROQ_API_KEY, timeout=10.0, max_retries=1)
    except Exception as e:
        logging.warning(f"⚠️ Errore inizializzazione client Groq: {e}")
GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")

# 🔄 GIOSTRA DEI MODELLI: Lista di tutti i modelli leggeri gratuiti (priorità a quelli con quota 1500 RPD)
GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-3.7-flash",
    "gemini-3.6-flash"
]

# Iteratore ciclico per moltiplicare i limiti giornalieri gratuiti
model_cycler = itertools.cycle(GEMINI_MODELS)

GEMINI_LOCK = asyncio.Lock()
LAST_GEMINI_REQUEST_TIME = 0.0


def calcola_data_consegna_target(ora_attuale: Optional[datetime] = None, client_name: str = "") -> Tuple[str, str]:
    if ora_attuale is None:
        ora_attuale = datetime.now()

    h = ora_attuale.hour
    wd = ora_attuale.weekday()

    if h < 8:
        data_target = ora_attuale
        desc = (
            f"📅 REGOLA ORARIA DI DEFAULT (< 08:00):\n"
            f"Il messaggio è arrivato alle {ora_attuale.strftime('%H:%M:%S')}.\n"
            f"Se il testo NON specifica un giorno, imposta la consegna di DEFAULT per OGGI: \"{data_target.strftime('%Y-%m-%d')}\"."
        )
    else:
        if wd == 5: # Sabato salta a Lunedì
            data_target = ora_attuale + timedelta(days=2)
        else: # Altri giorni passano a domani
            data_target = ora_attuale + timedelta(days=1)
            
        if data_target.weekday() == 6: # Se domani cade di Domenica, sposta a Lunedì
            data_target += timedelta(days=1)
            
        desc = (
            f"📅 REGOLA ORARIA DI DEFAULT (>= 08:00):\n"
            f"Il messaggio è arrivato alle {ora_attuale.strftime('%H:%M:%S')} (DOPO le ore 08:00).\n"
            f"Se il testo NON specifica un giorno, la consegna di DEFAULT è il prossimo giorno utile: \"{data_target.strftime('%Y-%m-%d')}\"."
        )

    return data_target.strftime('%Y-%m-%d'), desc

def estrai_cliente_reale(text_to_parse: str, client_name: str, message_timestamp: Optional[datetime]) -> str:
    """
    Capisce se l'ordine è diretto dal cliente o se è stato inoltrato dal Titolare (Andrea).
    Se è inoltrato, estrae il nome reale del cliente dal testo.
    """
    is_andrea = "3334695153" in client_name or "224257489502407" in client_name or "andrea aliandro" in client_name.lower()
    cliente_finale = client_name
    
    if is_andrea:
        estratto = None
        testo_pulito = text_to_parse.replace("🎙️ [VOCALE TRASCRITTO]:", "").strip()
        
        # Cerca pattern tipo: "Mario Rossi, 20/08" oppure "Mario Rossi:"
        match_full = re.match(r'^([^,:\n]{2,30})[,:]\s*\d{1,2}[./-]\d{1,2}', testo_pulito)
        if match_full:
            estratto = match_full.group(1).strip()
        else:
            match_simple = re.match(r'^([^,:\n]{2,20})[,:]', testo_pulito)
            if match_simple:
                estratto = match_simple.group(1).strip()
            else:
                match_vocale = re.match(r'^([a-zA-Z\s]{3,20})\s+\d{1,2}', testo_pulito)
                if match_vocale:
                    estratto = match_vocale.group(1).strip()

        if estratto and estratto.lower() not in ["null", "none", "andrea", "andrea aliandro", "sconosciuto"]:
            cliente_finale = estratto 
        else:
            dt_sicura = message_timestamp or datetime.now()
            cliente_finale = f"Cliente Non Specificato ({dt_sicura.strftime('%H:%M:%S')})"
            
    return cliente_finale

def normalizza_nome(nome: str) -> str:
    """Pulisce e uniforma il nome del cliente rimuovendo punteggiatura, spazi doppi e applicando title-case."""
    if not nome or not str(nome).strip():
        return "Sconosciuto"
    # Rimuove caratteri speciali/punteggiatura all'inizio e alla fine (preservando lettere accentate e parentesi)
    nome_pulito = re.sub(r'^[^\w\(\)]+|[^\w\(\)]+$', '', str(nome))
    if not nome_pulito.strip():
        return "Sconosciuto"
    # Rimuove gli spazi doppi e mette la Maiuscola ad ogni parola (es. "mario  rossi " -> "Mario Rossi")
    return " ".join(nome_pulito.split()).title()


class AIParser:
    def __init__(self, base_dir="catalogo"):
        self.base_dir = base_dir
        
        catalogo_path = get_static_path(os.path.join("catalogo", "catalogo.json"))
        particolarita_path = get_persistent_path(os.path.join("catalogo", "particolarita_clienti.json"))
        
        self.catalog = self._load_json(catalogo_path, [])
        
        self.synonyms_map = {}
        for item in self.catalog:
            cod_art = item.get("c")
            if cod_art:
                self.synonyms_map[cod_art] = item.get("s", "")
                
        self.client_rules = self._load_json(particolarita_path, [])

    def _load_json(self, file_path: str, default_value: Any) -> Any:
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
        t_lower = (text or "").lower().strip()

        if t_lower in {'vocale o media', 'vocale', 'media', 'audio', 'foto', 'immagine', 'sticker', 'adesivo'}:
            return True

        courtesy_words = {
            'ok', 'okk', 'okey', 'oki', 'okkk', 'k', 'kk',
            'grazie', 'grz', 'grazieee', 'mille', 'ringrazio', 'ringraziamo',
            'perfetto', 'perfetti', 'perfetta', 'bene', 'vabene', 'ottimo', 'ottima',
            'ricevuto', 'confermato', 'conferma', 'confermo',
            'ciao', 'salve', 'buonasera', 'buongiorno', 'buondì', 'buondi',
            'nulla', 'niente',
            'certamente', 'daccordo', 'd accordo', 'va bene', 'vabene', 'prego', 'buon lavoro',
            'buona giornata', 'buona serata', 'a dopo', 'a piu tardi', 'a più tardi',
            'tutto ok', 'tutto bene', 'tutto a posto', 'a posto', 'aposto'
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
        client_name_lower = (client_name or "").lower()
        lista_clienti = self.client_rules if isinstance(self.client_rules, list) else []
        
        for cliente in lista_clienti:
            nome_registrato = cliente.get("n", "")
            nome_registrato_lower = nome_registrato.lower().strip()

            if len(nome_registrato_lower) < 3: continue

            if nome_registrato_lower in client_name_lower or client_name_lower in nome_registrato_lower:
                particolarita = str(cliente.get("p", ""))[:100]
                ric_def = cliente.get("rd", "")
                mozz_def = cliente.get("md", "")
                strac_def = cliente.get("sd", "")
                
                rule_text = f"\n⚠️ REGOLE CLIENTE '{nome_registrato}':\n"
                if particolarita: rule_text += f"- Note: {particolarita}...\n"
                if ric_def: rule_text += f"- Default ricotta: {ric_def}\n"
                if mozz_def: rule_text += f"- Default mozzarella: {mozz_def}\n"
                if strac_def: rule_text += f"- Default stracciatella: {strac_def}\n"
                return rule_text
        return ""

    def build_system_instruction(self, client_name: str = "", message_timestamp: Optional[datetime] = None):
        if message_timestamp is None:
            message_timestamp = datetime.now()

        cat_items = []
        for p in self.catalog:
            cod = p.get("c", "")
            nome = p.get("n", "")
            syns = p.get("s", "")
            if cod and nome:
                cat_items.append(f"{cod}:{nome}({syns})")
        catalog_formatted = " | ".join(cat_items)

        regole_cliente = self.get_specific_client_rules(client_name)
        data_target_str, descrizione_slot = calcola_data_consegna_target(message_timestamp, client_name)

        is_andrea = "3334695153" in client_name or "224257489502407" in client_name or "andrea aliandro" in client_name.lower()
        andrea_rule = (
            "ORDINI INOLTRATI: Formato 'NomeCliente, Data, Ordine'. "
            "ESTRAI il NomeCliente (parola prima della virgola) in 'cliente_reale'. Altrimenti scrivi 'SCONOSCIUTO'."
        ) if is_andrea else "Il messaggio arriva direttamente dal cliente reale."

        giorni_it = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]
        oggi_nome = giorni_it[message_timestamp.weekday()]
        msg_date_str = message_timestamp.strftime('%Y-%m-%d')
        msg_time_str = message_timestamp.strftime('%H:%M:%S')
        
        cal_dopo = []
        for i in range(1, 8):
            d = message_timestamp + timedelta(days=i)
            cal_dopo.append(f"{giorni_it[d.weekday()]}={d.strftime('%Y-%m-%d')}")
        calendario = ", ".join(cal_dopo)

        return f"""Sei l'IA Caseificio Petruzzi. Estrai l'ordine in JSON rigoroso.
        
        🕒 TEMPO - MSG RICEVUTO IL: {oggi_nome.upper()} {msg_date_str} alle {msg_time_str}.
        Se specifica un giorno della settimana, USA QUESTO CALENDARIO: {calendario}.
        "domani"={cal_dopo[0].split('=')[1]}, "dopodomani"={cal_dopo[1].split('=')[1]}.
        Se non specifica NESSUNA data o giorno, usa il default: {descrizione_slot}
        
        REGOLE: {andrea_rule} "is_cancelled":true se annullato.
        
        INTEGRAZIONE STORICO (FONDAMENTALE):
        Se ti viene passato uno "STORICO OGGI", NON ELIMINARE I PRODOTTI GIÀ PRESENTI! 
        Il tuo compito è UNIRE i prodotti del nuovo messaggio con quelli dello storico. 
        - Se l'utente fa un'aggiunta, restituisci l'array "prodotti" con TUTTO lo storico + le aggiunte.
        - Se l'utente fa una rimozione/modifica, aggiorna le quantità dello storico.
        L'array "prodotti" finale in JSON deve SEMPRE contenere l'ordine COMPLETO e AGGIORNATO per quella giornata.
        
        CATALOGO: {catalog_formatted}
        {regole_cliente}

        MAPPATURA PRODOTTI AMBIGUI:
        1. SCAMORZE: "scamorze" senza specificare "confezionate" -> SFUSA. Usa "Conf." SOLO se richiesto.
        2. RICOTTA: "ricotta" generica -> 500g. "ricottina" o "300g" -> 300g/piccole.
        3. BURRATA: E' sempre a PEZZI. Se ordina 500g -> 2 pezzi, 1kg -> 4 pezzi. unita_di_misura: "pezzi".
        4. SFOGLIA DI MOZZARELLA (anche Delat / Senza Lattosio): E' da 500g a pezzo. Se ordina a pezzi o a peso (es. 1kg -> 2 pezzi), unita_di_misura: "pezzi".

        SCHEMA JSON:
        {{
        "testo_trascritto": "Se il messaggio conteneva un audio, scrivi qui la trascrizione. Altrimenti vuoto.",
        "ordini": [{{
            "is_order": true,
            "is_cancelled": false,
            "data_consegna": "YYYY-MM-DD",
            "cliente_reale": "NOME CLIENTE",
            "prodotti": [{{"codice_articolo": "COD", "nome_articolo": "NOME", "quantita": 1.0, "unita_di_misura": "pezzi/kg"}}],
            "note_ordine": "",
            "da_verificare_manualmente": false
        }}]
        }}"""

    def _format_parsed_result(self, parsed_json: dict, text_to_parse: str, client_name: str, message_timestamp: Optional[datetime]) -> dict:
        testo_trascritto = parsed_json.get("testo_trascritto", "")
        ordini_array = parsed_json.get("ordini", [])
        if not ordini_array and "prodotti" in parsed_json:
            ordini_array = [parsed_json]
        
        for ord_obj in ordini_array:
            # Estrazione unificata del cliente reale
            cliente_gemini = str(ord_obj.get("cliente_reale", "")).strip()
            if cliente_gemini and cliente_gemini.lower() not in ["null", "none", "sconosciuto"]:
                nome_grezzo = cliente_gemini
            else:
                nome_grezzo = estrai_cliente_reale(text_to_parse, client_name, message_timestamp)

            # APPLICA LA NORMALIZZAZIONE QUI
            ord_obj["cliente_id"] = normalizza_nome(nome_grezzo)

            prodotti_parsed = ord_obj.get("prodotti", [])
            for p in prodotti_parsed:
                cod = p.get("codice_articolo", "")
                nome = (p.get("nome_articolo") or "").lower()
                qta = float(p.get("quantita", 1.0))
                um = (p.get("unita_di_misura") or "kg").lower()

                match_kg = re.search(r'(\d+(?:\.\d+)?)\s*kg\b', nome.replace(',', '.'))
                peso_unitario = float(match_kg.group(1)) if match_kg else 0.0

                if peso_unitario > 0 and um in ["pezzi", "pz", "pezzo", "vaschette", "unità"]:
                    p["quantita"] = round(qta * peso_unitario, 3)
                    p["unita_di_misura"] = "kg"

            if not ord_obj.get("is_cancelled") and len(prodotti_parsed) == 0:
                ord_obj["is_order"] = False
                ord_obj["da_verificare_manualmente"] = True
                if not ord_obj.get("note_ordine"):
                    ord_obj["note_ordine"] = "Nessun prodotto individuato nel testo/vocale."

        return {
            "testo_trascritto": testo_trascritto,
            "ordini": ordini_array
        }

    async def _try_groq_fallback(self, prompt_sistema: str, prompt_utente: str, text_to_parse: str, client_name: str, message_timestamp: Optional[datetime]) -> Optional[dict]:
        if not client_groq:
            return None
        try:
            logging.info(f"🔄 Tentativo di fallback su GROQ ({GROQ_MODEL})...")
            groq_response = await client_groq.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": prompt_sistema},
                    {"role": "user", "content": prompt_utente}
                ],
                response_format={"type": "json_object"},
                max_completion_tokens=2048,
                temperature=0.0
            )
            raw_text = groq_response.choices[0].message.content
            if not raw_text:
                return None
            raw_text = raw_text.strip()
            match_json = re.search(r'(\{.*\})', raw_text, re.DOTALL)
            if match_json:
                raw_text = match_json.group(1)
            parsed_json = json.loads(raw_text)
            result = self._format_parsed_result(parsed_json, text_to_parse, client_name, message_timestamp)
            logging.info("✅ Ordine salvato con successo dal fallback GROQ!")
            return result
        except Exception as groq_e:
            logging.error(f"⚠️ Errore anche su Groq: {groq_e}. Passo al Parser Locale.")
            return None

    async def parse_message(self, text_to_parse: str, client_name: str = "Cliente", storico_oggi: str = "", audio_data: Optional[str] = None, mime_type: str = "audio/ogg", message_timestamp: Optional[datetime] = None):
        global LAST_GEMINI_REQUEST_TIME
        
        if message_timestamp is None:
            message_timestamp = datetime.now()

        # Check iniziale cortesia
        if not audio_data and self.is_courtesy_or_non_order(text_to_parse):
            return {
                "testo_trascritto": "",
                "ordini": [{
                    "is_order": False,
                    "cliente_id": normalizza_nome(estrai_cliente_reale(text_to_parse, client_name, message_timestamp)),
                    "prodotti": [],
                    "note_ordine": "Messaggio di cortesia o informativo.",
                    "da_verificare_manualmente": False
                }]
            }

        if storico_oggi and len(storico_oggi) > 150:
            storico_oggi = "[..]" + storico_oggi[-150:]

        prompt_sistema = self.build_system_instruction(client_name, message_timestamp=message_timestamp)
        prompt_utente = ""
        if storico_oggi:
            prompt_utente += f"STORICO OGGI ({client_name}):\n{storico_oggi}\nNUOVO MSG:\n"

        if audio_data:
            prompt_utente += f"Ascolta l'audio allegato inviato da {client_name}. Trascrivilo nel campo 'testo_trascritto'."
        else:
            prompt_utente += f"\"{text_to_parse}\""

        max_attempts = 4

        for attempt in range(max_attempts):
            async with GEMINI_LOCK:
                now = time.time()
                elapsed = now - LAST_GEMINI_REQUEST_TIME
                
                # Pacing immediato (grazie alla rotazione ciclica su 4 modelli Gemini)
                min_pacing = 0.5 
                if elapsed < min_pacing:
                    await asyncio.sleep(min_pacing - elapsed)
                LAST_GEMINI_REQUEST_TIME = time.time()

                # 🔄 PESCA IL MODELLO A ROTAZIONE
                current_model = next(model_cycler)
                logging.info(f"🔄 Usando il modello: {current_model} (Tentativo {attempt+1}) per {client_name}")

                try:
                    contents = []
                    if audio_data:
                        contents.append({"mime_type": mime_type, "data": audio_data})
                    contents.append(prompt_utente)

                    model = genai.GenerativeModel(  # type: ignore
                        model_name=current_model,
                        system_instruction=prompt_sistema,
                        generation_config={
                            "response_mime_type": "application/json",
                            "temperature": 0.0
                        }
                    )
                    
                    response = await model.generate_content_async(contents)
                    
                    raw_text = response.text.strip()
                    match_json = re.search(r'(\{.*\})', raw_text, re.DOTALL)
                    if match_json:
                        raw_text = match_json.group(1)

                    parsed_json = json.loads(raw_text)
                    return self._format_parsed_result(parsed_json, text_to_parse, client_name, message_timestamp)

                except ResourceExhausted as e:
                    logging.warning(f"⚠️ Rate Limit Gemini raggiunto per {current_model}. Tento il fallback su GROQ...")
                    
                    if client_groq and not audio_data:
                        groq_res = await self._try_groq_fallback(
                            prompt_sistema=prompt_sistema,
                            prompt_utente=prompt_utente,
                            text_to_parse=text_to_parse,
                            client_name=client_name,
                            message_timestamp=message_timestamp
                        )
                        if groq_res is not None:
                            return groq_res

                    await asyncio.sleep(2.0) 
                    if attempt == max_attempts - 1:
                        return self.fallback_local_parse(text_to_parse, client_name, message_timestamp)
                        
                except Exception as e:
                    logging.error(f"⚠️ Errore Gemini API ({current_model}): {e}")
                    
                    if client_groq and not audio_data:
                        groq_res = await self._try_groq_fallback(
                            prompt_sistema=prompt_sistema,
                            prompt_utente=prompt_utente,
                            text_to_parse=text_to_parse,
                            client_name=client_name,
                            message_timestamp=message_timestamp
                        )
                        if groq_res is not None:
                            return groq_res

                    await asyncio.sleep(1.0)
                    if attempt == max_attempts - 1:
                        return self.fallback_local_parse(text_to_parse, client_name, message_timestamp)

        return self.fallback_local_parse(text_to_parse, client_name, message_timestamp)

    def fallback_local_parse(self, text_to_parse: str, client_name: str, message_timestamp: Optional[datetime] = None) -> dict:
        """ 🧠 SUPER PARSER DI EMERGENZA (Divide in blocchi per precisione estrema) """
        
        testo_pulito_cifre = re.sub(r'[\s\-\.\(\)\+:]', '', text_to_parse or "")
        if testo_pulito_cifre.isdigit() and len(testo_pulito_cifre) >= 6:
            return {
                "testo_trascritto": "",
                "ordini": [{
                    "is_order": False, "is_cancelled": False, "cliente_id": client_name,
                    "prodotti": [], "note_ordine": "Scartato: sembra solo un orario/numero.",
                    "da_verificare_manualmente": True, "is_fallback": True
                }]
            }

        prodotti_trovati = []
        
        syn_entries = []
        for item in self.catalog:
            cod = item.get("c")
            nome = item.get("n", "")
            peso = item.get("p")
            um_default = "pezzi" if peso else "kg"
            syns = [s.strip().lower() for s in (item.get("s") or "").split(",") if s.strip()]
            syn_entries.append({"cod": cod, "nome": nome, "um": um_default, "sinonimi": syns})

        # DIVIDIAMO IL MESSAGGIO (Evita fusioni di quantità errate)
        testo_diviso = re.split(r',|\n|\se\s|\s\+\s', text_to_parse or "", flags=re.IGNORECASE)
        pattern = r'(?:[Nn][°\.\s]+|[Nn](?=\d)|[Pp]ezzo\s+|[Pp]ezzi\s+|[Pp]z\s+)?(\d+(?:[.,]\d+)?)\s*(kg|k|chili|kili|g|gr|grammi|pz|pezzi|pezzo|coppia|coppie|vaschette|vaschetta|cf)?\s*(?:di\s+)?([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]{3,35})'

        for blocco in testo_diviso:
            matches = re.findall(pattern, blocco, re.IGNORECASE)
            
            for qta_str, um_raw, prod_raw in matches:
                try:
                    qta = float(qta_str.replace(',', '.'))
                except ValueError:
                    qta = 1.0

                if qta <= 0 or qta > 500: continue

                p_clean = (prod_raw or "").strip().lower()
                um_clean = (um_raw or "").strip().lower()
                
                um_finale = "kg"
                if um_clean in ["pz", "pezzi", "pezzo", "coppia", "coppie", "vaschetta", "vaschette", "cf"] or blocco.strip().lower().startswith("n"):
                    um_finale = "pezzi"
                    if um_clean in ["coppia", "coppie"]: qta *= 2
                elif um_clean in ["g", "gr", "grammi"]:
                    um_finale = "kg"
                    qta = qta / 1000.0

                matched_entry = None
                for entry in syn_entries:
                    if any(syn == p_clean for syn in entry["sinonimi"]) or any(syn in p_clean for syn in entry["sinonimi"]):
                        matched_entry = entry
                        break

                if matched_entry:
                    if not um_clean: um_finale = matched_entry["um"]
                    prodotti_trovati.append({
                        "codice_articolo": matched_entry["cod"],
                        "nome_articolo": matched_entry["nome"],
                        "quantita": qta,
                        "unita_di_misura": um_finale
                    })

        # LOGICA DATE E REGOLE CLIENTE (Invariata)
        base_dt = message_timestamp if message_timestamp else datetime.now()
        t_lower = (text_to_parse or "").lower()
        data_target_str, _ = calcola_data_consegna_target(base_dt, client_name)
        data_target = datetime.strptime(data_target_str, '%Y-%m-%d')
        
        date_pattern = r'\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b'
        date_match = re.search(date_pattern, text_to_parse)
        if date_match:
            giorno, mese = int(date_match.group(1)), int(date_match.group(2))
            anno = int(date_match.group(3)) if date_match.group(3) else base_dt.year
            if anno < 100: anno += 2000
            try: data_target = datetime(anno, mese, giorno)
            except ValueError: pass
        elif "dopodomani" in t_lower:
            data_target = base_dt + timedelta(days=2)
            if data_target.weekday() == 6: data_target += timedelta(days=1)
        elif "domani" in t_lower or "dmn" in t_lower:
            data_target = base_dt + timedelta(days=1)
            if data_target.weekday() == 6: data_target += timedelta(days=1)
        elif "stasera" in t_lower or "oggi" in t_lower:
            data_target = base_dt

        is_canc = bool(re.search(r'\b(?:annulla|cancella|disdici|elimina|non portarmi|non mi serve)\b', t_lower, re.IGNORECASE))
        
        # CHIAMATA UNIFICATA AL CLIENTE REALE
        cliente_grezzo = estrai_cliente_reale(text_to_parse, client_name, message_timestamp)
        cliente_finale = normalizza_nome(cliente_grezzo) # <--- FILTRO APPLICATO

        # Non generiamo ordini automatici dal parser locale: salviamo come messaggio da verificare
        singolo_ordine = {
            "is_order": False,
            "is_cancelled": is_canc,
            "cliente_id": cliente_finale,
            "data_consegna": data_target.strftime('%Y-%m-%d'),
            "prodotti": [],
            "note_ordine": "[Annullato dal cliente via WhatsApp]" if is_canc else "",
            "da_verificare_manualmente": not is_canc,
            "is_fallback": True
        }

        return {
            "testo_trascritto": "",
            "ordini": [singolo_ordine]
        }