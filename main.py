import asyncio
import os
import json
from datetime import datetime
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from typing import List, Optional

from backend.db import (
    init_db, 
    get_tutti_ordini, 
    crea_ordine_manuale, 
    aggiorna_ordine, 
    elimina_ordine, 
    get_produzione_aggregata, 
    get_statistiche,
    get_filoni_per_cliente,
    get_lista_clienti_registrati,
    aggiorna_confezionamento_ordine,
    sblocca_ordine_confezionamento,
    conferma_ordine,
    get_broadcast_liste,
    salva_broadcast_lista,
    elimina_broadcast_lista,
    get_broadcast_schedulati,
    crea_broadcast_schedulato,
    elimina_broadcast_schedulato,
    get_broadcast_logs,
    elimina_broadcast_log,
    rielabora_tutti_ordini,
    svuota_database_ordini,
    get_data_attiva,
    avanza_data_attiva,
    DB_FILE
)

from backend.pdf_generator import (
    genera_pdf_produzione_totale, 
    genera_pdf_singolo_ordine, 
    genera_pdf_filoni,
    genera_pdf_ordini_confezionati_banco,
    genera_pdf_ordini_generale,
    apri_file_nativo_os
)

from backend.whatsapp import (
    avvia_whatsapp, 
    get_whatsapp_status, 
    reset_whatsapp_banco, 
    forzare_scansione_chat, 
    elabora_webhook_evolution
)

app = FastAPI(title="Petruzzi Manager - Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ProdottoItem(BaseModel):
    codice_articolo: str
    nome_articolo: Optional[str] = None
    quantita: float
    unita_di_misura: Optional[str] = "kg"

class OrdineCreate(BaseModel):
    mittente: str
    prodotti: List[ProdottoItem]
    note_ordine: Optional[str] = ""
    data_consegna: Optional[str] = None

class OrdineUpdate(BaseModel):
    prodotti: List[ProdottoItem]
    note_ordine: Optional[str] = ""
    data_consegna: Optional[str] = None

@app.on_event("startup")
async def startup_event():
    await init_db()
    asyncio.create_task(avvia_whatsapp())

@app.get("/api/status")
def status():
    return {
        "status": "Motore Petruzzi Attivo",
        "database": "SQLite Locale",
        "ai": "Groq API (Llama 3.3)"
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
    return await get_tutti_ordini(data, scomponi_pezzi=scomponi_pezzi, includi_non_ordini=False)

@app.get("/api/ordini/da-verificare")
async def list_ordini_da_verificare(data: Optional[str] = Query(None)):
    tutti = await get_tutti_ordini(data, includi_non_ordini=True)
    return [o for o in tutti if not o.get("is_order", True) and not o.get("is_cancelled") and len(o.get("prodotti", [])) == 0]

@app.post("/api/ordini/rielabora-tutti")
@app.get("/api/ordini/rielabora-tutti")
async def reprocess_all_orders_endpoint():
    count = await rielabora_tutti_ordini()
    return {"status": "success", "message": f"Rielaborati con successo {count} ordini con l'IA ed il parser.", "count": count}

@app.put("/api/ordini/{id_ordine}/sblocco")
async def unlock_confezionamento(id_ordine: int):
    success = await sblocca_ordine_confezionamento(id_ordine)
    if not success:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    return {"status": "success", "message": "Ordine sbloccato per modifiche."}

@app.get("/api/broadcast/liste")
async def list_broadcast_liste():
    return await get_broadcast_liste()

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
    return await get_broadcast_schedulati()

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

@app.get("/api/broadcast/logs")
async def list_broadcast_logs():
    return await get_broadcast_logs()

@app.delete("/api/broadcast/logs/{id_log}")
async def delete_broadcast_log(id_log: int):
    await elimina_broadcast_log(id_log)
    return {"status": "success"}

@app.post("/api/ordini")
async def add_ordine(payload: OrdineCreate):
    prodotti_dict = [p.dict() for p in payload.prodotti]
    ordine_id = await crea_ordine_manuale(
        mittente=payload.mittente,
        prodotti=prodotti_dict,
        note=payload.note_ordine or "",
        data_consegna=payload.data_consegna
    )
    return {"status": "ok", "id": ordine_id}

@app.put("/api/ordini/{id_ordine}")
async def update_ordine(id_ordine: int, payload: OrdineUpdate):
    prodotti_dict = [p.dict() for p in payload.prodotti]
    success = await aggiorna_ordine(
        id_ordine=id_ordine,
        prodotti=prodotti_dict,
        note=payload.note_ordine or "", 
        data_consegna=payload.data_consegna
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
    return await get_produzione_aggregata(data)

@app.get("/api/statistiche")
async def get_stats(periodo_tipo: str = Query("mensile"), periodo_valore: Optional[str] = Query(None)):
    return await get_statistiche(periodo_tipo, periodo_valore)

@app.get("/api/prodotti")
async def list_prodotti():
    catalog_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "catalogo", "catalogo_prodotti.json"))
    if os.path.exists(catalog_path):
        with open(catalog_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def salva_e_apri_pdf_temp(pdf_bytes: bytes, filename: str):
    try:
        reports_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "reports"))
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
    lista_prod = await get_produzione_aggregata(target_data)
    pdf_bytes = genera_pdf_produzione_totale(target_data, lista_prod)
    salva_e_apri_pdf_temp(pdf_bytes, f"produzione_petruzzi_{target_data}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=produzione_petruzzi_{target_data}.pdf"}
    )

@app.get("/api/pdf/ordine/{id_ordine}")
async def download_pdf_ordine(id_ordine: int):
    ordini = await get_tutti_ordini()
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
    ordini = await get_tutti_ordini(target_date)
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
    return await get_filoni_per_cliente(data)

@app.get("/api/pdf/filoni")
async def download_pdf_filoni(data: Optional[str] = Query(None)):
    target_data = data or await get_data_attiva()
    lista_filoni = await get_filoni_per_cliente(target_data)
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
    ordini = await get_tutti_ordini(target_data)
    conf_list = [o for o in ordini if o.get('stato_confezionamento') == 'CONFEZIONATO' or o.get('stato_ordine') == 'CONFERMATO']
    pdf_bytes = genera_pdf_ordini_confezionati_banco(target_data, conf_list)
    salva_e_apri_pdf_temp(pdf_bytes, f"riepilogo_banco_confezionati_{target_data}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=riepilogo_banco_confezionati_{target_data}.pdf"}
    )

@app.get("/api/clienti")
async def list_clienti():
    return await get_lista_clienti_registrati()

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

@app.get("/api/admin/overview")
async def get_admin_overview(token: Optional[str] = Query(None), data: Optional[str] = Query(None)):
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Token riservato non valido.")
    
    target_date = data or await get_data_attiva()
    ordini_oggi = await get_tutti_ordini(target_date)
    prod_aggregata = await get_produzione_aggregata(target_date)
    
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
    tablet_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend", "dist", "tablet.html"))
    fallback_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend", "dist", "index.html"))
    if os.path.exists(tablet_dist):
        return FileResponse(tablet_dist)
    elif os.path.exists(fallback_dist):
        return FileResponse(fallback_dist)
    return {"status": "ok", "message": "Interfaccia Tablet in caricamento"}

@app.get("/titolare")
@app.get("/titolare.html")
@app.get("/admin")
async def serve_titolare_route():
    titolare_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend", "dist", "titolare.html"))
    fallback_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend", "dist", "index.html"))
    if os.path.exists(titolare_dist):
        return FileResponse(titolare_dist)
    elif os.path.exists(fallback_dist):
        return FileResponse(fallback_dist)
    return {"status": "ok", "message": "Modulo Titolare in caricamento"}

images_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "images"))
if os.path.exists(images_dir):
    app.mount("/images", StaticFiles(directory=images_dir), name="images")

frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")