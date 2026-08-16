import React from 'react';
import { RefreshCw, ChevronDown, Tablet, ShieldCheck } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, selectedDate, setSelectedDate, onOpenNewOrderModal, onRefresh, onReprocessAll, isRefreshing }) {
  return (
    <header className="sticky top-0 z-40 petruzzi-header-glow backdrop-blur-xl border-b border-petruzzi-700/20 shadow-md bg-white/95 text-petruzzi-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Compact Single Header Bar */}
        <div className="flex flex-wrap items-center justify-between py-2.5 gap-3">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="bg-white p-1 rounded-xl border border-petruzzi-300 shadow-sm flex items-center justify-center">
              <img
                src="/images/logo.png"
                alt="Caseificio Petruzzi"
                className="h-9 w-auto object-contain"
              />
            </div>
            <div>
              <h1 className="text-base font-black text-petruzzi-950 tracking-tight leading-tight">
                Caseificio Petruzzi Manager
              </h1>
            </div>
          </div>

          {/* Right Quick Actions & Navigation Dropdown Menu */}
          <div className="flex items-center space-x-2">

            

            {/* Quick Standalone Entry Links for Tablet and Titolare */}
            <div className="hidden lg:flex items-center space-x-1.5 bg-petruzzi-100 p-1 rounded-xl border border-petruzzi-300">
              <button
                onClick={() => setActiveTab('tablet')}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  activeTab === 'tablet'
                    ? 'bg-petruzzi-800 text-white'
                    : 'text-petruzzi-800 hover:bg-petruzzi-200'
                }`}
                title="Postazione Tablet Confezionamento"
              >
                <Tablet className="w-3.5 h-3.5" />
                <span>Tablet</span>
              </button>
            </div>
            
            {/* Live WhatsApp Dot */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-[11px] font-bold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              <span className="hidden sm:inline">WhatsApp</span>
            </div>

            {/* Refresh */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-800 border border-petruzzi-300 transition"
              title="Aggiorna dati"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-petruzzi-700' : ''}`} />
            </button>

            {/* Rielabora Tutti Ordini IA Button */}
            {onReprocessAll && (
              <button
                onClick={onReprocessAll}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs border border-amber-300 transition shadow-sm"
                title="Rielabora tutti gli ordini con la nuova chiave IA o parser"
              >
                <span>🧠 Rielabora IA</span>
              </button>
            )}

           {/* Navigation Dropdown Menu */}
              <div className="relative">
                <select
                  value={activeTab}
                  onChange={(e) => {
                    if (e.target.value === 'nuovo-ordine') {
                      onOpenNewOrderModal();
                    } else {
                      setActiveTab(e.target.value);
                    }
                  }}
                  className="bg-gradient-to-r from-petruzzi-700 to-petruzzi-800 text-white font-black text-xs rounded-xl pl-3.5 pr-8 py-2 outline-none cursor-pointer shadow-md border border-petruzzi-900 hover:from-petruzzi-800 hover:to-petruzzi-900 transition appearance-none"
                >
                  {/* GRUPPO 1: Gestione Principale */}
                  <option value="produzione" className="bg-white text-petruzzi-950 font-bold">🏭 Produzione Casaro</option>
                  
                  <option value="ordini" className="bg-white text-petruzzi-950 font-bold">📦 Ordini Clienti</option>
                  <option value="nuovo-ordine" className="bg-petruzzi-100 text-petruzzi-950 font-black">➕ Creazione Nuovo Ordine</option>
                  <option value="confermati" className="bg-white text-emerald-800 font-bold">✅ Ordini Confermati</option>
                  {/* SPAZIO VUOTO NON SELEZIONABILE */}
                  <option disabled className="bg-gray-100 text-gray-400 text-center font-normal">──────────</option>

                  {/* GRUPPO 2: Viste Specifiche */}
                  <option value="produzione-sole" className="bg-amber-50 text-amber-950 font-black">☀️ Produzione Totale Sole 365</option>
                  <option value="sole" className="bg-amber-50 text-amber-900 font-bold">☀️ Ordini Gruppo Sole 365</option>
                  <option value="filoni" className="bg-white text-petruzzi-950 font-bold">🍕 Filoni Pizzeria</option>
                  
                  {/* SPAZIO VUOTO NON SELEZIONABILE */}
                  <option disabled className="bg-gray-100 text-gray-400 text-center font-normal">──────────</option>

                  {/* GRUPPO 3: Strumenti e Amministrazione */}
                  <option value="anagrafica" className="bg-white text-petruzzi-950 font-bold">👥 Rubrica & Particolarità Clienti</option>
                  <option value="broadcast" className="bg-white text-petruzzi-900 font-bold">📢 Broadcast & Notifiche</option>
                  <option value="statistiche" className="bg-white text-petruzzi-950 font-bold">📊 Statistiche & Controllo</option>
                  <option value="connessione" className="bg-white text-emerald-800 font-bold">📲 Connessione Banco WhatsApp</option>
                </select>
                <ChevronDown className="w-4 h-4 text-white absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none stroke-[3]" />
              </div>
          </div>

        </div>

      </div>
    </header>
  );
}
