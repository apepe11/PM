import os
import asyncio
import base64
import shutil
import json
import re
from datetime import datetime, timedelta
from typing import Optional
from playwright.async_api import Playwright, BrowserContext, Page, async_playwright
from backend.db import get_storico_oggi, salva_o_aggiorna_ordine, svuota_database_ordini, ordine_esiste_in_db
from backend.ai_parser import AIParser

SESSION_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "whatsapp_session"))
ai_parser = AIParser(base_dir="catalogo")
messaggi_processati = set()
BROADCAST_DEMONE_ATTIVO = False

def calcola_timestamp_ricezione_reale(time_str: Optional[str] = None, data_ricezione_str: Optional[str] = None) -> str:
    now = datetime.now()
    target_date = now.date()

    if data_ricezione_str:
        clean_date = data_ricezione_str.strip().lower()
        if clean_date == 'ieri':
            target_date = now.date() - timedelta(days=1)
        elif '/' in clean_date:
            parts = clean_date.split('/')
            try:
                if len(parts) == 2:
                    m, d = int(parts[1]), int(parts[0])
                    target_date = datetime(now.year, m, d).date()
                elif len(parts) == 3:
                    y, m, d = int(parts[2]), int(parts[1]), int(parts[0])
                    target_date = datetime(y, m, d).date()
            except Exception:
                pass

    time_part = now.strftime('%H:%M:%S')
    if time_str:
        matches = re.search(r'\b(\d{1,2}):(\d{2})\b', time_str)
        if matches:
            hh, mm = int(matches.group(1)), int(matches.group(2))
            if not data_ricezione_str and hh > now.hour + 2:
                target_date = now.date() - timedelta(days=1)
            
            # SE il messaggio è arrivato adesso, prendiamo l'orario reale del PC (inclusi i secondi)
            if target_date == now.date() and hh == now.hour and mm == now.minute:
                time_part = f"{hh:02d}:{mm:02d}:{now.second:02d}"
            else:
                time_part = f"{hh:02d}:{mm:02d}:00"

    return f"{target_date.strftime('%Y-%m-%d')} {time_part}"


WHATSAPP_STATE = {
    "stato_connessione": "DISCONNESSO", 
    "qr_code_base64": None,
    "account_banco": None,
    "data_connessione": None,
    "ultimo_messaggio": None,
    "eventi_log": []
}

CURRENT_PAGE: Optional[Page] = None
PLAYWRIGHT_INSTANCE: Optional[Playwright] = None
BROWSER_CONTEXT: Optional[BrowserContext] = None

def get_current_whatsapp_page():
    return CURRENT_PAGE

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

def get_whatsapp_status():
    return WHATSAPP_STATE

async def estrai_audio_da_chat(page, mittente, row_index=None) -> Optional[dict[str, str]]:
    try:
        if page.is_closed():
            return None

        opened = False
        clean_mittente = mittente.split('(')[0].strip() if mittente else ""
        
        # 🎯 TENTATIVO 1: LA BARRA DI RICERCA (Infallibile contro il DOM dinamico)
        if clean_mittente:
            search_box = page.locator('div[contenteditable="true"][data-tab="3"], div[title*="ricerca"]')
            if await search_box.count() > 0:
                await search_box.first.fill(clean_mittente)
                await asyncio.sleep(1.5) # Attendi i risultati
                
                chat_result = page.locator('div#pane-side div[role="row"]').first
                if await chat_result.count() > 0:
                    await chat_result.click(force=True)
                    opened = True
                    await asyncio.sleep(1.0)
                
                # Pulisci la barra di ricerca per ripristinare la lista
                clear_btn = page.locator('button[aria-label*="Annulla"]')
                if await clear_btn.count() > 0:
                    await clear_btn.first.click(force=True)
                else:
                    await search_box.first.fill("")
                await asyncio.sleep(0.5)

        # 🔄 TENTATIVO 2: Scroll vecchia maniera (Fall-back se la ricerca fallisce)
        if not opened and row_index is not None:
            try:
                rows = page.locator('div#pane-side div[role="row"]')
                if await rows.count() > row_index:
                    await rows.nth(row_index).scroll_into_view_if_needed()
                    await rows.nth(row_index).click(force=True)
                    opened = True
            except Exception:
                pass

        if opened:
            await page.wait_for_selector("div#main", timeout=8000)
            await asyncio.sleep(1.0)

            for attempt in range(10):
                if page.is_closed():
                    return None
                await asyncio.sleep(1.0)
                
                audio_info = await page.evaluate(r'''async () => {
                    const main = document.querySelector('div#main');
                    if (!main) return null;
                    const messages = main.querySelectorAll('div[data-id], div.message-in, div._1wlJG');

                    for (let i = messages.length - 1; i >= 0; i--) {
                        const msg = messages[i];
                        if (msg.classList && msg.classList.contains && msg.classList.contains('message-out')) continue;

                        const debug = { hasAudioTag: false, audioSrc: null, currentSrc: null, buttonsFound: 0, fetchError: null };
                        let audioEl = msg.querySelector('audio');

                        const candidates = Array.from(msg.querySelectorAll('button, span, a, div[role="button"], div[data-icon]')).filter(e => {
                            const aria = (e.getAttribute('aria-label') || '').toLowerCase();
                            const dataIcon = (e.getAttribute('data-icon') || '').toLowerCase();
                            return aria.includes('vocale') || aria.includes('play') || aria.includes('riproduci') || aria.includes('scarica') || aria.includes('download') || dataIcon.includes('ptt') || dataIcon.includes('play') || dataIcon.includes('audio');
                        });
                        debug.buttonsFound = candidates.length;

                        if ((!audioEl || !audioEl.src || audioEl.src.startsWith('about:')) && candidates.length > 0) {
                            try { candidates[0].click(); await new Promise(r => setTimeout(r, 900)); } catch(e) {}
                            audioEl = msg.querySelector('audio');
                        }

                        if (!audioEl || (!audioEl.src && !audioEl.currentSrc)) {
                            try { msg.click(); await new Promise(r => setTimeout(r, 800)); } catch(e) {}
                            audioEl = msg.querySelector('audio');
                        }

                        if (audioEl && (audioEl.currentSrc || audioEl.src)) {
                            try {
                                const src = audioEl.currentSrc || audioEl.src || (audioEl.querySelector ? audioEl.querySelector('source')?.src : null);
                                if (!src) { debug.fetchError = 'no-src'; return { debug }; }
                                const res = await fetch(src);
                                const blob = await res.blob();
                                return new Promise((resolve) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve({
                                        base64: reader.result.split(',')[1],
                                        mimeType: blob.type || 'audio/ogg',
                                        debug
                                    });
                                    reader.readAsDataURL(blob);
                                });
                            } catch (e) {
                                debug.fetchError = String(e);
                                return { debug };
                            }
                        }
                        return { debug };
                    }
                    return null;
                }''')
                
                if audio_info and audio_info.get('base64'):
                    return audio_info
                    
            return None
    except Exception as e:
        print(f"⚠️ Impossibile scaricare l'audio per {mittente}: {e}")
    return None

    
async def elabora_nuovo_messaggio(args, page=None):
    mittente = args.get('mittente', 'Sconosciuto')
    testo = args.get('testo', '')
    is_vocal = args.get('is_vocal', False)
    row_index = args.get('row_index')
    time_str = args.get('time_str')
    data_ricezione = args.get('data_ricezione')
    
    if mittente.strip().lower() in ["tu", "you", "banco", "me", "io"]:
        return

    # 1. CALCOLA IL TIMESTAMP ESATTO SUBITO (AL MILLISECONDO)
    data_ricezione_custom = calcola_timestamp_ricezione_reale(time_str, data_ricezione)
    try:
        dt_msg = datetime.strptime(data_ricezione_custom, '%Y-%m-%d %H:%M:%S')
    except:
        dt_msg = datetime.now()

    data_id = args.get('data_id', '')
    metadata = {
        "mittente": mittente,
        "is_vocal": is_vocal,
        "row_index": row_index,
        "time_str": time_str,
        "data_id": data_id,
        "data_ricezione": data_ricezione
    }
    if data_id:
        add_whatsapp_log(f"🔑 [DEDUPLICA] Rilevato DOM data-id per {mittente}: '{data_id}'", "INFO")
    else:
        add_whatsapp_log(f"🔑 [DEDUPLICA] DOM data-id non presente per {mittente}, impiegata chiave fallback.", "INFO")

    msg_summary = f"Da {mittente}: {testo[:40]}..." if len(testo) > 40 else f"Da {mittente}: {testo}"
    if is_vocal:
        add_whatsapp_log(f"🎙️ [VOCALE AUTOMATICO] Ricevuto audio da {mittente} -> Avvio immediato trascrizione IA...", "AUDIO", metadata=metadata)
    else:
        add_whatsapp_log(f"📩 Messaggio in arrivo: {msg_summary}", "INCOMING", metadata=metadata)
        
    WHATSAPP_STATE["ultimo_messaggio"] = f"{mittente} - {'🎙️ Vocale' if is_vocal else testo}"

    audio_data = None
    mime_type = "audio/ogg"
    
    if is_vocal and page:
        audio_info: Optional[dict[str, str]] = await estrai_audio_da_chat(page, mittente, row_index=row_index)
        if audio_info and audio_info.get('base64'):
            audio_data = audio_info['base64']
            mime_type = audio_info.get('mimeType', 'audio/ogg')
            add_whatsapp_log(
                f"⚡ Audio estratto per {mittente}. Trascrizione ed estrazione ordini Gemini in corso...",
                "AUDIO",
                metadata={**metadata, "audio_extracted": True}
            )
        else:
            debug_info = None
            try:
                if isinstance(audio_info, dict) and audio_info.get('debug'):
                    debug_info = audio_info.get('debug')
            except Exception:
                pass
            add_whatsapp_log(
                f"⚠️ Estrazione file audio per {mittente} fallita o non disponibile. Tenta analisi del testo.",
                "WARN",
                metadata={**metadata, "audio_extracted": False, "audio_debug": debug_info}
            )

    storico_di_oggi = await get_storico_oggi(mittente)
    
    # 2. PASSIAMO L'ORARIO REALE DEL MESSAGGIO A GEMINI!
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
    
    # Estraiamo i dati
    prodotti = risultato_ia.get("prodotti", [])
    is_cancelled = risultato_ia.get("is_cancelled", False)

    # 🛑 REGOLA DI FERRO: Se l'array prodotti è vuoto (0 voci) e non è un annullamento, NON E' UN ORDINE!
    if len(prodotti) == 0 and not is_cancelled:
        risultato_ia["is_order"] = False
        
    is_order = risultato_ia.get("is_order", False)
    
    trascrizione = risultato_ia.get("testo_trascritto")
    if trascrizione:
        testo_db = f"🎙️ [VOCALE TRASCRITTO]: \"{trascrizione}\""
        add_whatsapp_log(f"🎙️ [TRASCRIZIONE COMPLETATA] {mittente}: \"{trascrizione}\"", "SUCCESS")
    elif is_vocal:
        testo_db = f"🎙️ [MESSAGGIO VOCALE] {testo}"
    else:
        testo_db = testo

    if is_cancelled or (storico_di_oggi and not is_order and len(prodotti) == 0 and ("annull" in testo.lower() or "cancell" in testo.lower() or "disdic" in testo.lower() or "non serve" in testo.lower())):
        add_whatsapp_log(f"🚫 Ordine per {mittente} ANNULLATO via WhatsApp su richiesta del cliente.", "WARN")
        risultato_ia["is_order"] = False
        risultato_ia["is_cancelled"] = True
        risultato_ia["prodotti"] = []
        risultato_ia["stato_ordine"] = "ANNULLATO"
        risultato_ia["note_ordine"] = "Ordine annullato dal cliente via WhatsApp."
        await salva_o_aggiorna_ordine(mittente, testo_db, json.dumps(risultato_ia, ensure_ascii=False), data_ricezione_custom=data_ricezione_custom)
    elif is_order:
        n_prod = len(prodotti)
        add_whatsapp_log(f"✅ Ordine acquisito/aggiornato per {mittente} ({n_prod} prodotti)", "SUCCESS")
        await salva_o_aggiorna_ordine(mittente, testo_db, json.dumps(risultato_ia, ensure_ascii=False), data_ricezione_custom=data_ricezione_custom)
    else:
        add_whatsapp_log(f"ℹ️ Messaggio informativo/cortesia da {mittente}", "INFO")
async def estrai_chat_visibili(page):
    """Funzione di appoggio per estrarre le chat a schermo (filtrando i messaggi vecchi)."""
    return await page.evaluate(r'''() => {
        const risultati = [];
        const rows = document.querySelectorAll('div#pane-side div[role="row"]');
        
        rows.forEach((row, index) => {
            const innerHTML = row.innerHTML;
            const innerText = row.innerText || '';
            
            const timeEl = row.querySelector('div._ak8i, span[dir="auto"]:last-of-type');
            let timeStr = '';
            if (timeEl) {
                const t = (timeEl.innerText || '').toLowerCase().trim();
                if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t) || /^(lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica)$/.test(t)) {
                    return; 
                }
                const matches = t.match(/\b\d{1,2}:\d{2}\b/);
                if (matches) timeStr = matches[0];
            }

            let mittente = '';
            const titleEl = row.querySelector('span[title]');
            if (titleEl) {
                mittente = titleEl.getAttribute('title') || titleEl.innerText || '';
            }

            const normalizedText = innerText.replace(/\s+/g, ' ');
            const phoneMatch = normalizedText.match(/(\+?\d[\d\s\.\-\(\)]{6,}\d)/);
            const usernameMatch = normalizedText.match(/@[A-Za-z0-9_.]+/);
            const normalizedPhone = phoneMatch ? phoneMatch[0].replace(/[^+\d]/g, '') : '';
            const normalizedUser = usernameMatch ? usernameMatch[0] : '';

            if (!mittente) {
                const lines = innerText.split('\n').map(l => l.trim()).filter(l => l && !/^\d{1,2}:\d{2}$/.test(l) && !/^\d{2}\/\d{4}$/.test(l) && l.toLowerCase() !== 'ieri');
                mittente = lines.length > 0 ? lines[0] : 'Cliente WhatsApp';
            }

            if (!mittente.trim() || /^\+?[\d\s\.\-\(\)]+$/.test(mittente.trim())) {
                if (normalizedUser && normalizedPhone) {
                    mittente = `${normalizedUser} (${normalizedPhone})`;
                } else if (normalizedPhone) {
                    mittente = `Cliente WhatsApp ${normalizedPhone}`;
                } else if (normalizedUser) {
                    mittente = normalizedUser.replace(/^@/, '');
                }
            }

            const haSpuntaIcona = /data-icon=["'](?:msg-|status-|.*check|.*dblcheck|msg-time|status-time|tail-out|out-)/i.test(innerHTML);
            const haSpuntaTesto = /[✓✔]/.test(innerText);
            const haTuPrefix = /^\s*(?:Tu|You)\s*:/im.test(innerText) || 
                               /\n\s*(?:Tu|You)\s*:/i.test(innerText) || 
                               /aria-label=["'][^"']*(?:Tu:|You:)/i.test(innerHTML);
            const haBozza = /^\s*Bozza\s*:/im.test(innerText) || /\n\s*Bozza\s*:/i.test(innerText);
            const haTailOut = /tail-out|message-out/i.test(innerHTML);

            if (haSpuntaIcona || haSpuntaTesto || haTuPrefix || haBozza || haTailOut) {
                return;
            }

            let testo = '';
            const textSpans = row.querySelectorAll('span[dir="ltr"], span[dir="auto"]');
            for (let span of textSpans) {
                const val = span.innerText ? span.innerText.trim() : '';
                if (val && val !== mittente && !/^\d{1,2}:\d{2}$/.test(val) && !/^\d{2}\/\d{2}\/\d{4}$/.test(val) && val.toLowerCase() !== 'ieri') {
                    testo = val;
                    break;
                }
            }

            if (testo) {
                testo = testo.replace(/^Inoltrato\s*/i, '').replace(/Inoltrato/i, '').trim();
            }

            if (/sta\s+scrivendo|sta\s+registrando|sta\s+digitando|online/i.test(testo) || /sta\s+scrivendo|sta\s+registrando|sta\s+digitando|online/i.test(innerText)) {
                return;
            }

            if (!testo) {
                const lines = innerText.split('\n').map(l => l.trim()).filter(l => l && l !== mittente && !/^\d{1,2}:\d{2}$/.test(l) && !/^\d{2}\/\d{4}$/.test(l) && l.toLowerCase() !== 'ieri');
                testo = lines.length > 0 ? lines[0] : 'Vocale o Media';
            }

            const isVocal = /vocale|media|audio|0:\d{2}|🎙|messaggio vocale/i.test(testo) || 
                            /data-icon=["'](?:ptt|mic|audio|status-vcard)/i.test(innerHTML) ||
                            testo === 'Vocale o Media' ||
                            !!row.querySelector('[data-icon*="ptt"], [data-icon*="mic"], [data-icon*="audio"]');

            const unreadEl = row.querySelector('span[aria-label*="non lett"], span[aria-label*="unread"], [data-icon="unread-count"], span._1pj2u, span[aria-label*="messagg"]');
            const isUnread = !!unreadEl;

            const dataId = row.getAttribute('data-id') || row.querySelector('[data-id]')?.getAttribute('data-id') || '';

            risultati.push({
                mittente: mittente,
                testo: testo,
                is_vocal: isVocal,
                is_unread: isUnread,
                row_index: index,
                time_str: timeStr,
                data_id: dataId
            });
        });
        return risultati;
    }''')

async def forzare_scansione_chat():
    global CURRENT_PAGE, messaggi_processati
    if not CURRENT_PAGE or CURRENT_PAGE.is_closed():
        return {"status": "error", "message": "WhatsApp non è attualmente connesso."}
    
    try:
        dati_chat = await estrai_chat_visibili(CURRENT_PAGE)
        dati_chat.sort(key=lambda m: m.get('row_index', 0))
        n_processati = 0
        for msg in dati_chat:
            chiave_univoca = f"{msg.get('data_id') or ''}_{msg['mittente']}_{msg['testo']}_{msg.get('time_str', '')}"
            already_in_db = await ordine_esiste_in_db(msg['mittente'], msg['testo'], msg.get('time_str'))
            if (chiave_univoca not in messaggi_processati or msg.get('is_unread')) or not already_in_db:
                messaggi_processati.add(chiave_univoca)
                asyncio.create_task(elabora_nuovo_messaggio(msg, CURRENT_PAGE))
                n_processati += 1
                await asyncio.sleep(0.1) 
        return {"status": "ok", "message": f"Scansione completata. Processati {n_processati} ordini/messaggi in background."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def disconnetti_whatsapp():
    global CURRENT_PAGE, BROWSER_CONTEXT, PLAYWRIGHT_INSTANCE
    add_whatsapp_log("🔌 Chiusura e disconnessione in corso...", "WARN")
    WHATSAPP_STATE["stato_connessione"] = "DISCONNESSO"
    WHATSAPP_STATE["qr_code_base64"] = None
    WHATSAPP_STATE["account_banco"] = None
    
    CURRENT_PAGE = None

    try:
        if BROWSER_CONTEXT:
            try:
                await BROWSER_CONTEXT.close()
            except Exception as e:
                pass
            BROWSER_CONTEXT = None
        if PLAYWRIGHT_INSTANCE:
            try:
                await PLAYWRIGHT_INSTANCE.stop()
            except Exception as e:
                pass
            PLAYWRIGHT_INSTANCE = None
        add_whatsapp_log("🛑 Sessione disconnessa con successo.", "INFO")
        return True
    except Exception as e:
        add_whatsapp_log(f"⚠️ Errore disconnessione: {e}", "WARN")
        return False

async def reset_whatsapp_banco():
    global CURRENT_PAGE, BROWSER_CONTEXT, PLAYWRIGHT_INSTANCE, messaggi_processati, BROADCAST_DEMONE_ATTIVO
    BROADCAST_DEMONE_ATTIVO = False
    
    try:
        add_whatsapp_log("🗑️ Dimentico dispositivo Banco corrente e resetto credenziali...", "WARN")
        await disconnetti_whatsapp()
        await asyncio.sleep(2.0)
        
        try:
            if os.path.exists(SESSION_DIR):
                shutil.rmtree(SESSION_DIR, ignore_errors=True)
                add_whatsapp_log("🧹 Cartella sessione WhatsApp eliminata con successo.", "INFO")
        except Exception as e:
            add_whatsapp_log(f"⚠️ Avviso pulizia cartella sessione: {e}", "WARN")
            
        os.makedirs(SESSION_DIR, exist_ok=True)
        messaggi_processati.clear()
        await svuota_database_ordini()
        add_whatsapp_log("🧹 Database locale ordini svuotato automaticamente.", "INFO")
        
        WHATSAPP_STATE["stato_connessione"] = "DISCONNESSO"
        WHATSAPP_STATE["qr_code_base64"] = None
        WHATSAPP_STATE["account_banco"] = None
        WHATSAPP_STATE["data_connessione"] = None
        WHATSAPP_STATE["ultimo_messaggio"] = None
        add_whatsapp_log("✨ Banco dimenticato con successo. Avvio della nuova registrazione...", "SUCCESS")
        
        asyncio.create_task(avvia_whatsapp())
        return True
    except Exception as e:
        add_whatsapp_log(f"❌ Errore durante il reset del Banco: {e}", "ERROR")
        return False

async def avvia_whatsapp():
    global CURRENT_PAGE, BROWSER_CONTEXT, PLAYWRIGHT_INSTANCE
    
    add_whatsapp_log("🚀 Inizializzazione motore Playwright WhatsApp (Native Chrome Stealth Mode)...", "INFO")
    WHATSAPP_STATE["stato_connessione"] = "IN_ATTESA_QR"
    
    try:
        if PLAYWRIGHT_INSTANCE:
            try:
                await PLAYWRIGHT_INSTANCE.stop()
            except Exception:
                pass
            PLAYWRIGHT_INSTANCE = None

        PLAYWRIGHT_INSTANCE = await async_playwright().start()
        os.makedirs(SESSION_DIR, exist_ok=True)
        
        HEADLESS = False
        chrome_binary = None
        for candidate in ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium"]:
            if os.path.exists(candidate):
                chrome_binary = candidate
                break

        launch_kwargs = {
            "user_data_dir": SESSION_DIR,
            "headless": HEADLESS,
            "args": [
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--no-first-run",
                "--ignore-certificate-errors",
                "--autoplay-policy=no-user-gesture-required",
                "--mute-audio"
            ],
            "ignore_default_args": ["--enable-automation"],
            "viewport": {"width": 1280, "height": 800},
            "user_agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "permissions": ["notifications", "camera", "microphone"]
        }

        if chrome_binary:
            launch_kwargs["executable_path"] = chrome_binary
            add_whatsapp_log(f"🌐 Utilizzo browser Chrome nativo del sistema: {chrome_binary}", "INFO")

        BROWSER_CONTEXT = await PLAYWRIGHT_INSTANCE.chromium.launch_persistent_context(**launch_kwargs)
        
        await BROWSER_CONTEXT.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'languages', { get: () => ['it-IT', 'it', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        """)

        page = BROWSER_CONTEXT.pages[0] if BROWSER_CONTEXT.pages else await BROWSER_CONTEXT.new_page()
        CURRENT_PAGE = page

        await page.goto("https://web.whatsapp.com/")
        add_whatsapp_log("📱 Pagina web.whatsapp.com caricata in modalità protetta.", "INFO")

        connected = False
        for _ in range(30):
            if CURRENT_PAGE is None or CURRENT_PAGE != page or WHATSAPP_STATE["stato_connessione"] == "DISCONNESSO" or page.is_closed():
                return
            try:
                if await page.locator("div#pane-side").count() > 0:
                    connected = True
                    break

                qr_canvas = page.locator("canvas, div[data-ref]")
                if await qr_canvas.count() > 0:
                    WHATSAPP_STATE["stato_connessione"] = "IN_ATTESA_QR"
                    try:
                        qr_bytes = await qr_canvas.first.screenshot()
                        WHATSAPP_STATE["qr_code_base64"] = base64.b64encode(qr_bytes).decode('utf-8')
                        add_whatsapp_log("📷 QR Code rilevato a schermo. In attesa di scansione da smartphone Banco...", "WARN")
                    except Exception:
                        pass
            except Exception as e:
                if "closed" in str(e).lower() or page.is_closed():
                    return
            await asyncio.sleep(2)

        if not connected:
            if CURRENT_PAGE is None or CURRENT_PAGE != page or WHATSAPP_STATE["stato_connessione"] == "DISCONNESSO" or page.is_closed():
                return
            try:
                await page.wait_for_selector("div#pane-side", timeout=0)
            except Exception as e:
                if "closed" in str(e).lower() or page.is_closed() or CURRENT_PAGE != page:
                    return

        WHATSAPP_STATE["stato_connessione"] = "CONNESSO"
        WHATSAPP_STATE["qr_code_base64"] = None
        WHATSAPP_STATE["data_connessione"] = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        WHATSAPP_STATE["account_banco"] = "Account Banco Caseificio Petruzzi"
        
        add_whatsapp_log("🟢 WHATSAPP BANCO CONNESSO ED ATTIVO!", "SUCCESS")

        global BROADCAST_DEMONE_ATTIVO
        if not BROADCAST_DEMONE_ATTIVO:
            from backend.broadcast import avvia_demone_broadcast
            BROADCAST_DEMONE_ATTIVO = True
            asyncio.create_task(avvia_demone_broadcast(get_current_whatsapp_page))
            add_whatsapp_log("📢 Demone broadcast avviato.", "INFO")
        else:
            add_whatsapp_log("📢 Demone broadcast già attivo, non ne avvio un secondo.", "INFO")

        try:
            dati_iniziali = await estrai_chat_visibili(page)
            n_unreads = 0
            for msg in dati_iniziali:
                chiave = f"{msg.get('data_id') or ''}_{msg['mittente']}_{msg['testo']}_{msg.get('time_str', '')}"
                already_in_db = await ordine_esiste_in_db(msg['mittente'], msg['testo'], msg.get('time_str'))
                if msg.get('is_unread') or not already_in_db:
                    n_unreads += 1
                    add_whatsapp_log(
                        f"⚡ [STARTUP/RECUPERO] Rilevato ordine/messaggio da {msg['mittente']} ({msg.get('time_str', 'oggi')}): {msg['testo'][:35]}",
                        "INCOMING"
                    )
                    messaggi_processati.add(chiave)
                    asyncio.create_task(elabora_nuovo_messaggio(msg, page))
                    await asyncio.sleep(0.1) 
                else:
                    messaggi_processati.add(chiave)
            add_whatsapp_log(f"🟢 MOTORE ATTIVO 24/7! Sincronizzazione completata ({n_unreads} ordini/messaggi in arrivo avviati).", "SUCCESS")
        except Exception as e:
            add_whatsapp_log(f"⚠️ Avviso sincronizzazione iniziale: {e}", "WARN")

        while True:
            if CURRENT_PAGE is None or CURRENT_PAGE != page or WHATSAPP_STATE["stato_connessione"] == "DISCONNESSO" or page.is_closed():
                add_whatsapp_log("🛑 Loop monitoraggio terminato per questa istanza.", "INFO")
                break
            
            try:
                dati_chat_visibili = await estrai_chat_visibili(page)
                dati_chat_visibili.sort(key=lambda m: m.get('row_index', 0))
                
                da_processare = [
                    msg for msg in dati_chat_visibili 
                    if f"{msg.get('data_id') or ''}_{msg['mittente']}_{msg['testo']}_{msg.get('time_str', '')}" not in messaggi_processati
                ]

                if da_processare:
                    msg_urgente = da_processare[0]
                    chiave_univoca = f"{msg_urgente.get('data_id') or ''}_{msg_urgente['mittente']}_{msg_urgente['testo']}_{msg_urgente.get('time_str', '')}"
                    
                    messaggi_processati.add(chiave_univoca)
                    
                    asyncio.create_task(elabora_nuovo_messaggio(msg_urgente, page))
                    
                    await asyncio.sleep(0.1)

            except Exception as e:
                err_msg = str(e).lower()
                if CURRENT_PAGE is None or CURRENT_PAGE != page or WHATSAPP_STATE["stato_connessione"] == "DISCONNESSO" or page.is_closed() or "closed" in err_msg:
                    break
                add_whatsapp_log(f"⚠️ Avviso scansione loop: {e}", "WARN")

            await asyncio.sleep(0.8)

    except Exception as e:
        err_msg = str(e).lower()
        if WHATSAPP_STATE["stato_connessione"] != "DISCONNESSO":
            WHATSAPP_STATE["stato_connessione"] = "ERRORE"
            add_whatsapp_log(f"❌ Pagina chiusa o errore critico: {e}. Riavvio automatico in corso...", "ERROR")
            await asyncio.sleep(3.0)
            asyncio.create_task(avvia_whatsapp())