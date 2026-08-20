import json
import os
import re
import ast
import asyncio
import logging
import aiosqlite
from datetime import datetime, timedelta
from typing import Any, Optional

from backend.paths import get_persistent_path, get_static_path

DB_FILE = get_persistent_path("petruzzi_ordini.db")


def parse_dati_estratti_ia(dati_raw) -> dict:
    if not dati_raw:
        return {}
    res = {}
    if isinstance(dati_raw, dict):
        res = dati_raw
    elif isinstance(dati_raw, list):
        for item in dati_raw:
            if isinstance(item, dict):
                res = item
                break
    elif isinstance(dati_raw, str):
        try:
            parsed = json.loads(dati_raw)
            if isinstance(parsed, dict):
                res = parsed
            elif isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, dict):
                        res = item
                        break
        except Exception:
            try:
                parsed = ast.literal_eval(dati_raw)
                if isinstance(parsed, dict):
                    res = parsed
                elif isinstance(parsed, list):
                    for item in parsed:
                        if isinstance(item, dict):
                            res = item
                            break
            except Exception:
                return {}
    
    if isinstance(res, dict):
        if "ordini" in res and isinstance(res["ordini"], list) and len(res["ordini"]) > 0:
            return res["ordini"][0]
        return res
    return {}

def get_db_connection():
    """Ritorna la connessione ad aiosqlite con un timeout maggiorato."""
    return aiosqlite.connect(DB_FILE, timeout=30.0)

async def get_data_attiva() -> str:
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT valore FROM impostazioni WHERE chiave = 'data_attiva'")
        row = await cursor.fetchone()
        if row:
            return row[0]
        else:
            oggi = datetime.now()
            if oggi.hour >= 8:
                data_calc = oggi + timedelta(days=1)
            else:
                data_calc = oggi
            
            if data_calc.weekday() == 6: 
                data_calc += timedelta(days=1)
            
            data_str = data_calc.strftime('%Y-%m-%d')
            await db.execute("INSERT INTO impostazioni (chiave, valore) VALUES ('data_attiva', ?)", (data_str,))
            await db.commit()
            return data_str

async def avanza_data_attiva() -> str:
    corrente_str = await get_data_attiva()
    corrente_dt = datetime.strptime(corrente_str, '%Y-%m-%d')
    
    nuova_dt = corrente_dt + timedelta(days=1)
    if nuova_dt.weekday() == 6: 
        nuova_dt += timedelta(days=1)
        
    nuova_str = nuova_dt.strftime('%Y-%m-%d')
    
    async with get_db_connection() as db:
        await db.execute("UPDATE impostazioni SET valore = ? WHERE chiave = 'data_attiva'", (nuova_str,))
        await db.commit()
        
    return nuova_str

async def normalize_data_consegna(data_consegna: Any, data_ricezione: Optional[str] = None) -> Optional[str]:
    if data_consegna is not None:
        if isinstance(data_consegna, datetime):
            return data_consegna.strftime('%Y-%m-%d')

        if isinstance(data_consegna, str):
            raw = data_consegna.strip()
            if not raw:
                return None

            for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f'):
                try:
                    parsed = datetime.strptime(raw, fmt)
                    return parsed.strftime('%Y-%m-%d')
                except ValueError:
                    pass

            for fmt in ('%d/%m/%Y', '%d/%m/%Y %H:%M:%S'):
                try:
                    parsed = datetime.strptime(raw, fmt)
                    return parsed.strftime('%Y-%m-%d')
                except ValueError:
                    pass

    if data_ricezione:
        try:
            dt_ric = datetime.strptime(data_ricezione, '%Y-%m-%d %H:%M:%S')
            h = dt_ric.hour
            wd = dt_ric.weekday()
            
            if h < 8:
                dt_calc = dt_ric
            else:
                if wd == 5: 
                    dt_calc = dt_ric + timedelta(days=2)
                else: 
                    dt_calc = dt_ric + timedelta(days=1)
                    
                if dt_calc.weekday() == 6:
                    dt_calc += timedelta(days=1)
                    
            return dt_calc.strftime('%Y-%m-%d')
        except Exception:
            pass

    return await get_data_attiva()


async def _trova_ordine_esistente_per_data(db, mittente: str, data_consegna_target: Optional[str], finestra_giorni: int = 7):
    limite_ricezione = (datetime.now() - timedelta(days=finestra_giorni)).strftime('%Y-%m-%d %H:%M:%S')
    cursor = await db.execute(
        "SELECT id, testo_originale, dati_estratti_ia, data_ricezione FROM ordini "
        "WHERE mittente = ? AND data_ricezione >= ? ORDER BY data_ricezione DESC LIMIT 15",
        (mittente, limite_ricezione)
    )
    rows = await cursor.fetchall()
    today_str = datetime.now().strftime('%Y-%m-%d')

    for row in rows:
        id_ord, testo_orig, dati_ia_raw, data_ric = row
        dati_parsed = parse_dati_estratti_ia(dati_ia_raw)
        data_consegna_ord = await normalize_data_consegna(dati_parsed.get("data_consegna"), data_ric)

        if data_consegna_target is not None:
            if data_consegna_ord == data_consegna_target:
                return row
        else:
            if not data_consegna_ord or data_consegna_ord >= today_str:
                return row

    return None

CATALOGO_FILE = get_static_path(os.path.join("catalogo", "catalogo.json"))
PARTICOLARITA_FILE = get_persistent_path(os.path.join("catalogo", "particolarita_clienti.json"))
PRODOTTI_MAP = {}

if os.path.exists(CATALOGO_FILE):
    try:
        with open(CATALOGO_FILE, 'r', encoding='utf-8') as f:
            catalog_list = json.load(f)
            for prod in catalog_list:
                cod = prod.get("c")
                nome = prod.get("n")
                peso = prod.get("p")
                
                um = "pezzi" if peso is not None else "kg"
                
                if cod:
                    PRODOTTI_MAP[cod] = {
                        "nome": nome, 
                        "unita_misura": um.lower(),
                        "peso_unitario": peso 
                    }
    except Exception as e:
        print(f"⚠️ Errore caricamento catalogo in db.py: {e}")


async def init_db():
    async with get_db_connection() as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA synchronous=NORMAL;")
        
        await db.execute("""
            CREATE TABLE IF NOT EXISTS impostazioni (
                chiave TEXT PRIMARY KEY,
                valore TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS ordini (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mittente TEXT,
                testo_originale TEXT,
                dati_estratti_ia TEXT,
                data_ricezione DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messaggi_elaborati (
                msg_id TEXT PRIMARY KEY,
                data_elaborazione DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS broadcast_liste (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome_lista TEXT UNIQUE,
                contatti_json TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS broadcast_schedulati (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_lista INTEGER,
                nome_lista TEXT,
                messaggio TEXT,
                orario_programmato DATETIME,
                stato TEXT DEFAULT 'PROGRAMMATO',
                data_invio DATETIME,
                ricorrenza TEXT DEFAULT 'UNA_TANTUM'
            )
        """)
        try:
            await db.execute("ALTER TABLE broadcast_schedulati ADD COLUMN ricorrenza TEXT DEFAULT 'UNA_TANTUM'")
        except Exception:
            pass
        await db.execute("""
            CREATE TABLE IF NOT EXISTS broadcast_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_schedulazione INTEGER,
                destinatario TEXT,
                messaggio TEXT,
                stato_esito TEXT,
                timestamp_invio DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS campioni_ia_clienti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente_id TEXT,
                testo_originale TEXT,
                dati_confermati_json TEXT,
                timestamp_conferma DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()
        
        await get_data_attiva()
        print("🗄️ Database Locale SQLite pronto con modalità Anti-Blocco (WAL) attiva.")

async def is_messaggio_elaborato(msg_id: str) -> bool:
    if not msg_id:
        return False
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT 1 FROM messaggi_elaborati WHERE msg_id = ?", (msg_id,))
        row = await cursor.fetchone()
        return bool(row)

async def segna_messaggio_elaborato(msg_id: str):
    if not msg_id:
        return
    async with get_db_connection() as db:
        await db.execute("INSERT OR IGNORE INTO messaggi_elaborati (msg_id) VALUES (?)", (msg_id,))
        await db.commit()

async def get_storico_oggi(mittente: str) -> str:
    target_data_consegna = await get_data_attiva()
    async with get_db_connection() as db:
        row = await _trova_ordine_esistente_per_data(db, mittente, target_data_consegna)
        if not row:
            return ""
        return row[1] 

async def ordine_esiste_in_db(mittente: str, testo: str, time_str: Optional[str] = None) -> bool:
    async with get_db_connection() as db:
        clean_text = testo.replace("🎙️ [MESSAGGIO VOCALE]", "").replace("🎙️ [VOCALE TRASCRITTO]:", "").strip()
        if not clean_text or len(clean_text) < 4:
            return False
        cursor = await db.execute(
            "SELECT id FROM ordini WHERE (testo_originale = ? OR testo_originale LIKE ?)",
            (testo, f"%{clean_text}%")
        )
        row = await cursor.fetchone()
        return bool(row)

async def salva_o_aggiorna_ordine(mittente: str, nuovo_messaggio: str, dati_estratti: str, data_ricezione_custom: Optional[str] = None):
    async with get_db_connection() as db:
        now_str = data_ricezione_custom if data_ricezione_custom else datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        try:
            dati_json = json.loads(dati_estratti)
        except Exception:
            dati_json = {}

        mittente_finale = dati_json.get("cliente_id", mittente)

        corrected_date = await normalize_data_consegna(dati_json.get("data_consegna"), now_str)
        if corrected_date and dati_json.get("data_consegna") != corrected_date:
            dati_json["data_consegna"] = corrected_date
            dati_estratti = json.dumps(dati_json, ensure_ascii=False)

        # Se l'ordine è un annullamento esplicito, aggiorna l'ordine esistente
        if dati_json.get("is_cancelled") or dati_json.get("stato_ordine") == "ANNULLATO":
            row = await _trova_ordine_esistente_per_data(db, mittente_finale, corrected_date)
            if row:
                target_id = row[0]
                await db.execute(
                    "UPDATE ordini SET testo_originale = ?, dati_estratti_ia = ?, data_ricezione = ? WHERE id = ?",
                    (nuovo_messaggio, dati_estratti, now_str, target_id)
                )
                await db.commit()
                return

        # DEDUPLICAZIONE RIGOROSA ANTI-DOPPIONI: Se lo stesso identico messaggio/ordine esiste già, aggiorna i dati senza duplicare la scheda
        clean_check = nuovo_messaggio.replace("🎙️ [MESSAGGIO VOCALE]", "").replace("🎙️ [VOCALE TRASCRITTO]:", "").strip()
        if len(clean_check) >= 4:
            cursor = await db.execute(
                "SELECT id, dati_estratti_ia FROM ordini WHERE (mittente = ? OR mittente = ?) AND (testo_originale = ? OR testo_originale LIKE ?)",
                (mittente_finale, mittente, nuovo_messaggio, f"%{clean_check}%")
            )
            existing_row = await cursor.fetchone()
            if existing_row:
                old_dati = parse_dati_estratti_ia(existing_row[1])
                # Non sovrascrivere ordini modificati manualmente o già confermati/consegnati
                if old_dati.get("modificato_manualmente") or old_dati.get("stato_ordine") in ["CONFERMATO", "CONSEGNATO"]:
                    return
                await db.execute(
                    "UPDATE ordini SET dati_estratti_ia = ? WHERE id = ?",
                    (dati_estratti, existing_row[0])
                )
                await db.commit()
                return

        # INSERISCE COME NUOVO ORDINE SE NON È UN DUPLICATO
        await db.execute(
            "INSERT INTO ordini (mittente, testo_originale, dati_estratti_ia, data_ricezione) VALUES (?, ?, ?, ?)",
            (mittente_finale, nuovo_messaggio, dati_estratti, now_str)
        )
        await db.commit()

def estrai_peso_unitario_da_nome(nome_o_codice: str) -> float:
    if not nome_o_codice:
        return 0.0
    text = nome_o_codice.lower().replace(',', '.')
    match_kg = re.search(r'(\d+(?:\.\d+)?)\s*kg\b', text)
    if match_kg:
        try:
            return float(match_kg.group(1))
        except ValueError:
            pass
    match_g = re.search(r'(\d+(?:\.\d+)?)\s*(?:g|gr|grammi)\b', text)
    if match_g:
        try:
            val = float(match_g.group(1))
            return val / 1000.0 if val > 10 else val
        except ValueError:
            pass
    return 0.0

async def aggiorna_confezionamento_ordine(id_ordine: int, prodotti_aggiornati: list):
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT dati_estratti_ia FROM ordini WHERE id = ?", (id_ordine,))
        row = await cursor.fetchone()
        if not row:
            return False
            
        dati_raw = row[0]
        dati_parsed = parse_dati_estratti_ia(dati_raw)

        peso_totale = 0.0
        lotto_generico = ""
        for p in prodotti_aggiornati:
            if not p.get("is_peso_fisso"):
                try:
                    g_str = str(p.get("grammatura", "0")).replace(',', '.').replace('KG', '').replace('kg', '').strip()
                    val = float(g_str)
                    um = p.get("unita_di_misura", "kg").lower()
                    
                    if um in ["pezzi", "pz", "coppia", "coppie"]:
                        qta = float(p.get("quantita", 1.0))
                        peso_totale += (val * qta)
                    else:
                        peso_totale += val
                except ValueError:
                    pass
            if p.get("numero_lotto") and not lotto_generico:
                lotto_generico = p.get("numero_lotto")

        dati_parsed["prodotti"] = prodotti_aggiornati
        dati_parsed["peso_reale"] = round(peso_totale, 3)
        dati_parsed["numero_lotto"] = lotto_generico
        dati_parsed["stato_confezionamento"] = "CONFEZIONATO"
        dati_parsed["stato_ordine"] = "CONFERMATO"
        dati_parsed["data_conferma"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        await db.execute(
            "UPDATE ordini SET dati_estratti_ia = ? WHERE id = ?",
            (json.dumps(dati_parsed, ensure_ascii=False), id_ordine)
        )
        await db.commit()
        return True

async def conferma_ordine(id_ordine: int, prodotti: Optional[list] = None, numero_lotto: Optional[str] = None):
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT dati_estratti_ia FROM ordini WHERE id = ?", (id_ordine,))
        row = await cursor.fetchone()
        if not row:
            return False
            
        dati_raw = row[0]
        dati_parsed = parse_dati_estratti_ia(dati_raw)

        lotto_default = (numero_lotto or dati_parsed.get("numero_lotto") or f"L{datetime.now().strftime('%y%m%d')}").strip().upper()
        prodotti_attuali = prodotti if prodotti is not None else (dati_parsed.get("prodotti") or [])
            
        peso_totale = 0.0
        for p in prodotti_attuali:
            cod = p.get("codice_articolo", "")
            nome = p.get("nome_articolo", "") or cod
            
            if not p.get("numero_lotto"):
                p["numero_lotto"] = lotto_default
                
            unit_w = estrai_peso_unitario_da_nome(nome)
            if unit_w <= 0 and cod in PRODOTTI_MAP and PRODOTTI_MAP[cod].get("peso_unitario") is not None:
                unit_w = float(PRODOTTI_MAP[cod]["peso_unitario"])

            if unit_w > 0:
                p["is_peso_fisso"] = True
                if not p.get("grammatura") or str(p.get("grammatura")).strip() == "":
                    p["grammatura"] = f"{unit_w:.3f} KG"
            else:
                p["is_peso_fisso"] = False
                if not p.get("grammatura") or str(p.get("grammatura")).strip() == "":
                    p["grammatura"] = f"{p.get('quantita', 1.0)} {p.get('unita_di_misura', 'kg')}"
                
                try:
                    g_str = str(p.get("grammatura", "0")).replace(',', '.').replace('KG', '').replace('kg', '').strip()
                    val = float(g_str)
                    um = p.get("unita_di_misura", "kg").lower()
                    if um in ["pezzi", "pz", "coppia", "coppie"]:
                        qta = float(p.get("quantita", 1.0))
                        peso_totale += (val * qta)
                    else:
                        peso_totale += val
                except ValueError:
                    pass

        dati_parsed["prodotti"] = prodotti_attuali
        if peso_totale > 0:
            dati_parsed["peso_reale"] = round(peso_totale, 3)
            
        dati_parsed["stato_ordine"] = "CONFERMATO"
        dati_parsed["numero_lotto"] = lotto_default
        dati_parsed["data_conferma"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        await db.execute(
            "UPDATE ordini SET dati_estratti_ia = ? WHERE id = ?",
            (json.dumps(dati_parsed, ensure_ascii=False), id_ordine)
        )
        await db.commit()
        
        try:
            cursor_m = await db.execute("SELECT mittente, testo_originale FROM ordini WHERE id = ?", (id_ordine,))
            row_m = await cursor_m.fetchone()
            if row_m:
                await salva_campione_ia_cliente(row_m[0], row_m[1], dati_parsed)
        except Exception:
            pass

        return True

async def consegna_ordine(id_ordine: int, prodotti: Optional[list] = None):
    """Aggiorna i prodotti con i pesi inseriti dal corriere e imposta stato_ordine = 'CONSEGNATO'."""
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT dati_estratti_ia FROM ordini WHERE id = ?", (id_ordine,))
        row = await cursor.fetchone()
        if not row:
            return False
            
        dati_raw = row[0]
        dati_parsed = parse_dati_estratti_ia(dati_raw)

        if prodotti is not None:
            peso_totale = 0.0
            for p in prodotti:
                gram = str(p.get("grammatura") or p.get("peso_effettivo") or "").replace(',', '.').replace('KG', '').replace('kg', '').strip()
                try:
                    val = float(gram)
                    peso_totale += val
                except ValueError:
                    pass
            dati_parsed["prodotti"] = prodotti
            if peso_totale > 0:
                dati_parsed["peso_reale"] = round(peso_totale, 3)

        dati_parsed["stato_ordine"] = "CONSEGNATO"
        dati_parsed["data_consegna_effettiva"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        await db.execute(
            "UPDATE ordini SET dati_estratti_ia = ? WHERE id = ?",
            (json.dumps(dati_parsed, ensure_ascii=False), id_ordine)
        )
        await db.commit()
        return True

def scomponi_prodotti_pezzi(prodotti: list) -> list:
    prodotti_scomposti = []
    for p in prodotti:
        um = (p.get("unita_di_misura") or "kg").lower()
        try:
            qta = float(p.get("quantita", 1.0))
        except (ValueError, TypeError):
            qta = 1.0
        
        nome_check = str(p.get("nome_articolo") or p.get("codice_articolo") or "").lower()
        
        is_caciocavallo_silano = "caciocavallo silano" in nome_check or ("caciocavallo" in nome_check and "dop" in nome_check)
        
        if is_caciocavallo_silano and um in ["pezzi", "pz", "coppia", "coppie"] and 1 < qta <= 100 and qta.is_integer():
            count = int(qta)
            base_name = p.get("nome_articolo") or p.get("codice_articolo") or "Prodotto"
            for i in range(count):
                single_item = {**p}
                single_item["quantita"] = 1.0
                single_item["unita_di_misura"] = um
                single_item["pezzo_index"] = i + 1
                single_item["pezzi_totali"] = count
                single_item["nome_articolo"] = f"{base_name} (Pezzo {i+1} di {count})"
                prodotti_scomposti.append(single_item)
        else:
            prodotti_scomposti.append(p)
            
    return prodotti_scomposti

async def get_tutti_ordini(data_filtro: Optional[str] = None, scomponi_pezzi: bool = False, includi_non_ordini: bool = False):
    async with get_db_connection() as db:
        query = "SELECT id, mittente, testo_originale, dati_estratti_ia, data_ricezione FROM ordini ORDER BY data_ricezione DESC"
        cursor = await db.execute(query)
        rows = await cursor.fetchall()
        
        ordini_lista = []

        for r in rows:
            id_ord, mittente, testo_orig, dati_ia_raw, data_ric = r
            dati_parsed = parse_dati_estratti_ia(dati_ia_raw)
            if not dati_parsed and dati_ia_raw:
                dati_parsed = {"is_order": True, "prodotti": [], "note_ordine": str(dati_ia_raw)}

            is_cancelled_rec = bool(dati_parsed.get("is_cancelled")) or dati_parsed.get("stato_ordine") == "ANNULLATO"
            
            is_valid_order = dati_parsed.get("is_order", False) or is_cancelled_rec or len(dati_parsed.get("prodotti", [])) > 0
            
            if not is_valid_order and not includi_non_ordini:
                continue

            data_consegna = await normalize_data_consegna(dati_parsed.get("data_consegna"), data_ric)
            if not data_consegna:
                data_consegna = await normalize_data_consegna(None, data_ric)

            if data_filtro and data_consegna != data_filtro:
                continue

            lotto_ord = dati_parsed.get("numero_lotto")
            prodotti = dati_parsed.get("prodotti", [])
            
            if scomponi_pezzi:
                prodotti = scomponi_prodotti_pezzi(prodotti)

            for p in prodotti:
                cod = p.get("codice_articolo")
                nome = str(p.get("nome_articolo") or cod or "")
                if cod in PRODOTTI_MAP and not p.get("nome_articolo"):
                    p["nome_articolo"] = PRODOTTI_MAP[cod]["nome"]

                unit_w = estrai_peso_unitario_da_nome(nome)
                if unit_w <= 0 and cod in PRODOTTI_MAP and PRODOTTI_MAP[cod].get("peso_unitario") is not None:
                    unit_w = float(PRODOTTI_MAP[cod]["peso_unitario"])

                if unit_w > 0:
                    p["is_peso_fisso"] = True
                    p["peso_unitario_kg"] = unit_w
                    p["peso_totale_calcolato_kg"] = round(float(p.get("quantita", 0)) * unit_w, 3)
                else:
                    p["is_peso_fisso"] = False
                
                if not p.get("numero_lotto"):
                    p["numero_lotto"] = lotto_ord

            is_fallback_rec = bool(dati_parsed.get("is_fallback")) or (
                "[Parser Locale" in str(dati_parsed.get("note_ordine", ""))
                or "[Parser Locale" in str(testo_orig or "")
            )

            ordini_lista.append({
                "id": id_ord,
                "mittente": mittente,
                "testo_originale": testo_orig,
                "data_consegna": data_consegna,
                "prodotti": prodotti,
                "note_ordine": dati_parsed.get("note_ordine", ""),
                "is_order": dati_parsed.get("is_order", len(prodotti) > 0),
                "is_cancelled": is_cancelled_rec,
                "da_verificare_manualmente": dati_parsed.get("da_verificare_manualmente", False),
                "is_fallback": is_fallback_rec,
                "stato_ordine": dati_parsed.get("stato_ordine", "IN_ATTESA"),
                "stato_confezionamento": dati_parsed.get("stato_confezionamento", "DA_CONFEZIONARE"),
                "peso_reale": dati_parsed.get("peso_reale"),
                "numero_lotto": lotto_ord,
                "data_conferma": dati_parsed.get("data_conferma"),
                "data_confezionamento": dati_parsed.get("data_confezionamento"),
                "data_consegna_effettiva": dati_parsed.get("data_consegna_effettiva"),
                "data_ricezione": data_ric,
                "timestamp_elaborazione": dati_parsed.get("timestamp_elaborazione")
            })
        return ordini_lista

async def crea_ordine_manuale(mittente: str, prodotti: list, note: str = "", data_consegna: Optional[str] = None):
    if not data_consegna:
        data_consegna = await get_data_attiva()
    else:
        norm_data = await normalize_data_consegna(data_consegna)
        if norm_data:
            data_consegna = norm_data
    
    # Riempi nome_articolo da catalogo se mancante
    for p in prodotti:
        cod = p.get("codice_articolo")
        if cod in PRODOTTI_MAP and not p.get("nome_articolo"):
            p["nome_articolo"] = PRODOTTI_MAP[cod]["nome"]

    dati_ia = {
        "is_order": True,
        "stato_ordine": "IN_ATTESA",
        "stato_confezionamento": "DA_CONFEZIONARE",
        "data_consegna": data_consegna,
        "prodotti": prodotti,
        "note_ordine": note,
        "da_verificare_manualmente": False,
        "cliente_id": mittente
    }
    testo_orig = f"[Inserimento Manuale Dashboard] {note}".strip()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    async with get_db_connection() as db:
        cursor = await db.execute(
            "INSERT INTO ordini (mittente, testo_originale, dati_estratti_ia, data_ricezione) VALUES (?, ?, ?, ?)",
            (mittente, testo_orig, json.dumps(dati_ia, ensure_ascii=False), now_str)
        )
        await db.commit()
        return cursor.lastrowid

async def aggiorna_ordine(id_ordine: int, prodotti: list, note: str = "", data_consegna: Optional[str] = None, mittente: Optional[str] = None):
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT mittente, testo_originale, dati_estratti_ia FROM ordini WHERE id = ?", (id_ordine,))
        row = await cursor.fetchone()
        if not row:
            return False
        
        old_mittente, _, dati_ia_raw = row
        dati_parsed = parse_dati_estratti_ia(dati_ia_raw)

        # Riempi nome_articolo da catalogo se mancante e normalizza quantita
        cleaned_prodotti = []
        for p in prodotti:
            cod = p.get("codice_articolo")
            nome = p.get("nome_articolo")
            if cod in PRODOTTI_MAP and not nome:
                p["nome_articolo"] = PRODOTTI_MAP[cod]["nome"]
            try:
                p["quantita"] = float(str(p.get("quantita", 1.0)).replace(',', '.'))
            except (ValueError, TypeError):
                p["quantita"] = 1.0
            cleaned_prodotti.append(p)

        dati_parsed["prodotti"] = cleaned_prodotti
        if note is not None:
            dati_parsed["note_ordine"] = note
        if data_consegna:
            norm_data = await normalize_data_consegna(data_consegna)
            dati_parsed["data_consegna"] = norm_data or data_consegna

        new_mittente = (mittente or old_mittente or "").strip()
        dati_parsed["cliente_id"] = new_mittente
        dati_parsed["is_order"] = True
        dati_parsed["da_verificare_manualmente"] = False
        dati_parsed["modificato_manualmente"] = True
        dati_parsed["timestamp_modifica"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        await db.execute(
            "UPDATE ordini SET mittente = ?, dati_estratti_ia = ? WHERE id = ?",
            (new_mittente, json.dumps(dati_parsed, ensure_ascii=False), id_ordine)
        )
        await db.commit()
        return True

async def elimina_ordine(id_ordine: int):
    async with get_db_connection() as db:
        await db.execute("DELETE FROM ordini WHERE id = ?", (id_ordine,))
        await db.commit()
        return True

async def svuota_database_ordini():
    async with get_db_connection() as db:
        await db.execute("DELETE FROM ordini")
        await db.execute("DELETE FROM messaggi_elaborati")
        await db.commit()
        print("🧹 Database ordini e memoria messaggi svuotati con successo.")
        return True

async def rielabora_singolo_ordine(id_ordine: int) -> dict:
    from backend.ai_parser import AIParser
    ai_parser = AIParser(base_dir="catalogo")
    
    async with get_db_connection() as db:
        cursor = await db.execute(
            "SELECT id, mittente, testo_originale, data_ricezione, dati_estratti_ia FROM ordini WHERE id = ?",
            (id_ordine,)
        )
        row = await cursor.fetchone()
        
    if not row:
        return {"status": "error", "message": f"Ordine #{id_ordine} non trovato."}
        
    id_ord, mittente, testo_orig, data_ric, dati_raw = row
    dati_parsed = parse_dati_estratti_ia(dati_raw)
    
    clean_text = (testo_orig or "").replace("🎙️ [VOCALE TRASCRITTO]:", "").replace("🎙️ [MESSAGGIO VOCALE]", "").strip()
    clean_text = re.sub(r'\[Integrazione/Correzione\]:', '', clean_text).strip()
    clean_text = re.sub(r'\[Parser Locale.*?\]', '', clean_text).strip()
    clean_text = re.sub(r'\[Inserimento Manuale Dashboard\]', '', clean_text).strip()
    clean_text = clean_text.strip().strip('"').strip("'").strip()
    
    if not clean_text:
        # Se non c'è testo nel messaggio originale, controlla se ci sono note
        if dati_parsed.get("note_ordine"):
            note_clean = re.sub(r'\[Parser Locale.*?\]', '', dati_parsed.get("note_ordine", "")).strip().strip('"').strip("'")
            if note_clean:
                clean_text = note_clean
            
    if not clean_text:
        return {"status": "error", "message": "Nessun testo originale disponibile per rielaborare questo ordine con l'IA."}
        
    msg_dt = None
    if data_ric:
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
            try:
                msg_dt = datetime.strptime(str(data_ric).strip(), fmt)
                break
            except Exception:
                pass
                
    risultato_ia = await ai_parser.parse_message(clean_text, client_name=mittente, message_timestamp=msg_dt)
    
    if not risultato_ia:
        return {"status": "error", "message": "Nessuna risposta ricevuta dall'IA."}
        
    ordini_ottenuti = risultato_ia.get("ordini", [])
    if not ordini_ottenuti and "prodotti" in risultato_ia:
        ordini_ottenuti = [risultato_ia]
        
    if not ordini_ottenuti:
        return {"status": "error", "message": "L'IA non ha rilevato articoli o ordini validi nel testo."}
        
    ord_singolo = ordini_ottenuti[0]
    ord_singolo["timestamp_elaborazione"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # Normalizza data consegna
    corrected_date = await normalize_data_consegna(ord_singolo.get("data_consegna"), data_ric)
    if corrected_date:
        ord_singolo["data_consegna"] = corrected_date
    elif dati_parsed.get("data_consegna"):
        ord_singolo["data_consegna"] = dati_parsed.get("data_consegna")
        
    # Reset stato
    ord_singolo["stato_ordine"] = "IN_ATTESA"
    ord_singolo["stato_confezionamento"] = "DA_CONFEZIONARE"
    if not ord_singolo.get("is_fallback"):
        ord_singolo["is_fallback"] = False
        ord_singolo["da_verificare_manualmente"] = False
    
    prodotti = ord_singolo.get("prodotti", [])
    is_cancelled = ord_singolo.get("is_cancelled", False)
    if len(prodotti) == 0 and not is_cancelled:
        ord_singolo["is_order"] = False
    else:
        ord_singolo["is_order"] = True
        
    nuovo_cliente = ord_singolo.get("cliente_id") or mittente
    json_str = json.dumps(ord_singolo, ensure_ascii=False)
    
    async with get_db_connection() as db:
        await db.execute(
            "UPDATE ordini SET mittente = ?, dati_estratti_ia = ? WHERE id = ?",
            (nuovo_cliente, json_str, id_ord)
        )
        await db.commit()
        
    usato_fallback = any(ordine.get("is_fallback", False) for ordine in ordini_ottenuti) or ord_singolo.get("is_fallback", False)
    if usato_fallback:
        logging.warning(f"⚠️ [Elaborazione Ordine] Ordine #{id_ord} ({nuovo_cliente}) salvato dal Parser Locale di Emergenza!")
        print(f"⚠️ [Rielabora Singolo Ordine] Ordine #{id_ord} ({nuovo_cliente}) salvato dal Parser Locale di Emergenza!")
        msg_out = f"⚠️ Ordine #{id_ord} ({nuovo_cliente}) elaborato in emergenza (da verificare)"
    else:
        logging.info(f"✨ [Elaborazione Ordine] Ordine #{id_ord} ({nuovo_cliente}) elaborato con successo dall'IA!")
        print(f"✨ [Rielabora Singolo Ordine] Ordine #{id_ord} ({nuovo_cliente}) rielaborato con successo dall'IA!")
        msg_out = f"✨ Ordine #{id_ord} ({nuovo_cliente}) rielaborato con successo dall'IA!"

    return {
        "status": "success",
        "message": msg_out,
        "ordine": ord_singolo
    }

async def rielabora_tutti_ordini(ore_limite: int = 48):
    from backend.ai_parser import AIParser
    ai_parser = AIParser(base_dir="catalogo")
    
    limite_dt = (datetime.now() - timedelta(hours=ore_limite)).strftime('%Y-%m-%d %H:%M:%S')
    
    # 1. Recupera rapidamente le righe e rilascia immediatamente la connessione al DB
    async with get_db_connection() as db:
        cursor = await db.execute(
            "SELECT id, mittente, testo_originale, data_ricezione, dati_estratti_ia FROM ordini WHERE data_ricezione >= ? ORDER BY data_ricezione ASC",
            (limite_dt,)
        )
        rows = await cursor.fetchall()
        
    count = 0
    # 2. Elabora con l'IA senza bloccare transazioni aperte su SQLite
    for r in rows:
        id_ord, mittente, testo_orig, data_ric, dati_raw = r
        dati_parsed = parse_dati_estratti_ia(dati_raw)
        if dati_parsed.get("modificato_manualmente") or dati_parsed.get("stato_ordine") in ["CONFERMATO", "CONSEGNATO"]:
            continue

        if not testo_orig or "[Inserimento Manuale Dashboard]" in testo_orig:
            continue
        
        clean_text = testo_orig.replace("🎙️ [VOCALE TRASCRITTO]:", "").replace("🎙️ [MESSAGGIO VOCALE]", "").strip()
        clean_text = re.sub(r'\[Integrazione/Correzione\]:', '', clean_text).strip()
        clean_text = re.sub(r'\[Parser Locale.*?\]', '', clean_text).strip()
        
        if not clean_text:
            continue

        msg_dt = None
        if data_ric:
            for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
                try:
                    msg_dt = datetime.strptime(str(data_ric).strip(), fmt)
                    break
                except Exception:
                    pass

        risultato_ia = await ai_parser.parse_message(clean_text, client_name=mittente, message_timestamp=msg_dt)
        ordini_ottenuti = (risultato_ia or {}).get("ordini", [])
        if not ordini_ottenuti and "prodotti" in (risultato_ia or {}):
            ordini_ottenuti = [risultato_ia]

        has_valid_order = any(
            o.get("is_order") and len(o.get("prodotti", [])) > 0
            for o in ordini_ottenuti
        )
        if has_valid_order:
            ord_salva = ordini_ottenuti[0]
            ord_salva["timestamp_elaborazione"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            json_str = json.dumps(ord_salva, ensure_ascii=False)
            async with get_db_connection() as db:
                await db.execute("UPDATE ordini SET dati_estratti_ia = ? WHERE id = ?", (json_str, id_ord))
                await db.commit()
            count += 1
            
    return count

async def riprova_ordini_parser_locale():
    """Cerca tutti gli ordini elaborati con il parser locale di riserva o incompleti e riprova ad elaborarli con l'IA."""
    from backend.ai_parser import AIParser
    ai_parser = AIParser(base_dir="catalogo")

    async with get_db_connection() as db:
        cursor = await db.execute(
            "SELECT id, mittente, testo_originale, data_ricezione, dati_estratti_ia FROM ordini "
            "WHERE (dati_estratti_ia LIKE '%Parser Locale%' OR testo_originale LIKE '%Parser Locale%' OR dati_estratti_ia LIKE '%Nessun prodotto individuato%') "
            "ORDER BY id DESC"
        )
        rows = await cursor.fetchall()

    if not rows:
        return 0

    count = 0
    for r in rows:
        id_ord, mittente, testo_orig, data_ric, dati_raw = r
        dati_parsed = parse_dati_estratti_ia(dati_raw)
        
        # Se l'ordine è già stato modificato manualmente o confermato/consegnato, non sovrascrivere
        if dati_parsed.get("modificato_manualmente") or dati_parsed.get("stato_ordine") in ["CONFERMATO", "CONSEGNATO"]:
            continue

        if not testo_orig or "[Inserimento Manuale Dashboard]" in testo_orig:
            continue

        clean_text = testo_orig.replace("🎙️ [VOCALE TRASCRITTO]:", "").replace("🎙️ [MESSAGGIO VOCALE]", "").strip()
        clean_text = re.sub(r'\[Integrazione/Correzione\]:', '', clean_text).strip()
        clean_text = re.sub(r'\[Parser Locale.*?\]', '', clean_text).strip()

        if not clean_text:
            continue

        msg_dt = None
        if data_ric:
            for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
                try:
                    msg_dt = datetime.strptime(str(data_ric).strip(), fmt)
                    break
                except Exception:
                    pass

        risultato_ia = await ai_parser.parse_message(clean_text, client_name=mittente, message_timestamp=msg_dt)
        ordini_ottenuti = (risultato_ia or {}).get("ordini", [])
        
        is_success_ai = False
        for o in ordini_ottenuti:
            note = str(o.get("note_ordine", ""))
            if "Parser Locale" not in note and len(o.get("prodotti", [])) > 0:
                is_success_ai = True
                break

        if is_success_ai:
            json_str = json.dumps(risultato_ia, ensure_ascii=False)
            async with get_db_connection() as db:
                await db.execute("UPDATE ordini SET dati_estratti_ia = ? WHERE id = ?", (json_str, id_ord))
                await db.commit()
            count += 1
            print(f"✨ [Auto-Retry IA 5min] Ordine #{id_ord} ({mittente}) rielaborato con successo dall'IA!")

    return count

def avvia_loop_auto_retry_ia():
    """Disabilitato: la rielaborazione avviene solo su richiesta esplicita dell'utente."""
    pass

def is_cliente_mulnar(mittente: str) -> bool:
    """Verifica se il mittente o numero corrisponde a Mulnar."""
    m = str(mittente or "").lower()
    m_clean = re.sub(r"\D", "", m)
    if "mulnar" in m:
        return True
    for num in ["3471461004", "0975203278", "471461004", "975203278"]:
        if num in m_clean or num in m:
            return True
    return False

def is_burrata_articolo(codice: str, nome: str) -> bool:
    """Verifica se l'articolo è una burrata di qualsiasi tipologia (classica, tartufo, pistacchio, ecc.)."""
    c = str(codice or "").lower()
    n = str(nome or "").lower()
    return "burrat" in c or "burrat" in n or "burat" in c or "burat" in n or "burpist" in c

def is_sfoglia_articolo(codice: str, nome: str) -> bool:
    """Verifica se l'articolo è una sfoglia di mozzarella (classica o senza lattosio / delat)."""
    c = str(codice or "").lower()
    n = str(nome or "").lower()
    return "sfoglia" in c or "sfoglia" in n

def is_articolo_calcolo_a_pezzi(codice: str, nome: str) -> bool:
    """Verifica se l'articolo va calcolato a PEZZI per la distinta di produzione casaro."""
    return is_burrata_articolo(codice, nome) or is_sfoglia_articolo(codice, nome)

def get_peso_unitario_articolo(codice: str, nome: str) -> float:
    cod = str(codice or "").strip()
    if cod in PRODOTTI_MAP and PRODOTTI_MAP[cod].get("peso_unitario") is not None:
        try:
            return float(PRODOTTI_MAP[cod]["peso_unitario"])
        except Exception:
            pass
    w = estrai_peso_unitario_da_nome(nome)
    if w > 0:
        return w
    if is_sfoglia_articolo(codice, nome):
        return 0.5
    return 0.25

async def get_produzione_aggregata(data_target: Optional[str] = None):
    ordini = await get_tutti_ordini(data_target)
    totali = {}

    for o in ordini:
        if o.get("is_cancelled") or o.get("stato_ordine") == "ANNULLATO":
            continue
        if is_cliente_mulnar(o.get("mittente", "")):
            continue
        for p in o.get("prodotti", []):
            cod = str(p.get("codice_articolo", "GENERICO")).strip()
            cod_lower = cod.lower()
            nome = str(p.get("nome_articolo") or PRODOTTI_MAP.get(cod, {}).get("nome") or cod).strip()
            nome_lower = nome.lower()
            
            if "filmzpe" in cod_lower or "filon" in nome_lower or "filon" in cod_lower or "panett" in nome_lower or "pizza" in nome_lower or "julienne" in nome_lower or "tagju" in cod_lower:
                continue

            qta = float(p.get("quantita", 0))
            um = (p.get("unita_di_misura") or PRODOTTI_MAP.get(cod, {}).get("unita_misura") or "kg").lower()

            # Gli articoli come burrata e sfoglia vanno SEMPRE calcolati a PEZZI per la produzione casaro
            if is_articolo_calcolo_a_pezzi(cod, nome):
                um = "pezzi"
                p_um = (p.get("unita_di_misura") or "").lower()
                if p_um == "kg":
                    peso_un = get_peso_unitario_articolo(cod, nome)
                    if peso_un > 0:
                        qta = round(qta / peso_un)
                    else:
                        qta = round(qta / 0.5) if is_sfoglia_articolo(cod, nome) else round(qta / 0.25)
                else:
                    qta = round(qta)

            if cod not in totali:
                totali[cod] = {
                    "codice_articolo": cod,
                    "nome_prodotto": nome,
                    "quantita_totale": 0.0,
                    "unita_di_misura": um,
                    "numero_ordini": 0
                }
            totali[cod]["quantita_totale"] += qta
            totali[cod]["numero_ordini"] += 1

    lista_produzione = sorted(totali.values(), key=lambda x: x["quantita_totale"], reverse=True)
    return lista_produzione

def is_ordine_sole(ordine_or_mittente) -> bool:
    """Verifica se un ordine o mittente fa parte del circuito Gruppo Sole 365."""
    if isinstance(ordine_or_mittente, dict):
        mittente = str(ordine_or_mittente.get("mittente", ""))
        note = str(ordine_or_mittente.get("note_ordine", ""))
        testo = str(ordine_or_mittente.get("testo_originale", ""))
        full_text = f"{mittente} {note} {testo}".lower()
    else:
        full_text = str(ordine_or_mittente).lower()
        mittente = str(ordine_or_mittente)

    if "sole" in full_text or "365" in full_text:
        return True

    numeri_sole_365 = [
        '3284344912', '181208998756424', '199325305045099', '177188993269891', '393284344912',
        '3341868867', '3270507404', '3286595597', '3889867085', '3495813205', '3287583993', '3924317281'
    ]
    if any(num in mittente for num in numeri_sole_365):
        return True

    if os.path.exists(PARTICOLARITA_FILE):
        try:
            with open(PARTICOLARITA_FILE, 'r', encoding='utf-8') as f:
                clienti = json.load(f)
                for c in clienti:
                    nome_c = str(c.get("n", "")).lower()
                    part_c = str(c.get("p", "")).lower()
                    tel_c = str(c.get("t", "")).replace("+", "").replace(" ", "")
                    if ("sole" in nome_c or "365" in nome_c or "sole" in part_c or "365" in part_c):
                        if nome_c and nome_c in full_text:
                            return True
                        if tel_c and tel_c in mittente.replace("+", "").replace(" ", ""):
                            return True
        except Exception:
            pass

    return False

async def get_produzione_aggregata_sole(data_target: Optional[str] = None):
    """Calcola la distinta di produzione aggregata esclusivamente per gli ordini del Gruppo Sole 365."""
    ordini = await get_tutti_ordini(data_target)
    totali = {}

    for o in ordini:
        if o.get("is_cancelled") or o.get("stato_ordine") == "ANNULLATO":
            continue
        if not is_ordine_sole(o):
            continue

        mittente_nome = o.get("mittente", "").split("(")[0].strip() or "Punto Vendita Sole"

        for p in o.get("prodotti", []):
            cod = str(p.get("codice_articolo", "GENERICO")).strip()
            nome = str(p.get("nome_articolo") or PRODOTTI_MAP.get(cod, {}).get("nome") or cod).strip()

            qta = float(p.get("quantita", 0))
            um = (p.get("unita_di_misura") or PRODOTTI_MAP.get(cod, {}).get("unita_misura") or "kg").lower()

            # Gli articoli come burrata e sfoglia vanno SEMPRE calcolati a PEZZI per la produzione casaro
            if is_articolo_calcolo_a_pezzi(cod, nome):
                um = "pezzi"
                p_um = (p.get("unita_di_misura") or "").lower()
                if p_um == "kg":
                    peso_un = get_peso_unitario_articolo(cod, nome)
                    if peso_un > 0:
                        qta = round(qta / peso_un)
                    else:
                        qta = round(qta / 0.5) if is_sfoglia_articolo(cod, nome) else round(qta / 0.25)
                else:
                    qta = round(qta)

            if cod not in totali:
                totali[cod] = {
                    "codice_articolo": cod,
                    "nome_prodotto": nome,
                    "quantita_totale": 0.0,
                    "unita_di_misura": um,
                    "numero_ordini": 0,
                    "clienti": []
                }
            totali[cod]["quantita_totale"] += qta
            totali[cod]["numero_ordini"] += 1
            if mittente_nome not in totali[cod]["clienti"]:
                totali[cod]["clienti"].append(mittente_nome)

    lista_produzione = sorted(totali.values(), key=lambda x: x["quantita_totale"], reverse=True)
    return lista_produzione

async def get_ordini_sole(data_target: Optional[str] = None, scomponi_pezzi: bool = False):
    """Restituisce la lista degli ordini appartenenti al Gruppo Sole 365."""
    ordini = await get_tutti_ordini(data_target, scomponi_pezzi=scomponi_pezzi)
    return [o for o in ordini if is_ordine_sole(o) and not o.get("is_cancelled") and o.get("stato_ordine") != "ANNULLATO"]

async def get_statistiche(periodo_tipo: str = "mensile", periodo_valore: Optional[str] = None):
    tutti_ordini = await get_tutti_ordini()
    
    now = datetime.now()
    current_year = now.year
    current_month = now.month
    
    if not periodo_valore:
        if periodo_tipo == "mensile":
            periodo_valore = now.strftime('%Y-%m')
        elif periodo_tipo == "trimestrale":
            q = (current_month - 1) // 3 + 1
            periodo_valore = f"{current_year}-Q{q}"
        elif periodo_tipo == "semestrale":
            s = 1 if current_month <= 6 else 2
            periodo_valore = f"{current_year}-S{s}"
        elif periodo_tipo == "annuale":
            periodo_valore = str(current_year)

    def fa_parte_del_periodo(ord_data_str: str) -> bool:
        if not ord_data_str:
            return False
        try:
            parts = ord_data_str.split('-')
            if len(parts) < 3:
                return False
            y, m = int(parts[0]), int(parts[1])
            
            if periodo_tipo == "mensile":
                if not periodo_valore:
                    return False
                target_y, target_m = map(int, periodo_valore.split('-'))
                return y == target_y and m == target_m
            elif periodo_tipo == "trimestrale":
                if not periodo_valore or "-Q" not in periodo_valore:
                    return False
                py, pq = periodo_valore.split('-Q')
                target_y = int(py)
                quarter = int(pq)
                target_months = range((quarter - 1) * 3 + 1, quarter * 3 + 1)
                return y == target_y and m in target_months
            elif periodo_tipo == "semestrale":
                if not periodo_valore or "-S" not in periodo_valore:
                    return False
                py, ps = periodo_valore.split('-S')
                target_y = int(py)
                sem = int(ps)
                target_months = range(1, 7) if sem == 1 else range(7, 13)
                return y == target_y and m in target_months
            elif periodo_tipo == "annuale":
                if not periodo_valore:
                    return False
                target_y = int(periodo_valore)
                return y == target_y
        except Exception:
            return False
        return False

    ordini_filtrati = [o for o in tutti_ordini if fa_parte_del_periodo(o.get("data_consegna") or o.get("data_ricezione", "")[:10])]

    total_ordini_periodo = len(ordini_filtrati)
    total_kg_mozzarella = 0.0
    clienti_counter = {}
    totali_prodotti = {}

    for o in ordini_filtrati:
        cliente = o.get("mittente", "Anonimo")
        clienti_counter[cliente] = clienti_counter.get(cliente, 0) + 1

        for p in o.get("prodotti", []):
            cod = p.get("codice_articolo", "GENERICO")
            nome = p.get("nome_articolo") or cod
            qta = float(p.get("quantita", 0))
            um = (p.get("unita_di_misura") or "kg").lower()

            if "mozz" in cod.lower() or "bufal" in cod.lower() or "fdl" in cod.lower() or "boc" in cod.lower() or "nod" in cod.lower() or "mozzarella" in nome.lower() or "fior di latte" in nome.lower() or "bufala" in nome.lower():
                total_kg_mozzarella += qta

            if cod not in totali_prodotti:
                totali_prodotti[cod] = {
                    "prodotto": nome[:25],
                    "quantita": 0.0,
                    "unita": um.upper()
                }
            totali_prodotti[cod]["quantita"] += qta

    top_cliente = max(clienti_counter.items(), key=lambda x: x[1])[0] if clienti_counter else "-"
    media_kg_ordine = round(total_kg_mozzarella / total_ordini_periodo, 1) if total_ordini_periodo > 0 else 0.0
    trend_articoli = sorted(totali_prodotti.values(), key=lambda x: x["quantita"], reverse=True)[:8]

    volumi_temporali = []
    if periodo_tipo == "mensile":
        volumi_temporali = [
            {"giorno": "Set 1", "volumi_kg": round(total_kg_mozzarella * 0.22, 1), "ordini": max(0, int(total_ordini_periodo * 0.2))},
            {"giorno": "Set 2", "volumi_kg": round(total_kg_mozzarella * 0.28, 1), "ordini": max(0, int(total_ordini_periodo * 0.3))},
            {"giorno": "Set 3", "volumi_kg": round(total_kg_mozzarella * 0.25, 1), "ordini": max(0, int(total_ordini_periodo * 0.25))},
            {"giorno": "Set 4", "volumi_kg": round(total_kg_mozzarella * 0.25, 1), "ordini": max(0, int(total_ordini_periodo * 0.25))},
        ]
    elif periodo_tipo == "trimestrale":
        m_names = ["Mese 1", "Mese 2", "Mese 3"]
        val_str = periodo_valore or ""
        if "-Q1" in val_str: m_names = ["Gennaio", "Febbraio", "Marzo"]
        elif "-Q2" in val_str: m_names = ["Aprile", "Maggio", "Giugno"]
        elif "-Q3" in val_str: m_names = ["Luglio", "Agosto", "Settembre"]
        elif "-Q4" in val_str: m_names = ["Ottobre", "Novembre", "Dicembre"]
        
        volumi_temporali = [
            {"giorno": m_names[0], "volumi_kg": round(total_kg_mozzarella * 0.3, 1), "ordini": int(total_ordini_periodo * 0.3)},
            {"giorno": m_names[1], "volumi_kg": round(total_kg_mozzarella * 0.38, 1), "ordini": int(total_ordini_periodo * 0.4)},
            {"giorno": m_names[2], "volumi_kg": round(total_kg_mozzarella * 0.32, 1), "ordini": int(total_ordini_periodo * 0.3)},
        ]
    elif periodo_tipo == "semestrale":
        val_str = periodo_valore or ""
        s_months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu"] if "-S1" in val_str else ["Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
        volumi_temporali = [
            {"giorno": m, "volumi_kg": round((total_kg_mozzarella / 6), 1), "ordini": int(total_ordini_periodo / 6)}
            for m in s_months
        ]
    elif periodo_tipo == "annuale":
        volumi_temporali = [
            {"giorno": "Q1 (Gen-Mar)", "volumi_kg": round(total_kg_mozzarella * 0.22, 1), "ordini": int(total_ordini_periodo * 0.2)},
            {"giorno": "Q2 (Apr-Giu)", "volumi_kg": round(total_kg_mozzarella * 0.28, 1), "ordini": int(total_ordini_periodo * 0.3)},
            {"giorno": "Q3 (Lug-Set)", "volumi_kg": round(total_kg_mozzarella * 0.32, 1), "ordini": int(total_ordini_periodo * 0.35)},
            {"giorno": "Q4 (Ott-Dic)", "volumi_kg": round(total_kg_mozzarella * 0.18, 1), "ordini": int(total_ordini_periodo * 0.15)},
        ]

    return {
        "kpi": {
            "ordini_totali_periodo": total_ordini_periodo,
            "kg_mozzarella_periodo": round(total_kg_mozzarella, 1),
            "media_kg_ordine": media_kg_ordine,
            "top_cliente_periodo": top_cliente
        },
        "periodo_tipo": periodo_tipo,
        "periodo_valore": periodo_valore,
        "trend_articoli": trend_articoli,
        "volumi_giornalieri": volumi_temporali
    }

async def get_filoni_per_cliente(data_target: Optional[str] = None):
    ordini = await get_tutti_ordini(data_target)
    clienti_filoni = []

    for o in ordini:
        if o.get("is_cancelled") or o.get("stato_ordine") == "ANNULLATO":
            continue

        mittente = o.get("mittente", "")
        is_mulnar = is_cliente_mulnar(mittente)

        filoni_cliente = []
        for p in o.get("prodotti", []):
            nome = (p.get("nome_articolo") or p.get("codice_articolo") or "").lower()
            cod = (p.get("codice_articolo") or "").lower()
            if "filon" in nome or "filon" in cod or "panetto" in nome or "pizza" in nome or "julienne" in nome or "tagju" in cod or is_mulnar:
                filoni_cliente.append(p)
        
        if filoni_cliente:
            tot_kg = sum(float(p.get("quantita", 0)) for p in filoni_cliente if (p.get("unita_di_misura") or "").lower() == "kg")
            tot_pz = sum(float(p.get("quantita", 0)) for p in filoni_cliente if (p.get("unita_di_misura") or "").lower() in ["pezzi", "pz", "coppia", "coppie"])
            
            clienti_filoni.append({
                "id_ordine": o.get("id"),
                "mittente": o.get("mittente"),
                "data_consegna": o.get("data_consegna"),
                "note_ordine": o.get("note_ordine"),
                "prodotti_filoni": filoni_cliente,
                "prodotti": o.get("prodotti", []),
                "totale_kg": round(tot_kg, 1),
                "totale_pz": round(tot_pz, 0)
            })

    return clienti_filoni

async def get_lista_clienti_registrati():
    clienti_map = {}

    # 1. Carica da particolarita_clienti.json
    part_path = PARTICOLARITA_FILE
    if os.path.exists(part_path):
        try:
            with open(part_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                lista_clienti = data if isinstance(data, list) else []
                for c in lista_clienti:
                    nome = (c.get("n") or c.get("nome_cliente") or "").strip()
                    tel = (c.get("t") or c.get("telefono") or "").strip()
                    note = (c.get("p") or c.get("particolarita") or "").strip()
                    if nome or tel:
                        k = (nome or tel).lower()
                        clienti_map[k] = {"n": nome or tel, "t": tel, "p": note}
        except Exception:
            pass

    # 2. Carica contatti dalla rubrica WhatsApp Evolution in memoria
    try:
        from backend.whatsapp import WHATSAPP_CONTACTS
        for phone, name in WHATSAPP_CONTACTS.items():
            nome = str(name or "").strip()
            tel = str(phone or "").strip()
            if not tel.startswith("+") and not tel.startswith("39") and len(tel) == 10:
                tel = "+39" + tel
            elif not tel.startswith("+"):
                tel = "+" + tel
            k = (nome or tel).lower()
            if k not in clienti_map:
                clienti_map[k] = {"n": nome or tel, "t": tel, "p": ""}
            elif not clienti_map[k].get("t") and tel:
                clienti_map[k]["t"] = tel
    except Exception:
        pass

    # 3. Carica mittenti storici dagli ordini nel database
    try:
        async with get_db_connection() as db:
            cursor = await db.execute("SELECT DISTINCT mittente FROM ordini WHERE mittente IS NOT NULL AND mittente != ''")
            rows = await cursor.fetchall()
            for r in rows:
                raw_m = str(r[0]).strip()
                if not raw_m:
                    continue
                match = re.match(r"^(.*?)\s*\(\+?(\d+)\)$", raw_m)
                if match:
                    nome_m = match.group(1).strip()
                    tel_m = "+" + match.group(2).strip()
                else:
                    nome_m = raw_m
                    tel_m = ""
                k = (nome_m or raw_m).lower()
                if k not in clienti_map:
                    clienti_map[k] = {"n": nome_m or raw_m, "t": tel_m, "p": ""}
                elif tel_m and not clienti_map[k].get("t"):
                    clienti_map[k]["t"] = tel_m
    except Exception:
        pass

    return sorted(list(clienti_map.values()), key=lambda x: x.get("n", "").lower())

async def sblocca_ordine_confezionamento(id_ordine: int):
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT dati_estratti_ia FROM ordini WHERE id = ?", (id_ordine,))
        row = await cursor.fetchone()
        if not row:
            return False
            
        dati_raw = row[0]
        dati_parsed = parse_dati_estratti_ia(dati_raw)

        dati_parsed["stato_confezionamento"] = "IN_LAVORAZIONE"
        dati_parsed["sbloccato_da_operatore"] = True
        dati_parsed["data_sblocco"] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        await db.execute(
            "UPDATE ordini SET dati_estratti_ia = ? WHERE id = ?",
            (json.dumps(dati_parsed, ensure_ascii=False), id_ordine)
        )
        await db.commit()
        return True

async def get_broadcast_liste():
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT id, nome_lista, contatti_json FROM broadcast_liste ORDER BY nome_lista ASC")
        rows = await cursor.fetchall()
        res = []
        for r in rows:
            try:
                contatti = json.loads(r[2]) if r[2] else []
            except Exception:
                contatti = []
            res.append({"id": r[0], "nome_lista": r[1], "contatti": contatti})
        return res

async def salva_broadcast_lista(nome_lista: str, contatti: list):
    async with get_db_connection() as db:
        contatti_json = json.dumps(contatti, ensure_ascii=False)
        await db.execute(
            "INSERT INTO broadcast_liste (nome_lista, contatti_json) VALUES (?, ?) ON CONFLICT(nome_lista) DO UPDATE SET contatti_json=excluded.contatti_json",
            (nome_lista.strip(), contatti_json)
        )
        await db.commit()
        return True

async def elimina_broadcast_lista(id_lista: int):
    async with get_db_connection() as db:
        await db.execute("DELETE FROM broadcast_liste WHERE id = ?", (id_lista,))
        await db.commit()
        return True

async def get_broadcast_schedulati():
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT id, id_lista, nome_lista, messaggio, orario_programmato, stato, data_invio, ricorrenza FROM broadcast_schedulati ORDER BY orario_programmato ASC")
        rows = await cursor.fetchall()
        return [{
            "id": r[0], "id_lista": r[1], "nome_lista": r[2], "messaggio": r[3],
            "orario_programmato": r[4], "stato": r[5], "data_invio": r[6],
            "ricorrenza": r[7] if len(r) > 7 and r[7] else "UNA_TANTUM"
        } for r in rows]

async def crea_broadcast_schedulato(id_lista: int, nome_lista: str, messaggio: str, orario_programmato: str, ricorrenza: str = "UNA_TANTUM"):
    async with get_db_connection() as db:
        await db.execute(
            "INSERT INTO broadcast_schedulati (id_lista, nome_lista, messaggio, orario_programmato, stato, ricorrenza) VALUES (?, ?, ?, ?, 'PROGRAMMATO', ?)",
            (id_lista, nome_lista, messaggio, orario_programmato, ricorrenza)
        )
        await db.commit()
        return True

async def elimina_broadcast_schedulato(id_sched: int):
    async with get_db_connection() as db:
        await db.execute("DELETE FROM broadcast_schedulati WHERE id = ?", (id_sched,))
        await db.commit()
        return True

async def registra_broadcast_log(id_schedulazione: int, destinatario: str, messaggio: str, stato_esito: str):
    async with get_db_connection() as db:
        await db.execute(
            "INSERT INTO broadcast_logs (id_schedulazione, destinatario, messaggio, stato_esito) VALUES (?, ?, ?, ?)",
            (id_schedulazione, destinatario, messaggio, stato_esito)
        )
        await db.commit()
        return True

async def get_broadcast_logs():
    async with get_db_connection() as db:
        cursor = await db.execute("SELECT id, id_schedulazione, destinatario, messaggio, stato_esito, timestamp_invio FROM broadcast_logs ORDER BY timestamp_invio DESC LIMIT 100")
        rows = await cursor.fetchall()
        return [{
            "id": r[0], "id_schedulazione": r[1], "destinatario": r[2],
            "messaggio": r[3], "stato_esito": r[4], "timestamp_invio": r[5]
        } for r in rows]

async def elimina_broadcast_log(id_log: int):
    async with get_db_connection() as db:
        await db.execute("DELETE FROM broadcast_logs WHERE id = ?", (id_log,))
        await db.commit()
        return True

async def salva_campione_ia_cliente(cliente_id: str, testo_originale: str, dati_confermati: dict):
    if not cliente_id or not testo_originale:
        return False
    async with get_db_connection() as db:
        json_data = json.dumps(dati_confermati, ensure_ascii=False)
        await db.execute(
            "INSERT INTO campioni_ia_clienti (cliente_id, testo_originale, dati_confermati_json) VALUES (?, ?, ?)",
            (cliente_id.strip(), testo_originale.strip(), json_data)
        )
        await db.commit()
        return True

async def get_campioni_ia_cliente(cliente_id: str, limit: int = 5):
    if not cliente_id:
        return []
    async with get_db_connection() as db:
        cursor = await db.execute(
            "SELECT testo_originale, dati_confermati_json FROM campioni_ia_clienti WHERE cliente_id = ? ORDER BY timestamp_conferma DESC LIMIT ?",
            (cliente_id.strip(), limit)
        )
        rows = await cursor.fetchall()
        campioni = []
        for r in rows:
            try:
                campioni.append({
                    "testo_originale": r[0],
                    "dati_confermati": json.loads(r[1]) if r[1] else {}
                })
            except Exception:
                pass
        return campioni