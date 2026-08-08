import React, { useState } from 'react';
import { Calendar, Printer, Flame, CheckCircle2, Search } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

export default function ProduzioneGiornaliera({ produzione, selectedDate, setSelectedDate }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProduzione = produzione.filter(item => {
    return (
      item.nome_prodotto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.codice_articolo.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalKg = produzione
    .filter(i => i.unita_di_misura?.toLowerCase() === 'kg')
    .reduce((acc, curr) => acc + curr.quantita_totale, 0);

  const totalPz = produzione
    .filter(i => i.unita_di_misura?.toLowerCase() === 'pezzi' || i.unita_di_misura?.toLowerCase() === 'pz')
    .reduce((acc, curr) => acc + curr.quantita_totale, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Compact & Delicate Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 rounded-xl bg-petruzzi-100/90 border border-petruzzi-200">
        
        {/* Date Selector */}
        <div className="flex items-center space-x-3">
          <Calendar className="w-4 h-4 text-petruzzi-700" />
          <span className="text-xs font-bold text-petruzzi-900 uppercase">Data:</span>
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

        {/* Delicate PDF Button */}
        <a
          href={`/api/pdf/produzione?data=${selectedDate}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-petruzzi-800 hover:bg-petruzzi-900 text-white text-xs font-bold transition text-decoration-none shadow-sm"
        >
          <Printer className="w-4 h-4" />
          <span>Stampa Scheda PDF</span>
        </a>

      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-petruzzi-600" />
        <input
          type="text"
          placeholder="Cerca un formaggio o codice articolo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-petruzzi-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-petruzzi-700 shadow-sm"
        />
      </div>

      {/* Main Aggregated Totals Table */}
      <div className="petruzzi-card rounded-2xl overflow-hidden border border-petruzzi-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-petruzzi-800 border-b border-petruzzi-900 text-petruzzi-100 text-xs font-black uppercase tracking-wider">
                <th className="py-4 px-6">Codice Articolo</th>
                <th className="py-4 px-6">Formato / Prodotto</th>
                <th className="py-4 px-6 text-right">Quantità Totale da Produrre</th>
                <th className="py-4 px-6 text-center">Unità</th>
                <th className="py-4 px-6 text-center">Ordini Totali</th>
                <th className="py-4 px-6 text-center">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-petruzzi-200/80 text-sm">
              {filteredProduzione.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-petruzzi-600 font-medium">
                    Nessun prodotto da lavorare per la data selezionata.
                  </td>
                </tr>
              ) : (
                filteredProduzione.map((item, idx) => {
                  const isHeavy = item.quantita_totale >= 10.0;
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-petruzzi-100/60 transition-colors ${
                        isHeavy ? 'bg-petruzzi-100/80' : ''
                      }`}
                    >
                      {/* Codice Articolo */}
                      <td className="py-4 px-6 font-mono text-xs font-extrabold text-petruzzi-800">
                        {item.codice_articolo}
                      </td>

                      {/* Nome Prodotto */}
                      <td className="py-4 px-6 font-bold text-petruzzi-950 text-base">
                        <div className="flex items-center space-x-2">
                          <span>{item.nome_prodotto}</span>
                          {isHeavy && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                              <Flame className="w-3.5 h-3.5 text-amber-700" />
                              <span>Volume Alto</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quantità Totale */}
                      <td className="py-4 px-6 text-right">
                        <span className={`text-2xl font-black ${isHeavy ? 'text-petruzzi-800' : 'text-petruzzi-950'}`}>
                          {item.quantita_totale.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                      </td>

                      {/* Unità di Misura */}
                      <td className="py-4 px-6 text-center uppercase font-black text-xs text-petruzzi-800">
                        <span className="px-3 py-1 rounded-lg bg-petruzzi-100 border border-petruzzi-300">
                          {item.unita_di_misura}
                        </span>
                      </td>

                      {/* N. Ordini */}
                      <td className="py-4 px-6 text-center text-petruzzi-800 font-bold">
                        {item.numero_ordini} {item.numero_ordini === 1 ? 'cliente' : 'clienti'}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6 text-center">
                        <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1 rounded-full">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          <span>In Produzione</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
