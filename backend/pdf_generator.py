import io
import os
import sys
import subprocess
import logging
import re
from datetime import datetime
from typing import Optional
from xml.sax.saxutils import escape as _xml_escape
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm

LOGO_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "images", "logo.png"))

def _clean_original_text(text: Optional[str]) -> str:
    """Ripulisce il testo originale da tag tecnici per renderlo leggibile."""
    if not text:
        return ""
    clean = str(text)
    clean = re.sub(r'🎙️\s*\[VOCALE TRASCRITTO\]:\s*', '', clean)
    clean = re.sub(r'\[Parser Locale di Riserva\]\s*', '', clean)
    clean = re.sub(r'\[Integrazione/Correzione\]:\s*', '\n+ ', clean)
    return clean.strip()

def _safe_text(value) -> str:
    """Esegue l'escape XML di qualunque testo LIBERO."""
    if value is None:
        return ""
    return _xml_escape(str(value))

def apri_file_nativo_os(filepath: str) -> bool:
    """Apre nativamente 1-Click il file PDF generato."""
    if not filepath or not os.path.exists(filepath):
        return False
    try:
        if sys.platform.startswith('win'):
            getattr(os, "startfile")(filepath)
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

    data_table = [
        [
            Paragraph("CODICE", header_cell_style),
            Paragraph("PRODOTTO DA PRODURRE", header_cell_style),
            Paragraph("QUANTITÀ TOT.", header_cell_style),
            Paragraph("ORDINI", header_cell_style)
        ]
    ]

    for prod in lista_produzione:
        tot_qta = _safe_float(prod.get("quantita_totale", prod.get("totale_kg", 0)))
        n_ordini = _safe_float(prod.get("numero_ordini", prod.get("totale_pezzi", 0)))
        
        um = str(prod.get("unita_di_misura", "KG")).strip().upper()
        
        if um in ["PEZZI", "PZ", "COPPIA", "COPPIE"]:
            qta_str = f"<b>{int(tot_qta)} {um}</b>"
        else:
            qta_str = f"<b>{tot_qta:.2f} {um}</b>"

        data_table.append([
            Paragraph(_safe_text(prod.get("codice_articolo", prod.get("codice", ""))), cell_style),
            Paragraph(_safe_text(prod.get("nome_prodotto", prod.get("nome", ""))), cell_style),
            Paragraph(qta_str, cell_style),
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
    msg_style = ParagraphStyle(
        'MsgStyle', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=9, leading=11, textColor=colors.HexColor('#4b5563')
    )

    data_cons_formatted = formatta_data_it(ordine.get('data_consegna',''))

    if os.path.exists(LOGO_PATH):
        img = Image(LOGO_PATH, width=2.5*cm, height=2.5*cm)
        img.hAlign = 'LEFT'
        header_text = [
            Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style),
            Spacer(1, 0.1*cm),
            Paragraph(f"RICEVUTA ORDINE E BOLLA CONFEZIONAMENTO #{ordine.get('id','')}", sub_style),
            Paragraph(f"Cliente: <b>{_safe_text(ordine.get('mittente',''))}</b> | Data Consegna: <b>{data_cons_formatted}</b>", sub_style)
        ]
        header_table = Table([[img, header_text]], colWidths=[3.0*cm, 15.0*cm])
        story.append(header_table)
    else:
        story.append(Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style))
        story.append(Paragraph(f"RICEVUTA ORDINE #{ordine.get('id','')} - {_safe_text(ordine.get('mittente',''))}", sub_style))

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

    for p in ordine.get('prodotti', []):
        grammatura_str = p.get('grammatura') or ""
        lotto_str = p.get('numero_lotto') or ordine.get('numero_lotto') or ""

        data_tab.append([
            Paragraph(str(p.get("codice_articolo", "")), cell_norm),
            Paragraph(_safe_text(p.get("nome_articolo", "") or p.get("codice_articolo", "")), cell_norm),
            Paragraph(f"{p.get('quantita', 1.0)} {_safe_text(p.get('unita_di_misura', 'kg'))}", cell_norm),
            Paragraph(f"<b>{_safe_text(grammatura_str)}</b>", cell_bold),
            Paragraph(f"<b>{_safe_text(lotto_str)}</b>", cell_bold)
        ])

    table = Table(data_tab, colWidths=[3.0*cm, 7.0*cm, 2.5*cm, 3.0*cm, 2.5*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#fef3c7')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#fde68a')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(table)

    story.append(Spacer(1, 0.4*cm))

    if ordine.get("note_ordine"):
        story.append(Paragraph(f"<b>Note Ordine/Resi:</b> {_safe_text(ordine.get('note_ordine'))}", sub_style))
        story.append(Spacer(1, 0.2*cm))

    testo_orig = ordine.get("testo_originale") or ""
    if testo_orig and "Inserimento Manuale" not in testo_orig:
        clean_msg = _clean_original_text(testo_orig)
        story.append(Paragraph(f"<b>Messaggio WhatsApp Originale:</b><br/>\"{_safe_text(clean_msg)}\"", msg_style))

    doc.build(story)
    return buffer.getvalue()

def genera_pdf_filoni(data_str: str, clienti_filoni: list) -> bytes:
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
            Paragraph("<b>FILONI RICHIESTI</b>", cell_bold),
            Paragraph("<b>PESO REALE (SOMMA)</b>", cell_bold),
            Paragraph("<b>N° LOTTO</b>", cell_bold),
            Paragraph("<b>NOTE CUCINA</b>", cell_bold)
        ]
    ]

    for c in clienti_filoni:
        prods_str = "<br/>".join([f"• {_safe_text(p.get('nome_articolo') or p.get('codice_articolo'))}: <b>{p.get('quantita')} {_safe_text(p.get('unita_di_misura'))}</b>" for p in c.get('prodotti_filoni', [])])
        data_tab.append([
            Paragraph(f"<b>{_safe_text(c.get('mittente',''))}</b>", cell_bold),
            Paragraph(prods_str, cell_norm),
            Paragraph("", cell_norm), # Campo vuoto per scrivere la grammatura a penna
            Paragraph("", cell_norm), # Campo vuoto per scrivere il lotto a penna
            Paragraph(_safe_text(c.get("note_ordine")) or "-", cell_norm)
        ])

    table = Table(data_tab, colWidths=[4.0*cm, 5.5*cm, 3.0*cm, 2.5*cm, 3.0*cm])
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
            f"• {_safe_text(p.get('nome_articolo') or p.get('codice_articolo'))}: {p.get('quantita')} {_safe_text(p.get('unita_di_misura'))} ({_safe_text(p.get('grammatura') or 'Da pesare')})"
            for p in o.get('prodotti', [])
        ])
        peso_raw = o.get('peso_reale')
        if peso_raw is not None and str(peso_raw).strip() not in ('', '-'):
            peso_str = f"<b>{_safe_float(peso_raw):.2f} KG</b>"
        else:
            peso_str = "<b>-</b>"
        data_tab.append([
            Paragraph(f"#{idx}", cell_norm),
            Paragraph(f"<b>{_safe_text(o.get('mittente',''))}</b><br/><font size=7 color='#666666'>{_safe_text(o.get('note_ordine',''))}</font>", cell_norm),
            Paragraph(prods_str or "-", cell_norm),
            Paragraph(peso_str, cell_bold),
            Paragraph(f"<b>{_safe_text(o.get('numero_lotto') or '-')}</b>", cell_bold)
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
        'CellBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=11, textColor=colors.HexColor('#1c1917')
    )
    cell_norm = ParagraphStyle(
        'CellNorm', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=11, textColor=colors.HexColor('#1c1917')
    )
    msg_style = ParagraphStyle(
        'MsgStyle', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=8, leading=10, textColor=colors.HexColor('#2563eb')
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
            Paragraph("<b>ARTICOLO E Q.TÀ</b>", cell_bold),
            Paragraph("<b>GRAMMATURA</b>", cell_bold),
            Paragraph("<b>N° LOTTO</b>", cell_bold),
            Paragraph("<b>NOTE / MSG</b>", cell_bold)
        ]
    ]

    table_style = [
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#fef3c7')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#fde68a')),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]

    row_idx = 1
    for o in ordini:
        start_row = row_idx
        cliente_name = _safe_text(o.get('mittente',''))
        note = _safe_text(o.get('note_ordine', ''))
        
        testo_orig = o.get("testo_originale") or ""
        clean_msg = ""
        if testo_orig and "Inserimento Manuale" not in testo_orig:
            clean_msg = _safe_text(_clean_original_text(testo_orig))
        
        notes_html = ""
        if note and note != "-":
            notes_html += f"<b>Note:</b> {note}<br/><br/>"
        if clean_msg:
            notes_html += f"<i>\"{clean_msg}\"</i>"
        if not notes_html:
            notes_html = "-"

        prodotti = o.get('prodotti', [])
        end_row = start_row + max(1, len(prodotti)) - 1

        if not prodotti:
            data_tab.append([
                Paragraph(f"<b>{cliente_name}</b>", cell_bold),
                Paragraph("-", cell_norm),
                Paragraph("", cell_norm),
                Paragraph("", cell_norm),
                Paragraph(notes_html, msg_style)
            ])
            row_idx += 1
        else:
            for i, p in enumerate(prodotti):
                c_name = f"<b>{cliente_name}</b>" if i == 0 else ""
                c_notes = notes_html if i == 0 else ""
                
                art_str = f"{p.get('quantita')} {_safe_text(p.get('unita_di_misura'))} <b>{_safe_text(p.get('nome_articolo') or p.get('codice_articolo'))}</b>"
                
                grammatura_str = p.get('grammatura') or ""
                lotto_str = p.get('numero_lotto') or o.get('numero_lotto') or ""

                data_tab.append([
                    Paragraph(c_name, cell_bold),
                    Paragraph(art_str, cell_norm),
                    Paragraph(f"<b>{_safe_text(grammatura_str)}</b>", cell_bold),
                    Paragraph(f"<b>{_safe_text(lotto_str)}</b>", cell_bold),
                    Paragraph(c_notes, msg_style)
                ])
                row_idx += 1
                
        if end_row > start_row:
            table_style.append(('SPAN', (0, start_row), (0, end_row)))
            table_style.append(('SPAN', (4, start_row), (4, end_row)))
            table_style.append(('VALIGN', (0, start_row), (0, end_row), 'TOP'))
            table_style.append(('VALIGN', (4, start_row), (4, end_row), 'TOP'))

        table_style.append(('LINEBELOW', (0, end_row), (-1, end_row), 1.5, colors.HexColor('#d97706')))

    table = Table(data_tab, colWidths=[3.5*cm, 5.5*cm, 2.5*cm, 2.5*cm, 4.0*cm])
    table.setStyle(TableStyle(table_style))
    story.append(table)

    doc.build(story)
    return buffer.getvalue()

def genera_pdf_sole(data_str: str, ordini_sole: list) -> bytes:
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
            Paragraph(f"SCHEDA PREPARAZIONE SOLE 365 — {data_formatted}", sub_style),
            Paragraph(f"Generato il: {datetime.now().strftime('%d/%m/%Y alle %H:%M')}", styles['Italic'])
        ]
        header_table = Table([[img, header_text]], colWidths=[3.0*cm, 15.0*cm])
        story.append(header_table)
    else:
        story.append(Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style))
        story.append(Paragraph(f"SCHEDA PREPARAZIONE SOLE 365 — {data_formatted}", sub_style))

    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#d97706'), spaceBefore=1, spaceAfter=12))

    data_tab = [
        [
            Paragraph("<b>PUNTO VENDITA SOLE 365</b>", cell_bold),
            Paragraph("<b>ARTICOLI E QUANTITÀ</b>", cell_bold),
            Paragraph("<b>PESO REALE</b>", cell_bold),
            Paragraph("<b>N° LOTTO</b>", cell_bold),
            Paragraph("<b>NOTE</b>", cell_bold)
        ]
    ]

    for o in ordini_sole:
        prods_str = "<br/>".join([f"• {_safe_text(p.get('nome_articolo') or p.get('codice_articolo'))}: <b>{p.get('quantita')} {_safe_text(p.get('unita_di_misura'))}</b>" for p in o.get('prodotti', [])])
        data_tab.append([
            Paragraph(f"<b>{_safe_text(o.get('mittente',''))}</b>", cell_bold),
            Paragraph(prods_str, cell_norm),
            Paragraph("", cell_norm), # Campo vuoto per scrivere la grammatura a penna
            Paragraph("", cell_norm), # Campo vuoto per scrivere il lotto a penna
            Paragraph(_safe_text(o.get("note_ordine")) or "-", cell_norm)
        ])

    table = Table(data_tab, colWidths=[4.0*cm, 5.5*cm, 2.5*cm, 2.5*cm, 3.5*cm])
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

def genera_pdf_produzione_sole_totale(data_produzione: str, lista_produzione: list) -> bytes:
    """Genera la distinta A4 PDF per la produzione totale aggregata riservata agli ordini Sole 365."""
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
        textColor=colors.HexColor('#b45309')
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

    if os.path.exists(LOGO_PATH):
        img = Image(LOGO_PATH, width=2.5*cm, height=2.5*cm)
        img.hAlign = 'LEFT'
        
        header_text = [
            Paragraph("CASEIFICIO PETRUZZI DAL 1923", title_style),
            Spacer(1, 0.1*cm),
            Paragraph(f"DISTINTA DI PRODUZIONE SOLE 365 — GIORNATA: {data_formatted}", subtitle_style),
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
        story.append(Paragraph(f"DISTINTA DI PRODUZIONE SOLE 365 — GIORNATA: {data_formatted}", subtitle_style))

    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#d97706'), spaceBefore=1, spaceAfter=15))

    data_table = [
        [
            Paragraph("CODICE", header_cell_style),
            Paragraph("PRODOTTO DA PRODURRE (GRUPPO SOLE 365)", header_cell_style),
            Paragraph("QUANTITÀ TOT.", header_cell_style),
            Paragraph("PUNTI VENDITA / ORDINI", header_cell_style)
        ]
    ]

    for prod in lista_produzione:
        tot_qta = _safe_float(prod.get("quantita_totale", prod.get("totale_kg", 0)))
        n_ordini = _safe_float(prod.get("numero_ordini", 0))
        clienti_list = prod.get("clienti", [])
        
        clienti_str = ""
        if clienti_list:
            clienti_str = f"<br/><font size='8' color='#78350f'>({', '.join(clienti_list[:3])}{'...' if len(clienti_list)>3 else ''})</font>"
        
        um = str(prod.get("unita_di_misura", "KG")).strip().upper()
        
        if um in ["PEZZI", "PZ", "COPPIA", "COPPIE"]:
            qta_str = f"<b>{int(tot_qta)} {um}</b>"
        else:
            qta_str = f"<b>{tot_qta:.2f} {um}</b>"

        data_table.append([
            Paragraph(_safe_text(prod.get("codice_articolo", "")), cell_style),
            Paragraph(_safe_text(prod.get("nome_prodotto", "")), cell_style),
            Paragraph(qta_str, cell_style),
            Paragraph(f"<b>{n_ordini:.0f} ord.</b>{clienti_str}", cell_style)
        ])

    if len(data_table) == 1:
        data_table.append([
            Paragraph("-", cell_style),
            Paragraph("Nessun articolo da produrre per il Gruppo Sole 365 in questa data.", cell_style),
            Paragraph("-", cell_style),
            Paragraph("-", cell_style)
        ])

    table = Table(data_table, colWidths=[3.2*cm, 7.8*cm, 3.2*cm, 3.8*cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#92400e')),
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