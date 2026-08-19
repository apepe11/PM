import React, { useState, useEffect } from 'react';
import { Calendar, Printer, Pizza, Sparkles, CheckCircle2, MessageSquare, Search, Edit3, Trash2, Plus } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

export default function FiloniPizzeria({ selectedDate, setSelectedDate, onEditOrder, onDeleteOrder, onOpenNewOrderModal }) {
  const [clientiFiloni, setClientiFiloni] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const fetchFiloniData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/filoni?data=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setClientiFiloni(data);
      }
    } catch (e) {
      console.error("Errore fetch filoni:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFiloniData();
  }, [selectedDate]);

  const filteredClienti = clientiFiloni.filter(c => 
    c.mittente.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.prodotti_filoni.some(p => (p.nome_articolo || p.codice_articolo).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Compact & Delicate Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 rounded-xl bg-petruzzi-100/90 border border-petruzzi-200">
        
        {/* Date Selector */}
        <div className="flex items-center space-x-3">
          <Pizza className="w-4 h-4 text-petruzzi-700" />
          <span className="text-xs font-bold text-petruzzi-900 uppercase">Data Filoni:</span>
          <div className="flex items-center space-x-1.5">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-petruzzi-300 text-petruzzi-950 rounded-lg px-2.5 py-1 text-xs font-bold focus:ring-1 focus:ring-petruzzi-700 outline-none shadow-sm"
            />
            <span className="text-xs font-black text-petruzzi-900 bg-white px-2.5 py-1 rounded-lg border border-petruzzi-300 shadow-sm font-mono">
              {formatDateIT(selectedDate)}
            </span>
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
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5">
          {onOpenNewOrderModal && (
            <button
              onClick={() => onOpenNewOrderModal(false)}
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-petruzzi-700 hover:bg-petruzzi-800 text-white text-xs font-black transition shadow-sm border border-petruzzi-800"
            >
              <Plus className="w-4 h-4 text-petruzzi-200" />
              <span>➕ Aggiungi Ordine Filoni</span>
            </button>
          )}

          {/* Delicate PDF Button */}
          <a
            href={`/api/pdf/filoni?data=${selectedDate}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-petruzzi-800 hover:bg-petruzzi-900 text-white text-xs font-bold transition text-decoration-none shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Stampa Scheda Filoni PDF</span>
          </a>
        </div>

      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-petruzzi-600" />
        <input
          type="text"
          placeholder="Cerca per pizzeria o tipo di filone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-petruzzi-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-petruzzi-700 shadow-sm"
        />
      </div>

      {/* Client Filoni List */}
      <div className="space-y-4">
        {filteredClienti.length === 0 ? (
          <div className="petruzzi-card p-12 rounded-2xl text-center border border-petruzzi-200">
            <Pizza className="w-12 h-12 text-petruzzi-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-petruzzi-800">Nessuna pizzeria o ordine filoni per questa data</h3>
            <p className="text-sm text-petruzzi-600 mt-1">Gli ordini contenenti filoni di mozzarella appariranno qui organizzati per cliente.</p>
            {onOpenNewOrderModal && (
              <button
                onClick={() => onOpenNewOrderModal(false)}
                className="mt-4 inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white text-xs font-bold transition shadow-md"
              >
                <Plus className="w-4 h-4 text-petruzzi-200" />
                <span>➕ Aggiungi Ordine Filoni Manuale</span>
              </button>
            )}
          </div>
        ) : (
          filteredClienti.map((cli, idx) => (
            <div key={idx} className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 space-y-4">
              
              {/* Client Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-petruzzi-200 pb-3 gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-petruzzi-100 border border-petruzzi-300 flex items-center justify-center text-petruzzi-800 font-extrabold text-lg shrink-0">
                    🍕
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-petruzzi-950">{cli.mittente}</h3>
                    <p className="text-xs text-petruzzi-700">Data Consegna: {formatDateIT(cli.data_consegna)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Somma Teorica */}
                  <div className="text-right bg-petruzzi-50 px-3 py-1.5 rounded-xl border border-petruzzi-200">
                    <span className="text-[10px] text-petruzzi-600 uppercase font-bold block">Somma Teorica Filoni</span>
                    <span className="text-base font-black text-petruzzi-800">
                      {cli.totale_kg > 0 ? `${cli.totale_kg} KG` : `${cli.totale_pz} PZ`}
                    </span>
                  </div>

                  {/* Campi input visivi per la schermata (Vuoti di default come da richiesta) */}
                  <div className="text-left">
                    <span className="text-[10px] text-petruzzi-700 uppercase font-bold block mb-1">Peso Reale (Somma)</span>
                    <input type="text" placeholder="es. 10.5 KG" className="w-24 bg-white border border-petruzzi-300 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-petruzzi-700" />
                  </div>

                  <div className="text-left">
                    <span className="text-[10px] text-petruzzi-700 uppercase font-bold block mb-1">Lotto Unico</span>
                    <input type="text" placeholder="N° Lotto" className="w-20 bg-white border border-petruzzi-300 rounded-lg px-2 py-1.5 text-xs font-bold font-mono outline-none focus:border-petruzzi-700" />
                  </div>

                  <div className="flex items-center space-x-1.5 border-l border-petruzzi-200 pl-4">
                    {onEditOrder && (
                      <button
                        onClick={() => onEditOrder({
                          id: cli.id_ordine,
                          mittente: cli.mittente,
                          prodotti: cli.prodotti || cli.prodotti_filoni,
                          note_ordine: cli.note_ordine,
                          data_consegna: cli.data_consegna
                        })}
                        className="p-2 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs transition shadow-sm"
                        title="Modifica Ordine"
                      >
                        <Edit3 className="w-4 h-4 text-petruzzi-300" />
                      </button>
                    )}

                    {onDeleteOrder && (
                      <button
                        onClick={() => setDeleteConfirmId(cli.id_ordine)}
                        className="p-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 font-extrabold text-xs border border-red-300 transition"
                        title="Annulla / Elimina Ordine"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Delete Confirmation Overlay */}
              {deleteConfirmId === cli.id_ordine && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-center space-y-2">
                  <p className="text-xs font-bold text-red-900">Eliminare l'ordine per {cli.mittente}?</p>
                  <div className="flex justify-center space-x-2">
                    <button
                      onClick={async () => {
                        await onDeleteOrder(cli.id_ordine);
                        setDeleteConfirmId(null);
                        fetchFiloniData();
                      }}
                      className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold"
                    >
                      Sì, Elimina
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-3 py-1 bg-petruzzi-200 text-petruzzi-900 rounded-lg text-xs font-bold"
                    >
                      No
                    </button>
                  </div>
                </div>
              )}

              {/* Filoni Products Table */}
              <div className="overflow-x-auto rounded-xl border border-petruzzi-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-petruzzi-800 text-petruzzi-100 text-xs font-bold uppercase tracking-wider border-b border-petruzzi-900">
                      <th className="py-2.5 px-4">Codice</th>
                      <th className="py-2.5 px-4">Tipologia Filone Ordinato</th>
                      <th className="py-2.5 px-4 text-right">Quantità</th>
                      <th className="py-2.5 px-4 text-center">Unità</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-petruzzi-200/80 bg-white">
                    {cli.prodotti_filoni.map((pf, pfIdx) => (
                      <tr key={pfIdx} className="hover:bg-petruzzi-50">
                        <td className="py-3 px-4 font-mono font-bold text-xs text-petruzzi-800">{pf.codice_articolo}</td>
                        <td className="py-3 px-4 font-bold text-petruzzi-950">{pf.nome_articolo || pf.codice_articolo}</td>
                        <td className="py-3 px-4 text-right font-black text-petruzzi-800 text-base">{pf.quantita}</td>
                        <td className="py-3 px-4 text-center uppercase text-xs font-bold text-petruzzi-700">{pf.unita_di_misura || 'kg'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Special Notes */}
              {cli.note_ordine && (
                <div className="bg-petruzzi-100/80 p-3 rounded-xl border border-petruzzi-300 flex items-start space-x-2 text-xs">
                  <MessageSquare className="w-4 h-4 text-petruzzi-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-petruzzi-900">Note Pizzeria: </span>
                    <span className="text-petruzzi-800 italic">{cli.note_ordine}</span>
                  </div>
                </div>
              )}

            </div>
          ))
        )}
      </div>

    </div>
  );
}