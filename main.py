import asyncio
import os
import json
import httpx
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Union

from backend.paths import (
    get_bundle_dir,
    get_data_dir,
    get_static_path,
    get_persistent_path
)

from backend.db import (
    init_db, 
    get_tutti_ordini, 
    crea_ordine_manuale, 
    aggiorna_ordine, 
    elimina_ordine, 
    get_produzione_aggregata, 
    get_produzione_aggregata_sole,
    get_ordini_sole,
    is_ordine_sole,
    get_statistiche,
    get_filoni_per_cliente,
    get_lista_clienti_registrati,
    aggiorna_confezionamento_ordine,
    aggiorna_prodotto_singolo_ordine,
    aggiorna_prodotti_parziali_ordine,
    sblocca_ordine_confezionamento,
    conferma_ordine,
    consegna_ordine,
    get_broadcast_liste,
    salva_broadcast_lista,
    elimina_broadcast_lista,
    get_broadcast_schedulati,
    crea_broadcast_schedulato,
    elimina_broadcast_schedulato,
    get_broadcast_logs,
    elimina_broadcast_log,
    rielabora_singolo_ordine,
    rielabora_tutti_ordini,
    riprova_ordini_parser_locale,
    avvia_loop_auto_retry_ia,
    svuota_database_ordini,
    get_data_attiva,
    avanza_data_attiva,
    DB_FILE
)

from backend.pdf_generator import (
    genera_pdf_produzione_totale, 
    genera_pdf_produzione_sole_totale,
    genera_pdf_singolo_ordine, 
    genera_pdf_filoni,
    genera_pdf_ordini_confezionati_banco,
    genera_pdf_ordini_generale,
    genera_pdf_sole,
    apri_file_nativo_os
)

from backend.whatsapp import (
    avvia_whatsapp, 
    get_whatsapp_status, 
    reset_whatsapp_banco, 
    forzare_scansione_chat, 
    elabora_webhook_evolution,
    avvia_loop_sincronizzazione_periodica
)

# ---------------------------------------------------------
# 🔒 SISTEMA DI CONTROLLO LICENZA REMOTA (CALL-HOME KILL-SWITCH)
# ---------------------------------------------------------
URL_LICENZA = os.environ.get(
    "URL_LICENZA",
    "https://gist.githubusercontent.com/apepe11/2e0a21543f90632b9f0e0ccf2fc14888/raw/mia.json"
)
LICENZA_ATTIVA = True
LICENZA_DETTAGLI = {
    "status": "active",
    "ultimo_controllo": None,
    "errore": None
}

async def verifica_licenza_remota() -> bool:
    """Interroga il server/Gist remoto per validare lo stato della licenza SaaS."""
    global LICENZA_ATTIVA, LICENZA_DETTAGLI
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(URL_LICENZA)
            if resp.status_code == 200:
                dati = resp.json()
                stato = str(dati.get("status", "")).lower().strip()
                is_active = dati.get("active", True) if "active" in dati else (stato == "active")
                
                if stato in ["suspended", "sospesa", "revoked", "inactive", "scaduta", "disattivata"] or not is_active:
                    LICENZA_ATTIVA = False
                    print("⚠️ [KILL-SWITCH] ATTENZIONE: La licenza remota risulta SOSPESA. Il gestionale è stato bloccato.")
                else:
                    LICENZA_ATTIVA = True
                    print("🟢 [LICENZA] Controllo remoto superato con successo: Licenza ATTIVA.")
                
                LICENZA_DETTAGLI["status"] = "active" if LICENZA_ATTIVA else "suspended"
                LICENZA_DETTAGLI["ultimo_controllo"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                LICENZA_DETTAGLI["errore"] = None
                return LICENZA_ATTIVA
            else:
                print(f"⚠️ [LICENZA] Risposta server anomala (HTTP {resp.status_code}). Mantenimento stato precedente.")
    except Exception as e:
        print(f"⚠️ [LICENZA] Impossibile contattare il server licenze: {e}. Mantenimento stato precedente.")
        LICENZA_DETTAGLI["ultimo_controllo"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        LICENZA_DETTAGLI["errore"] = str(e)
    return LICENZA_ATTIVA

async def controllo_licenza_periodico():
    """Controlla la licenza all'avvio e poi ogni 5 minuti in background."""
    intervallo_secondi = int(os.environ.get("INTERVALLO_CONTROLLO_LICENZA", 300))  # 5 minuti di default
    await verifica_licenza_remota()
    while True:
        await asyncio.sleep(intervallo_secondi)
        await verifica_licenza_remota()

app = FastAPI(title="Petruzzi Manager - Dashboard API")

# Middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🛑 Middleware Blocco Licenza Sospesa
@app.middleware("http")
async def licenza_check_middleware(request: Request, call_next):
    percorso = request.url.path
    if not LICENZA_ATTIVA:
        # Permette SOLO /api/status, /api/licenza/status e /api/licenza/check
        if percorso not in ["/api/status", "/api/licenza/status", "/api/licenza/check"]:
            return JSONResponse(
                status_code=403,
                content={
                    "status": "error",
                    "code": "LICENSE_SUSPENDED",
                    "message": "Licenza Software Sospesa. Accesso bloccato. Contattare l'amministratore per rinnovare la licenza.",
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
            )
    response = await call_next(request)
    return response

class ProdottoItem(BaseModel):
    codice_articolo: str
    nome_articolo: Optional[str] = None
    quantita: float = 1.0
    unita_di_misura: Optional[str] = "kg"
    grammatura: Optional[Union[float, str]] = None
    numero_lotto: Optional[str] = None
    is_peso_fisso: Optional[bool] = None
    peso_unitario_kg: Optional[float] = None

    class Config:
        extra = "allow"

class OrdineCreate(BaseModel):
    mittente: str
    prodotti: List[ProdottoItem]
    note_ordine: Optional[str] = ""
    data_consegna: Optional[str] = None

    class Config:
        extra = "allow"

class OrdineUpdate(BaseModel):
    mittente: Optional[str] = None
    prodotti: List[ProdottoItem]
    note_ordine: Optional[str] = ""
    data_consegna: Optional[str] = None

    class Config:
        extra = "allow"

@app.on_event("startup")
async def startup_event():
    await init_db()
    asyncio.create_task(controllo_licenza_periodico())
    asyncio.create_task(avvia_whatsapp())
    avvia_loop_sincronizzazione_periodica()
    from backend.broadcast import avvia_demone_broadcast
    asyncio.create_task(avvia_demone_broadcast())

@app.get("/api/status")
def status():
    return {
        "status": "ok" if LICENZA_ATTIVA else "suspended",
        "licenza_attiva": LICENZA_ATTIVA,
        "dettagli_licenza": LICENZA_DETTAGLI,
        "database": "SQLite Locale",
        "ai": "Groq API (Llama 3.3)",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

@app.post("/api/licenza/check")
async def force_license_check():
    attiva = await verifica_licenza_remota()
    return {
        "licenza_attiva": attiva,
        "dettagli": LICENZA_DETTAGLI
    }

@app.get("/api/data-attiva")
async def api_get_data_attiva():
    data = await get_data_attiva()
    return {"data_attiva": data}

@app.post("/api/chiudi-produzione")
async def api_chiudi_produzione():
    nuova_data = await avanza_data_attiva()
    return {"status": "success", "nuova_data": nuova_data, "message": f"Ricezione ordini chiusa. Nuova data: {nuova_data}"}


@app.get("/api/whatsapp/status")
def whatsapp_status_endpoint():
    return get_whatsapp_status()

@app.post("/api/whatsapp/connect")
async def whatsapp_connect_endpoint():
    status_info = get_whatsapp_status()
    if status_info.get("stato_connessione") in ["IN_ATTESA_QR", "CONNESSO"]:
        return {"status": "already_active", "info": status_info}
    asyncio.create_task(avvia_whatsapp())
    return {"status": "starting", "message": "Inizializzazione connessione Evolution API in corso..."}

@app.post("/api/whatsapp/disconnect")
@app.post("/api/whatsapp/reset")
@app.post("/api/whatsapp/forget")
async def whatsapp_reset_endpoint():
    try:
        success = await reset_whatsapp_banco()
        if not success:
            raise HTTPException(status_code=500, detail="Errore durante la disassociazione della sessione Banco.")
        return {"status": "success", "message": "Banco dimenticato. Verrà richiesto un nuovo QR Code."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore reset Banco: {str(e)}")

@app.post("/api/whatsapp/rescan")
async def whatsapp_rescan_endpoint():
    res = await forzare_scansione_chat()
    return res

@app.post("/api/whatsapp/webhook")
@app.post("/api/whatsapp/webhook/{subpath:path}")
async def whatsapp_webhook(payload: dict = Body(...), subpath: Optional[str] = None):
    asyncio.create_task(elabora_webhook_evolution(payload))
    return {"status": "success"}

@app.post("/api/database/svuota")
async def svuota_database_endpoint():
    await svuota_database_ordini()
    return {"status": "success", "message": "Database ordini svuotato con successo."}

@app.get("/api/ordini")
async def list_ordini(data: Optional[str] = Query(None), scomponi_pezzi: bool = Query(False)):
    # Di default NON include i messaggi non riconosciuti come ordine (0 prodotti,
    # non annullati) - vedi /api/ordini/da-verificare per quelli.
    return await get_tutti_ordini(data, scomponi_pezzi=scomponi_pezzi, includi_non_ordini=False)  # type: ignore

@app.get("/api/ordini/da-verificare")
async def list_ordini_da_verificare(data: Optional[str] = Query(None)):
    tutti = await get_tutti_ordini(data, includi_non_ordini=True)  # type: ignore
    return [o for o in tutti if not o.get("is_order", True) and not o.get("is_cancelled") and len(o.get("prodotti", [])) == 0]

@app.post("/api/ordini/{id_ordine}/rielabora")
async def reprocess_single_order_endpoint(id_ordine: int):
    res = await rielabora_singolo_ordine(id_ordine)
    if res.get("status") == "error":
        raise HTTPException(status_code=400, detail=res.get("message", "Errore durante la rielaborazione dell'ordine."))
    return res

@app.post("/api/ordini/rielabora-tutti")
@app.get("/api/ordini/rielabora-tutti")
async def reprocess_all_orders_endpoint(ore: int = 48):
    count = await rielabora_tutti_ordini(ore_limite=ore)
    return {"status": "success", "message": f"Rielaborati con successo {count} ordini delle ultime {ore} ore con l'IA.", "count": count}

@app.post("/api/ordini/retry-parser")
async def retry_parser_orders_endpoint():
    count = await riprova_ordini_parser_locale()
    return {"status": "success", "message": f"Rielaborati {count} ordini con l'IA.", "count": count}

@app.put("/api/ordini/{id_ordine}/sblocco")
async def unlock_confezionamento(id_ordine: int):
    success = await sblocca_ordine_confezionamento(id_ordine)
    if not success:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    return {"status": "success", "message": "Ordine sbloccato per modifiche."}

@app.get("/api/broadcast/liste")
async def list_broadcast_liste():
    return await get_broadcast_liste()  # type: ignore

@app.post("/api/broadcast/liste")
async def save_broadcast_lista(payload: dict = Body(...)):
    nome = payload.get("nome_lista", "").strip()
    contatti = payload.get("contatti", [])
    if not nome:
        raise HTTPException(status_code=400, detail="Nome lista obbligatorio.")
    await salva_broadcast_lista(nome, contatti)
    return {"status": "success"}

@app.delete("/api/broadcast/liste/{id_lista}")
async def delete_broadcast_lista(id_lista: int):
    await elimina_broadcast_lista(id_lista)
    return {"status": "success"}

@app.get("/api/broadcast/schedulati")
async def list_broadcast_schedulati():
    return await get_broadcast_schedulati()  # type: ignore

@app.post("/api/broadcast/schedulati")
async def schedule_broadcast(payload: dict = Body(...)):
    id_lista = int(payload.get("id_lista", 0))
    nome_lista = payload.get("nome_lista", "")
    messaggio = payload.get("messaggio", "")
    orario = payload.get("orario_programmato", "")
    ricorrenza = payload.get("ricorrenza", "UNA_TANTUM")
    if not messaggio or not orario:
        raise HTTPException(status_code=400, detail="Messaggio ed orario obbligatori.")
    await crea_broadcast_schedulato(id_lista, nome_lista, messaggio, orario, ricorrenza)
    return {"status": "success"}

@app.delete("/api/broadcast/schedulati/{id_sched}")
async def delete_broadcast_schedulato(id_sched: int):
    await elimina_broadcast_schedulato(id_sched)
    return {"status": "success"}

@app.post("/api/broadcast/schedulati/{id_sched}/esegui-ora")
async def run_scheduled_now(id_sched: int):
    from backend.broadcast import esegui_task_schedulato_ora
    success = await esegui_task_schedulato_ora(id_sched)
    if not success:
        raise HTTPException(status_code=404, detail="Task schedulato non trovato o lista vuota.")
    return {"status": "success", "message": "Invio broadcast avviato."}

@app.post("/api/broadcast/invia-ora")
async def send_broadcast_now_endpoint(payload: dict = Body(...)):
    id_lista = payload.get("id_lista")
    messaggio = payload.get("messaggio", "").strip()
    numero_test = payload.get("numero_test", "").strip()
    
    if not messaggio:
        raise HTTPException(status_code=400, detail="Messaggio obbligatorio.")
        
    from backend.broadcast import esegui_broadcast_istantaneo
    risultato = await esegui_broadcast_istantaneo(id_lista=id_lista, messaggio=messaggio, numero_test=numero_test)
    return {"status": "success", "risultato": risultato}

@app.get("/api/broadcast/logs")
async def list_broadcast_logs():
    return await get_broadcast_logs()  # type: ignore

@app.delete("/api/broadcast/logs-all")
async def clear_all_broadcast_logs_endpoint():
    async with get_db_connection() as db:
        await db.execute("DELETE FROM broadcast_logs")
        await db.commit()
    return {"status": "success", "message": "Tutti i log eliminati."}

@app.delete("/api/broadcast/logs/{id_log}")
async def delete_broadcast_log(id_log: int):
    await elimina_broadcast_log(id_log)
    return {"status": "success"}

@app.post("/api/ordini")
async def add_ordine(payload: dict = Body(...)):
    prodotti_raw = payload.get("prodotti", [])
    prodotti_dict = [p for p in prodotti_raw if isinstance(p, dict)]
    mittente = str(payload.get("mittente") or "").strip()
    if not mittente:
        raise HTTPException(status_code=400, detail="Il mittente/cliente è obbligatorio")
    note_ordine = payload.get("note_ordine", "")
    data_consegna = payload.get("data_consegna")
    ordine_id = await crea_ordine_manuale(
        mittente=mittente,
        prodotti=prodotti_dict,
        note=note_ordine or "",
        data_consegna=data_consegna
    )
    return {"status": "ok", "id": ordine_id}

@app.put("/api/ordini/{id_ordine}")
async def update_ordine(id_ordine: int, payload: dict = Body(...)):
    prodotti_raw = payload.get("prodotti", [])
    prodotti_dict = [p for p in prodotti_raw if isinstance(p, dict)]
    mittente = payload.get("mittente")
    note_ordine = payload.get("note_ordine", "")
    data_consegna = payload.get("data_consegna")
    success = await aggiorna_ordine(
        id_ordine=id_ordine,
        mittente=mittente,
        prodotti=prodotti_dict,
        note=note_ordine or "", 
        data_consegna=data_consegna
    )
    if not success:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    return {"status": "ok"}

@app.delete("/api/ordini/{id_ordine}")
async def remove_ordine(id_ordine: int):
    success = await elimina_ordine(id_ordine)
    if not success:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    return {"status": "ok"}

@app.get("/api/produzione")
async def list_produzione(data: Optional[str] = Query(None)):
    return await get_produzione_aggregata(data)  # type: ignore

@app.get("/api/produzione-sole")
@app.get("/api/produzione/sole")
async def list_produzione_sole(data: Optional[str] = Query(None)):
    target_data = data or await get_data_attiva()
    return await get_produzione_aggregata_sole(target_data)  # type: ignore

@app.get("/api/ordini-sole")
async def list_ordini_sole(data: Optional[str] = Query(None), scomponi_pezzi: bool = Query(False)):
    target_data = data or await get_data_attiva()
    return await get_ordini_sole(target_data, scomponi_pezzi=scomponi_pezzi)  # type: ignore

@app.get("/api/statistiche")
async def get_stats(periodo_tipo: str = Query("mensile"), periodo_valore: Optional[str] = Query(None)):
    return await get_statistiche(periodo_tipo, periodo_valore)

@app.get("/api/prodotti")
async def list_prodotti():
    catalog_path = get_static_path(os.path.join("catalogo", "catalogo.json"))
    if os.path.exists(catalog_path):
        with open(catalog_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def salva_e_apri_pdf_temp(pdf_bytes: bytes, filename: str):
    try:
        reports_dir = get_persistent_path("reports")
        os.makedirs(reports_dir, exist_ok=True)
        filepath = os.path.join(reports_dir, filename)
        with open(filepath, "wb") as f:
            f.write(pdf_bytes)
        apri_file_nativo_os(filepath)
    except Exception as e:
        print(f"⚠️ Errore salvataggio/apertura PDF: {e}")

@app.get("/api/pdf/produzione")
async def download_pdf_produzione(data: Optional[str] = Query(None)):
    target_data = data or await get_data_attiva()
    lista_prod = await get_produzione_aggregata(target_data)  # type: ignore
    pdf_bytes = genera_pdf_produzione_totale(target_data, lista_prod)
    salva_e_apri_pdf_temp(pdf_bytes, f"produzione_petruzzi_{target_data}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=produzione_petruzzi_{target_data}.pdf"}
    )

@app.get("/api/pdf/produzione-sole")
@app.get("/api/pdf/produzione/sole")
async def download_pdf_produzione_sole(data: Optional[str] = Query(None)):
    target_data = data or await get_data_attiva()
    lista_prod = await get_produzione_aggregata_sole(target_data)  # type: ignore
    pdf_bytes = genera_pdf_produzione_sole_totale(target_data, lista_prod)
    salva_e_apri_pdf_temp(pdf_bytes, f"produzione_sole_{target_data}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=produzione_sole_{target_data}.pdf"}
    )

@app.get("/api/pdf/ordine/{id_ordine}")
async def download_pdf_ordine(id_ordine: int):
    ordini = await get_tutti_ordini()  # type: ignore
    target_ord = next((o for o in ordini if o["id"] == id_ordine), None)
    if not target_ord:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    pdf_bytes = genera_pdf_singolo_ordine(target_ord)
    filename = f"ordine_{target_ord['mittente'].replace(' ', '_')}.pdf"
    salva_e_apri_pdf_temp(pdf_bytes, filename)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

@app.get("/api/pdf/ordini-generale")
async def download_pdf_ordini_generale(data: Optional[str] = Query(None)):
    target_date = data or await get_data_attiva()
    ordini = await get_tutti_ordini(target_date)  # type: ignore
    ordini_attivi = [o for o in ordini if not o.get('is_cancelled') and o.get('stato_ordine') != 'ANNULLATO']
    
    pdf_bytes = genera_pdf_ordini_generale(target_date, ordini_attivi)
    filename = f"ordini_generali_{target_date}.pdf"
    salva_e_apri_pdf_temp(pdf_bytes, filename)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

@app.get("/api/filoni")
async def list_filoni(data: Optional[str] = Query(None)):
    return await get_filoni_per_cliente(data)  # type: ignore

@app.get("/api/pdf/filoni")
async def download_pdf_filoni(data: Optional[str] = Query(None)):
    target_data = data or await get_data_attiva()
    lista_filoni = await get_filoni_per_cliente(target_data)  # type: ignore
    pdf_bytes = genera_pdf_filoni(target_data, lista_filoni)
    salva_e_apri_pdf_temp(pdf_bytes, f"filoni_pizzeria_{target_data}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=filoni_pizzeria_{target_data}.pdf"}
    )

@app.get("/api/pdf/ordini-confezionati-banco")
async def download_pdf_ordini_confezionati_banco(data: Optional[str] = Query(None)):
    target_data = data or await get_data_attiva()
    ordini = await get_tutti_ordini(target_data)  # type: ignore
    conf_list = [o for o in ordini if o.get('stato_confezionamento') == 'CONFEZIONATO' or o.get('stato_ordine') == 'CONFERMATO']
    pdf_bytes = genera_pdf_ordini_confezionati_banco(target_data, conf_list)
    salva_e_apri_pdf_temp(pdf_bytes, f"riepilogo_banco_confezionati_{target_data}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=riepilogo_banco_confezionati_{target_data}.pdf"}
    )

def _get_particolarita_path():
    return get_persistent_path(os.path.join("catalogo", "particolarita_clienti.json"))

def _carica_particolarita_json() -> list:
    path = _get_particolarita_path()
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception as e:
            print(f"⚠️ Errore lettura particolarità: {e}")
    return []

def _salva_particolarita_json(data: list):
    path = _get_particolarita_path()
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    try:
        from backend.whatsapp import ai_parser as whatsapp_ai_parser
        if hasattr(whatsapp_ai_parser, 'reload_client_rules'):
            whatsapp_ai_parser.reload_client_rules()
    except Exception as e:
        print(f"⚠️ Errore reload regole IA: {e}")

@app.get("/api/clienti")
async def list_clienti():
    return await get_lista_clienti_registrati()  # type: ignore

@app.get("/api/particolarita-clienti")
async def get_particolarita_clienti():
    """Restituisce l'elenco completo dei clienti e particolarità dal file JSON."""
    clienti = _carica_particolarita_json()
    # Aggiunge un identificatore indice univoco per ciascun cliente
    result = []
    for idx, c in enumerate(clienti):
        item = dict(c)
        item["index"] = idx
        result.append(item)
    return result

@app.post("/api/particolarita-clienti")
@app.post("/api/clienti")
async def add_particolarita_cliente(payload: dict = Body(...)):
    """Aggiunge un nuovo cliente o regola nel file JSON."""
    clienti = _carica_particolarita_json()
    
    # Pulisce i campi nulli/vuoti
    cliente_pulito = {k: v.strip() if isinstance(v, str) else v for k, v in payload.items() if v is not None and v != "" and k != "index"}
    if not cliente_pulito.get("n"):
        raise HTTPException(status_code=400, detail="Il nome del cliente è obbligatorio.")
    
    clienti.append(cliente_pulito)
    _salva_particolarita_json(clienti)
    return {"status": "success", "message": "Cliente aggiunto con successo.", "total": len(clienti)}

@app.put("/api/particolarita-clienti/{index}")
async def update_particolarita_cliente(index: int, payload: dict = Body(...)):
    """Modifica direttamente il cliente alla posizione specificata nel file JSON."""
    clienti = _carica_particolarita_json()
    if index < 0 or index >= len(clienti):
        raise HTTPException(status_code=404, detail="Cliente non trovato all'indice specificato.")
    
    cliente_pulito = {k: v.strip() if isinstance(v, str) else v for k, v in payload.items() if v is not None and v != "" and k != "index"}
    if not cliente_pulito.get("n"):
        raise HTTPException(status_code=400, detail="Il nome del cliente è obbligatorio.")
        
    clienti[index] = cliente_pulito
    _salva_particolarita_json(clienti)
    return {"status": "success", "message": "Cliente aggiornato con successo."}

@app.delete("/api/particolarita-clienti/{index}")
async def delete_particolarita_cliente(index: int):
    """Elimina il cliente alla posizione specificata dal file JSON."""
    clienti = _carica_particolarita_json()
    if index < 0 or index >= len(clienti):
        raise HTTPException(status_code=404, detail="Cliente non trovato all'indice specificato.")
    
    rimosso = clienti.pop(index)
    _salva_particolarita_json(clienti)
    return {"status": "success", "message": f"Cliente '{rimosso.get('n', '')}' rimosso dal file JSON.", "total": len(clienti)}

# --- SALVATAGGIO SINGOLA RIGA PRODOTTO / LOTTI PARZIALI (TABLET) ---
@app.put("/api/ordini/{id_ordine}/prodotti/{index_prodotto}")
@app.patch("/api/ordini/{id_ordine}/prodotti/{index_prodotto}")
async def update_singolo_prodotto_ordine(id_ordine: int, index_prodotto: int, payload: dict = Body(...)):
    success = await aggiorna_prodotto_singolo_ordine(id_ordine, index_prodotto, payload)
    if not success:
        raise HTTPException(status_code=404, detail="Ordine o prodotto non trovato")
    return {"status": "success", "message": "Prodotto aggiornato con successo."}

@app.put("/api/ordini/{id_ordine}/prodotti")
@app.patch("/api/ordini/{id_ordine}/prodotti")
@app.put("/api/ordini/{id_ordine}/prodotto")
@app.patch("/api/ordini/{id_ordine}/prodotto")
async def update_prodotti_parziali_ordine_endpoint(id_ordine: int, payload: dict = Body(...)):
    prodotti = payload.get("prodotti")
    if prodotti is not None:
        success = await aggiorna_prodotti_parziali_ordine(id_ordine, prodotti)
    elif "index" in payload and "prodotto" in payload:
        success = await aggiorna_prodotto_singolo_ordine(id_ordine, payload["index"], payload["prodotto"])
    elif "prodotto" in payload:
        success = await aggiorna_prodotto_singolo_ordine(id_ordine, 0, payload["prodotto"])
    else:
        success = await aggiorna_prodotti_parziali_ordine(id_ordine, [payload])
    if not success:
        raise HTTPException(status_code=404, detail="Ordine o prodotto non trovato")
    return {"status": "success", "message": "Prodotti aggiornati con successo."}

# --- MODIFICA FONDAMENTALE: L'API prende una lista di prodotti pesati ---
@app.put("/api/ordini/{id_ordine}/confezione")
async def update_confezionamento(id_ordine: int, payload: dict = Body(...)):
    prodotti = payload.get("prodotti", [])
    success = await aggiorna_confezionamento_ordine(id_ordine, prodotti)
    if not success:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    return {"status": "success", "message": "Confezionamento registrato."}

@app.put("/api/ordini/{id_ordine}/conferma")
async def confirm_order(id_ordine: int, payload: dict = Body(...)):
    prodotti = payload.get("prodotti")
    numero_lotto = payload.get("numero_lotto")
    success = await conferma_ordine(id_ordine, prodotti, numero_lotto)
    if not success:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    return {"status": "success", "message": "Ordine confermato."}

@app.put("/api/ordini/{id_ordine}/consegna")
async def deliver_order(id_ordine: int, payload: dict = Body(...)):
    prodotti = payload.get("prodotti", [])
    success = await consegna_ordine(id_ordine, prodotti)
    if not success:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    return {"status": "success", "message": "Ordine contrassegnato come CONSEGNATO con successo."}

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "petruzzi-secret-key")

@app.get("/api/admin/backup-db")
async def download_db_backup(token: Optional[str] = Query(None)):
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Token riservato non valido.")
    if not os.path.exists(DB_FILE):
        raise HTTPException(status_code=440, detail="Database file non trovato.")
    backup_filename = f"petruzzi_backup_{datetime.now().strftime('%Y%m%d_%H%M')}.db"
    return FileResponse(
        path=DB_FILE,
        filename=backup_filename,
        media_type="application/x-sqlite3"
    )


@app.get("/api/pdf/sole")
async def download_pdf_sole(data: Optional[str] = Query(None)):
    target_date = data or await get_data_attiva()
    ordini_sole = await get_ordini_sole(target_date)
            
    # Usa il template PDF per i clienti "Sole 365"
    pdf_bytes = genera_pdf_sole(target_date, ordini_sole)
    filename = f"scheda_ordini_sole_365_{target_date}.pdf"
    salva_e_apri_pdf_temp(pdf_bytes, filename)
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

@app.get("/api/admin/overview")
async def get_admin_overview(token: Optional[str] = Query(None), data: Optional[str] = Query(None)):
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Token riservato non valido.")
    
    target_date = data or await get_data_attiva()
    ordini_oggi = await get_tutti_ordini(target_date)  # type: ignore
    prod_aggregata = await get_produzione_aggregata(target_date)  # type: ignore
    
    totali_kg = sum(p.get("quantita_totale", 0) for p in prod_aggregata if (p.get("unita_di_misura") or "").lower() == "kg")
    totali_pz = sum(p.get("quantita_totale", 0) for p in prod_aggregata if (p.get("unita_di_misura") or "").lower() in ["pezzi", "pz"])
    
    n_ordini = len(ordini_oggi)
    n_confezionati = sum(1 for o in ordini_oggi if o.get("stato_confezionamento") == "CONFEZIONATO")
    n_confermati = sum(1 for o in ordini_oggi if o.get("stato_ordine") == "CONFERMATO")
    perc_completamento = round((n_confezionati / n_ordini * 100), 1) if n_ordini > 0 else 0.0
    
    db_size = os.path.getsize(DB_FILE) if os.path.exists(DB_FILE) else 0

    return {
        "target_date": target_date,
        "n_ordini_totali": n_ordini,
        "n_confezionati": n_confezionati,
        "n_confermati": n_confermati,
        "percentuale_completamento": perc_completamento,
        "totale_kg": round(totali_kg, 2),
        "totale_pezzi": round(totali_pz, 0),
        "db_size_bytes": db_size,
        "produzione_aggregata": prod_aggregata,
        "ordini": ordini_oggi,
        "timestamp_ultimo_aggiornamento": datetime.now().strftime('%d/%m/%Y %H:%M:%S')
    }

@app.get("/tablet")
@app.get("/tablet.html")
async def serve_tablet_route():
    tablet_dist = get_static_path(os.path.join("frontend", "dist", "tablet.html"))
    fallback_dist = get_static_path(os.path.join("frontend", "dist", "index.html"))
    if os.path.exists(tablet_dist):
        return FileResponse(tablet_dist)
    elif os.path.exists(fallback_dist):
        return FileResponse(fallback_dist)
    return {"status": "ok", "message": "Interfaccia Tablet in caricamento"}

@app.get("/titolare")
@app.get("/titolare.html")
@app.get("/admin")
async def serve_titolare_route():
    titolare_dist = get_static_path(os.path.join("frontend", "dist", "titolare.html"))
    fallback_dist = get_static_path(os.path.join("frontend", "dist", "index.html"))
    if os.path.exists(titolare_dist):
        return FileResponse(titolare_dist)
    elif os.path.exists(fallback_dist):
        return FileResponse(fallback_dist)
    return {"status": "ok", "message": "Modulo Titolare in caricamento"}

images_dir = get_static_path("images")
if os.path.exists(images_dir):
    app.mount("/images", StaticFiles(directory=images_dir), name="images")

frontend_dist = get_static_path(os.path.join("frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Avvio Caseificio Petruzzi Manager su http://localhost:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")