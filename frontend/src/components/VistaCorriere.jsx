import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle2, Phone, Calendar, Clock, AlertCircle, RefreshCw, Scale, MessageSquare } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

// Helper per determinare se un prodotto è a peso fisso
const isArticoloPesoFisso = (prod) => {
  if (prod.is_peso_fisso === true || prod.is_peso_fisso === 'true') return true;
  const nome = (prod.nome_articolo || prod.codice_articolo || '').toLowerCase();
  if (nome.includes('0,500kg') || nome.includes('0.500kg') || nome.includes('0,250kg') || nome.includes('0.250kg')) return true;
  if (nome.includes('vaschetta') || nome.includes('conf.') || nome.includes('confezionat')) return true;
  return false;
};

// Card del singolo ordine per la vista corriere
const CorriereOrderCard = ({ ord, onConsegna, isDelivering }) => {
  const [prodotti, setProdotti] = useState(ord.prodotti || []);

  useEffect(() => {
    setProdotti(ord.prodotti || []);
  }, [ord.prodotti]);

  const handlePesoChange = (idx, value) => {
    setProdotti((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], grammatura: value, peso_effettivo: value };
      return copy;
    });
  };

  // Estrazione eventuale numero di telefono per chiamata rapida
  const matchTel = ord.mittente?.match(/(?:\+39|0039)?(\d{9,12})/);
  const telefono = matchTel ? matchTel[1] : null;

  return (
    <div className="bg-white rounded-3xl border-2 border-blue-200 p-5 shadow-lg flex flex-col justify-between transition-all hover:border-blue-400 space-y-4">
      {/* HEADER CARD: NOME CLIENTE & INFO */}
      <div className="flex items-start justify-between gap-3 border-b border-blue-100 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 font-mono font-bold text-[10px]">
              #{ord.id}
            </span>
            {ord.numero_lotto && (
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono font-bold text-[10px]">
                Lotto: {ord.numero_lotto}
              </span>
            )}
          </div>
          <h2 className="text-xl font-black text-slate-900 mt-1 truncate">
            {ord.mittente}
          </h2>
          <div className="flex items-center space-x-2 mt-0.5 text-xs text-slate-500 font-medium">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Consegna: <strong>{formatDateIT(ord.data_consegna)}</strong></span>
          </div>
        </div>

        {telefono && (
          <a
            href={`tel:${telefono}`}
            className="flex items-center justify-center p-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-md active:scale-95 transition"
            title={`Chiama ${telefono}`}
          >
            <Phone className="w-5 h-5 fill-current" />
          </a>
        )}
      </div>

      {/* NOTE ORDINE / INDIRIZZO / ORARI */}
      {ord.note_ordine && (
        <div className="bg-amber-50 rounded-2xl p-3 border border-amber-200 text-xs text-amber-950 flex items-start space-x-2">
          <MessageSquare className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block uppercase text-[10px] text-amber-800">Note Consegna:</span>
            <p className="italic">{ord.note_ordine}</p>
          </div>
        </div>
      )}

      {/* LISTA PRODOTTI & PESI TOUCH-FRIENDLY */}
      <div className="space-y-3">
        <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider block">
          Articoli da Scaricare:
        </span>
        <div className="space-y-2.5">
          {prodotti && prodotti.map((prod, idx) => {
            const isFisso = isArticoloPesoFisso(prod);
            const currentWeight = prod.grammatura || prod.peso_effettivo || '';

            return (
              <div
                key={idx}
                className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-extrabold text-slate-900 text-sm block">
                    {prod.nome_articolo || prod.codice_articolo}
                  </span>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-900 font-bold text-xs">
                      Q.tà: {prod.quantita} {prod.unita_di_misura}
                    </span>
                    {isFisso && (
                      <span className="px-2 py-0.5 rounded-lg bg-slate-200 text-slate-700 font-mono text-[10px] uppercase font-bold">
                        Peso Fisso
                      </span>
                    )}
                  </div>
                </div>

                {/* CONTROLLO PESO REALE */}
                <div className="flex items-center justify-end space-x-2 shrink-0">
                  {isFisso ? (
                    <div className="flex items-center space-x-1.5 px-3 py-2 bg-white rounded-xl border border-slate-300 shadow-sm text-xs font-bold text-slate-700">
                      <Scale className="w-4 h-4 text-slate-400" />
                      <span>{currentWeight || `${prod.quantita} ${prod.unita_di_misura}`}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end w-full sm:w-auto">
                      <label className="text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                        Peso Reale (Kg)
                      </label>
                      <div className="relative flex items-center w-full sm:w-36">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Es. 1.350"
                          value={currentWeight}
                          onChange={(e) => handlePesoChange(idx, e.target.value)}
                          className="w-full h-11 px-3.5 pr-8 text-base font-black text-slate-900 bg-white border-2 border-blue-400 rounded-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm placeholder-slate-400 text-right"
                        />
                        <span className="absolute right-2.5 font-bold text-xs text-slate-400 pointer-events-none">
                          kg
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PULSANTE GIGANTE: SEGNA COME CONSEGNATO */}
      <div className="pt-2">
        <button
          onClick={() => onConsegna(ord.id, prodotti)}
          disabled={isDelivering}
          className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 active:scale-[0.98] text-white font-black text-base rounded-2xl shadow-md transition flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isDelivering ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Registrazione Consegna in corso...</span>
            </>
          ) : (
            <>
              <Truck className="w-6 h-6 stroke-[2.5]" />
              <span>🚚 SEGNA COME CONSEGNATO</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default function VistaCorriere({ ordini = [], selectedDate, onOrderDelivered, showToast }) {
  const [dataFiltro, setDataFiltro] = useState(selectedDate || new Date().toISOString().split('T')[0]);
  const [deliveringId, setDeliveringId] = useState(null);

  useEffect(() => {
    if (selectedDate) {
      setDataFiltro(selectedDate);
    }
  }, [selectedDate]);

  // Filtra solo gli ordini CONFERMATI (pronti per la consegna) per la data selezionata
  const ordiniDaConsegnare = ordini.filter((o) => {
    const isConfermato = o.stato_ordine === 'CONFERMATO';
    const matchData = !dataFiltro || o.data_consegna === dataFiltro;
    const hasProdotti = o.prodotti && o.prodotti.length > 0;
    const isNotCancelled = !o.is_cancelled;
    return isConfermato && matchData && hasProdotti && isNotCancelled;
  });

  const handleConsegna = async (idOrdine, prodottiAggiornati) => {
    setDeliveringId(idOrdine);
    try {
      const res = await fetch(`/api/ordini/${idOrdine}/consegna`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prodotti: prodottiAggiornati })
      });

      if (res.ok) {
        if (showToast) showToast('✅ Consegna registrata con successo!', 'success');
        if (onOrderDelivered) onOrderDelivered();
      } else {
        if (showToast) showToast('Errore durante la registrazione della consegna', 'error');
      }
    } catch (e) {
      console.error(e);
      if (showToast) showToast('Errore di connessione al server', 'error');
    } finally {
      setDeliveringId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 px-3 sm:px-6 py-4">
      {/* HEADER MOBILE-FIRST */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Truck className="w-7 h-7 text-blue-200 stroke-[2.5]" />
            <h1 className="text-2xl font-black tracking-tight">Vista Corriere</h1>
          </div>
          <p className="text-xs text-blue-100 font-medium">
            Gestione consegne e pesi reali da furgone / mobile.
          </p>
        </div>

        {/* SELETTORE DATA RAPIDO */}
        <div className="flex items-center space-x-2 bg-blue-900/60 p-1.5 rounded-2xl border border-blue-400/30">
          <Calendar className="w-4 h-4 text-blue-200 ml-2" />
          <input
            type="date"
            value={dataFiltro}
            onChange={(e) => setDataFiltro(e.target.value)}
            className="bg-transparent text-white font-bold text-xs py-1 px-2 outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* STATS BANNER */}
      <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-600">
        <span>
          Data selezionata: <strong className="text-blue-900">{formatDateIT(dataFiltro)}</strong>
        </span>
        <span className="px-3 py-1 bg-blue-100 text-blue-900 rounded-full font-black text-[11px]">
          📦 {ordiniDaConsegnare.length} Consegne da completare
        </span>
      </div>

      {/* LISTA CARD ORDINI */}
      {ordiniDaConsegnare.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {ordiniDaConsegnare.map((ord) => (
            <CorriereOrderCard
              key={ord.id}
              ord={ord}
              onConsegna={handleConsegna}
              isDelivering={deliveringId === ord.id}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-slate-200 shadow-sm space-y-4 my-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 shadow-inner">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">
              Nessuna consegna in sospeso per il {formatDateIT(dataFiltro)}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Tutti gli ordini confermati per questa data sono stati consegnati o non ci sono ordini pronti per uscire.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
