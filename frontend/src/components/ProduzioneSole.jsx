import React, { useState } from 'react';
import { Calendar, Printer, Flame, Search, Sun, Store, Layers } from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

export default function ProduzioneSole({ produzioneSole = [], selectedDate, setSelectedDate }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProduzione = produzioneSole.filter(item => {
    const nome = (item.nome_prodotto || '').toLowerCase();
    const cod = (item.codice_articolo || '').toLowerCase();
    const query = searchTerm.toLowerCase();
    return nome.includes(query) || cod.includes(query);
  });

  const totalKg = produzioneSole
    .filter(i => (i.unita_di_misura || '').toLowerCase() === 'kg')
    .reduce((acc, curr) => acc + curr.quantita_totale, 0);

  const totalPz = produzioneSole
    .filter(i => {
      const um = (i.unita_di_misura || '').toLowerCase();
      return um === 'pezzi' || um === 'pz' || um === 'coppia' || um === 'coppie';
    })
    .reduce((acc, curr) => acc + curr.quantita_totale, 0);

  // Set di tutti i punti vendita unici coinvolti
  const puntiVenditaUnici = new Set();
  produzioneSole.forEach(item => {
    (item.clienti || []).forEach(c => puntiVenditaUnici.add(c));
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Banner & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 rounded-xl bg-amber-50/90 border border-amber-300/80 shadow-sm">
        
        {/* Date Selector */}
        <div className="flex items-center space-x-3">
          <Sun className="w-4 h-4 text-amber-700" />
          <span className="text-xs font-black text-amber-950 uppercase tracking-wider">Data Sole:</span>
          <div className="flex items-center space-x-1.5">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-amber-300 text-petruzzi-950 rounded-lg px-2.5 py-1 text-xs font-bold focus:ring-1 focus:ring-amber-600 outline-none shadow-sm"
            />
            <span className="text-xs font-black text-amber-950 bg-white px-2.5 py-1 rounded-lg border border-amber-300 shadow-sm font-mono">
              {formatDateIT(selectedDate)}
            </span>
          </div>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
              selectedDate === new Date().toISOString().split('T')[0]
                ? 'bg-amber-800 text-white border-amber-800'
                : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
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
        </div>

        {/* PDF Stampa Scheda Produzione Sole */}
        <a
          href={`/api/pdf/produzione-sole?data=${selectedDate}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white text-xs font-black transition text-decoration-none shadow-sm"
        >
          <Printer className="w-4 h-4" />
          <span>Stampa Scheda PDF Sole 365</span>
        </a>

      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="petruzzi-card p-4 rounded-xl border border-amber-200 bg-white/90 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Totale Peso Sole</span>
          <div className="text-xl font-black text-amber-950">
            {totalKg.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} <span className="text-xs font-bold text-amber-800">KG</span>
          </div>
        </div>

        <div className="petruzzi-card p-4 rounded-xl border border-amber-200 bg-white/90 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Totale Pezzi Sole</span>
          <div className="text-xl font-black text-amber-950">
            {Math.round(totalPz)} <span className="text-xs font-bold text-amber-800">PZ</span>
          </div>
        </div>

        <div className="petruzzi-card p-4 rounded-xl border border-amber-200 bg-white/90 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block flex items-center space-x-1">
            <Store className="w-3 h-3 text-amber-700" />
            <span>Punti Vendita</span>
          </span>
          <div className="text-xl font-black text-amber-950">
            {puntiVenditaUnici.size} <span className="text-xs font-bold text-amber-800">attivi</span>
          </div>
        </div>

        <div className="petruzzi-card p-4 rounded-xl border border-amber-200 bg-white/90 shadow-sm space-y-1">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block flex items-center space-x-1">
            <Layers className="w-3 h-3 text-amber-700" />
            <span>Referenze Sole</span>
          </span>
          <div className="text-xl font-black text-amber-950">
            {produzioneSole.length} <span className="text-xs font-bold text-amber-800">voci</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-petruzzi-600" />
        <input
          type="text"
          placeholder="Cerca un prodotto Sole o codice articolo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-petruzzi-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-amber-600 shadow-sm"
        />
      </div>

      {/* Main Aggregated Totals Table */}
      <div className="petruzzi-card rounded-2xl overflow-hidden border border-amber-200 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-amber-900 border-b border-amber-950 text-amber-100 text-xs font-black uppercase tracking-wider">
                <th className="py-4 px-6">Codice Articolo</th>
                <th className="py-4 px-6">Formato / Prodotto Sole 365</th>
                <th className="py-4 px-6 text-right">Quantità Totale Sole</th>
                <th className="py-4 px-6 text-center">Unità</th>
                <th className="py-4 px-6 text-left">Punti Vendita Richiedenti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100 text-sm">
              {filteredProduzione.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-12 text-petruzzi-600 font-medium">
                    <div className="space-y-2">
                      <Sun className="w-10 h-10 text-amber-400 mx-auto" />
                      <p className="font-bold text-petruzzi-800">Nessun prodotto Sole 365 da lavorare per la data selezionata.</p>
                      <p className="text-xs text-petruzzi-600">Gli ordini pervenuti dai supermercati del gruppo Sole 365 verranno consolidati automaticamente qui.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProduzione.map((item, idx) => {
                  const isHeavy = item.quantita_totale >= 10.0;
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-amber-50/70 transition-colors ${
                        isHeavy ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Codice Articolo */}
                      <td className="py-4 px-6 font-mono text-xs font-extrabold text-amber-900">
                        {item.codice_articolo}
                      </td>

                      {/* Nome Prodotto */}
                      <td className="py-4 px-6 font-bold text-petruzzi-950 text-base">
                        <div className="flex items-center space-x-2">
                          <span>{item.nome_prodotto}</span>
                          {isHeavy && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                              <Flame className="w-3.5 h-3.5 text-amber-700" />
                              <span>Volume Alto</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Quantità Totale */}
                      <td className="py-4 px-6 text-right">
                        <span className={`text-2xl font-black ${isHeavy ? 'text-amber-900' : 'text-petruzzi-950'}`}>
                          {item.unita_di_misura?.toLowerCase() === 'pezzi' || item.unita_di_misura?.toLowerCase() === 'pz'
                            ? Math.round(item.quantita_totale)
                            : item.quantita_totale.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                      </td>

                      {/* Unità di Misura */}
                      <td className="py-4 px-6 text-center uppercase font-black text-xs text-amber-900">
                        <span className="px-3 py-1 rounded-lg bg-amber-100 border border-amber-300">
                          {item.unita_di_misura}
                        </span>
                      </td>

                      {/* Punti Vendita / Ordini */}
                      <td className="py-4 px-6 text-left">
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="text-xs font-black text-amber-900 mr-1">
                            {item.numero_ordini} {item.numero_ordini === 1 ? 'ordine' : 'ordini'}:
                          </span>
                          {(item.clienti || []).map((c, cIdx) => (
                            <span
                              key={cIdx}
                              className="px-2 py-0.5 rounded-md bg-white border border-amber-300 text-amber-950 font-bold text-[11px] shadow-sm"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
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
