import React from 'react';
import AdminRemoteHub from './components/AdminRemoteHub';
import { Monitor } from 'lucide-react';

export default function TitolareApp() {
  return (
    <div className="min-h-screen bg-[#FAF6F0] text-petruzzi-950 flex flex-col font-sans">
      
      {/* Top Banner Navigation for Owner Remote Hub */}
      <header className="bg-white border-b border-petruzzi-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <img src="/images/logo.png" alt="Caseificio Petruzzi" className="h-8 w-auto object-contain" />
          <div>
            <h1 className="text-base font-black text-petruzzi-950 tracking-tight leading-none">
              Caseificio Petruzzi
            </h1>
            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-widest block mt-0.5">
              🛡️ MODULO REMOTO TITOLARE & CONTROLLO GESTIONE
            </span>
          </div>
        </div>

        <a
          href="/"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 border border-petruzzi-300 font-bold text-xs transition shadow-sm"
        >
          <Monitor className="w-4 h-4 text-petruzzi-700" />
          <span className="hidden sm:inline">Server Principale</span>
        </a>
      </header>

      {/* Main Owner Remote Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        <AdminRemoteHub />
      </main>

    </div>
  );
}
