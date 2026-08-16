import os
import re
import json
import time
import logging
import asyncio
import base64
from datetime import datetime, timedelta
from typing import Optional, Tuple, Union, Any

from dotenv import load_dotenv
from groq import AsyncGroq

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
# Silenziamo i log interni della libreria HTTP che stampano gli errori 429/200 di default
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY non impostata. Creare un file .env con GROQ_API_KEY=...")

# Modello principale (Alta precisione)
GROQ_MODEL = "llama-3.3-70b-versatile"
# Modello di riserva (Leggermente meno preciso, ma limiti altissimi per evitare blocchi)
GROQ_FALLBACK_MODEL = "llama-3.1-8b-instant"
GROQ_AUDIO_MODEL = "whisper-large-v3"

GROQ_LOCK = asyncio.Lock()
LAST_GROQ_REQUEST_TIME = 0.0

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
            f"Se il cliente (o il Titolare che inoltra) NON ha specificato alcun giorno/orario nel testo, imposta la consegna di DEFAULT per OGGI: \"{data_target.strftime('%Y-%m-%d')}\"."
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
            f"Se il cliente (o il Titolare che inoltra) NON ha specificato alcun giorno/orario nel testo, lo scatto orario imposta la consegna di DEFAULT al prossimo giorno utile: \"{data_target.strftime('%Y-%m-%d')}\"."
        )

    return data_target.strftime('%Y-%m-%d'), desc

class AIParser:
    def __init__(self, base_dir="catalogo"):
        self.base_dir = base_dir
        
        catalogo_path = os.path.join(self.base_dir, "catalogo.json")
        particolarita_path = os.path.join(self.base_dir, "particolarita_clienti.json")
        
        self.catalog = self._load_json(catalogo_path, [])
        
        self.synonyms_map = {}
        for item in self.catalog:
            cod_art = item.get("c")
            if cod_art:
                self.synonyms_map[cod_art] = item.get("s", "")
                
        self.client_rules = self._load_json(particolarita_path, [])
        
        self.client_groq = AsyncGroq(api_key=GROQ_API_KEY, max_retries=0)
        self.current_model = GROQ_MODEL

    def reload_client_rules(self):
        particolarita_path = os.path.join(self.base_dir, "particolarita_clienti.json")
        self.client_rules = self._load_json(particolarita_path, [])
        logging.info(f"🔄 Regole clienti ricaricate in memoria ({len(self.client_rules)} clienti).")

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
        client_name_lower = (client_name or "").lower()
        lista_clienti = self.client_rules if isinstance(self.client_rules, list) else []
        
        for cliente in lista_clienti:
            nome_registrato = cliente.get("n", "")
            nome_registrato_lower = nome_registrato.lower().strip()

            if len(nome_registrato_lower) < 3:
                continue

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
        ) if is_andrea else ""

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
        
        CATALOGO: {catalog_formatted}
        {regole_cliente}

        MAPPATURA PRODOTTI AMBIGUI (MASSIMA ATTENZIONE):
        1. SCAMORZE: Se il cliente chiede "scamorze" o "scamorza" (bianche, affumicate, ecc.) senza specificare le parole "confezionate", "conf" o "imbustate", DEVI usare ESCLUSIVAMENTE la versione SFUSA (es. SCABIPE, SCAAFPE). Usa la versione "Conf." SOLO se c'è scritto esplicitamente "confezionate" o "conf".
        2. RICOTTA: Se il cliente chiede "ricotta" o "ricotte" senza specificare il peso, DEVI usare SEMPRE di default la Ricotta classica da 500g (codice RICOTPE). Usa la Ricotta da 300g (RIC300) o le Ricottine (RICPIC) SOLO SE scrive esplicitamente "300g", "piccole" o "ricottina".
        3. BURRATA (qualunque tipo: classica, tartufo, pistacchio, ecc.): La burrata è sempre conteggiata A PEZZI (unita_di_misura: "pezzi"). Se il cliente ordina ad es. "2 burrate", "1 burrata pistacchio" o "3 vaschette", la quantità è il numero di pezzi e l'unita_di_misura DEVE ESSERE "pezzi". Se indica il peso (es. "500g di burrata" o "1kg"), convertila sempre nel numero di pezzi corrispondenti (1 pezzo = 250g = 0.25kg, quindi 500g = 2 pezzi, 1kg = 4 pezzi) con unita_di_misura: "pezzi".

        MAPPATURA QUANTITÀ E RESI:
        - Usa ESATTAMENTE Codice/Nome. 
        - Se la quantità indica "N", "n.", "n", "pezzo", "pezzi" o "pz" (es. "N3 scamorze", "2 pezzi", "pz 4"), significa SEMPRE e SOLO "pezzi", MAI "kg".
        - Pezzi->pezzi, g/Kg sfusi->kg. 
        - Se chiede reso/cambio, calcola SOLO il saldo netto da consegnare in "prodotti". Note reso in "note_ordine".

        SCHEMA JSON DA RISPETTARE:
        {{
        "testo_trascritto": "",
        "ordini": [{{
            "is_order": true,
            "is_cancelled": false,
            "data_consegna": "YYYY-MM-DD",
            "cliente_reale": "NOME CLIENTE OPPURE 'SCONOSCIUTO'",
            "prodotti": [{{"codice_articolo": "COD", "nome_articolo": "NOME", "quantita": 1.0, "unita_di_misura": "pezzi/kg", "grammatura": ""}}],
            "note_ordine": "",
            "da_verificare_manualmente": false
        }}]
        }}"""

    async def parse_message(self, text_to_parse: str, client_name: str = "Cliente", storico_oggi: str = "", audio_data: Optional[str] = None, mime_type: str = "audio/ogg", message_timestamp: Optional[datetime] = None):
        global LAST_GROQ_REQUEST_TIME
        
        if message_timestamp is None:
            message_timestamp = datetime.now()
            
        testo_trascritto_vocale = ""

        if audio_data:
            try:
                logging.info(f"🎙️ Avvio trascrizione Groq Whisper per {client_name}...")
                audio_bytes = base64.b64decode(audio_data)
                
                transcription = await self.client_groq.audio.transcriptions.create(
                  file=("audio.ogg", audio_bytes),
                  model=GROQ_AUDIO_MODEL,
                  response_format="json"
                )
                
                testo_trascritto_vocale = transcription.text
                logging.info(f"🎙️ Trascrizione completata per {client_name}.")
                
                text_to_parse = f"{text_to_parse}\n[TRASCRIZIONE VOCALE]: {testo_trascritto_vocale}"
            except Exception as e:
                pass 

        testo_per_check = testo_trascritto_vocale if audio_data else text_to_parse

        if self.is_courtesy_or_non_order(testo_per_check):
            return {
                "testo_trascritto": testo_trascritto_vocale,
                "ordini": [{
                    "is_order": False,
                    "cliente_id": client_name,
                    "prodotti": [],
                    "note_ordine": "Messaggio di cortesia o informativo.",
                    "da_verificare_manualmente": False
                }]
            }

        if audio_data and testo_trascritto_vocale and len(testo_trascritto_vocale.strip()) < 8:
            return {
                "testo_trascritto": testo_trascritto_vocale,
                "ordini": [{
                    "is_order": False,
                    "cliente_id": client_name,
                    "prodotti": [],
                    "note_ordine": "Vocale trascritto troppo corto/non chiaro.",
                    "da_verificare_manualmente": True
                }]
            }

        if storico_oggi and len(storico_oggi) > 150:
            storico_oggi = "[..]" + storico_oggi[-150:]

        max_attempts = 3

        for attempt in range(max_attempts):
            async with GROQ_LOCK:
                now = time.time()
                elapsed = now - LAST_GROQ_REQUEST_TIME
                min_pacing = 32.0 
                if elapsed < min_pacing:
                    await asyncio.sleep(min_pacing - elapsed)
                LAST_GROQ_REQUEST_TIME = time.time()

                try:
                    prompt_sistema = self.build_system_instruction(client_name, message_timestamp=message_timestamp)
                    
                    if storico_oggi:
                        prompt_utente = f"STORICO OGGI ({client_name}):\n{storico_oggi}\nNUOVO MSG:\n\"{text_to_parse}\""
                    else:
                        prompt_utente = f"Msg ({client_name}):\n\"{text_to_parse}\""

                    completion = await self.client_groq.chat.completions.create(
                        model=self.current_model,
                        messages=[
                            {"role": "system", "content": prompt_sistema},
                            {"role": "user", "content": prompt_utente}
                        ],
                        temperature=0.0
                    )
                    
                    raw_text = (completion.choices[0].message.content or "").strip()
                    
                    match_json = re.search(r'(\{.*\})', raw_text, re.DOTALL)
                    if match_json:
                        raw_text = match_json.group(1)

                    parsed_json = json.loads(raw_text)
                    
                    testo_trascritto = parsed_json.get("testo_trascritto") or testo_trascritto_vocale
                    
                    ordini_array = parsed_json.get("ordini", [])
                    if not ordini_array and "prodotti" in parsed_json:
                        ordini_array = [parsed_json]
                    
                    is_andrea = "3334695153" in client_name or "224257489502407" in client_name or "andrea aliandro" in client_name.lower()
                    
                    for ord_obj in ordini_array:
                        cliente_finale = client_name
                        if is_andrea:
                            estratto = str(ord_obj.get("cliente_reale", "")).strip()
                            
                            if not estratto or estratto.lower() in ["null", "none", "andrea", "andrea aliandro", "titolare", "sconosciuto"]:
                                match_full = re.match(r'^([^,:\n]{2,30})[,:]\s*\d{1,2}[./-]\d{1,2}', text_to_parse.strip())
                                if match_full:
                                    estratto = match_full.group(1).strip()
                                else:
                                    match_simple = re.match(r'^([^,:\n]{2,20})[,:]', text_to_parse.strip())
                                    if match_simple:
                                        estratto = match_simple.group(1).strip()
                                    else:
                                        match_vocale = re.match(r'^([a-zA-Z]{3,20})\s+\d{1,2}', text_to_parse.strip())
                                        if match_vocale:
                                            estratto = match_vocale.group(1).strip()

                            if estratto and estratto.lower() not in ["null", "none", "andrea", "andrea aliandro", "sconosciuto"]:
                                cliente_finale = estratto
                            else:
                                dt_sicura = message_timestamp or datetime.now()
                                hh_mm_ss = dt_sicura.strftime('%H:%M:%S')
                                cliente_finale = f"Cliente Non Specificato ({hh_mm_ss})"
                        
                        ord_obj["cliente_id"] = cliente_finale

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

                        if not ord_obj.get("is_cancelled") and len(ord_obj.get("prodotti", [])) == 0:
                            ord_obj["is_order"] = False
                            ord_obj["da_verificare_manualmente"] = True
                            if not ord_obj.get("note_ordine"):
                                ord_obj["note_ordine"] = "Nessun prodotto individuato nel testo/vocale."

                    return {
                        "testo_trascritto": testo_trascritto,
                        "ordini": ordini_array
                    }

                except Exception as e:
                    err_str = str(e).lower()
                    if "rate limit" in err_str or "429" in err_str:
                        if self.current_model == GROQ_MODEL:
                            self.current_model = GROQ_FALLBACK_MODEL
                        else:
                            await asyncio.sleep(60.0)
                    else:
                        await asyncio.sleep(1.0)
                    
                    if attempt == max_attempts - 1:
                        return self.fallback_local_parse(text_to_parse, client_name, message_timestamp)

        return self.fallback_local_parse(text_to_parse, client_name, message_timestamp)

    def fallback_local_parse(self, text_to_parse: str, client_name: str, message_timestamp: Optional[datetime] = None) -> dict:
        testo_pulito_cifre = re.sub(r'[\s\-\.\(\)\+:]', '', text_to_parse or "")
        if testo_pulito_cifre.isdigit() and len(testo_pulito_cifre) >= 6:
            return {
                "testo_trascritto": "",
                "ordini": [{
                    "is_order": False, "is_cancelled": False, "cliente_id": client_name,
                    "prodotti": [], "note_ordine": "[Parser Locale] Testo scartato: sembra un numero/orario.",
                    "da_verificare_manualmente": True
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

        pattern = r'([Nn][°\.\s]+|[Nn](?=\d)|[Pp]ezzo\s+|[Pp]ezzi\s+|[Pp]z\s+)?(\d+(?:[.,]\d+)?)\s*(kg|k|chili|kili|g|gr|grammi|pz|pezzi|pezzo|coppia|coppie|vaschette|vaschetta|cf)?\s*(?:di\s+)?([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]{3,35})'
        matches = re.findall(pattern, text_to_parse or "", re.IGNORECASE)

        for n_prefix, qta_str, um_raw, prod_raw in matches:
            try:
                qta = float(qta_str.replace(',', '.'))
            except ValueError:
                qta = 1.0

            if qta <= 0 or qta > 500:
                continue

            p_clean = (prod_raw or "").strip().lower()
            um_clean = (um_raw or "").strip().lower()
            
            um_finale = "kg"
            if n_prefix or um_clean in ["pz", "pezzi", "pezzo", "coppia", "coppie", "vaschetta", "vaschette", "cf"]:
                um_finale = "pezzi"
                if um_clean in ["coppia", "coppie"]:
                    qta *= 2
            elif um_clean in ["g", "gr", "grammi"]:
                um_finale = "kg"
                qta = qta / 1000.0

            matched_entry = None
            for entry in syn_entries:
                for syn in entry["sinonimi"]:
                    if syn in p_clean or p_clean in syn:
                        matched_entry = entry
                        break
                if matched_entry:
                    break

            if matched_entry:
                if not um_clean and not n_prefix:
                    um_finale = matched_entry["um"]
                    
                prodotti_trovati.append({
                    "codice_articolo": matched_entry["cod"],
                    "nome_articolo": matched_entry["nome"],
                    "quantita": qta,
                    "unita_di_misura": um_finale
                })

        base_dt = message_timestamp if message_timestamp else datetime.now()
        t_lower = (text_to_parse or "").lower()
        
        data_target_str, _ = calcola_data_consegna_target(base_dt, client_name)
        data_target = datetime.strptime(data_target_str, '%Y-%m-%d')
        
        date_pattern = r'\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b'
        date_match = re.search(date_pattern, text_to_parse)
        if date_match:
            giorno = int(date_match.group(1))
            mese = int(date_match.group(2))
            anno = int(date_match.group(3)) if date_match.group(3) else base_dt.year
            if anno < 100:
                anno += 2000
            try:
                data_target = datetime(anno, mese, giorno)
            except ValueError:
                pass
        elif "dopodomani" in t_lower:
            data_target = base_dt + timedelta(days=2)
            if data_target.weekday() == 6: 
                data_target += timedelta(days=1)
        elif "domani" in t_lower or "dmn" in t_lower:
            data_target = base_dt + timedelta(days=1)
            if data_target.weekday() == 6: 
                data_target += timedelta(days=1)
        elif "stasera" in t_lower or "oggi" in t_lower:
            data_target = base_dt
        else:
            giorni_map = {
                "lunedì": 0, "lunedi": 0,
                "martedì": 1, "martedi": 1,
                "mercoledì": 2, "mercoledi": 2,
                "giovedì": 3, "giovedi": 3,
                "venerdì": 4, "venerdi": 4,
                "sabato": 5,
                "domenica": 6
            }
            giorno_trovato = None
            for g_str, g_idx in giorni_map.items():
                if f"per {g_str}" in t_lower or f"a {g_str}" in t_lower or f"per il {g_str}" in t_lower or re.search(rf'\b{g_str}\b', t_lower):
                    giorno_trovato = g_idx
                    break
            
            if giorno_trovato is not None:
                current_weekday = base_dt.weekday()
                days_ahead = giorno_trovato - current_weekday
                if days_ahead <= 0:
                    days_ahead += 7
                data_target = base_dt + timedelta(days=days_ahead)
                if data_target.weekday() == 6:
                    data_target += timedelta(days=1)

        is_canc = bool(re.search(r'\b(?:annulla|cancella|disdici|elimina|non portarmi|non mi serve)\b', t_lower, re.IGNORECASE))

        is_andrea = "3334695153" in client_name or "224257489502407" in client_name or "andrea aliandro" in client_name.lower()
        cliente_finale = client_name
        if is_andrea:
            estratto = None
            testo_pulito = text_to_parse.replace("🎙️ [VOCALE TRASCRITTO]:", "").strip()
            match_full = re.match(r'^([^,:\n]{2,30})[,:]\s*\d{1,2}[./-]\d{1,2}', testo_pulito)
            if match_full:
                estratto = match_full.group(1).strip()
            else:
                match_simple = re.match(r'^([^,:\n]{2,20})[,:]', testo_pulito)
                if match_simple:
                    estratto = match_simple.group(1).strip()
                else:
                    match_vocale = re.match(r'^([a-zA-Z]{3,20})\s+\d{1,2}', testo_pulito)
                    if match_vocale:
                        estratto = match_vocale.group(1).strip()

            if estratto and estratto.lower() not in ["null", "none", "andrea", "andrea aliandro", "sconosciuto"]:
                cliente_finale = estratto 
            else:
                dt_sicura = message_timestamp or datetime.now()
                hh_mm_ss = dt_sicura.strftime('%H:%M:%S')
                cliente_finale = f"Cliente Non Specificato ({hh_mm_ss})"

        singolo_ordine = {
            "is_order": not is_canc and len(prodotti_trovati) > 0,
            "is_cancelled": is_canc,
            "cliente_id": cliente_finale,
            "data_consegna": data_target.strftime('%Y-%m-%d'),
            "prodotti": [] if is_canc else prodotti_trovati,
            "note_ordine": "[Annullato dal cliente via WhatsApp]" if is_canc else f"[Parser Locale di Riserva] {text_to_parse}",
            "da_verificare_manualmente": not is_canc and len(prodotti_trovati) == 0
        }

        return {
            "testo_trascritto": "",
            "ordini": [singolo_ordine]
        }