import os
import sys
import shutil
import logging

def get_bundle_dir() -> str:
    """
    Restituisce il percorso dei file statici inclusi nel bundle (PyInstaller _MEIPASS)
    oppure la root del progetto durante lo sviluppo locale.
    """
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        return getattr(sys, '_MEIPASS')
    # In sviluppo, la root è la cartella superiore a 'backend'
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def get_data_dir() -> str:
    """
    Restituisce la directory di lavoro reale e persistente (dove risiedono il database SQLite,
    le particolarità clienti modificate, le impostazioni, la cartella reports generati, ecc.).
    """
    return os.getcwd()

def get_static_path(relative_path: str) -> str:
    """
    Restituisce il percorso assoluto di una risorsa statica inclusa nel pacchetto
    (frontend buildato, immagini, catalogo base di default).
    """
    return os.path.abspath(os.path.join(get_bundle_dir(), relative_path))

def get_persistent_path(relative_path: str, default_source_relative: str = None) -> str:
    """
    Restituisce il percorso assoluto di un file o cartella persistente nella cartella reale dell'utente.
    Se il file non esiste ancora nella cartella dell'utente ma è presente un default nel bundle,
    viene copiato automaticamente al primo avvio.
    """
    target_path = os.path.abspath(os.path.join(get_data_dir(), relative_path))
    
    # Se il file non esiste, crea la cartella e copia il default dal bundle se disponibile
    if not os.path.exists(target_path):
        target_dir = os.path.dirname(target_path)
        if target_dir and not os.path.exists(target_dir):
            try:
                os.makedirs(target_dir, exist_ok=True)
            except Exception as e:
                logging.warning(f"Impossibile creare cartella {target_dir}: {e}")

        source_relative = default_source_relative or relative_path
        bundle_source = os.path.abspath(os.path.join(get_bundle_dir(), source_relative))

        if os.path.exists(bundle_source):
            try:
                if os.path.isdir(bundle_source):
                    shutil.copytree(bundle_source, target_path, dirs_exist_ok=True)
                else:
                    shutil.copy2(bundle_source, target_path)
                logging.info(f"📋 Inizializzato file persistente da default: {target_path}")
            except Exception as e:
                logging.warning(f"Impossibile copiare default in {target_path}: {e}")

    return target_path
