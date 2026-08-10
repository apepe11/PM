import React, { useState } from 'react';
import { CheckCircle2, FileText, Calendar, Hash, Scale, Clock, Search, ExternalLink, PackageCheck } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

export default function OrdiniConfermati({ ordini, selectedDate, setSelectedDate }) {
  const [searchTerm, setSearchTerm] = useState('');

  const ordiniConfermati = ordini.filter(o => {
    const isConf = o.stato_ordine === 'CONFERMATO' || o.stato_confezionamento === 'CONFEZIONATO';
    const matchSearch = (o.mittente || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (o.numero_lotto || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchDate = !selectedDate || o.data_consegna === selectedDate;
    return isConf && matchSearch && matchDate;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-petruzzi-100/90 border border-petruzzi-200 shadow-md">
        <div>
          <div className="flex items-center space-x-2 text-emerald-800 text-xs font-bold uppercase tracking-widest mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>REGISTRO UFFICIALE ORDINI EVASI E CONFERMATI</span>
          </div>
          <h2 className="text-xl font-extrabold text-petruzzi-950">Ordini Confermati & Bolle di Spedizione</h2>
          <p className="text-xs text-petruzzi-700 mt-0.5">Ordini verificati con grammature per articolo, lotti assegnati e download PDF 1-click.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-petruzzi-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cerca cliente o lotto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border border-petruzzi-300 rounded-xl pl-8 pr-3 py-1.5 text-xs text-petruzzi-950 placeholder-petruzzi-600/70 outline-none focus:border-petruzzi-700 shadow-sm"
            />
          </div>

          <div className="flex items-center space-x-1.5 bg-white p-1 rounded-xl border border-petruzzi-300 shadow-sm">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-petruzzi-50 border border-petruzzi-200 text-petruzzi-950 text-xs font-bold rounded-lg px-2 py-1 outline-none cursor-pointer"
            />
            {selectedDate && (
              <span className="text-xs font-black text-petruzzi-900 bg-petruzzi-100 px-2 py-1 rounded-lg border border-petruzzi-300 font-mono">
                {formatDateIT(selectedDate)}
              </span>
            )}
            <button
              onClick={() => setSelectedDate('')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                !selectedDate ? 'bg-petruzzi-800 text-white' : 'text-petruzzi-700 hover:text-petruzzi-950'
              }`}
            >
              Tutti
            </button>
          </div>

          <a
            href={`/api/pdf/ordini-confezionati-banco?data=${selectedDate}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shadow-md transition transform active:scale-95"
            title="Stampa Scheda Riepilogativa Banco 1-Click"
          >
            <FileText className="w-4 h-4" />
            <span>📋 PDF RIEPILOGO BANCO</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ordiniConfermati.length === 0 ? (
          <div className="col-span-full p-12 text-center petruzzi-card rounded-2xl border border-petruzzi-200">
            <PackageCheck className="w-12 h-12 text-petruzzi-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-petruzzi-800">Nessun ordine confermato presente per la data selezionata</h3>
            <p className="text-xs text-petruzzi-600 mt-1">Conferma gli ordini dalla sezione "Ordini Clienti" o dalla "Postazione Tablet".</p>
          </div>
        ) : (
          ordiniConfermati.map((ord) => (
            <div
              key={ord.id}
              className="petruzzi-card p-6 rounded-2xl border border-emerald-300 bg-emerald-50/40 space-y-4 hover:border-emerald-500 transition shadow-lg"
            >
              <div className="flex items-center justify-between border-b border-petruzzi-200 pb-3">
                <div>
                  <h3 className="text-lg font-black text-petruzzi-950 flex items-center space-x-2">
                    <span>{ord.mittente}</span>
                  </h3>
                  <div className="flex items-center space-x-2 mt-0.5 text-xs text-petruzzi-700">
                    <span>Consegna: <strong className="text-petruzzi-900">{formatDateIT(ord.data_consegna)}</strong></span>
                    <span>•</span>
                    <span className="flex items-center space-x-1 text-emerald-800 font-semibold">
                      <Clock className="w-3 h-3 text-emerald-700" />
                      <span>{formatDateIT(ord.data_conferma) || 'Confermato'}</span>
                    </span>
                  </div>
                </div>

                <a
                  href={`/api/pdf/ordine/${ord.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs shadow-md transition transform active:scale-95 shrink-0"
                >
                  <FileText className="w-4 h-4" />
                  <span>PDF ORDINE</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </a>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-bold text-petruzzi-700 uppercase tracking-wider block">
                  Articoli Confezionati & Lotti:
                </span>
                
                <div className="bg-white/90 rounded-xl p-3 border border-petruzzi-200 divide-y divide-petruzzi-200 space-y-2 max-h-48 overflow-y-auto">
                  {ord.prodotti && ord.prodotti.map((p, pIdx) => (
                    <div key={pIdx} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-petruzzi-950 block">{p.nome_articolo || p.codice_articolo}</span>
                        <div className="flex items-center space-x-2 mt-0.5 text-[11px]">
                          <span className="text-petruzzi-700">
                            Grammatura: <strong className="text-petruzzi-900">{p.grammatura || `${p.quantita} ${p.unita_di_misura}`}</strong>
                            {p.is_peso_fisso && (
                              <span className="ml-1 text-[9px] bg-petruzzi-100 text-petruzzi-800 px-1.5 py-0.5 rounded font-mono uppercase border border-petruzzi-300">Peso Fisso</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-2.5 py-1 bg-petruzzi-100 border border-petruzzi-300 rounded-lg text-petruzzi-900 font-mono font-bold text-xs inline-flex items-center space-x-1">
                          <Hash className="w-3 h-3 text-petruzzi-600" />
                          <span>{p.numero_lotto || ord.numero_lotto || '-'}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {ord.note_ordine && (
                <div className="bg-petruzzi-100/70 p-2.5 rounded-xl border border-petruzzi-200 text-xs text-petruzzi-900">
                  <span className="font-bold text-petruzzi-700 uppercase tracking-wider block text-[10px]">Note:</span>
                  <p className="italic">{ord.note_ordine}</p>
                </div>
              )}

              {ord.peso_reale && (
                <div className="pt-2 border-t border-petruzzi-200 flex items-center justify-between text-xs text-petruzzi-800">
                  <span className="flex items-center space-x-1">
                    <Scale className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Tot. Pesato Variabile: <strong className="text-emerald-900 font-extrabold">{ord.peso_reale} KG</strong></span>
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md font-bold text-[10px] uppercase border border-emerald-300">
                    ✅ CONFERMATO IN LABORATORIO
                  </span>
                </div>
              )}

            </div>
          ))
        )}
      </div>

    </div>
  );
}