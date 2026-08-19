import React, { useState, useEffect } from 'react';
import { Package, Calendar, Edit3, Trash2, Plus, AlertTriangle, UserCheck, MessageSquare, Search, Sparkles, Sun, Printer } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';
import { isSoleOrder } from '../utils/soleUtils';

const isCaciocavalloSilanoDop = (prod) => {
  const nome = (prod?.nome_articolo || prod?.codice_articolo || '').toLowerCase();
  return nome.includes('caciocavallo silano') || (nome.includes('caciocavallo') && nome.includes('dop'));
};

const OrderCard = ({ ord, onConfirmOrder, onEditOrder, onDeleteOrder, deleteConfirmId, setDeleteConfirmId, onReprocessOrder, reprocessingOrderId }) => {
  const [prodotti, setProdotti] = useState(ord.prodotti || []);
  const isReprocessing = reprocessingOrderId === ord.id;

  useEffect(() => {
    setProdotti(prev => {
      const incoming = ord.prodotti || [];
      if (prev.length === 0) return incoming;
      
      return incoming.map((incProd, idx) => {
        const prevProd = prev[idx];
        if (ord.stato_ordine !== 'CONFERMATO' && prevProd) {
          return {
            ...incProd,
            numero_lotto: prevProd.numero_lotto || incProd.numero_lotto || '',
            grammatura: prevProd.grammatura || incProd.grammatura || ''
          };
        }
        return incProd;
      });
    });
  }, [ord.prodotti, ord.stato_ordine]);

  const handleGroupChange = (indices, field, value) => {
    setProdotti((prev) => {
      const newProd = [...prev];
      indices.forEach((i) => {
        newProd[i] = { ...newProd[i], [field]: value };
      });
      return newProd;
    });
  };

  const gruppiProdotti = [];
  {
    const indiceGruppoPerChiave = new Map();
    prodotti.forEach((prod, idx) => {
      if (isCaciocavalloSilanoDop(prod)) {
        gruppiProdotti.push({ key: `eccezione-${idx}`, eccezione: true, items: [{ prod, idx }] });
        return;
      }
      const chiave = prod.codice_articolo || prod.nome_articolo || `senza-nome-${idx}`;
      if (indiceGruppoPerChiave.has(chiave)) {
        gruppiProdotti[indiceGruppoPerChiave.get(chiave)].items.push({ prod, idx });
      } else {
        indiceGruppoPerChiave.set(chiave, gruppiProdotti.length);
        gruppiProdotti.push({ key: chiave, eccezione: false, items: [{ prod, idx }] });
      }
    });
  }

  const isLocalFallback = ord.is_fallback || ord.fonte_parser === 'LOCALE' || ord.elaborato_da === 'PARSER_LOCALE' || ord.da_verificare_manualmente || (ord.note_ordine && ord.note_ordine.includes('Parser Locale'));

  return (
    <div
      className={`petruzzi-card p-6 rounded-3xl border-2 transition-all flex flex-col lg:flex-row items-stretch justify-between gap-6 shadow-md hover:shadow-lg ${
        isLocalFallback
          ? 'border-amber-500 bg-amber-50/95'
          : 'border-amber-300/80 bg-white/95 hover:border-amber-400'
      }`}
    >
      <div className="w-full lg:w-64 shrink-0 space-y-3 pb-4 lg:pb-0 border-b lg:border-b-0 lg:border-r border-amber-200 lg:pr-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between lg:block">
            <h3 className="font-black text-petruzzi-950 text-xl tracking-tight leading-snug">
              {ord.mittente ? ord.mittente.split('(')[0].trim() : ''}
            </h3> 
            
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {isLocalFallback ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-950 text-[10px] font-black uppercase border border-orange-400 shadow-sm animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-orange-700" />
                  <span>⚠️ ESTRATTO IN EMERGENZA (CONTROLLARE)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black uppercase border border-emerald-300 shadow-sm">
                  <Sparkles className="w-3 h-3 text-emerald-700" />
                  <span>🤖 ESTRATTO CON IA</span>
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2 mt-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-1.5 text-[11px] text-petruzzi-700 font-medium">
                <MessageSquare className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Arrivo su WhatsApp: <strong className="text-petruzzi-900">{formatDateIT(ord.data_ricezione) || 'N/D'}</strong></span>
              </div>
              <div className="flex items-center space-x-1.5 text-[11px] text-petruzzi-700 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Elaborato dal sistema: <strong className="text-petruzzi-900">{ord.timestamp_elaborazione ? formatDateIT(ord.timestamp_elaborazione) : (formatDateIT(ord.data_ricezione) || 'N/D')}</strong></span>
              </div>
            </div>
            <div className="inline-block mt-1 text-xs font-black text-amber-950 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
              Data Consegna: {formatDateIT(ord.data_consegna)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-amber-950 uppercase tracking-wider">Articoli Ordinati e Organizzati:</span>
          <span className="text-[11px] font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
            {prodotti ? prodotti.length : 0} voci
          </span>
        </div>

        <div className="bg-amber-50/50 rounded-2xl p-3 border border-amber-200 divide-y divide-amber-200/70 shadow-inner max-h-64 overflow-y-auto">
          {prodotti && prodotti.length > 0 ? (
            gruppiProdotti.map((gruppo) => {
              const primo = gruppo.items[0].prod;
              const indici = gruppo.items.map((it) => it.idx);

              const isIncompleto = ord.stato_ordine !== 'CONFERMATO' && 
                                   (!primo.numero_lotto || (!primo.is_peso_fisso && !primo.grammatura));

              return (
                <div 
                  key={gruppo.key} 
                  className={`py-3 flex flex-col xl:flex-row xl:items-end justify-between gap-3 first:pt-0 last:pb-0 px-2 rounded-xl transition-colors ${
                    isIncompleto 
                      ? 'bg-red-50/80 border border-red-300 shadow-sm' 
                      : ''
                  }`}
                >
                  <div className="flex-1 min-w-0 mb-1">
                    <span className="font-extrabold text-petruzzi-950 text-sm truncate block">{primo.nome_articolo || primo.codice_articolo}</span>
                    {primo.is_peso_fisso && (
                      <span className="inline-block mt-1 text-[9px] bg-petruzzi-200 text-petruzzi-800 px-1.5 py-0.5 rounded font-mono uppercase">Peso Fisso ({primo.peso_unitario_kg} KG)</span>
                    )}
                    {primo.pezzi_totali && (
                      <span className="inline-block mt-1 text-[9px] bg-petruzzi-100 text-petruzzi-700 px-1.5 py-0.5 rounded font-mono uppercase ml-1">Pezzo {primo.pezzo_index} di {primo.pezzi_totali}</span>
                    )}
                    {!gruppo.eccezione && gruppo.items.length > 1 && (
                      <span className="inline-block mt-1 text-[9px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono uppercase ml-1">{gruppo.items.length} voci · stesso lotto</span>
                    )}
                  </div>

                  <div className="flex items-end gap-2 shrink-0 flex-wrap justify-end">
                    <div className="flex flex-col items-start">
                      <label className="text-[9px] font-black text-amber-800 uppercase mb-0.5 ml-0.5">Quantità</label>
                      <div className="flex flex-wrap gap-1 justify-end max-w-[160px]">
                        {gruppo.items.map(({ prod, idx }) => (
                          <span key={idx} className="flex items-center justify-center h-[26px] font-black text-petruzzi-950 bg-white px-2.5 rounded-md border border-amber-300 shadow-sm text-[11px] whitespace-nowrap">
                            {prod.quantita} {prod.unita_di_misura}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col items-start">
                      <label className="text-[9px] font-black text-amber-800 uppercase mb-0.5 ml-0.5">Lotto Art.</label>
                      {ord.stato_ordine !== 'CONFERMATO' ? (
                        <input
                          type="text"
                          placeholder="Inserisci lotto"
                          value={primo.numero_lotto || ''}
                          onChange={(e) => handleGroupChange(indici, 'numero_lotto', e.target.value.toUpperCase())}
                          className={`w-24 h-[26px] px-2 text-[10px] font-mono font-semibold bg-white border rounded-md focus:ring-1 outline-none shadow-sm placeholder-amber-400 ${
                            !primo.numero_lotto
                              ? 'border-red-400 focus:ring-red-600'
                              : 'border-amber-300 focus:ring-amber-700'
                          }`}
                        />
                      ) : (
                        <span className="flex items-center h-[26px] text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-2 rounded-md border border-amber-200">{primo.numero_lotto || '-'}</span>
                      )}
                    </div>

                    <div className="flex flex-col items-start">
                      <label className="text-[9px] font-black text-amber-800 uppercase mb-0.5 ml-0.5">Grammatura</label>
                      {ord.stato_ordine !== 'CONFERMATO' ? (
                        <input
                          type="text"
                          placeholder="Inserisci kg"
                          value={primo.grammatura || ''}
                          onChange={(e) => handleGroupChange(indici, 'grammatura', e.target.value)}
                          className={`w-24 h-[26px] px-2 text-[10px] font-semibold bg-white border rounded-md focus:ring-1 outline-none shadow-sm placeholder-amber-400 ${
                            !primo.grammatura
                              ? 'border-red-400 focus:ring-red-600'
                              : 'border-amber-400 focus:ring-amber-700'
                          }`}
                        />
                      ) : (
                        <span className="flex items-center justify-center w-24 h-[26px] text-[10px] font-bold text-gray-500 bg-gray-100 px-2 rounded-md border border-gray-200">
                          {primo.grammatura || '-'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-xs text-petruzzi-600 italic">Nessun prodotto estratto dal testo.</p>
          )}
        </div>

        {/* BOX MESSAGGIO ORIGINALE */}
        {ord.testo_originale && !ord.testo_originale.includes('Inserimento Manuale') && (
          <div className="bg-blue-50/70 p-2.5 rounded-xl border border-blue-200 text-xs text-blue-900 mt-2">
            <div className="flex items-center space-x-1.5 font-bold text-blue-800 uppercase tracking-wider mb-1 text-[10px]">
              <MessageSquare className="w-3 h-3" />
              <span>Msg. WhatsApp Originale:</span>
            </div>
            <p className="italic font-medium">"{ord.testo_originale.replace(/🎙️\s*\[VOCALE TRASCRITTO\]:\s*/g, '').replace(/\[Parser Locale di Riserva\]\s*/g, '').replace(/\[Integrazione\/Correzione\]:\s*/g, ' + ')}"</p>
          </div>
        )}

        {ord.note_ordine && (
          <div className="bg-amber-100/70 p-3 rounded-xl border border-amber-300 text-xs text-amber-950">
            <div className="flex items-center space-x-1.5 font-black text-amber-900 mb-0.5 text-[11px]">
              <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
              <span>Note Consegna:</span>
            </div>
            <p className="italic font-medium">{ord.note_ordine}</p>
          </div>
        )}
      </div>

      <div className="w-full lg:w-56 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-amber-200 lg:pl-6 flex flex-col justify-center space-y-3">
        {ord.stato_ordine === 'CONFERMATO' ? (
          <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-2xl text-center space-y-1 shadow-sm">
            <span className="flex items-center justify-center space-x-1.5 text-xs font-black text-emerald-900">
              <UserCheck className="w-4 h-4 text-emerald-700" />
              <span>✅ ORDINE CONFERMATO</span>
            </span>
            <span className="text-[10px] text-emerald-800 font-bold block">Inviato in Produzione</span>
            <span className="text-[10px] font-mono font-bold block mt-1 text-emerald-900">Lotto Gen: {ord.numero_lotto || '-'}</span>
          </div>
        ) : (
          <div className="space-y-2 bg-amber-50/50 p-2 rounded-2xl border border-amber-200">
            <button
              onClick={() => onConfirmOrder && onConfirmOrder(ord.id, '', prodotti)}
              className="w-full py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-black text-xs rounded-xl shadow-md transition transform active:scale-95 flex items-center justify-center space-x-2"
            >
              <UserCheck className="w-4 h-4 stroke-[2.5]" />
              <span>✅ CONFERMA ORDINE</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <a
            href={`/api/pdf/ordine/${ord.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-1 py-2 px-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-extrabold text-xs border border-amber-300 transition shadow-sm"
            title="Visualizza o Stampa PDF Ordine Sole 365"
          >
            <span>📄 PDF</span>
          </a>

          <button
            type="button"
            onClick={() => onEditOrder(ord)}
            className="flex items-center justify-center space-x-1.5 py-2 px-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-black text-xs transition shadow-sm border border-amber-900"
            title="Aggiusta / Modifica Ordine"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-200" />
            <span>Aggiusta</span>
          </button>

          <button
            type="button"
            disabled={isReprocessing}
            onClick={() => onReprocessOrder && onReprocessOrder(ord.id)}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-xl text-xs font-black border transition shadow-sm ${
              isReprocessing
                ? 'bg-amber-200 text-amber-700 border-amber-400 cursor-not-allowed opacity-75'
                : 'bg-amber-200 hover:bg-amber-300 text-amber-950 border-amber-400'
            }`}
            title="Rielabora questo singolo ordine con l'IA"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-800 ${isReprocessing ? 'animate-spin' : ''}`} />
            <span>{isReprocessing ? 'In corso...' : 'Rielabora IA'}</span>
          </button>

          <button
            type="button"
            onClick={() => setDeleteConfirmId(ord.id)}
            className="flex items-center justify-center space-x-1.5 py-2 px-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 font-extrabold text-xs border border-red-300 transition shadow-sm"
            title="Elimina Ordine"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-700" />
            <span>Elimina</span>
          </button>
        </div>

        {deleteConfirmId === ord.id && (
          <div className="p-2.5 bg-red-100 border border-red-300 rounded-xl text-center space-y-2">
            <p className="text-[11px] font-bold text-red-900">Eliminare l'ordine?</p>
            <div className="flex justify-center space-x-2">
              <button
                onClick={() => { onDeleteOrder(ord.id); setDeleteConfirmId(null); }}
                className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold"
              >
                Sì
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-2.5 py-1 bg-amber-200 text-amber-900 rounded-lg text-xs font-bold"
              >
                No
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function OrdiniSole({ ordini, selectedDate, setSelectedDate, onEditOrder, onDeleteOrder, onConfirmOrder, onOpenNewOrderModal, onReprocessOrder, reprocessingOrderId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Filtra SOLO gli ordini appartenenti al circuito Sole 365
  const ordiniSole = ordini.filter(isSoleOrder);

  const filteredOrdini = ordiniSole.filter(o => {
    const matchesDate = !selectedDate || o.data_consegna === selectedDate;
    const matchesClient = o.mittente.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProduct = (o.prodotti || []).some(p => (p.nome_articolo || p.codice_articolo || '').toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesDate && (matchesClient || matchesProduct);
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 rounded-xl bg-amber-50/90 border border-amber-300/80 shadow-sm">
        <div className="flex items-center space-x-3">
          <Sun className="w-4 h-4 text-amber-700" />
          <span className="text-xs font-black text-amber-950 uppercase">Filtro Data Ordini Sole:</span>
          <div className="flex items-center space-x-1.5">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-amber-300 text-petruzzi-950 rounded-lg px-2.5 py-1 text-xs font-bold focus:ring-1 focus:ring-amber-700 outline-none shadow-sm"
            />
            {selectedDate && (
              <span className="text-xs font-black text-amber-950 bg-white px-2.5 py-1 rounded-lg border border-amber-300 shadow-sm font-mono">
                {formatDateIT(selectedDate)}
              </span>
            )}
          </div>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
              selectedDate === new Date().toISOString().split('T')[0] ? 'bg-amber-800 text-white border-amber-800' : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
            }`}
          >
            Oggi
          </button>
          <button
            onClick={() => {
              const tmr = new Date();
              tmr.setDate(tmr.getDate() + 1);
              setSelectedDate(tmr.toISOString().split('T')[0]);
            }}
            className="px-3 py-1 rounded-lg bg-white text-amber-900 hover:bg-amber-100 text-xs font-bold border border-amber-300 transition"
          >
            Domani
          </button>
          <button
            onClick={() => setSelectedDate('')}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
              !selectedDate ? 'bg-amber-800 text-white border-amber-800' : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
            }`}
          >
            Tutti gli Ordini Sole
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href={`/api/pdf/sole${selectedDate ? `?data=${selectedDate}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold transition transform active:scale-95 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Stampa Scheda Sole PDF</span>
          </a>
          {onOpenNewOrderModal && (
            <button
              onClick={() => onOpenNewOrderModal(true)}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-black transition transform active:scale-95 shadow-sm border border-amber-900"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>☀️ ➕ Aggiungi Ordine Sole 365</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-petruzzi-600" />
        <input
          type="text"
          placeholder="Cerca per punto vendita Sole o articolo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-amber-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-amber-700 shadow-sm"
        />
      </div>

      <div className="space-y-4">
        {filteredOrdini.length === 0 ? (
          <div className="text-center py-16 petruzzi-card rounded-3xl border border-amber-200 space-y-3">
            <Package className="w-16 h-16 text-amber-500 mx-auto" />
            <h3 className="text-xl font-extrabold text-petruzzi-800">
              {selectedDate ? `Nessun ordine Sole 365 per la data (${formatDateIT(selectedDate)})` : 'Nessun ordine Sole 365 presente nel sistema'}
            </h3>
            {ordiniSole.length > 0 && (
              <div className="pt-2 flex justify-center space-x-3">
                <button onClick={() => setSelectedDate('')} className="px-4 py-2 bg-amber-800 text-white font-bold text-xs rounded-xl hover:bg-amber-900 shadow transition">
                  📋 Mostra Tutti gli Ordini Sole ({ordiniSole.length})
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredOrdini.map((ord) => (
            <OrderCard
              key={ord.id}
              ord={ord}
              onConfirmOrder={onConfirmOrder}
              onEditOrder={onEditOrder}
              onDeleteOrder={onDeleteOrder}
              deleteConfirmId={deleteConfirmId}
              setDeleteConfirmId={setDeleteConfirmId}
              onReprocessOrder={onReprocessOrder}
              reprocessingOrderId={reprocessingOrderId}
            />
          ))
        )}
      </div>
    </div>
  );
}