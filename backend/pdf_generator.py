import io
import os
import sys
import subprocess
import logging
import re
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm

LOGO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "images", "logo.png"))

def apri_file_nativo_os(filepath: str) -> bool:
    """Apre nativamente 1-Click il file PDF generato con l'applicazione predefinita di sistema (xdg-open / os.startfile / open)."""
    if not filepath or not os.path.exists(filepath):
        return False
    try:
        if sys.platform.startswith('win'):
            os.startfile(filepath)
        elif sys.platform.startswith('darwin'):
            subprocess.Popen(['open', filepath])
        else: # Linux
            subprocess.Popen(['xdg-open', filepath])
        logging.info(f"📄 Apertura nativa OS riuscita per: {filepath}")
        return True
    except Exception as e:
        logging.error(f"⚠️ Impossibile aprire file nativo OS ({filepath}): {e}")
        return False

def formatta_data_it(data_str: str) -> str:
    """Converte una data YYYY-MM-DD o ISO nel formato italiano DD/MM/YYYY."""
    if not data_str:
        return ""
    clean = str(data_str).strip()
    match = re.match(r'^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?$', clean)
    if match:
        y, m, d, t = match.groups()
        return f"{d}/{m}/{y} {t}".strip() if t else f"{d}/{m}/{y}"
    return clean

def _safe_float(v, default=0.0):
    try:
        if v is None:
            return default
        return float(v)
    except (TypeError, ValueError):
        return default

def genera_pdf_produzione_totale(data_produzione: str, lista_produzione: list) -> bytes:
    """Genera il PDF per il casaro con il totale della produzione aggregata per il giorno specificato."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5*cm,
        leftMargin=1.5*cm,
        topMargin=1.5*cm,
        bottomMargin=1.5*cm
    )

    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#4e2a1e'),
        alignment=0
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#7d5236')
    )
    cell_style = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=12,
        textColor=colors.HexColor('#1c1917')
    )
    header_cell_style = ParagraphStyle(
        'HeaderCellText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=12,
        textColor=colors.HexColor('#ffffff')
    )

    data_formatted = formatta_data_it(data_produzione)

    # Intestazione con Logo
    if os.path.exists(LOGO_PATH):
        img = Image(LOGO_PATH, width=2.5*cm, height=2.5*cm)
        img.hAlign = 'LEFT'
        
        header_text = [
            Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style),
            Spacer(1, 0.1*cm),
            Paragraph(f"DISTINTA DI PRODUZIONE CASARO — GIORNATA: {data_formatted}", subtitle_style),
            Paragraph(f"Generato il: {datetime.now().strftime('%d/%m/%Y alle %H:%M')}", styles['Italic'])
        ]
        
        header_table = Table([[img, header_text]], colWidths=[3.0*cm, 15.0*cm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (0,0), (0,0), 'LEFT'),
        ]))
        story.append(header_table)
    else:
        story.append(Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style))
        story.append(Paragraph(f"DISTINTA DI PRODUZIONE CASARO — GIORNATA: {data_formatted}", subtitle_style))

    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#d97706'), spaceBefore=1, spaceAfter=15))

    # Tabella Produzione
    data_table = [
        [
            Paragraph("CODICE", header_cell_style),
            Paragraph("PRODOTTO DA PRODURRE", header_cell_style),
            Paragraph("TOTALE KG", header_cell_style),
            Paragraph("ORDINI", header_cell_style)
        ]
    ]

    for prod in lista_produzione:
        tot_kg = _safe_float(prod.get("quantita_totale", prod.get("totale_kg", 0)))
        n_ordini = _safe_float(prod.get("numero_ordini", prod.get("totale_pezzi", 0)))
        data_table.append([
            Paragraph(str(prod.get("codice_articolo", prod.get("codice", ""))), cell_style),
            Paragraph(str(prod.get("nome_prodotto", prod.get("nome", ""))), cell_style),
            Paragraph(f"<b>{tot_kg:.2f} KG</b>", cell_style),
            Paragraph(f"<b>{n_ordini:.0f}</b>", cell_style)
        ])

    table = Table(data_table, colWidths=[3.5*cm, 8.5*cm, 3.0*cm, 3.0*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4e2a1e')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('BOTTOMPADDING', (0,0), (-1,0), 8),
        ('TOPPADDING', (0,0), (-1,0), 8),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#fffbeb')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#fde68a')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#ffffff'), colors.HexColor('#fef3c7')]),
        ('TOPPADDING', (0,1), (-1,-1), 6),
        ('BOTTOMPADDING', (0,1), (-1,-1), 6),
    ]))

    story.append(table)
    doc.build(story)
    return buffer.getvalue()

def genera_pdf_singolo_ordine(ordine: dict) -> bytes:
    """Genera il PDF per il singolo ordine cliente con Grammatura Pesata e Lotto."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm
    )
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=colors.HexColor('#4e2a1e')
    )
    sub_style = ParagraphStyle(
        'DocSubTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=colors.HexColor('#7d5236')
    )
    cell_bold = ParagraphStyle(
        'CellBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=12, textColor=colors.HexColor('#1c1917')
    )
    cell_norm = ParagraphStyle(
        'CellNorm', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=12, textColor=colors.HexColor('#1c1917')
    )

    data_cons_formatted = formatta_data_it(ordine.get('data_consegna',''))

    if os.path.exists(LOGO_PATH):
        img = Image(LOGO_PATH, width=2.5*cm, height=2.5*cm)
        img.hAlign = 'LEFT'
        header_text = [
            Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style),
            Spacer(1, 0.1*cm),
            Paragraph(f"RICEVUTA ORDINE E BOLLA CONFEZIONAMENTO #{ordine.get('id','')}", sub_style),
            Paragraph(f"Cliente: <b>{ordine.get('mittente','')}</b> | Data Consegna: <b>{data_cons_formatted}</b>", sub_style)
        ]
        header_table = Table([[img, header_text]], colWidths=[3.0*cm, 15.0*cm])
        story.append(header_table)
    else:
        story.append(Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style))
        story.append(Paragraph(f"RICEVUTA ORDINE #{ordine.get('id','')} - {ordine.get('mittente','')}", sub_style))

    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#d97706'), spaceBefore=1, spaceAfter=12))

    data_tab = [
        [
            Paragraph("<b>CODICE</b>", cell_bold),
            Paragraph("<b>PRODOTTO</b>", cell_bold),
            Paragraph("<b>QUANTITÀ</b>", cell_bold),
            Paragraph("<b>GRAMMATURA / PESO</b>", cell_bold),
            Paragraph("<b>N° LOTTO</b>", cell_bold)
        ]
    ]

    lotto_gen = ordine.get('numero_lotto') or f"L{datetime.now().strftime('%y%m%d')}"

    for p in ordine.get('prodotti', []):
        data_tab.append([
            Paragraph(str(p.get("codice_articolo", "")), cell_norm),
            Paragraph(str(p.get("nome_articolo", "") or p.get("codice_articolo", "")), cell_norm),
            Paragraph(f"{p.get('quantita', 1.0)} {p.get('unita_di_misura', 'kg')}", cell_norm),
            Paragraph(f"<b>{p.get('grammatura', '-')}</b>", cell_bold),
            Paragraph(f"<b>{p.get('numero_lotto') or lotto_gen}</b>", cell_bold)
        ])

    table = Table(data_tab, colWidths=[3.0*cm, 7.0*cm, 2.5*cm, 3.0*cm, 2.5*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#fef3c7')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#fde68a')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(table)

    if ordine.get("note_ordine"):
        story.append(Spacer(1, 0.4*cm))
        story.append(Paragraph(f"<b>Note Ordine:</b> {ordine.get('note_ordine')}", sub_style))

    doc.build(story)
    return buffer.getvalue()

def genera_pdf_filoni(data_str: str, clienti_filoni: list) -> bytes:
    """Genera la scheda PDF raggruppata per la lavorazione dei Filoni Pizzeria."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm
    )
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=colors.HexColor('#4e2a1e')
    )
    sub_style = ParagraphStyle(
        'DocSubTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=colors.HexColor('#7d5236')
    )
    cell_bold = ParagraphStyle(
        'CellBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=12, textColor=colors.HexColor('#1c1917')
    )
    cell_norm = ParagraphStyle(
        'CellNorm', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=12, textColor=colors.HexColor('#1c1917')
    )

    data_formatted = formatta_data_it(data_str)

    if os.path.exists(LOGO_PATH):
        img = Image(LOGO_PATH, width=2.5*cm, height=2.5*cm)
        img.hAlign = 'LEFT'
        header_text = [
            Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style),
            Spacer(1, 0.1*cm),
            Paragraph(f"SCHEDA LAVORAZIONE FILONI PIZZERIA — {data_formatted}", sub_style),
            Paragraph(f"Generato il: {datetime.now().strftime('%d/%m/%Y alle %H:%M')}", styles['Italic'])
        ]
        header_table = Table([[img, header_text]], colWidths=[3.0*cm, 15.0*cm])
        story.append(header_table)

    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#d97706'), spaceBefore=1, spaceAfter=12))

    data_tab = [
        [
            Paragraph("<b>PIZZERIA / CLIENTE</b>", cell_bold),
            Paragraph("<b>FILONI ED ARTICOLI RICHIESTI</b>", cell_bold),
            Paragraph("<b>NOTE CUCINA</b>", cell_bold)
        ]
    ]

    for c in clienti_filoni:
        prods_str = "<br/>".join([f"• {p.get('nome_articolo') or p.get('codice_articolo')}: <b>{p.get('quantita')} {p.get('unita_di_misura')}</b>" for p in c.get('prodotti_filoni', [])])
        data_tab.append([
            Paragraph(f"<b>{c.get('mittente','')}</b>", cell_bold),
            Paragraph(prods_str, cell_norm),
            Paragraph(c.get("note_ordine") or "-", cell_norm)
        ])

    table = Table(data_tab, colWidths=[5.0*cm, 8.0*cm, 5.0*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#fef3c7')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#fde68a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(table)

    doc.build(story)
    return buffer.getvalue()

def genera_pdf_ordini_confezionati_banco(data_str: str, ordini_confezionati: list) -> bytes:
    """Genera la scheda riepilogativa PDF A4 per gli ordini già confezionati per il banco vendita."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm
    )
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=16, leading=20, textColor=colors.HexColor('#4e2a1e')
    )
    sub_style = ParagraphStyle(
        'DocSubTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=colors.HexColor('#065f46')
    )
    cell_bold = ParagraphStyle(
        'CellBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=11, textColor=colors.HexColor('#1c1917')
    )
    cell_norm = ParagraphStyle(
        'CellNorm', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=11, textColor=colors.HexColor('#292524')
    )

    data_formatted = formatta_data_it(data_str)

    if os.path.exists(LOGO_PATH):
        img = Image(LOGO_PATH, width=2.8*cm, height=2.8*cm)
        img.hAlign = 'LEFT'
        header_text = [
            Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style),
            Spacer(1, 0.1*cm),
            Paragraph(f"📋 RIEPILOGO ORDINI CONFEZIONATI BANCO VENDITA — {data_formatted}", sub_style),
            Paragraph(f"Generato il: {datetime.now().strftime('%d/%m/%Y alle %H:%M')}", styles['Italic'])
        ]
        header_table = Table([[img, header_text]], colWidths=[3.2*cm, 14.8*cm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (0,0), (0,0), 'LEFT'),
        ]))
        story.append(header_table)
    
    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#059669'), spaceBefore=2, spaceAfter=10))

    data_tab = [
        [
            Paragraph("<b>#</b>", cell_bold),
            Paragraph("<b>CLIENTE / MITTENTE</b>", cell_bold),
            Paragraph("<b>DETTAGLIO ARTICOLI PESATI & LOTTI</b>", cell_bold),
            Paragraph("<b>PESO TOT. (KG)</b>", cell_bold),
            Paragraph("<b>N° LOTTO</b>", cell_bold)
        ]
    ]

    for idx, o in enumerate(ordini_confezionati, 1):
        prods_str = "<br/>".join([
            f"• {p.get('nome_articolo') or p.get('codice_articolo')}: {p.get('quantita')} {p.get('unita_di_misura')} ({p.get('grammatura','-')})"
            for p in o.get('prodotti', [])
        ])
        peso_raw = o.get('peso_reale')
        if peso_raw is not None and str(peso_raw).strip() not in ('', '-'):
            peso_str = f"<b>{_safe_float(peso_raw):.2f} KG</b>"
        else:
            peso_str = "<b>-</b>"
        data_tab.append([
            Paragraph(f"#{idx}", cell_norm),
            Paragraph(f"<b>{o.get('mittente','')}</b><br/><font size=7 color='#666666'>{o.get('note_ordine','')}</font>", cell_norm),
            Paragraph(prods_str or "-", cell_norm),
            Paragraph(peso_str, cell_bold),
            Paragraph(f"<b>{o.get('numero_lotto') or '-'}</b>", cell_bold)
        ])

    table = Table(data_tab, colWidths=[1.0*cm, 4.5*cm, 7.5*cm, 2.5*cm, 2.5*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#d1fae5')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#a7f3d0')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(table)

    doc.build(story)
    return buffer.getvalue()

def genera_pdf_ordini_generale(data_str: str, ordini: list) -> bytes:
    """Genera il PDF riepilogativo con la lista di tutti gli ordini per la preparazione."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm
    )
    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=colors.HexColor('#4e2a1e')
    )
    sub_style = ParagraphStyle(
        'DocSubTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=colors.HexColor('#7d5236')
    )
    cell_bold = ParagraphStyle(
        'CellBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10, leading=12, textColor=colors.HexColor('#1c1917')
    )
    cell_norm = ParagraphStyle(
        'CellNorm', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=12, textColor=colors.HexColor('#1c1917')
    )

    data_formatted = formatta_data_it(data_str) if data_str else "Tutti gli ordini"

    if os.path.exists(LOGO_PATH):
        img = Image(LOGO_PATH, width=2.5*cm, height=2.5*cm)
        img.hAlign = 'LEFT'
        header_text = [
            Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style),
            Spacer(1, 0.1*cm),
            Paragraph(f"RIEPILOGO GENERALE ORDINI CLIENTI — CONSEGNA: {data_formatted}", sub_style),
            Paragraph(f"Generato il: {datetime.now().strftime('%d/%m/%Y alle %H:%M')}", styles['Italic'])
        ]
        header_table = Table([[img, header_text]], colWidths=[3.0*cm, 15.0*cm])
        story.append(header_table)
    else:
        story.append(Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style))
        story.append(Paragraph(f"RIEPILOGO GENERALE ORDINI CLIENTI — CONSEGNA: {data_formatted}", sub_style))

    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#d97706'), spaceBefore=1, spaceAfter=12))

    data_tab = [
        [
            Paragraph("<b>CLIENTE</b>", cell_bold),
            Paragraph("<b>ARTICOLI ORDINATI</b>", cell_bold),
            Paragraph("<b>NOTE / DETTAGLI</b>", cell_bold)
        ]
    ]

    for o in ordini:
        prods_str = "<br/>".join([f"• {p.get('nome_articolo') or p.get('codice_articolo')}: <b>{p.get('quantita')} {p.get('unita_di_misura')}</b>" for p in o.get('prodotti', [])])
        data_tab.append([
            Paragraph(f"<b>{o.get('mittente','')}</b>", cell_bold),
            Paragraph(prods_str, cell_norm),
            Paragraph(o.get("note_ordine") or "-", cell_norm)
        ])

    table = Table(data_tab, colWidths=[5.0*cm, 8.0*cm, 5.0*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#fef3c7')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#fde68a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(table)

    doc.build(story)
    return buffer.getvalue()