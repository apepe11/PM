# -*- mode: python ; coding: utf-8 -*-
import os
import sys

block_cipher = None

# Cartelle e file di dati da includere nell'eseguibile PyInstaller (sys._MEIPASS)
added_datas = [
    ('frontend/dist', 'frontend/dist'),
    ('catalogo', 'catalogo'),
    ('images', 'images'),
]

# Moduli e librerie dinamiche da includere per evitare errori di importazione
hidden_imports = [
    # Uvicorn & Web Server ASGI
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.http.httptools_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.protocols.websockets.wsproto_impl',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    
    # FastAPI & Starlette
    'fastapi',
    'fastapi.staticfiles',
    'fastapi.responses',
    'fastapi.middleware',
    'fastapi.middleware.cors',
    'starlette',
    'starlette.responses',
    'starlette.middleware',
    'starlette.middleware.cors',
    'starlette.staticfiles',
    'pydantic',
    
    # Database & HTTP
    'aiosqlite',
    'sqlite3',
    'httpx',
    'httpcore',
    'h11',
    'anyio',
    'dotenv',
    'requests',
    
    # AI Engine & PDF Generator
    'groq',
    'reportlab',
    'reportlab.lib',
    'reportlab.platypus',
    'reportlab.pdfgen',
    'reportlab.graphics',
    
    # Moduli interni del gestionale
    'backend',
    'backend.paths',
    'backend.db',
    'backend.pdf_generator',
    'backend.ai_parser',
    'backend.whatsapp'
]

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=[],
    datas=added_datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='PetruzziManager',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
