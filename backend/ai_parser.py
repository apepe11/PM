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
from groq import Groq

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY non impostata. Creare un file .env con GROQ_API_KEY=...")

client_groq = Groq(api_key=GROQ_API_KEY)
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_AUDIO_MODEL = "whisper-large-v3"

GROQ_LOCK = asyncio.Lock()
LAST_GROQ_REQUEST_TIME = 0.0

def calcola_data_consegna_target(data_attiva_str: str, client_name: str = "") -> Tuple[str, str]:
    """
    Calcola la data di consegna target basandosi sulla Data Attiva impostata dal pulsante,
    gestendo i casi speciali (es. Andrea Aliandro).
    Ritorna SEMPRE una stringa (es. 'YYYY-MM-DD') e una stringa descrittiva.
    """
    if not data_attiva_str:
        data_attiva_str = datetime.now().strftime('%Y-%m-%d')
        
    data_attiva_dt = datetime.strptime(data_attiva_str, '%Y-%m-%d')
    is_andrea = "andrea aliandro" in (client_name or "").lower()

    # --- REGOLE SPECIALI PER ANDREA ALIANDRO ---
    if is_andrea:
        data_target = data_attiva_dt + timedelta(days=1)
        
        # Se cade di domenica, passa automaticamente a lunedì
        if data_target.weekday() == 6:
            data_target += timedelta(days=1)
            
        desc = (
            f"📅 REGOLE TEMPORALI SPECIALI PER ANDREA ALIANDRO:\n"
            f"Gli ordini inoltrati da Andrea sono SEMPRE di default per il GIORNO SUCCESSIVO rispetto alla produzione in corso.\n"
            f"Data di consegna di default: \"{data_target.strftime('%Y-%m-%d')}\"."
        )
        return data_target.strftime('%Y-%m-%d'), desc

    # --- REGOLA STANDARD BASATA SUL PULSANTE "DATA ATTIVA" ---
    desc = (
        f"📅 REGOLE TEMPORALI ATTUALI:\n"
        f"La data di ricezione in corso (selezionata dal gestionale) è {data_attiva_str}.\n"
        f"Se il cliente NON specifica esplicitamente un giorno diverso, usa TASSATIVAMENTE questa data di default: \"{data_attiva_str}\"."
    )
    return data_attiva_str, desc

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
        client_name_lower = (client_name or "").lower()
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
                    es = storico[0] if len(storico) > 0 else None
                    if es:
                        rule_text += "- ESEMPIO STORICO (TRADUCI ESATTAMENTE COSÌ I SUOI ORDINI):\n"
                        rule_text += f"  * Messaggio: \"{es.get('messaggio_raw')}\"\n"
                        rule_text += f"    Traduzione: {json.dumps(es.get('traduzione_ia'), separators=(',', ':'), ensure_ascii=False)}\n"
                        
                return rule_text
        return ""

    def build_system_instruction(self, client_name: str = "", campioni_passati_str: str = "", data_attiva_str: str = ""):
        # COMPRESSIONE ESTREMA DEL CATALOGO
        catalogo_compresso = []
        for p in self.catalog:
            catalogo_compresso.append({
                "cod": p.get("codice_articolo", p.get("codice_prodotto")),
                "nome": p.get("nome_articolo", p.get("nome_prodotto")),
                "um": p.get("unita_misura", p.get("unita_di_misura", "kg")).lower()
            })
        
        catalog_formatted = json.dumps(catalogo_compresso, separators=(',', ':'), ensure_ascii=False)
        regole_cliente = self.get_specific_client_rules(client_name)
        campioni_block = f"\nSTORICO CAMPIONI CONFERMATI '{client_name}':\n{campioni_passati_str}\n" if campioni_passati_str else ""

        data_target_str, descrizione_slot = calcola_data_consegna_target(data_attiva_str, client_name)

        andrea_rule = ""
        if "andrea aliandro" in (client_name or "").lower():
            andrea_rule = (
                "5. CASO SPECIALE ANDREA ALIANDRO: Andrea sta inoltrando un ordine per un altro cliente. "
                "Il nome del cliente REALE è sempre scritto all'inizio del messaggio prima della virgola o dell'ordine. "
                "ESTRAI il nome del cliente finale e valorizza il campo 'cliente_reale' nel JSON."
            )

        return f"""Sei l'assistente IA del Caseificio Petruzzi. 
            Il tuo compito è analizzare la conversazione WhatsApp ed estrarre l'ordine FINALE CONSOLIDATO.
            Restituisci UNICAMENTE un oggetto JSON valido, senza aggiungere commenti, spiegazioni o blocchi markdown.

            REGOLE TASSATIVE:
            1. ANALISI STORICO COMPLETO: Valuta lo "STORICO CONVERSAZIONE DI OGGI" ed il "NUOVO MESSAGGIO" assieme.
            2. AGGIUNTE / INTEGRAZIONI: Somma i nuovi prodotti a quelli richiesti in precedenza.
            3. CORREZIONI / SOSTITUZIONI: Applica le modifiche richieste nel risultato finale.
            4. ANNULLAMENTO DELL'ORDINE: Se richiesto, imposta "is_cancelled": true e svuota l'array dei prodotti.
            {andrea_rule}

            REGOLE TASSATIVE DATA DI CONSEGNA:
            1. SE NON SPECIFICATO -> CONSEGNA TASSATIVA: "{data_target_str}".
            {descrizione_slot}

            CATALOGO PRODOTTI UFFICIALE:
            {catalog_formatted}
            {regole_cliente}
            {campioni_block}

            REGOLE DI MAPPATURA E UNITA' DI MISURA:
            1. STRACCIATELLA: Se il cliente è "Sole 365" -> "STRACPE" (sfusa 1kg). Altrimenti -> "STRA20250PE" (vaschetta 0,250KG).
            2. UNITA' DI MISURA:
               - PEZZI/INTERI/COPPIE -> "unita_di_misura": "pezzi", "quantita": numero (1 coppia = 2 pezzi).
               - CHILI/GRAMMI -> "unita_di_misura": "kg", convertire grammi in kg (1 hg = 0.1 kg).

            SCHEMA JSON RICHIESTO:
            {{
            "testo_trascritto": "trascrizione in italiano (importante: riempi questo campo se hai trascritto un vocale)",
            "is_order": true,
            "is_cancelled": false,
            "data_consegna": "YYYY-MM-DD",
            "cliente_reale": "Nome Estratto (solo se mittente è Andrea Aliandro, altrimenti null)",
            "prodotti": [
                {{
                "codice_articolo": "STRINGA",
                "quantita": 1.0,
                "unita_di_misura": "kg"
                }}
            ],
            "note_ordine": "stringa",
            "da_verificare_manualmente": false
            }}"""

    async def parse_message(self, text_to_parse: str, client_name: str = "Cliente", storico_oggi: str = "", audio_data: Optional[str] = None, mime_type: str = "audio/ogg", message_timestamp: Optional[datetime] = None):
        global LAST_GROQ_REQUEST_TIME
        
        testo_trascritto_vocale = ""

        # --- TRASCRIZIONE AUDIO GROQ WHISPER ---
        if audio_data:
            try:
                logging.info(f"🎙️ Avvio trascrizione Groq Whisper per {client_name}...")
                audio_bytes = base64.b64decode(audio_data)
                
                # Chiamata al modello audio Whisper di Groq
                transcription = client_groq.audio.transcriptions.create(
                  file=("audio.ogg", audio_bytes),
                  model=GROQ_AUDIO_MODEL,
                  response_format="json"
                )
                
                testo_trascritto_vocale = transcription.text
                logging.info(f"🎙️ Trascrizione completata: {testo_trascritto_vocale}")
                
                # Uniamo la trascrizione al testo originale da analizzare
                text_to_parse = f"{text_to_parse}\n[TRASCRIZIONE VOCALE]: {testo_trascritto_vocale}"
            except Exception as e:
                logging.error(f"❌ Errore trascrizione audio Groq Whisper: {e}")

        if not audio_data and self.is_courtesy_or_non_order(text_to_parse):
            return {
                "is_order": False,
                "cliente_id": client_name,
                "prodotti": [],
                "note_ordine": "Messaggio di cortesia o informativo.",
                "da_verificare_manualmente": False
            }

        # Recuperiamo dinamicamente la data attiva per passarla al prompt
        try:
            from backend.db import get_campioni_ia_cliente, get_data_attiva
            data_attiva_str = await get_data_attiva()
        except ImportError:
            data_attiva_str = datetime.now().strftime('%Y-%m-%d')
            async def get_campioni_ia_cliente_dummy(x): return []
            get_campioni_ia_cliente = get_campioni_ia_cliente_dummy

        campioni = await get_campioni_ia_cliente(client_name)
        campioni_str = ""
        if campioni:
            campioni = campioni[:2]
            campioni_str = "\n".join([f"- In:\"{c.get('testo_originale', '')}\"->Out:{json.dumps(c.get('dati_confermati', {}), separators=(',', ':'), ensure_ascii=False)}" for c in campioni])

        max_attempts = 3
        for attempt in range(max_attempts):
            async with GROQ_LOCK:
                now = time.time()
                elapsed = now - LAST_GROQ_REQUEST_TIME
                min_pacing = 0.5
                if elapsed < min_pacing:
                    await asyncio.sleep(min_pacing - elapsed)
                LAST_GROQ_REQUEST_TIME = time.time()

            try:
                prompt_sistema = self.build_system_instruction(client_name, campioni_str, data_attiva_str)
                
                if storico_oggi:
                    prompt_utente = f"STORICO CONVERSAZIONE DI OGGI CON {client_name}:\n{storico_oggi}\n\nNUOVO MESSAGGIO DI CORREZIONE/AGGIUNTA:\n\"{text_to_parse}\""
                else:
                    prompt_utente = f"Messaggio ricevuto da {client_name}:\n\"{text_to_parse}\""

                completion = client_groq.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": prompt_sistema},
                        {"role": "user", "content": prompt_utente}
                    ],
                    temperature=0.0
                )
                
                raw_text = (completion.choices[0].message.content or "").strip()
                
                if raw_text.startswith("```"):
                    raw_text = re.sub(r'^```(?:json)?\s*', '', raw_text)
                    raw_text = re.sub(r'\s*```$', '', raw_text)
                    raw_text = raw_text.strip()

                parsed_json = json.loads(raw_text)
                
                # Se avevamo trascritto un vocale, assicuriamoci che l'IA non l'abbia perso
                if testo_trascritto_vocale and not parsed_json.get("testo_trascritto"):
                    parsed_json["testo_trascritto"] = testo_trascritto_vocale
                
                # --- GESTIONE NOME CLIENTE REALE (VIA ANDREA ALIANDRO) ---
                cliente_finale = client_name
                if "andrea aliandro" in (client_name or "").lower():
                    estratto = str(parsed_json.get("cliente_reale", "")).strip()
                    if estratto and estratto.lower() not in ["null", "none", "andrea aliandro"]:
                        cliente_finale = f"{estratto} (via Andrea)"
                
                parsed_json["cliente_id"] = cliente_finale

                is_sole_365 = "sole 365" in cliente_finale.lower() or "sole365" in cliente_finale.lower()
                prodotti_parsed = parsed_json.get("prodotti", [])
                for p in prodotti_parsed:
                    cod = p.get("codice_articolo", "")
                    nome = (p.get("nome_articolo") or "").lower()
                    qta = float(p.get("quantita", 1.0))
                    um = (p.get("unita_di_misura") or "kg").lower()

                    if "stracciatella" in nome or cod in ["STRACPE", "STRA20250PE"]:
                        if is_sole_365:
                            p["codice_articolo"] = "STRACPE"
                            p["nome_articolo"] = "Stracciatella Petruzzi (Sfusa 1kg)"
                        else:
                            p["codice_articolo"] = "STRA20250PE"
                            p["nome_articolo"] = "Stracciatella Petruzzi 0,250KG"

                    match_kg = re.search(r'(\d+(?:\.\d+)?)\s*kg\b', nome.replace(',', '.'))
                    peso_unitario = float(match_kg.group(1)) if match_kg else 0.0

                    if peso_unitario > 0 and um in ["pezzi", "pz", "vaschette", "unità"]:
                        p["quantita"] = round(qta * peso_unitario, 3)
                        p["unita_di_misura"] = "kg"

                return parsed_json

            except Exception as e:
                logging.warning(f"⚠️ Tentativo {attempt + 1} Groq fallito ({e}). Riprovo...")
                if attempt < max_attempts - 1:
                    await asyncio.sleep(1.0)
                    continue

                logging.error(f"❌ Errore definitivo Groq IA: {e}. Attivazione Parser Locale di riserva.")
                return self.fallback_local_parse(text_to_parse, client_name, message_timestamp, data_attiva_str)

        return self.fallback_local_parse(text_to_parse, client_name, message_timestamp, data_attiva_str)

    def fallback_local_parse(self, text_to_parse: str, client_name: str, message_timestamp: Optional[datetime] = None, data_attiva_str: str = "") -> dict:
        testo_pulito_cifre = re.sub(r'[\s\-\.\(\)\+:]', '', text_to_parse or "")
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
            syns = [s.strip().lower() for s in (item.get("sinonimi") or "").split(",") if s.strip()]
            syn_entries.append({"cod": cod, "nome": nome, "um": um, "sinonimi": syns})

        matches = re.findall(r'(?:n[°\s]*)?(\d+(?:[.,]\d+)?)\s*([a-zA-ZàèéìòùÀÈÉÌÒÙ\s]{2,30})', text_to_parse or "", re.IGNORECASE)

        for qta_str, prod_raw in matches:
            try:
                qta = float(qta_str.replace(',', '.'))
            except ValueError:
                qta = 1.0

            if qta <= 0 or qta > 500:
                continue

            p_clean = (prod_raw or "").strip().lower()
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

        base_dt = message_timestamp if message_timestamp else datetime.now()
        t_lower = (text_to_parse or "").lower()
        
        data_target_str, _ = calcola_data_consegna_target(data_attiva_str, client_name)
        data_target = datetime.strptime(data_target_str, '%Y-%m-%d')
        
        if "dopodomani" in t_lower:
            data_target = base_dt + timedelta(days=2)
            if data_target.weekday() == 6: 
                data_target += timedelta(days=1)
        elif "domani" in t_lower:
            data_target = base_dt + timedelta(days=1)
            if data_target.weekday() == 6: 
                data_target += timedelta(days=1)
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

        # --- GESTIONE NOME CLIENTE REALE (PARSER LOCALE) ---
        cliente_finale = client_name
        if "andrea aliandro" in (client_name or "").lower():
            match_nome = re.match(r'^([^,:\n]+)[,:\n]', text_to_parse or "")
            if match_nome:
                estratto = match_nome.group(1).strip()
                if estratto:
                    cliente_finale = f"{estratto} (via Andrea)"

        return {
            "is_order": not is_canc and len(prodotti_trovati) > 0,
            "is_cancelled": is_canc,
            "cliente_id": cliente_finale,
            "data_consegna": data_target.strftime('%Y-%m-%d'),
            "prodotti": [] if is_canc else prodotti_trovati,
            "note_ordine": "[Annullato dal cliente via WhatsApp]" if is_canc else f"[Parser Locale di Riserva] {text_to_parse}",
            "da_verificare_manualmente": not is_canc and len(prodotti_trovati) == 0
        }