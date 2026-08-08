import React, { useState, useEffect } from 'react';
import { Tablet, Scale, Hash, CheckCircle2, PackageCheck, Clock, RefreshCw, AlertCircle, Unlock, Lock, Layers } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

export default function PostazioneTablet() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [ordini, setOrdini] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState('');
  const [validationError, setValidationError] = useState({});

  const fetchOrdiniTablet = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ordini?data=${selectedDate}&scomponi_pezzi=true`);
      if (res.ok) {
        const data = await res.json();
        setOrdini(data);
        
        const initialForm = {};
        const todayLotto = `L${new Date().toISOString().slice(2,10).replace(/-/g, '')}`;
        data.forEach(o => {
          initialForm[o.id] = {
            peso_reale: o.peso_reale || '',
            numero_lotto: o.numero_lotto || todayLotto
          };
        });
        setFormData(initialForm);
      }
    } catch (e) {
      console.error("Errore fetch ordini tablet:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdiniTablet();
  }, [selectedDate]);

  const handleInputChange = (orderId, field, value) => {
    setFormData(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value
      }
    }));
    setValidationError(prev => ({ ...prev, [orderId]: null }));
  };

  const handleConfirmConfezionamento = async (orderId) => {
    const dataOrd = formData[orderId];
    const pesoVal = parseFloat(dataOrd?.peso_reale);
    const lottoVal = (dataOrd?.numero_lotto || '').trim();

    // Validazione Rigida Obbligatoria: sia Peso Reale che Numero di Lotto
    if (!pesoVal || isNaN(pesoVal) || pesoVal <= 0 || !lottoVal) {
      setValidationError(prev => ({
        ...prev,
        [orderId]: "⚠️ VALIDAZIONE OBBLIGATORIA FALLITA: Inserire sia il Peso Reale (KG > 0) che il N° di Lotto di produzione per poter confezionare!"
      }));
      return;
    }

    setSavingId(orderId);
    try {
      const res = await fetch(`/api/ordini/${orderId}/confezione`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peso_reale: pesoVal,
          numero_lotto: lottoVal
        })
      });

      if (res.ok) {
        setToast(`✅ Confezionamento registrato per Ordine #${orderId}!`);
        setTimeout(() => setToast(''), 4000);
        fetchOrdiniTablet();
      } else {
        alert("Errore durante il salvataggio.");
      }
    } catch (e) {
      alert("Errore di connessione.");
    } finally {
      setSavingId(null);
    }
  };

  const handleUnlockOrder = async (orderId) => {
    if (!window.confirm("Sbloccare temporaneamente questo ordine per modifiche dell'ultimo minuto?")) return;
    try {
      const res = await fetch(`/api/ordini/${orderId}/sblocco`, { method: 'PUT' });
      if (res.ok) {
        setToast(`🔓 Ordine #${orderId} sbloccato per modifiche!`);
        setTimeout(() => setToast(''), 4000);
        fetchOrdiniTablet();
      }
    } catch (e) {
      alert("Errore durante lo sblocco.");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-petruzzi-950 p-4 sm:p-6 space-y-6 font-sans">
      
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-700 text-white font-black px-6 py-3 rounded-2xl shadow-2xl animate-bounce">
          {toast}
        </div>
      )}

      {/* Touch Header */}
      <div className="petruzzi-card p-4 rounded-2xl flex items-center justify-between border border-petruzzi-200 bg-white/90 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-petruzzi-100 text-petruzzi-800 rounded-xl border border-petruzzi-300">
            <Tablet className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-petruzzi-950">Postazione Confezionamento Tablet</h1>
            <p className="text-xs text-petruzzi-700">Laboratorio Petruzzi • Pesatura Singoli Pezzi & Lotti</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-3 py-2 text-sm outline-none shadow-sm"
          />
          <span className="text-xs font-black text-petruzzi-900 bg-white px-3 py-2 rounded-xl border border-petruzzi-300 shadow-sm font-mono">
            {formatDateIT(selectedDate)}
          </span>
          <button
            onClick={fetchOrdiniTablet}
            className="p-2.5 bg-petruzzi-800 hover:bg-petruzzi-900 text-white rounded-xl border border-petruzzi-900 active:scale-95 transition"
            title="Rinfresca Ordini"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-petruzzi-300' : ''}`} />
          </button>
        </div>
      </div>

      {/* Orders List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ordini.length === 0 ? (
          <div className="col-span-full p-12 text-center petruzzi-card rounded-2xl border border-petruzzi-200">
            <PackageCheck className="w-12 h-12 text-petruzzi-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-petruzzi-800">Nessun ordine da confezionare per questa data</h3>
          </div>
        ) : (
          ordini.map((ord) => {
            const isConfezionato = ord.stato_confezionamento === 'CONFEZIONATO';
            const fState = formData[ord.id] || { peso_reale: '', numero_lotto: '' };
            const vErr = validationError[ord.id];

            return (
              <div
                key={ord.id}
                className={`petruzzi-card p-6 rounded-2xl border space-y-4 transition ${
                  isConfezionato
                    ? 'border-emerald-300 bg-emerald-50/40'
                    : 'border-petruzzi-200 hover:border-petruzzi-300'
                }`}
              >
                {/* Header Ordine */}
                <div className="flex items-center justify-between border-b border-petruzzi-200 pb-3">
                  <div>
                    <h3 className="text-lg font-black text-petruzzi-950">{ord.mittente}</h3>
                    <span className="text-xs text-petruzzi-700">Consegna Target: {formatDateIT(ord.data_consegna)}</span>
                  </div>

                  {isConfezionato ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-black uppercase flex items-center space-x-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>CONFEZIONATO</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-bold uppercase">
                      In Lavorazione
                    </span>
                  )}
                </div>

                {/* Scomposizione Pezzi Singoli */}
                <div className="bg-petruzzi-50 p-3 rounded-xl border border-petruzzi-200 space-y-2 text-xs">
                  <span className="font-bold text-petruzzi-800 uppercase tracking-wider block flex items-center space-x-1">
                    <Layers className="w-3.5 h-3.5 text-petruzzi-700" />
                    <span>Distinta Articoli e Pezzi Singoli Scomposti:</span>
                  </span>
                  
                  {ord.prodotti && ord.prodotti.map((p, pIdx) => (
                    <div key={pIdx} className="flex justify-between items-center bg-white p-2 rounded-lg border border-petruzzi-200">
                      <div>
                        <span className="font-bold text-petruzzi-950 block">{p.nome_articolo || p.codice_articolo}</span>
                        {p.pezzi_totali && (
                          <span className="text-[10px] text-petruzzi-700 font-mono">Pezzo Singolo {p.pezzo_index} di {p.pezzi_totali}</span>
                        )}
                      </div>
                      <span className="font-black text-petruzzi-900 bg-petruzzi-100 px-2 py-0.5 rounded border border-petruzzi-300">
                        {p.quantita} {p.unita_di_misura}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Dynamic Validation Error Box */}
                {vErr && (
                  <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-xs text-red-900 font-bold flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                    <span>{vErr}</span>
                  </div>
                )}

                {/* Form Pesatura & Lotto */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1 flex items-center space-x-1">
                      <Scale className="w-3.5 h-3.5 text-petruzzi-700" />
                      <span>Peso Reale (KG) *</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Es. 24.80"
                      value={fState.peso_reale}
                      onChange={(e) => handleInputChange(ord.id, 'peso_reale', e.target.value)}
                      disabled={isConfezionato}
                      className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-extrabold text-base rounded-xl px-3 py-2.5 outline-none focus:border-petruzzi-700 disabled:opacity-60 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1 flex items-center space-x-1">
                      <Hash className="w-3.5 h-3.5 text-petruzzi-700" />
                      <span>N° Lotto *</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Es. L260807"
                      value={fState.numero_lotto}
                      onChange={(e) => handleInputChange(ord.id, 'numero_lotto', e.target.value)}
                      disabled={isConfezionato}
                      className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-extrabold text-base rounded-xl px-3 py-2.5 outline-none focus:border-petruzzi-700 disabled:opacity-60 shadow-sm"
                    />
                  </div>
                </div>

                {/* Confirm / Unlock Action Buttons */}
                {!isConfezionato ? (
                  <button
                    onClick={() => handleConfirmConfezionamento(ord.id)}
                    disabled={savingId === ord.id}
                    className="w-full py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm shadow-md transition transform active:scale-95 flex items-center justify-center space-x-2"
                  >
                    <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                    <span>✅ CONFERMA CONFEZIONAMENTO</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="p-3 bg-white rounded-xl border border-petruzzi-200 text-xs text-petruzzi-800 flex items-center justify-between">
                      <span>Pesato: <strong className="text-petruzzi-950">{ord.peso_reale} KG</strong></span>
                      <span>Lotto: <strong className="text-petruzzi-900">{ord.numero_lotto}</strong></span>
                    </div>

                    {/* Sblocco Temporaneo per Modifiche Ultimo Minuto */}
                    <button
                      onClick={() => handleUnlockOrder(ord.id)}
                      className="w-full py-2 bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 font-bold text-xs rounded-xl border border-petruzzi-300 flex items-center justify-center space-x-2 transition"
                    >
                      <Unlock className="w-4 h-4 text-petruzzi-700" />
                      <span>🔄 ORDINE CONFEZIONATO (Sblocca per Modifiche)</span>
                    </button>
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
