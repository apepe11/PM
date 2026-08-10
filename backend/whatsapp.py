import os
import json
import base64
import re
import requests
import asyncio
from datetime import datetime, timedelta
from typing import Optional

from backend.db import get_storico_oggi, salva_o_aggiorna_ordine, ordine_esiste_in_db
from backend.ai_parser import AIParser

# ---------------------------------------------------------
# CONFIGURAZIONE EVOLUTION API
# ---------------------------------------------------------
EVOLUTION_URL = os.environ.get("EVOLUTION_URL", "http://localhost:8080")
EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY", "petruzzi_segreto_12345")
INSTANCE_NAME = os.environ.get("EVOLUTION_INSTANCE_NAME", "banco_petruzzi")
WEBHOOK_URL = os.environ.get("EVOLUTION_WEBHOOK_URL", "http://172.17.0.1:5000/api/whatsapp/webhook")
WEBHOOK_EVENTS = ["APPLICATION_STARTUP", "QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"]

SYNC_INTERVAL_SECONDS = int(os.environ.get("WHATSAPP_SYNC_INTERVAL_SECONDS", "120"))
_sync_loop_task: Optional[asyncio.Task] = None

ai_parser = AIParser(base_dir="catalogo")
messaggi_processati = set()

WHATSAPP_STATE = {
    "stato_connessione": "DISCONNESSO", 
    "qr_code_base64": None,
    "account_banco": None,
    "data_connessione": None,
    "ultimo_messaggio": None,
    "ultima_sincronizzazione_periodica": None,
    "eventi_log": []
}

def add_whatsapp_log(messaggio: str, tipo: str = "INFO", metadata: Optional[dict] = None):
    entry = {
        "timestamp": datetime.now().strftime('%H:%M:%S'),
        "testo": messaggio,
        "tipo": tipo,
        "metadata": metadata or {}
    }
    WHATSAPP_STATE["eventi_log"].insert(0, entry)
    if len(WHATSAPP_STATE["eventi_log"]) > 50:
        WHATSAPP_STATE["eventi_log"].pop()
    print(f"[{tipo}] {messaggio}")

def get_whatsapp_status():
    return WHATSAPP_STATE

def _req_headers():
    return {
        "apikey": EVOLUTION_API_KEY,
        "Content-Type": "application/json"
    }

async def _configura_webhook_evolution():
    payload = {
        "webhook": {
            "enabled": True,
            "url": WEBHOOK_URL,
            "byEvents": False,
            "base64": False,
            "events": WEBHOOK_EVENTS
        }
    }
    try:
        res = requests.post(f"{EVOLUTION_URL}/webhook/set/{INSTANCE_NAME}", json=payload, headers=_req_headers(), timeout=10)
        if res.status_code in [200, 201]:
            add_whatsapp_log(f"🔗 Webhook riconfigurato su Evolution API.", "SUCCESS")
            return True
        else:
            add_whatsapp_log(f"⚠️ Configurazione webhook fallita ({res.status_code})", "WARN")
            return False
    except Exception as e:
        add_whatsapp_log(f"⚠️ Impossibile configurare il webhook: {e}", "WARN")
        return False

async def _loop_sincronizzazione_periodica():
    while True:
        try:
            if WHATSAPP_STATE.get("stato_connessione") == "CONNESSO":
                await sincronizza_chat_recenti_background()
        except Exception as e:
            add_whatsapp_log(f"⚠️ Errore nel loop periodico: {e}", "WARN")
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)

def avvia_loop_sincronizzazione_periodica():
    global _sync_loop_task
    if _sync_loop_task is None or _sync_loop_task.done():
        _sync_loop_task = asyncio.create_task(_loop_sincronizzazione_periodica())

async def avvia_whatsapp():
    add_whatsapp_log("🚀 Connessione al motore Evolution API in corso...", "INFO")
    
    try:
        res = requests.get(f"{EVOLUTION_URL}/instance/connectionState/{INSTANCE_NAME}", headers=_req_headers(), timeout=5)
        if res.status_code == 200:
            state = res.json().get("instance", {}).get("state")
            if state == "open":
                WHATSAPP_STATE["stato_connessione"] = "CONNESSO"
                WHATSAPP_STATE["data_connessione"] = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
                add_whatsapp_log("🟢 Istanza già connessa e operativa!", "SUCCESS")

                await _configura_webhook_evolution()
                avvia_loop_sincronizzazione_periodica()
                return
            else:
                WHATSAPP_STATE["stato_connessione"] = "IN_ATTESA_QR"
                try:
                    connect_res = requests.get(f"{EVOLUTION_URL}/instance/connect/{INSTANCE_NAME}", headers=_req_headers(), timeout=10)
                    if connect_res.status_code == 200:
                        connect_data = connect_res.json()
                        qr_base64 = (
                            connect_data.get("qrcode", {}).get("base64")
                            or connect_data.get("base64")
                        )
                        if qr_base64:
                            WHATSAPP_STATE["qr_code_base64"] = qr_base64.replace("data:image/png;base64,", "")
                except Exception as qr_err:
                    add_whatsapp_log(f"⚠️ Impossibile recuperare il nuovo QR: {qr_err}", "WARN")
                return
    except requests.exceptions.RequestException:
        pass 

    payload = {
        "instanceName": INSTANCE_NAME,
        "qrcode": True,
        "integration": "WHATSAPP-BAILEYS",
        "webhook_url": WEBHOOK_URL,
        "webhook_events": WEBHOOK_EVENTS
    }
    
    try:
        res = requests.post(f"{EVOLUTION_URL}/instance/create", json=payload, headers=_req_headers(), timeout=10)
        if res.status_code in [200, 201]:
            WHATSAPP_STATE["stato_connessione"] = "IN_ATTESA_QR"
            qr_base64 = res.json().get("qrcode", {}).get("base64")
            if qr_base64:
                WHATSAPP_STATE["qr_code_base64"] = qr_base64.replace("data:image/png;base64,", "")
            add_whatsapp_log("✨ Nuova istanza creata. In attesa scansione QR...", "INFO")
            await _configura_webhook_evolution()
    except Exception as e:
        add_whatsapp_log(f"❌ Impossibile contattare Evolution API: {e}", "ERROR")

async def reset_whatsapp_banco():
    add_whatsapp_log("🗑️ Resetto dispositivo Banco corrente...", "WARN")
    WHATSAPP_STATE["stato_connessione"] = "DISCONNESSO"
    WHATSAPP_STATE["qr_code_base64"] = None
    
    try:
        requests.delete(f"{EVOLUTION_URL}/instance/logout/{INSTANCE_NAME}", headers=_req_headers())
        requests.delete(f"{EVOLUTION_URL}/instance/delete/{INSTANCE_NAME}", headers=_req_headers())
    except:
        pass
    
    add_whatsapp_log("✨ Banco dimenticato con successo.", "SUCCESS")
    await asyncio.sleep(1)
    asyncio.create_task(avvia_whatsapp())
    return True


# ---------------------------------------------------------
# HELPER PER PULIZIA NOMI CONTATTI
# ---------------------------------------------------------
def _normalizza_telefono(numero: str) -> str:
    """Riduce un numero alle sole cifre e alle ultime 9 (formato mobile IT senza prefisso),
    così il confronto funziona indipendentemente da +, spazi, 0039, 39, zeri iniziali ecc."""
    if not numero:
        return ""
    solo_cifre = re.sub(r"\D", "", str(numero))
    # normalizza eventuale prefisso internazionale 0039 -> 39
    if solo_cifre.startswith("0039"):
        solo_cifre = solo_cifre[2:]
    # tieni solo le ultime 9 cifre: è la parte stabile di un numero mobile italiano
    # (funziona sia che il resto abbia il prefisso 39 sia che non ce l'abbia)
    return solo_cifre[-9:] if len(solo_cifre) >= 9 else solo_cifre

_RUBRICA_CACHE_PATH: Optional[str] = None

def _trova_percorso_rubrica() -> Optional[str]:
    """Cerca particolarita_clienti.json in tutte le posizioni plausibili, invece di
    assumere ciecamente un unico percorso relativo che puo' rompersi se la struttura
    delle cartelle cambia. Il risultato viene 'cachato' dopo il primo trovato."""
    global _RUBRICA_CACHE_PATH
    if _RUBRICA_CACHE_PATH and os.path.exists(_RUBRICA_CACHE_PATH):
        return _RUBRICA_CACHE_PATH

    qui = os.path.dirname(os.path.abspath(__file__))
    candidati = [
        os.path.join(qui, "..", "catalogo", "particolarita_clienti.json"),
        os.path.join(qui, "catalogo", "particolarita_clienti.json"),
        os.path.join(qui, "..", "..", "catalogo", "particolarita_clienti.json"),
        os.path.join(os.getcwd(), "catalogo", "particolarita_clienti.json"),
    ]
    for c in candidati:
        c_abs = os.path.abspath(c)
        if os.path.exists(c_abs):
            _RUBRICA_CACHE_PATH = c_abs
            return c_abs

    add_whatsapp_log(
        f"⚠️ particolarita_clienti.json non trovato in nessuno dei percorsi attesi: {[os.path.abspath(c) for c in candidati]}",
        "WARN"
    )
    return None

def _trova_nome_in_rubrica_locale(phone_number: str) -> str:
    """Cerca il numero di telefono nel nostro database locale per usare il nome personalizzato."""
    part_path = _trova_percorso_rubrica()
    if not part_path:
        return ""

    try:
        with open(part_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        add_whatsapp_log(f"⚠️ Errore leggendo particolarita_clienti.json ({part_path}): {e}", "WARN")
        return ""

    target = _normalizza_telefono(phone_number)
    if not target:
        return ""

    for cli in data.get("clienti", []):
        # supporta sia "telefono" sia eventuali chiavi alternative usate nel file
        tel_raw = cli.get("telefono") or cli.get("numero") or cli.get("cellulare") or ""
        tel_norm = _normalizza_telefono(tel_raw)
        if tel_norm and tel_norm == target:
            nome_cli = (cli.get("nome_cliente") or cli.get("nome") or "").strip()
            if nome_cli:
                return nome_cli

    add_whatsapp_log(
        f"ℹ️ Numero {phone_number} non presente in particolarita_clienti.json (nessuna corrispondenza su {target}).",
        "INFO"
    )
    return ""

def _estrai_nome_contatto(msg: dict, phone_number: str) -> str:
    """Cerca di estrarre un nome sensato da WhatsApp, ignorando finti nomi e numeri duplicati."""
    name = msg.get("contactName") or msg.get("verifiedName") or msg.get("pushName") or msg.get("name") or ""
    name = str(name).strip()

    if not name:
        return ""

    clean_name = _normalizza_telefono(name)
    if clean_name and clean_name == _normalizza_telefono(phone_number):
        return ""

    if name.lower() in ["cliente whatsapp", "wa user", "whatsapp"]:
        return ""

    return name

def _forza_ricerca_nome_evolution(remote_jid: str, phone_number: str) -> str:
    """Se il messaggio non contiene il nome, interroga aggressivamente la rubrica di Evolution API."""
    try:
        res = requests.post(
            f"{EVOLUTION_URL}/chat/findContacts/{INSTANCE_NAME}", 
            json={"where": {"id": remote_jid}}, 
            headers=_req_headers(), 
            timeout=5
        )
        if res.status_code == 200:
            dati = res.json()
            records = dati if isinstance(dati, list) else dati.get("records", [])
            for contatto in records:
                nome = contatto.get("name") or contatto.get("pushName") or contatto.get("verifiedName") or ""
                nome_pulito = str(nome).strip()
                if nome_pulito and _normalizza_telefono(nome_pulito) != _normalizza_telefono(phone_number):
                    return nome_pulito
            add_whatsapp_log(f"ℹ️ Evolution API non ha un nome salvato per {remote_jid} (rubrica del telefono vuota per questo contatto).", "INFO")
        else:
            add_whatsapp_log(f"⚠️ findContacts su Evolution API ha risposto {res.status_code} per {remote_jid}.", "WARN")
    except Exception as e:
        add_whatsapp_log(f"⚠️ Errore chiamando findContacts su Evolution API: {e}", "WARN")
    return ""

def _estrai_lista_evolution(data, chiave: Optional[str] = None) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if chiave and chiave in data:
            sub = data[chiave]
            if isinstance(sub, list):
                return sub
            if isinstance(sub, dict) and isinstance(sub.get("records"), list):
                return sub["records"]
        if isinstance(data.get("records"), list):
            return data["records"]
    return []

async def sincronizza_chat_recenti_background():
    await asyncio.sleep(3)
    add_whatsapp_log("📥 Avvio sincronizzazione automatica delle chat recenti (ultimi 2 giorni)...", "INFO")
    
    two_days_ago_timestamp = (datetime.now() - timedelta(days=2)).timestamp()

    try:
        res = requests.post(f"{EVOLUTION_URL}/chat/findChats/{INSTANCE_NAME}", json={}, headers=_req_headers(), timeout=10)
        if res.status_code != 200:
            return

        chats_raw = res.json()
        chats = _estrai_lista_evolution(chats_raw, "chats")
        if not chats:
            return

        chat_ids = [c.get("remoteJid") or c.get("id") for c in chats[:30] if c.get("remoteJid") or c.get("id")]
        processed_count = 0

        for remote_jid in chat_ids:
            if "@g.us" in remote_jid:
                continue

            msg_res = requests.post(
                f"{EVOLUTION_URL}/chat/findMessages/{INSTANCE_NAME}", 
                json={"where": {"key": {"remoteJid": remote_jid}}}, 
                headers=_req_headers(), 
                timeout=10
            )
            
            if msg_res.status_code != 200:
                continue

            messages_data = msg_res.json()
            messages = _estrai_lista_evolution(messages_data, "messages")
            if not messages:
                continue

            for msg in messages:
                try:
                    if msg.get("key", {}).get("fromMe") == True:
                        continue

                    timestamp_raw = msg.get("messageTimestamp", 0)
                    try:
                        timestamp = float(timestamp_raw)
                    except (TypeError, ValueError):
                        timestamp = 0

                    if timestamp < two_days_ago_timestamp:
                        continue 

                    msg_id = msg.get("key", {}).get("id", "")
                    if msg_id in messaggi_processati:
                        continue

                    testo = ""
                    is_vocal = False
                    msg_content = msg.get("message", {}) or {}
                    if "conversation" in msg_content:
                        testo = msg_content["conversation"]
                    elif "extendedTextMessage" in msg_content:
                        testo = msg_content["extendedTextMessage"].get("text", "")
                    elif "audioMessage" in msg_content:
                        is_vocal = True
                        testo = "Vocale o Media"
                    elif "imageMessage" in msg_content:
                        testo = msg_content["imageMessage"].get("caption", "Immagine")

                    if not testo and not is_vocal:
                        continue

                    # RICOSTRUZIONE NOME SUPER-INTELLIGENTE
                    phone_number = remote_jid.split("@")[0]
                    nome_finale = _trova_nome_in_rubrica_locale(phone_number)
                    
                    if not nome_finale:
                        nome_finale = _estrai_nome_contatto(msg, phone_number)
                        
                    if not nome_finale:
                        nome_finale = _forza_ricerca_nome_evolution(remote_jid, phone_number)
                        
                    # Se non lo trova neanche così, mette solo il numero, rimuovendo la fastidiosa parola "Cliente"
                    mittente = f"{nome_finale} (+{phone_number})" if nome_finale else f"(+{phone_number})"

                    data_ricezione_custom = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S') if timestamp else datetime.now().strftime('%Y-%m-%d %H:%M:%S')

                    if not is_vocal and await ordine_esiste_in_db(mittente, testo, None):
                        messaggi_processati.add(msg_id)
                        continue

                    messaggi_processati.add(msg_id)
                    processed_count += 1

                    asyncio.create_task(_processa_ordine_ia(mittente, testo, is_vocal, msg, data_ricezione_custom))
                    await asyncio.sleep(0.5)
                except Exception as msg_err:
                    continue

        add_whatsapp_log(f"✅ Sincronizzazione storico completata. Analizzati {processed_count} messaggi recenti.", "SUCCESS")
        WHATSAPP_STATE["ultima_sincronizzazione_periodica"] = datetime.now().strftime('%d/%m/%Y %H:%M:%S')

    except Exception as e:
        add_whatsapp_log(f"⚠️ Errore durante la sincronizzazione delle chat recenti: {e}", "WARN")

async def elabora_webhook_evolution(payload: dict):
    event = payload.get("event")
    data_payload = payload.get("data", {})

    if not event:
        if "message" in payload or "messages" in payload or "key" in payload:
            event = "messages.upsert"
            if not data_payload and ("message" in payload or "key" in payload):
                data_payload = payload

    if event == "qrcode.updated":
        qr_data = data_payload.get("qrcode", {}).get("base64", "")
        if qr_data:
            WHATSAPP_STATE["stato_connessione"] = "IN_ATTESA_QR"
            WHATSAPP_STATE["qr_code_base64"] = qr_data.replace("data:image/png;base64,", "")
            add_whatsapp_log("📷 Nuovo QR Code generato.", "INFO")
        return

    if event == "connection.update":
        state = data_payload.get("state")
        if state == "open":
            WHATSAPP_STATE["stato_connessione"] = "CONNESSO"
            WHATSAPP_STATE["qr_code_base64"] = None
            WHATSAPP_STATE["data_connessione"] = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            add_whatsapp_log("🟢 WHATSAPP BANCO CONNESSO ED ATTIVO VIA EVOLUTION!", "SUCCESS")
            asyncio.create_task(_configura_webhook_evolution())
            avvia_loop_sincronizzazione_periodica()
        elif state == "close":
            WHATSAPP_STATE["stato_connessione"] = "DISCONNESSO"
            add_whatsapp_log("🛑 WhatsApp disconnesso.", "WARN")
        return

    if event in ["messages.upsert", "MESSAGES_UPSERT"] or "message" in data_payload or "messages" in data_payload:
        messages = data_payload.get("messages", [])
        if not messages:
            messages = [data_payload]

        for msg in messages:
            if not isinstance(msg, dict) or not msg.get("key"):
                continue

            if msg.get("key", {}).get("fromMe") == True:
                continue
                
            mittente_id = msg.get("key", {}).get("remoteJid", "")
            if "@g.us" in mittente_id:
                continue
                
            # RICOSTRUZIONE NOME SUPER-INTELLIGENTE
            phone_number = mittente_id.split("@")[0]
            nome_finale = _trova_nome_in_rubrica_locale(phone_number)
            
            if not nome_finale:
                nome_finale = _estrai_nome_contatto(msg, phone_number)
                
            if not nome_finale:
                nome_finale = _forza_ricerca_nome_evolution(mittente_id, phone_number)
                
            # Se non lo trova neanche così, mette solo il numero, rimuovendo "Cliente"
            mittente = f"{nome_finale} (+{phone_number})" if nome_finale else f"(+{phone_number})"
            
            testo = ""
            is_vocal = False
            msg_content = msg.get("message", {})
            
            if isinstance(msg_content, dict):
                if "conversation" in msg_content:
                    testo = msg_content["conversation"]
                elif "extendedTextMessage" in msg_content:
                    testo = msg_content["extendedTextMessage"].get("text", "")
                elif "audioMessage" in msg_content:
                    is_vocal = True
                    testo = "Vocale o Media"
                elif "imageMessage" in msg_content:
                    testo = msg_content["imageMessage"].get("caption", "Immagine")
            
            if not testo and not is_vocal:
                continue
                
            timestamp_unix = msg.get("messageTimestamp", datetime.now().timestamp())
            if isinstance(timestamp_unix, (int, float)):
                data_ricezione_custom = datetime.fromtimestamp(timestamp_unix).strftime('%Y-%m-%d %H:%M:%S')
            else:
                data_ricezione_custom = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            chiave_univoca = msg.get("key", {}).get("id", "")
            if chiave_univoca and chiave_univoca in messaggi_processati:
                continue
                
            if chiave_univoca:
                messaggi_processati.add(chiave_univoca)

            add_whatsapp_log(f"📩 Messaggio catturato da {mittente}: {testo}", "INCOMING")
            asyncio.create_task(_processa_ordine_ia(mittente, testo, is_vocal, msg, data_ricezione_custom))

def scarica_media_evolution(message_obj: dict) -> Optional[dict]:
    message_type = message_obj.get("messageType", "")
    if message_type not in ["audioMessage", "documentMessage"]:
        return None
        
    payload = { "message": message_obj.get("message") }
    try:
        res = requests.post(f"{EVOLUTION_URL}/chat/getBase64FromMediaMessage/{INSTANCE_NAME}", json=payload, headers=_req_headers(), timeout=15)
        if res.status_code == 200:
            data = res.json()
            return {
                "base64": data.get("base64"),
                "mimeType": data.get("mimetype", "audio/ogg")
            }
    except Exception as e:
        add_whatsapp_log(f"⚠️ Errore download media da Evolution: {e}", "ERROR")
    return None

async def _processa_ordine_ia(mittente: str, testo: str, is_vocal: bool, msg_raw: dict, data_ricezione_custom: str):
    WHATSAPP_STATE["ultimo_messaggio"] = f"{mittente} - {'🎙️ Vocale' if is_vocal else testo}"
    
    audio_data = None
    mime_type = "audio/ogg"
    
    if is_vocal:
        add_whatsapp_log(f"🎙️ [VOCALE] Ricevuto audio da {mittente} -> Download...", "AUDIO")
        media_info = scarica_media_evolution(msg_raw)
        if media_info and media_info.get("base64"):
            audio_data = media_info["base64"]
            mime_type = media_info["mimeType"]
            add_whatsapp_log(f"⚡ Audio scaricato. Trascrizione IA in corso...", "AUDIO")

    storico_di_oggi = await get_storico_oggi(mittente)
    dt_msg = datetime.strptime(data_ricezione_custom, '%Y-%m-%d %H:%M:%S')

    risultato_ia = await ai_parser.parse_message(
        testo,
        client_name=mittente,
        storico_oggi=storico_di_oggi,
        audio_data=audio_data,
        mime_type=mime_type,
        message_timestamp=dt_msg
    )
    
    if risultato_ia is None:
        risultato_ia = {
            "is_order": False,
            "prodotti": [],
            "note_ordine": "Errore durante l'analisi IA.",
            "da_verificare_manualmente": True
        }
        
    risultato_ia["timestamp_elaborazione"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    prodotti = risultato_ia.get("prodotti", [])
    is_cancelled = risultato_ia.get("is_cancelled", False)

    if len(prodotti) == 0 and not is_cancelled:
        risultato_ia["is_order"] = False
        
    is_order = risultato_ia.get("is_order", False)
    
    trascrizione = risultato_ia.get("testo_trascritto")
    if trascrizione:
        testo_db = f"🎙️ [VOCALE TRASCRITTO]: \"{trascrizione}\""
        add_whatsapp_log(f"🎙️ [TRASCRIZIONE] {mittente}: \"{trascrizione}\"", "SUCCESS")
    elif is_vocal:
        testo_db = f"🎙️ [MESSAGGIO VOCALE] {testo}"
    else:
        testo_db = testo

    if is_cancelled or (storico_di_oggi and not is_order and len(prodotti) == 0 and ("annull" in testo.lower() or "cancell" in testo.lower())):
        add_whatsapp_log(f"🚫 Ordine per {mittente} ANNULLATO.", "WARN")
        risultato_ia["is_order"] = False
        risultato_ia["is_cancelled"] = True
        risultato_ia["prodotti"] = []
        risultato_ia["stato_ordine"] = "ANNULLATO"
        await salva_o_aggiorna_ordine(mittente, testo_db, json.dumps(risultato_ia, ensure_ascii=False), data_ricezione_custom=data_ricezione_custom)
    elif is_order:
        n_prod = len(prodotti)
        add_svg = f"✅ Ordine acquisito per {mittente} ({n_prod} prodotti)"
        add_whatsapp_log(add_svg, "SUCCESS")
        await salva_o_aggiorna_ordine(mittente, testo_db, json.dumps(risultato_ia, ensure_ascii=False), data_ricezione_custom=data_ricezione_custom)
    else:
        add_whatsapp_log(f"ℹ️ Messaggio cortesia da {mittente}", "INFO")

async def forzare_scansione_chat():
    await _configura_webhook_evolution()
    asyncio.create_task(sincronizza_chat_recenti_background())
    avvia_loop_sincronizzazione_periodica()
    return {"status": "ok", "message": "Sincronizzazione avviata."}