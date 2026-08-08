import React, { useState, useEffect } from 'react';
import { ShieldCheck, Download, RefreshCw, Lock, Activity, Scale, CheckCircle2, FileText, Database, PackageCheck, AlertCircle } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

export default function AdminRemoteHub() {
  const [token, setToken] = useState(
    new URLSearchParams(window.location.search).get('token') || localStorage.getItem('petruzzi_admin_token') || 'petruzzi-secret-key'
  );
  const [inputToken, setInputToken] = useState(token);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchAdminOverview = async (authToken) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/overview?token=${encodeURIComponent(authToken)}&data=${selectedDate}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setIsAuthorized(true);
        localStorage.setItem('petruzzi_admin_token', authToken);
      } else {
        setIsAuthorized(false);
      }
    } catch (e) {
      console.error("Errore fetch admin overview:", e);
      setIsAuthorized(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAdminOverview(token);
    }
  }, [selectedDate]);

  const handleLogin = (e) => {
    e.preventDefault();
    setToken(inputToken);
    fetchAdminOverview(inputToken);
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
        <div className="petruzzi-card p-8 rounded-3xl max-w-md w-full border border-petruzzi-300 text-center space-y-6 bg-white/95 shadow-xl">
          <div className="p-4 bg-petruzzi-100 text-petruzzi-800 rounded-2xl border border-petruzzi-300 w-16 h-16 mx-auto flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-black text-petruzzi-950">Hub Amministratore Remoto</h2>
            <p className="text-xs text-petruzzi-700 mt-1">Inserisci la chiave di sicurezza o il token riservato per accedere al controllo produzione.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Inserisci Token o Chiave (es. petruzzi-secret-key)"
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              className="w-full bg-white border border-petruzzi-300 rounded-xl px-4 py-3 text-sm text-petruzzi-950 placeholder-petruzzi-600 focus:outline-none focus:border-petruzzi-700 text-center font-mono font-bold shadow-inner"
            />
            <button
              type="submit"
              className="w-full py-3 bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-sm rounded-xl shadow-lg transition"
            >
              🔑 SBLOCCA ACCESSO REMOTO
            </button>
          </form>
        </div>
      </div>
    );
  }

  const {
    n_ordini_totali = 0,
    n_confezionati = 0,
    n_confermati = 0,
    percentuale_completamento = 0,
    totale_kg = 0,
    totale_pezzi = 0,
    db_size_bytes = 0,
    produzione_aggregata = [],
    ordini = [],
    timestamp_ultimo_aggiornamento = ''
  } = data || {};

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-petruzzi-950 p-4 sm:p-6 space-y-8 font-sans">
      
      {/* Admin Top Header Banner */}
      <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-300">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-black text-petruzzi-950">Hub Remoto Titolare & Controllo Produzione</h1>
              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-black uppercase">
                Connesso da Remoto
              </span>
            </div>
            <p className="text-xs text-petruzzi-700">Ultimo aggiornamento SQL: {timestamp_ultimo_aggiornamento}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-3 py-2 text-xs outline-none shadow-sm"
          />
          <span className="text-xs font-black text-petruzzi-900 bg-white px-3 py-2 rounded-xl border border-petruzzi-300 shadow-sm font-mono">
            {formatDateIT(selectedDate)}
          </span>
          <button
            onClick={() => fetchAdminOverview(token)}
            className="p-2.5 bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 rounded-xl border border-petruzzi-300 transition"
            title="Rinfresca Dati"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-petruzzi-700' : ''}`} />
          </button>
          
          <a
            href={`/api/admin/backup-db?token=${encodeURIComponent(token)}`}
            download
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shadow-md transition"
          >
            <Download className="w-4 h-4" />
            <span>BACKUP DB (SQLite)</span>
          </a>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Weight */}
        <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-2">
          <span className="text-xs font-bold text-petruzzi-700 uppercase tracking-wider block">Totale Formaggi Lavorati</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-petruzzi-800">{totale_kg} KG</span>
            <span className="text-xs text-petruzzi-700 font-semibold">{totale_pezzi} PZ</span>
          </div>
          <span className="text-[10px] text-petruzzi-600 block">Produzione Target del Giorno</span>
        </div>

        {/* Total Orders */}
        <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-2">
          <span className="text-xs font-bold text-petruzzi-700 uppercase tracking-wider block">Ordini Acquisiti</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-petruzzi-950">{n_ordini_totali}</span>
            <span className="text-xs text-emerald-800 font-bold">{n_confermati} Confermati</span>
          </div>
          <span className="text-[10px] text-petruzzi-600 block">Ricevuti via WhatsApp ed Inseriti</span>
        </div>

        {/* Progress Packaging Bar */}
        <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-2">
          <span className="text-xs font-bold text-petruzzi-700 uppercase tracking-wider block">Stato Confezionamento</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-800">{percentuale_completamento}%</span>
            <span className="text-xs text-petruzzi-700 font-bold">{n_confezionati} / {n_ordini_totali} Confezionati</span>
          </div>
          <div className="w-full bg-petruzzi-100 rounded-full h-2 overflow-hidden border border-petruzzi-200">
            <div className="bg-emerald-700 h-full transition-all duration-500" style={{ width: `${percentuale_completamento}%` }}></div>
          </div>
        </div>

        {/* DB Health */}
        <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-2">
          <span className="text-xs font-bold text-petruzzi-700 uppercase tracking-wider block">Database Locale & Backup</span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-black text-petruzzi-950">{(db_size_bytes / 1024).toFixed(1)} KB</span>
            <span className="text-xs text-emerald-800 font-bold flex items-center space-x-1">
              <Database className="w-3.5 h-3.5 text-emerald-700" />
              <span>Attivo</span>
            </span>
          </div>
          <a
            href={`/api/pdf/produzione?data=${selectedDate}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-petruzzi-800 hover:underline flex items-center space-x-1"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Scarica Report PDF Casaro</span>
          </a>
        </div>

      </div>

      {/* Production Breakdown & Orders Feed Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Cheese Production Breakdown */}
        <div className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
          <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
            <PackageCheck className="w-5 h-5 text-petruzzi-700" />
            <span>Distinta Produzione Lavorazione Casaro</span>
          </h3>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 divide-y divide-petruzzi-200">
            {produzione_aggregata.length === 0 ? (
              <p className="text-xs text-petruzzi-600 italic py-4">Nessun prodotto presente in distinta.</p>
            ) : (
              produzione_aggregata.map((item, idx) => (
                <div key={idx} className="pt-2.5 first:pt-0 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-petruzzi-950 block">{item.nome_articolo || item.codice_articolo}</span>
                    <span className="text-[10px] text-petruzzi-700">Cod: {item.codice_articolo} • Ordini correlati: {item.numero_ordini_coinvolti}</span>
                  </div>

                  <span className="font-black text-petruzzi-800 bg-petruzzi-100 px-3 py-1 rounded-xl border border-petruzzi-300 text-sm">
                    {item.quantita_totale} {item.unita_di_misura}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Client Orders Stream */}
        <div className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
          <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
            <Activity className="w-5 h-5 text-emerald-700" />
            <span>Stato Avanzamento Ordini Clienti</span>
          </h3>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {ordini.length === 0 ? (
              <p className="text-xs text-petruzzi-600 italic py-4">Nessun ordine presente per questa data.</p>
            ) : (
              ordini.map((ord) => {
                const isConf = ord.stato_confezionamento === 'CONFEZIONATO';
                return (
                  <div key={ord.id} className="p-3 bg-petruzzi-50 rounded-xl border border-petruzzi-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-petruzzi-950 block">{ord.mittente}</span>
                      <span className="text-[10px] text-petruzzi-700">
                        {ord.prodotti?.length || 0} articoli • Consegna: {formatDateIT(ord.data_consegna)}
                      </span>
                    </div>

                    <div className="text-right space-y-1">
                      {isConf ? (
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-black uppercase">
                          ✅ Confezionato
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-bold uppercase">
                          In Lavorazione
                        </span>
                      )}
                      {ord.numero_lotto && (
                        <span className="block text-[10px] font-mono text-petruzzi-700">Lotto: {ord.numero_lotto}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
