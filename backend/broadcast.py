import asyncio
import logging
from datetime import datetime
from backend.db import (
    get_broadcast_schedulati,
    get_broadcast_liste,
    registra_broadcast_log
)

async def invia_messaggio_whatsapp_singolo(page, destinatario: str, messaggio: str) -> bool:
    """Invia un messaggio WhatsApp ad un singolo contatto tramite Playwright Web."""
    if not page or page.is_closed():
        logging.warning(f"⚠️ Broadcast: pagina non disponibile, invio a '{destinatario}' saltato.")
        return False
    try:
        # Cerca il contatto e clicca per aprire la chat
        chat_opened = await page.evaluate(f'''(name) => {{
            const rows = document.querySelectorAll('div[role="row"]');
            for (const r of rows) {{
                const text = r.innerText || '';
                if (text.includes(name)) {{
                    r.click();
                    return true;
                }}
            }}
            return false;
        }}''', destinatario)

        if not chat_opened:
            logging.warning(f"⚠️ Broadcast: Contatto '{destinatario}' non trovato in chat visibili.")
            return False

        await asyncio.sleep(1.5)

        # Scrive il messaggio nella casella di testo e simula l'invio
        sent = await page.evaluate(f'''(text) => {{
            return new Promise((resolve) => {{
                const footer = document.querySelector('footer');
                if (!footer) return resolve(false);
                const input = footer.querySelector('div[contenteditable="true"]');
                if (!input) return resolve(false);
                input.focus();
                document.execCommand('insertText', false, text);

                setTimeout(() => {{
                    const sendBtn = footer.querySelector('span[data-icon="send"]') || footer.querySelector('button[aria-label*="Invia"]') || footer.querySelector('button');
                    if (sendBtn) {{
                        sendBtn.click();
                        setTimeout(() => {{
                            const stillThere = input.innerText && input.innerText.trim().length > 0;
                            resolve(!stillThere);
                        }}, 500);
                    }} else {{
                        resolve(false);
                    }}
                }}, 300);
            }});
        }}''', messaggio)

        await asyncio.sleep(2)
        return sent
    except Exception as e:
        logging.error(f"❌ Errore invio broadcast a {destinatario}: {e}")
        return False

async def avvia_demone_broadcast(page_getter_func):
    """Demone schedulatore in background che verifica ogni 30s i broadcast programmati ed invia i messaggi."""
    logging.info("🚀 Demone Schedulatore Broadcast WhatsApp avviato (Controllo ogni 30s)...")
    
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
                        elif ric == "OGNI_LUNEDI" and weekday_eng == "MONDAY":
                            should_run = True
                        elif ric == "OGNI_MARTEDI" and weekday_eng == "TUESDAY":
                            should_run = True
                        elif ric == "OGNI_MERCOLEDI" and weekday_eng == "WEDNESDAY":
                            should_run = True
                        elif ric == "OGNI_GIOVEDI" and weekday_eng == "THURSDAY":
                            should_run = True
                        elif ric == "OGNI_VENERDI" and weekday_eng == "FRIDAY":
                            should_run = True
                        elif ric == "OGNI_SABATO" and weekday_eng == "SATURDAY":
                            should_run = True
                        elif ric == "OGNI_DOMENICA" and weekday_eng == "SUNDAY":
                            should_run = True
                
                if should_run:
                    logging.info(f"📢 Esecuzione Broadcast ID #{item['id']} ({ric}) per lista '{item['nome_lista']}'...")
                    
                    page = page_getter_func()
                    liste = await get_broadcast_liste()
                    target_lista = next((l for l in liste if l["id"] == item.get("id_lista")), None)
                    
                    contatti = target_lista.get("contatti", []) if target_lista else []
                    messaggio = item.get("messaggio", "")

                    for c in contatti:
                        page = page_getter_func()
                        if not page or page.is_closed():
                            logging.warning(f"⚠️ Broadcast ID #{item['id']}: WhatsApp disconnesso, interrompo invii rimanenti.")
                            break
                        nome_dest = c.get("nome") or c.get("telefono") or str(c)
                        esito = await invia_messaggio_whatsapp_singolo(page, nome_dest, messaggio)
                        stato_log = "INVIATO" if esito else "FALLITO"
                        await registra_broadcast_log(item["id"], nome_dest, messaggio, stato_log)
                        await asyncio.sleep(3) # Pausa anti-spam tra invii

                    import aiosqlite
                    from backend.db import DB_FILE
                    async with aiosqlite.connect(DB_FILE) as db:
                        if ric == "UNA_TANTUM":
                            await db.execute(
                                "UPDATE broadcast_schedulati SET stato = 'INVIATO', data_invio = ? WHERE id = ?",
                                (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), item["id"])
                            )
                        else:
                            await db.execute(
                                "UPDATE broadcast_schedulati SET data_invio = ? WHERE id = ?",
                                (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), item["id"])
                            )
                        await db.commit()
                        
                    logging.info(f"✅ Broadcast ID #{item['id']} ({ric}) completato.")

        except Exception as e:
            logging.error(f"⚠️ Errore nel demone broadcast: {e}")

        await asyncio.sleep(30)
