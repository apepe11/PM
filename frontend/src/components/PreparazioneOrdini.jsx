import React, { useState } from 'react';
import { Package, Calendar, Clock, Edit3, Trash2, Plus, AlertTriangle, UserCheck, MessageSquare, Search, Sparkles, Mic } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

export default function PreparazioneOrdini({ ordini, selectedDate, setSelectedDate, onEditOrder, onDeleteOrder, onConfirmOrder, onOpenNewOrderModal, onReprocessAll }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const filteredOrdini = ordini.filter(o => {
    const matchesDate = !selectedDate || o.data_consegna === selectedDate;
    const matchesClient = o.mittente.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProduct = o.prodotti.some(p => (p.nome_articolo || p.codice_articolo).toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesDate && (matchesClient || matchesProduct);
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Compact & Delicate Toolbar with Date Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 rounded-xl bg-petruzzi-100/90 border border-petruzzi-200">
        
        {/* Date Selector Filter */}
        <div className="flex items-center space-x-3">
          <Calendar className="w-4 h-4 text-petruzzi-700" />
          <span className="text-xs font-bold text-petruzzi-900 uppercase">Filtro Data Ordini:</span>
          <div className="flex items-center space-x-1.5">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-petruzzi-300 text-petruzzi-950 rounded-lg px-2.5 py-1 text-xs font-bold focus:ring-1 focus:ring-petruzzi-700 outline-none shadow-sm"
            />
            {selectedDate && (
              <span className="text-xs font-black text-petruzzi-900 bg-white px-2.5 py-1 rounded-lg border border-petruzzi-300 shadow-sm font-mono">
                {formatDateIT(selectedDate)}
              </span>
            )}
          </div>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
              selectedDate === new Date().toISOString().split('T')[0]
                ? 'bg-petruzzi-800 text-white border-petruzzi-800'
                : 'bg-white text-petruzzi-800 border-petruzzi-300 hover:bg-petruzzi-100'
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
            className="px-3 py-1 rounded-lg bg-white text-petruzzi-800 hover:bg-petruzzi-100 text-xs font-bold border border-petruzzi-300 transition"
          >
            Domani
          </button>
          <button
            onClick={() => setSelectedDate('')}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
              !selectedDate
                ? 'bg-petruzzi-800 text-white border-petruzzi-800'
                : 'bg-white text-petruzzi-800 border-petruzzi-300 hover:bg-petruzzi-100'
            }`}
          >
            Tutti gli Ordini
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          {onReprocessAll && (
            <button
              onClick={onReprocessAll}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold border border-amber-300 transition shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-800" />
              <span>🧠 Rielabora Tutti con IA</span>
            </button>
          )}

          <button
            onClick={onOpenNewOrderModal}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-petruzzi-800 hover:bg-petruzzi-900 text-white text-xs font-bold transition transform active:scale-95 shadow-sm"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>➕ Aggiungi Ordine Manuale</span>
          </button>
        </div>

      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-petruzzi-600" />
        <input
          type="text"
          placeholder="Cerca per nome cliente o prodotto ordinato..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-petruzzi-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-petruzzi-700 shadow-sm"
        />
      </div>

      {/* Client Orders List - Horizontal Cards Layout */}
      <div className="space-y-4">
        {filteredOrdini.length === 0 ? (
          <div className="text-center py-16 petruzzi-card rounded-3xl border border-petruzzi-200 space-y-3">
            <Package className="w-16 h-16 text-petruzzi-600 mx-auto" />
            <h3 className="text-xl font-extrabold text-petruzzi-800">
              {selectedDate ? `Nessun ordine filtrato per la data (${formatDateIT(selectedDate)})` : 'Nessun ordine presente nel sistema'}
            </h3>
            <p className="text-sm text-petruzzi-600 max-w-md mx-auto">
              {ordini.length > 0 
                ? `Ci sono ${ordini.length} ordini presenti nel sistema per altre date di consegna.`
                : 'Gli ordini ricevuti via WhatsApp appariranno qui in tempo reale.'}
            </p>
            {ordini.length > 0 && (
              <div className="pt-2 flex justify-center space-x-3">
                <button
                  onClick={() => setSelectedDate('')}
                  className="px-4 py-2 bg-petruzzi-800 text-white font-bold text-xs rounded-xl hover:bg-petruzzi-900 shadow transition"
                >
                  📋 Mostra Tutti gli Ordini ({ordini.length})
                </button>
              </div>
            )}
          </div>
        ) : (
          filteredOrdini.map((ord) => (
            <div
              key={ord.id}
              className={`petruzzi-card p-6 rounded-3xl border-2 transition-all flex flex-col lg:flex-row items-stretch justify-between gap-6 shadow-md hover:shadow-lg ${
                ord.da_verificare_manualmente
                  ? 'border-amber-500 bg-amber-50/95'
                  : 'border-petruzzi-300/80 bg-white/95 hover:border-petruzzi-400'
              }`}
            >
              {/* Left Column: Client Info & Dates */}
              <div className="w-full lg:w-64 shrink-0 space-y-3 pb-4 lg:pb-0 border-b lg:border-b-0 lg:border-r border-petruzzi-200 lg:pr-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between lg:block">
                    <h3 className="font-black text-petruzzi-950 text-xl tracking-tight leading-snug">{ord.mittente}</h3>
                    {ord.da_verificare_manualmente && (
                      <span className="lg:mt-2 inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-200 text-amber-950 text-[11px] font-black uppercase border border-amber-400 shadow-sm animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-800" />
                        <span>Da Verificare</span>
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 mt-3">
                    <div className="flex items-center space-x-1.5 text-xs text-petruzzi-700 font-medium">
                      <Clock className="w-3.5 h-3.5 text-petruzzi-600 shrink-0" />
                      <span>Ricevuto: <strong className="text-petruzzi-900">{formatDateIT(ord.data_ricezione) || 'Oggi'}</strong></span>
                    </div>
                    <div className="inline-block text-xs font-black text-petruzzi-900 bg-petruzzi-100 px-2.5 py-1 rounded-lg border border-petruzzi-300">
                      Consegna: {formatDateIT(ord.data_consegna)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Column: Products List & Notes */}
              <div className="flex-1 space-y-3 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-petruzzi-800 uppercase tracking-wider">Articoli Ordinati:</span>
                  <span className="text-[11px] font-extrabold text-petruzzi-700 bg-petruzzi-100 px-2 py-0.5 rounded-full border border-petruzzi-300">
                    {ord.prodotti ? ord.prodotti.length : 0} voci
                  </span>
                </div>

                <div className="bg-petruzzi-50/90 rounded-2xl p-3 border border-petruzzi-300/80 divide-y divide-petruzzi-200/80 shadow-inner max-h-48 overflow-y-auto">
                  {ord.prodotti && ord.prodotti.length > 0 ? (
                    ord.prodotti.map((prod, idx) => (
                      <div key={idx} className="py-2 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                        <span className="font-extrabold text-petruzzi-950 text-sm truncate mr-2">{prod.nome_articolo || prod.codice_articolo}</span>
                        <span className="font-black text-petruzzi-950 bg-white px-2.5 py-0.5 rounded-lg border border-petruzzi-300 shadow-sm shrink-0">
                          {prod.quantita} {prod.unita_di_misura}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-petruzzi-600 italic">Nessun prodotto estratto dal testo.</p>
                  )}
                </div>

                {/* Voice Transcription Box if applicable */}
                {ord.testo_originale && (ord.testo_originale.includes('VOCALE') || ord.testo_originale.includes('🎙️')) && (
                  <div className="bg-amber-100/90 p-3 rounded-xl border border-amber-300 flex items-start space-x-2 text-xs text-amber-950">
                    <Mic className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-black text-amber-900 block text-[11px]">Vocale Trascritto da Gemini:</span>
                      <span className="italic">{ord.testo_originale.replace(/🎙️\s*\[VOCALE TRASCRITTO\]:\s*/, '')}</span>
                    </div>
                  </div>
                )}

                {/* Delivery Notes */}
                {ord.note_ordine && (
                  <div className="bg-petruzzi-100/90 p-3 rounded-xl border border-petruzzi-300 text-xs text-petruzzi-950">
                    <div className="flex items-center space-x-1.5 font-black text-petruzzi-900 mb-0.5 text-[11px]">
                      <MessageSquare className="w-3.5 h-3.5 text-petruzzi-700" />
                      <span>Note Consegna:</span>
                    </div>
                    <p className="italic font-medium">{ord.note_ordine}</p>
                  </div>
                )}
              </div>

              {/* Right Column: Actions & Status */}
              <div className="w-full lg:w-56 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-petruzzi-200 lg:pl-6 flex flex-col justify-center space-y-3">
                {ord.stato_ordine === 'CONFERMATO' ? (
                  <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-2xl text-center space-y-1 shadow-sm">
                    <span className="flex items-center justify-center space-x-1.5 text-xs font-black text-emerald-900">
                      <UserCheck className="w-4 h-4 text-emerald-700" />
                      <span>✅ ORDINE CONFERMATO</span>
                    </span>
                    <span className="text-[10px] text-emerald-800 font-bold block">Inviato in Produzione</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onConfirmOrder && onConfirmOrder(ord.id)}
                    className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs rounded-2xl shadow-md transition transform active:scale-95 flex items-center justify-center space-x-2"
                  >
                    <UserCheck className="w-4 h-4 stroke-[2.5]" />
                    <span>✅ CONFERMA ORDINE</span>
                  </button>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={`/api/pdf/ordine/${ord.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center py-2 px-2 rounded-xl bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-950 font-extrabold text-xs border border-petruzzi-300 transition"
                    title="Download PDF"
                  >
                    <span>📄 PDF</span>
                  </a>

                  <button
                    onClick={() => onEditOrder(ord)}
                    className="flex items-center justify-center py-2 px-2 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs transition shadow-sm"
                    title="Modifica Ordine"
                  >
                    <Edit3 className="w-4 h-4 text-petruzzi-300" />
                  </button>

                  <button
                    onClick={() => setDeleteConfirmId(ord.id)}
                    className="flex items-center justify-center py-2 px-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 font-extrabold text-xs border border-red-300 transition"
                    title="Annulla Ordine"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Delete Confirmation Overlay */}
                {deleteConfirmId === ord.id && (
                  <div className="p-2.5 bg-red-100 border border-red-300 rounded-xl text-center space-y-2">
                    <p className="text-[11px] font-bold text-red-900">Eliminare l'ordine?</p>
                    <div className="flex justify-center space-x-2">
                      <button
                        onClick={() => {
                          onDeleteOrder(ord.id);
                          setDeleteConfirmId(null);
                        }}
                        className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold"
                      >
                        Sì
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-2.5 py-1 bg-petruzzi-200 text-petruzzi-900 rounded-lg text-xs font-bold"
                      >
                        No
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          ))
        )}
      </div>

    </div>
  );
}
