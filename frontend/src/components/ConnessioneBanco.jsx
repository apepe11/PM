import React, { useState, useEffect } from 'react';
import { QrCode, Wifi, WifiOff, RefreshCw, Power, ShieldCheck, MessageSquare, Terminal, CheckCircle2, AlertTriangle, Smartphone, Trash2, RotateCcw, ShieldAlert, Sparkles, ArrowRight } from 'lucide-react';

export default function ConnessioneBanco() {
  const [waStatus, setWaStatus] = useState({
    stato_connessione: 'DISCONNESSO',
    qr_code_base64: null,
    account_banco: null,
    data_connessione: null,
    ultimo_messaggio: null,
    eventi_log: []
  });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data);
      }
    } catch (e) {
      console.error("Errore fetch whatsapp status:", e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' });
      if (res.ok) {
        setToast("🚀 Avvio connessione WhatsApp Banco in corso...");
        setTimeout(() => setToast(''), 4000);
        fetchStatus();
      }
    } catch (e) {
      alert("Errore durante l'avvio della connessione.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Sei sicuro di voler disconnettere l'account WhatsApp del Banco?")) return;
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/disconnect', { method: 'POST' });
      if (res.ok) {
        setToast("🔌 Account Banco disconnesso.");
        setTimeout(() => setToast(''), 4000);
        fetchStatus();
      }
    } catch (e) {
      alert("Errore durante la disconnessione.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetBanco = async () => {
    setShowResetModal(false);
    setLoading(true);
    setToast("🗑️ Dimentico il Banco attuale e resetto la sessione...");
    try {
      const res = await fetch('/api/whatsapp/reset', { method: 'POST' });
      if (res.ok) {
        setToast("✨ Banco azzerato! Generazione nuovo QR Code per il nuovo Banco...");
        setTimeout(() => setToast(''), 6000);
        fetchStatus();
      } else {
        let errMsg = "Errore durante il reset del Banco.";
        try {
          const errData = await res.json();
          if (errData.detail) errMsg = errData.detail;
        } catch (_) {}
        alert(errMsg);
      }
    } catch (e) {
      alert("Errore di connessione durante la procedura di reset.");
    } finally {
      setLoading(false);
    }
  };

  const isConnected = waStatus.stato_connessione === 'CONNESSO';
  const isWaitingQR = waStatus.stato_connessione === 'IN_ATTESA_QR';

  return (
    <div className="space-y-6 animate-fadeIn font-sans text-petruzzi-950">
      
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-700 text-white font-black px-6 py-3 rounded-2xl shadow-2xl animate-bounce">
          {toast}
        </div>
      )}

      {/* Header Banner */}
      <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className={`p-3 rounded-xl border ${
            isConnected
              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
              : isWaitingQR
              ? 'bg-amber-100 text-amber-900 border-amber-300 animate-pulse'
              : 'bg-red-100 text-red-800 border-red-300'
          }`}>
            {isConnected ? <Wifi className="w-8 h-8" /> : <WifiOff className="w-8 h-8" />}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-black text-petruzzi-950">Connessione Banco WhatsApp</h1>
              {isConnected && (
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-black uppercase flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span>
                  <span>CONNESSO ED ATTIVO</span>
                </span>
              )}
              {isWaitingQR && (
                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-bold uppercase">
                  ⏳ SCANSIONA QR CODE
                </span>
              )}
              {!isConnected && !isWaitingQR && (
                <span className="px-2.5 py-0.5 bg-red-100 text-red-800 border border-red-300 rounded-full text-[10px] font-bold uppercase">
                  🔴 SCONNESSO
                </span>
              )}
            </div>
            <p className="text-xs text-petruzzi-700 mt-0.5">
              Connetti o gestisci l'account WhatsApp aziendale del Banco per l'elaborazione automatica degli ordini.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchStatus}
            className="p-2.5 bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 rounded-xl border border-petruzzi-300 transition"
            title="Aggiorna Stato"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-petruzzi-700' : ''}`} />
          </button>
          
          <button
            onClick={() => setShowResetModal(true)}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-extrabold text-xs border border-amber-300 transition shadow-sm"
            title="Scollega e dimentica questo Banco per registrarne uno nuovo"
          >
            <Trash2 className="w-4 h-4 text-amber-800" />
            <span>DIMENTICA BANCO</span>
          </button>

          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shadow-md transition transform active:scale-95"
            >
              <Power className="w-4 h-4" />
              <span>CONNETTI BANCO</span>
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-black text-xs shadow-md transition transform active:scale-95"
            >
              <WifiOff className="w-4 h-4" />
              <span>DISCONNETTI</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: QR Scan Section & Event Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Box: QR Display & Connection Info */}
        <div className="lg:col-span-6 petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2 border-b border-petruzzi-200 pb-3">
              <QrCode className="w-5 h-5 text-petruzzi-800" />
              <span>Stato Account & Scansione QR Code</span>
            </h3>

            {isConnected ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-700 rounded-full mx-auto flex items-center justify-center border-2 border-emerald-300 shadow-inner">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-petruzzi-950">Account Banco Connesso</h4>
                  <p className="text-xs text-petruzzi-700 mt-1">{waStatus.account_banco || "Caseificio Petruzzi Banco"}</p>
                  <p className="text-[11px] text-petruzzi-600 font-mono mt-0.5">Sessione avviata: {waStatus.data_connessione || 'Oggi'}</p>
                </div>
                <div className="p-3 bg-petruzzi-50 rounded-xl border border-petruzzi-200 text-xs text-petruzzi-800 max-w-sm mx-auto">
                  <span>I nuovi messaggi di testo e vocali in arrivo su questo account vengono trascritti ed elaborati automaticamente dall'IA.</span>
                </div>
              </div>
            ) : isWaitingQR && waStatus.qr_code_base64 ? (
              <div className="py-4 text-center space-y-4">
                <div className="p-3 bg-petruzzi-50 rounded-xl border border-petruzzi-300 inline-block shadow-md">
                  <img
                    src={`data:image/png;base64,${waStatus.qr_code_base64}`}
                    alt="QR Code WhatsApp Web"
                    className="w-56 h-56 mx-auto object-contain rounded-lg"
                  />
                </div>
                <div className="space-y-1 text-xs text-petruzzi-800">
                  <p className="font-extrabold text-petruzzi-950 flex items-center justify-center space-x-1">
                    <Smartphone className="w-4 h-4 text-petruzzi-700" />
                    <span>Inquadra il QR Code dallo Smartphone Banco:</span>
                  </p>
                  <ol className="text-[11px] text-petruzzi-700 space-y-0.5 text-left max-w-xs mx-auto list-decimal list-inside font-medium">
                    <li>Apri WhatsApp sul telefono del Banco</li>
                    <li>Tocca <strong>Menu</strong> o <strong>Impostazioni</strong></li>
                    <li>Seleziona <strong>Dispositivi collegati</strong></li>
                    <li>Inquadra questo codice QR per connetterti</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center space-y-4">
                <div className="w-16 h-16 bg-petruzzi-100 text-petruzzi-800 rounded-full mx-auto flex items-center justify-center border border-petruzzi-300">
                  <Power className="w-8 h-8 text-petruzzi-700" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-petruzzi-950">WhatsApp Banco Non Inizializzato</h4>
                  <p className="text-xs text-petruzzi-700 mt-1 max-w-xs mx-auto">
                    Clicca sul pulsante sottostante per avviare il motore WhatsApp ed effettuare il collegamento.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-petruzzi-200 space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleConnect}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs uppercase tracking-wider shadow-md transition transform active:scale-95 flex items-center justify-center space-x-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>🔄 {isConnected ? 'RICONNETTI ACCOUNT BANCO' : 'AVVIA CONNESSIONE BANCO'}</span>
              </button>

              <button
                onClick={() => setShowResetModal(true)}
                disabled={loading}
                className="py-3 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs shadow-sm transition flex items-center justify-center space-x-1.5"
                title="Procedura per dimenticare il banco e registrarne uno nuovo"
              >
                <Trash2 className="w-4 h-4 text-amber-800" />
                <span>Dimentica & Registra Nuovo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Box: Real-Time Event Log Terminal */}
        <div className="lg:col-span-6 petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
          <div className="flex items-center justify-between border-b border-petruzzi-200 pb-3">
            <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-petruzzi-700" />
              <span>Registro Eventi Connessione & Messaggi</span>
            </h3>
            <span className="px-2.5 py-0.5 bg-petruzzi-100 text-petruzzi-800 border border-petruzzi-300 rounded-full text-[10px] font-bold">
              LOGS STREAM
            </span>
          </div>

          <div className="bg-petruzzi-950 text-petruzzi-100 rounded-xl p-4 font-mono text-xs max-h-[420px] overflow-y-auto space-y-2 border border-petruzzi-900 shadow-inner">
            {waStatus.eventi_log && waStatus.eventi_log.length === 0 ? (
              <p className="text-petruzzi-400 italic py-4 text-center">Nessun evento registrato. Avvia la connessione per visualizzare i log.</p>
            ) : (
              waStatus.eventi_log.map((logItem, lIdx) => {
                let badgeStyle = "text-amber-400";
                if (logItem.tipo === "SUCCESS") badgeStyle = "text-emerald-400 font-bold";
                if (logItem.tipo === "INCOMING") badgeStyle = "text-sky-300 font-bold";
                if (logItem.tipo === "AUDIO") badgeStyle = "text-purple-300 font-bold";
                if (logItem.tipo === "ERROR" || logItem.tipo === "WARN") badgeStyle = "text-red-400 font-bold";

                return (
                  <div key={lIdx} className="flex flex-col space-y-1 border-b border-petruzzi-900/60 pb-1.5 last:border-0">
                    <div className="flex items-start space-x-2">
                      <span className="text-petruzzi-500 shrink-0">[{logItem.timestamp}]</span>
                      <span className={badgeStyle}>{logItem.testo}</span>
                    </div>
                    {logItem.metadata && Object.keys(logItem.metadata).length > 0 && (
                      <div className="text-petruzzi-400 text-[10px] font-mono pl-8">
                        {Object.entries(logItem.metadata).map(([key, value]) => (
                          value ? <span key={key} className="block">{key}: {String(value)}</span> : null
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>



      {/* Confirmation Modal: Reset Banco */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="petruzzi-card p-6 sm:p-8 rounded-3xl max-w-lg w-full bg-white shadow-2xl border-2 border-amber-400 space-y-6 animate-scaleIn">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl border border-amber-300 shrink-0">
                <ShieldAlert className="w-8 h-8 text-amber-700" />
              </div>
              <div>
                <h2 className="text-xl font-black text-petruzzi-950">Dimenticare l'Account Banco Attuale?</h2>
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mt-0.5">Azione di reset sessione WhatsApp</p>
              </div>
            </div>

            <div className="space-y-3 bg-amber-50/80 p-4 rounded-2xl border border-amber-200 text-xs text-amber-950 leading-relaxed">
              <p className="font-bold">
                ⚠️ Confermi di voler disassociare il dispositivo del Banco?
              </p>
              <ul className="list-disc list-inside space-y-1 text-petruzzi-800">
                <li>La sessione salvata nella cartella <code>whatsapp_session/</code> verrà completamente cancellata.</li>
                <li>Il dispositivo del Banco attualmente connesso perderà l'accesso al sistema.</li>
                <li>Verrà avviato un nuovo browser e generato un nuovo <strong>QR Code</strong> per registrare il nuovo smartphone.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-5 py-2.5 rounded-xl bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 font-bold text-xs border border-petruzzi-300 transition"
              >
                Annulla
              </button>
              <button
                onClick={handleResetBanco}
                className="px-6 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-black text-xs shadow-md transition transform active:scale-95 flex items-center space-x-2 border border-red-900"
              >
                <Trash2 className="w-4 h-4" />
                <span>SÌ, DIMENTICA E REGISTRA NUOVO</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

