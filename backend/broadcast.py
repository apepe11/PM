import os
import asyncio
import logging
import aiosqlite
from datetime import datetime
from typing import Optional

from backend.db import (
    get_broadcast_schedulati,
    get_broadcast_liste,
    registra_broadcast_log,
    DB_FILE
)

BROADCAST_POLL_INTERVAL_SECONDS = int(os.environ.get("BROADCAST_POLL_INTERVAL_SECONDS", "15"))

async def invia_a_contatto(destinatario: str, messaggio: str, id_sched: int = 0) -> bool:
    """Invia un messaggio WhatsApp tramite Evolution API e ne registra il log."""
    from backend.whatsapp import invia_messaggio_whatsapp
    
    esito = await invia_messaggio_whatsapp(destinatario, messaggio)
    stato_log = "INVIATO" if esito else "FALLITO"
    
    try:
        await registra_broadcast_log(id_sched, destinatario, messaggio, stato_log)
    except Exception as e:
        logging.error(f"Errore registrazione broadcast log: {e}")
        
    return esito

async def esegui_broadcast_istantaneo(id_lista: Optional[int] = None, messaggio: str = "", numero_test: Optional[str] = None) -> dict:
    """Esegue un invio broadcast immediato a tutta la lista o a un singolo contatto di test."""
    if not messaggio:
        return {"success": False, "inviati": 0, "falliti": 0, "totali": 0, "error": "Messaggio vuoto."}

    # Se è un invio di prova su numero singolo
    if numero_test and numero_test.strip():
        dest = numero_test.strip()
        ok = await invia_a_contatto(dest, messaggio, id_sched=0)
        return {
            "success": ok,
            "inviati": 1 if ok else 0,
            "falliti": 0 if ok else 1,
            "totali": 1,
            "test_mode": True
        }

    # Invio alla lista contatti
    liste = await get_broadcast_liste()
    target_lista = next((l for l in liste if l["id"] == id_lista), None)
    if not target_lista:
        return {"success": False, "inviati": 0, "falliti": 0, "totali": 0, "error": "Lista non trovata."}

    contatti = target_lista.get("contatti", [])
    inviati = 0
    falliti = 0

    for c in contatti:
        nome_dest = c.get("nome") or c.get("telefono") or str(c)
        ok = await invia_a_contatto(nome_dest, messaggio, id_sched=0)
        if ok:
            inviati += 1
        else:
            falliti += 1
        await asyncio.sleep(2) # Piccola pausa di rispetto rate limit

    return {
        "success": True,
        "inviati": inviati,
        "falliti": falliti,
        "totali": len(contatti)
    }

async def esegui_task_schedulato_ora(id_sched: int) -> bool:
    """Forza l'esecuzione immediata di un task schedulato."""
    schedulati = await get_broadcast_schedulati()
    item = next((s for s in schedulati if s["id"] == id_sched), None)
    if not item:
        return False

    liste = await get_broadcast_liste()
    target_lista = next((l for l in liste if l["id"] == item.get("id_lista")), None)
    if not target_lista:
        return False

    contatti = target_lista.get("contatti", [])
    messaggio = item.get("messaggio", "")
    ric = item.get("ricorrenza", "UNA_TANTUM")

    for c in contatti:
        nome_dest = c.get("nome") or c.get("telefono") or str(c)
        await invia_a_contatto(nome_dest, messaggio, id_sched=item["id"])
        await asyncio.sleep(2.5)

    async with aiosqlite.connect(DB_FILE) as db:
        timestamp_completamento = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        if ric == "UNA_TANTUM":
            await db.execute(
                "UPDATE broadcast_schedulati SET stato = 'INVIATO', data_invio = ? WHERE id = ?",
                (timestamp_completamento, item["id"])
            )
        else:
            await db.execute(
                "UPDATE broadcast_schedulati SET data_invio = ? WHERE id = ?",
                (timestamp_completamento, item["id"])
            )
        await db.commit()

    return True

async def avvia_demone_broadcast():
    """Demone schedulatore in background ad alta affidabilità per WhatsApp Evolution API."""
    logging.info(f"🚀 Demone Schedulatore Broadcast WhatsApp avviato (Polling ogni {BROADCAST_POLL_INTERVAL_SECONDS}s)...")
    
    while True:
        try:
            now = datetime.now()
            now_time_str = now.strftime('%H:%M')
            now_datetime_str = now.strftime('%Y-%m-%d %H:%M')
            weekday_eng = now.strftime('%A').upper()
            
            schedulati = await get_broadcast_schedulati()
            
            for item in schedulati:
                ric = item.get("ricorrenza", "UNA_TANTUM")
                orario = item.get("orario_programmato", "")
                stato = item.get("stato", "PROGRAMMATO")
                data_invio = item.get("data_invio") or ""
                
                should_run = False
                
                if ric == "UNA_TANTUM":
                    if stato == "PROGRAMMATO" and orario <= now_datetime_str:
                        should_run = True
                else:
                    time_part = orario.split()[-1] if ' ' in orario else orario
                    if time_part[:5] == now_time_str and not data_invio.startswith(now.strftime('%Y-%m-%d')):
                        if ric == "TUTTI_I_GIORNI":
                            should_run = True
                        elif ric == "GIORNI_FERIALI" and now.weekday() < 5:
                            should_run = True
                        elif ric == f"OGNI_{weekday_eng}":
                            should_run = True
                
                if should_run:
                    logging.info(f"📢 Esecuzione automatica Broadcast ID #{item['id']} ({ric}) per '{item['nome_lista']}'...")
                    await esegui_task_schedulato_ora(item["id"])

        except Exception as e:
            logging.error(f"⚠️ Eccezione nel demone broadcast: {e}")

        await asyncio.sleep(BROADCAST_POLL_INTERVAL_SECONDS)