import React, { useState, useEffect } from 'react';
import { Tablet, Scale, Hash, CheckCircle2, PackageCheck, Clock, RefreshCw, AlertCircle, Unlock, Lock, Layers, MessageSquare } from 'lucide-react';
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
        data.forEach(o => {
          // Prepara lo stato per ogni SINGOLO pezzo del prodotto
          initialForm[o.id] = o.prodotti.map(p => ({
            ...p,
            // Lascia il lotto completamente vuoto di default per forzare l'inserimento manuale
            numero_lotto: p.numero_lotto || '',
            // Se è a peso fisso pre-imposta la grammatura fissa, altrimenti vuoto
            grammatura: p.grammatura || (p.is_peso_fisso ? `${p.peso_unitario_kg} KG` : '')
          }));
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

  const handleProductChange = (orderId, prodIndex, field, value) => {
    setFormData(prev => {
      const orderProds = [...(prev[orderId] || [])];
      if (orderProds[prodIndex]) {
        orderProds[prodIndex] = { ...orderProds[prodIndex], [field]: value };
      }
      return { ...prev, [orderId]: orderProds };
    });
    setValidationError(prev => ({ ...prev, [orderId]: null }));
  };

  const handleConfirmConfezionamento = async (orderId) => {
    const productsToSave = formData[orderId] || [];
    
    // Validazione per OGNI singolo pezzo
    let isValid = true;
    for (const p of productsToSave) {
      if (!p.numero_lotto || p.numero_lotto.trim() === '') {
        isValid = false;
        break;
      }
      // Se NON è a peso fisso, deve avere una grammatura valida
      if (!p.is_peso_fisso) {
        const pVal = parseFloat(p.grammatura);
        if (!p.grammatura || isNaN(pVal) || pVal <= 0) {
          isValid = false;
          break;
        }
      }
    }

    if (!isValid) {
      setValidationError(prev => ({
        ...prev,
        [orderId]: "⚠️ ATTENZIONE: Devi inserire il PESO REALE (per gli articoli da pesare) e il LOTTO per ogni singola riga!"
      }));
      return;
    }

    setSavingId(orderId);
    try {
      const res = await fetch(`/api/ordini/${orderId}/confezione`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prodotti: productsToSave })
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
      
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-700 text-white font-black px-6 py-3 rounded-2xl shadow-2xl animate-bounce">
          {toast}
        </div>
      )}

      <div className="petruzzi-card p-4 rounded-2xl flex items-center justify-between border border-petruzzi-200 bg-white/90 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-petruzzi-100 text-petruzzi-800 rounded-xl border border-petruzzi-300">
            <Tablet className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-petruzzi-950">Postazione Confezionamento Tablet</h1>
            <p className="text-xs text-petruzzi-700">Pesatura Singoli Pezzi & Assegnazione Lotti</p>
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

      <div className="grid grid-cols-1 gap-6">
        {ordini.length === 0 ? (
          <div className="p-12 text-center petruzzi-card rounded-2xl border border-petruzzi-200">
            <PackageCheck className="w-12 h-12 text-petruzzi-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-petruzzi-800">Nessun ordine da confezionare per questa data</h3>
          </div>
        ) : (
          ordini.map((ord) => {
            const isConfezionato = ord.stato_confezionamento === 'CONFEZIONATO';
            const currentProds = formData[ord.id] || [];
            const vErr = validationError[ord.id];

            return (
              <div
                key={ord.id}
                className={`petruzzi-card p-6 rounded-2xl border space-y-4 transition ${
                  isConfezionato ? 'border-emerald-300 bg-emerald-50/40' : 'border-petruzzi-200 hover:border-petruzzi-300'
                }`}
              >
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

                {vErr && (
                  <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-xs text-red-900 font-bold flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                    <span>{vErr}</span>
                  </div>
                )}

                <div className="bg-petruzzi-50 p-4 rounded-xl border border-petruzzi-200 space-y-3">
                  <div className="grid grid-cols-12 gap-4 pb-2 border-b border-petruzzi-200 text-xs font-black text-petruzzi-800 uppercase tracking-wider">
                    <div className="col-span-6">Articolo in distinto</div>
                    <div className="col-span-3">⚖️ Peso (KG)</div>
                    <div className="col-span-3"># Lotto</div>
                  </div>

                  {currentProds.map((p, pIdx) => (
                    <div key={pIdx} className="grid grid-cols-12 gap-4 items-center bg-white p-2 rounded-lg border border-petruzzi-200 shadow-sm">
                      <div className="col-span-6">
                        <span className="font-bold text-petruzzi-950 block">{p.nome_articolo || p.codice_articolo}</span>
                        {p.pezzi_totali && (
                          <span className="text-[10px] text-petruzzi-700 font-mono">Pezzo {p.pezzo_index} di {p.pezzi_totali}</span>
                        )}
                        {p.is_peso_fisso && (
                          <span className="ml-1 text-[9px] bg-petruzzi-100 text-petruzzi-800 px-1 py-0.5 rounded font-mono uppercase border border-petruzzi-300">
                            Peso Fisso
                          </span>
                        )}
                      </div>

                      <div className="col-span-3">
                        {p.is_peso_fisso ? (
                           <div className="w-full bg-gray-100 border border-gray-300 text-gray-600 font-bold text-sm rounded-lg px-3 py-2 text-center">
                             {p.grammatura}
                           </div>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            placeholder="es. 0.350"
                            value={p.grammatura}
                            onChange={(e) => handleProductChange(ord.id, pIdx, 'grammatura', e.target.value)}
                            disabled={isConfezionato}
                            className="w-full bg-white border border-amber-400 text-amber-950 font-extrabold text-sm rounded-lg px-3 py-2 outline-none focus:border-petruzzi-700 disabled:opacity-60 shadow-inner"
                          />
                        )}
                      </div>

                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="es. L240813"
                          value={p.numero_lotto}
                          onChange={(e) => handleProductChange(ord.id, pIdx, 'numero_lotto', e.target.value.toUpperCase())}
                          disabled={isConfezionato}
                          className="w-full bg-white border border-petruzzi-300 text-petruzzi-900 font-bold text-sm font-mono rounded-lg px-3 py-2 outline-none focus:border-petruzzi-700 disabled:opacity-60 placeholder:text-gray-400"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* BOX MESSAGGIO ORIGINALE */}
                {ord.testo_originale && !ord.testo_originale.includes('Inserimento Manuale') && (
                  <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 text-xs text-blue-900">
                    <div className="flex items-center space-x-1.5 font-bold text-blue-800 uppercase tracking-wider mb-1 text-[10px]">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Msg. WhatsApp Originale:</span>
                    </div>
                    <p className="italic font-medium">"{ord.testo_originale.replace(/🎙️\s*\[VOCALE TRASCRITTO\]:\s*/g, '').replace(/\[Parser Locale di Riserva\]\s*/g, '').replace(/\[Integrazione\/Correzione\]:\s*/g, ' + ')}"</p>
                  </div>
                )}

                {/* BOX NOTE */}
                {ord.note_ordine && (
                  <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-300 text-xs text-amber-950">
                    <div className="flex items-center space-x-1.5 font-black text-amber-900 mb-0.5 text-[11px]">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
                      <span>Note Consegna / Resi:</span>
                    </div>
                    <p className="italic font-medium">{ord.note_ordine}</p>
                  </div>
                )}

                {!isConfezionato ? (
                  <button
                    onClick={() => handleConfirmConfezionamento(ord.id)}
                    disabled={savingId === ord.id}
                    className="w-full py-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-base shadow-md transition transform active:scale-95 flex items-center justify-center space-x-2"
                  >
                    <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                    <span>✅ CONFERMA E SALVA</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-xl border border-petruzzi-200 text-sm text-petruzzi-800 flex items-center justify-between">
                      <span>Totale Pesato Variabile: <strong className="text-petruzzi-950 text-base">{ord.peso_reale} KG</strong></span>
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-md font-bold text-xs uppercase">
                        Salvato nel Server
                      </span>
                    </div>

                    <button
                      onClick={() => handleUnlockOrder(ord.id)}
                      className="w-full py-3 bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 font-bold text-sm rounded-xl border border-petruzzi-300 flex items-center justify-center space-x-2 transition"
                    >
                      <Unlock className="w-5 h-5 text-petruzzi-700" />
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