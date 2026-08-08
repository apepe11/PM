import React, { useState, useEffect } from 'react';
import { Send, Users, Calendar, Clock, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw, MessageSquare, History, Zap, BellRing, CheckSquare, Square, Search, Repeat } from 'lucide-react';

export default function BroadcastManager() {
  const [activeSubTab, setActiveSubTab] = useState('liste');
  const [liste, setListe] = useState([]);
  const [schedulati, setSchedulati] = useState([]);
  const [logs, setLogs] = useState([]);
  const [registeredClients, setRegisteredClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // State Form creazione Lista & Schedulazione Automatica Integrata
  const [nomeNuovaLista, setNomeNuovaLista] = useState('');
  const [contattiInput, setContattiInput] = useState('');
  const [attivaAutoSchedule, setAttivaAutoSchedule] = useState(true);
  const [orarioProgrammatoForm, setOrarioProgrammatoForm] = useState('');
  const [ricorrenzaForm, setRicorrenzaForm] = useState('UNA_TANTUM');
  const [messaggioAutoForm, setMessaggioAutoForm] = useState('');

  // State Schedulatore Separato
  const [selectedListaId, setSelectedListaId] = useState('');
  const [messaggioBroadcast, setMessaggioBroadcast] = useState('');
  const [orarioProgrammato, setOrarioProgrammato] = useState('');
  const [ricorrenzaSeparata, setRicorrenzaSeparata] = useState('UNA_TANTUM');

  const [toast, setToast] = useState('');

  const fetchBroadcastData = async () => {
    setIsLoading(true);
    try {
      const [resListe, resSched, resLogs, resClienti] = await Promise.all([
        fetch('/api/broadcast/liste'),
        fetch('/api/broadcast/schedulati'),
        fetch('/api/broadcast/logs'),
        fetch('/api/clienti')
      ]);

      if (resListe.ok) setListe(await resListe.json());
      if (resSched.ok) setSchedulati(await resSched.json());
      if (resLogs.ok) setLogs(await resLogs.json());
      if (resClienti.ok) setRegisteredClients(await resClienti.json());
    } catch (e) {
      console.error("Errore fetch broadcast:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBroadcastData();
    const nextTime = new Date(Date.now() + 15 * 60000).toISOString().slice(0, 16);
    setOrarioProgrammatoForm(nextTime);
    setOrarioProgrammato(nextTime);
  }, []);

  const toggleClientSelection = (clientName) => {
    if (selectedClients.includes(clientName)) {
      setSelectedClients(selectedClients.filter(c => c !== clientName));
    } else {
      setSelectedClients([...selectedClients, clientName]);
    }
  };

  const handleSelectAllClients = () => {
    setSelectedClients([...registeredClients]);
  };

  const handleDeselectAllClients = () => {
    setSelectedClients([]);
  };

  const filteredClientsList = registeredClients.filter(c =>
    c.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Flusso 1-Click: Salva Lista + Programma Messaggio Automatico
  const handleSaveListaEProgrammaAuto = async (e) => {
    e.preventDefault();
    if (!nomeNuovaLista.trim()) {
      alert("Inserire il nome per la lista broadcast!");
      return;
    }

    const manualContacts = contattiInput
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => ({ nome: line }));

    const clientContacts = selectedClients.map(c => ({ nome: c }));

    const contattiAggregati = [...clientContacts, ...manualContacts];

    if (contattiAggregati.length === 0) {
      alert("Seleziona almeno un cliente dalla lista o inserisci un contatto manuale!");
      return;
    }

    if (attivaAutoSchedule) {
      if (!orarioProgrammatoForm || !messaggioAutoForm.trim()) {
        alert("Per programmare il messaggio automatico occorre specificare l'orario ed il testo del messaggio!");
        return;
      }
    }

    try {
      // 1. Salva Lista Contatti su DB
      const resLista = await fetch('/api/broadcast/liste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_lista: nomeNuovaLista, contatti: contattiAggregati })
      });

      if (!resLista.ok) {
        alert("Errore salvataggio lista.");
        return;
      }

      // 2. Se l'opzione Messaggio Automatico è attiva, schedula l'invio
      if (attivaAutoSchedule) {
        const listeAggiornate = await (await fetch('/api/broadcast/liste')).json();
        const targetSaved = listeAggiornate.find(l => l.nome_lista.toLowerCase() === nomeNuovaLista.trim().toLowerCase());
        const targetId = targetSaved ? targetSaved.id : 0;

        await fetch('/api/broadcast/schedulati', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_lista: targetId,
            nome_lista: nomeNuovaLista,
            messaggio: messaggioAutoForm,
            orario_programmato: orarioProgrammatoForm.replace('T', ' '),
            ricorrenza: ricorrenzaForm
          })
        });

        setToast(`🚀 Lista "${nomeNuovaLista}" creata ed Invio (${ricorrenzaForm}) ATTIVATO!`);
      } else {
        setToast(`✅ Lista "${nomeNuovaLista}" salvata con successo!`);
      }

      // Reset Form
      setNomeNuovaLista('');
      setContattiInput('');
      setSelectedClients([]);
      setMessaggioAutoForm('');
      setTimeout(() => setToast(''), 5000);
      fetchBroadcastData();

    } catch (e) {
      alert("Errore durante la creazione e programmazione broadcast.");
    }
  };

  const handlePrecompilaModalitaAuto = (listaObj) => {
    setSelectedListaId(listaObj.id);
    setActiveSubTab('programma');
  };

  const handleDeleteLista = async (idLista) => {
    if (!window.confirm("Eliminare questa lista broadcast?")) return;
    try {
      await fetch(`/api/broadcast/liste/${idLista}`, { method: 'DELETE' });
      fetchBroadcastData();
    } catch (e) {
      alert("Errore durante l'eliminazione.");
    }
  };

  const handleScheduleBroadcast = async (e) => {
    e.preventDefault();
    if (!selectedListaId || !messaggioBroadcast.trim() || !orarioProgrammato) {
      alert("Compilare lista, messaggio ed orario programmato!");
      return;
    }

    const targetL = liste.find(l => String(l.id) === String(selectedListaId));
    const nomeL = targetL ? targetL.nome_lista : 'Lista';

    try {
      const res = await fetch('/api/broadcast/schedulati', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_lista: parseInt(selectedListaId),
          nome_lista: nomeL,
          messaggio: messaggioBroadcast,
          orario_programmato: orarioProgrammato.replace('T', ' '),
          ricorrenza: ricorrenzaSeparata
        })
      });

      if (res.ok) {
        setMessaggioBroadcast('');
        setToast("✅ Broadcast programmato con successo!");
        setTimeout(() => setToast(''), 4000);
        fetchBroadcastData();
      }
    } catch (e) {
      alert("Errore programmazione broadcast.");
    }
  };

  const handleDeleteSchedulato = async (idSched) => {
    if (!window.confirm("Sei sicuro di voler eliminare questo messaggio broadcast programmato?")) return;
    try {
      await fetch(`/api/broadcast/schedulati/${idSched}`, { method: 'DELETE' });
      setToast("🗑️ Messaggio broadcast programmato eliminato.");
      setTimeout(() => setToast(''), 3000);
      fetchBroadcastData();
    } catch (e) {
      alert("Errore eliminazione schedulazione.");
    }
  };

  const handleDeleteLog = async (idLog) => {
    if (!window.confirm("Sei sicuro di voler eliminare questo record di invio dal log?")) return;
    try {
      await fetch(`/api/broadcast/logs/${idLog}`, { method: 'DELETE' });
      setToast("🗑️ Log di spedizione eliminato.");
      setTimeout(() => setToast(''), 3000);
      fetchBroadcastData();
    } catch (e) {
      alert("Errore eliminazione log.");
    }
  };

  const getRicorrenzaLabel = (ric) => {
    switch (ric) {
      case 'OGNI_LUNEDI': return '🔄 Ogni Lunedì';
      case 'OGNI_MARTEDI': return '🔄 Ogni Martedì';
      case 'OGNI_MERCOLEDI': return '🔄 Ogni Mercoledì';
      case 'OGNI_GIOVEDI': return '🔄 Ogni Giovedì';
      case 'OGNI_VENERDI': return '🔄 Ogni Venerdì';
      case 'OGNI_SABATO': return '🔄 Ogni Sabato';
      case 'OGNI_DOMENICA': return '🔄 Ogni Domenica';
      case 'GIORNI_FERIALI': return '🔄 Giorni Feriali (Lun-Ven)';
      case 'TUTTI_I_GIORNI': return '🔄 Tutti i Giorni';
      default: return '📅 Data Specifica';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn font-sans text-petruzzi-950">
      
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-700 text-white font-black px-6 py-3 rounded-2xl shadow-2xl animate-bounce flex items-center space-x-2">
          <BellRing className="w-5 h-5" />
          <span>{toast}</span>
        </div>
      )}

      {/* Banner Intestazione Broadcast */}
      <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-petruzzi-100 text-petruzzi-800 rounded-xl border border-petruzzi-300">
            <Send className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-petruzzi-950">Gestione Broadcast & Notifiche Schedulate</h1>
            <p className="text-xs text-petruzzi-700">Seleziona clienti registrati, crea liste e programma invii automatici ricorsivi (ogni martedì, ogni sabato, ecc.).</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-petruzzi-100/80 p-1 rounded-xl border border-petruzzi-300">
          <button
            onClick={() => setActiveSubTab('liste')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              activeSubTab === 'liste' ? 'bg-petruzzi-800 text-white shadow-sm' : 'text-petruzzi-900 hover:text-petruzzi-950 hover:bg-petruzzi-200/50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Crea Lista & Auto-Messaggio</span>
          </button>
          <button
            onClick={() => setActiveSubTab('programma')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              activeSubTab === 'programma' ? 'bg-petruzzi-800 text-white shadow-sm' : 'text-petruzzi-900 hover:text-petruzzi-950 hover:bg-petruzzi-200/50'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Coda Programmati ({schedulati.filter(s=>s.stato==='PROGRAMMATO').length})</span>
          </button>
        </div>
      </div>

      {/* SubTab 1: Liste Contatti + Selezione Clienti + Schedulazione Automatica Integrata */}
      {activeSubTab === 'liste' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Form Wizard Integrato */}
          <div className="lg:col-span-7 petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-5">
            <div className="border-b border-petruzzi-200 pb-3 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
                <Users className="w-5 h-5 text-petruzzi-700" />
                <span>1. Seleziona Clienti & Crea Lista Broadcast</span>
              </h3>
              <span className="px-2.5 py-1 bg-petruzzi-100 text-petruzzi-800 border border-petruzzi-300 rounded-full text-[10px] font-bold">
                WIZARD AUTOMATICO
              </span>
            </div>

            <form onSubmit={handleSaveListaEProgrammaAuto} className="space-y-5">
              
              {/* Step 1: Nome Lista */}
              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">
                  1. Nome della Lista Broadcast *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Pizzerie del Martedì / Clienti del Sabato"
                  value={nomeNuovaLista}
                  onChange={(e) => setNomeNuovaLista(e.target.value)}
                  className="w-full bg-white border border-petruzzi-300 rounded-xl px-4 py-2.5 text-sm text-petruzzi-950 focus:outline-none focus:border-petruzzi-700 font-bold shadow-sm"
                />
              </div>

              {/* Step 2: Selezione Utenti da Lista Registrati */}
              <div className="space-y-3 bg-petruzzi-50/90 p-4 rounded-xl border border-petruzzi-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-petruzzi-200 pb-2">
                  <label className="text-xs font-black text-petruzzi-950 uppercase tracking-wider flex items-center space-x-1.5">
                    <Users className="w-4 h-4 text-petruzzi-800" />
                    <span>Seleziona Clienti Registrati ({selectedClients.length} selezionati)</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleSelectAllClients}
                      className="px-2 py-0.5 bg-white text-petruzzi-800 border border-petruzzi-300 rounded text-[10px] font-bold hover:bg-petruzzi-100"
                    >
                      Seleziona Tutti
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllClients}
                      className="px-2 py-0.5 bg-white text-petruzzi-700 border border-petruzzi-300 rounded text-[10px] font-bold hover:bg-petruzzi-100"
                    >
                      Deseleziona
                    </button>
                  </div>
                </div>

                {/* Filter Search Box */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-petruzzi-600" />
                  <input
                    type="text"
                    placeholder="Cerca cliente nella lista..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full bg-white border border-petruzzi-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-petruzzi-950 focus:outline-none"
                  />
                </div>

                {/* Interactive Checkbox List */}
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 bg-white p-2.5 rounded-lg border border-petruzzi-200 divide-y divide-petruzzi-100">
                  {filteredClientsList.length === 0 ? (
                    <p className="text-xs text-petruzzi-600 italic py-2 text-center">Nessun cliente registrato trovato.</p>
                  ) : (
                    filteredClientsList.map((clientName, cIdx) => {
                      const isSelected = selectedClients.includes(clientName);
                      return (
                        <label
                          key={cIdx}
                          onClick={() => toggleClientSelection(clientName)}
                          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-petruzzi-50 cursor-pointer transition text-xs font-bold text-petruzzi-900"
                        >
                          <span>{clientName}</span>
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-petruzzi-800" />
                          ) : (
                            <Square className="w-4 h-4 text-petruzzi-400" />
                          )}
                        </label>
                      );
                    })
                  )}
                </div>

                {/* Additional Manual Input Option */}
                <div className="pt-2 border-t border-petruzzi-200">
                  <label className="block text-[11px] font-bold text-petruzzi-800 uppercase mb-1">
                    + Aggiungi eventuali altri contatti/numeri manuali (1 per riga)
                  </label>
                  <textarea
                    rows="2"
                    placeholder="+39 333 123 4567&#10;Mario Rossi"
                    value={contattiInput}
                    onChange={(e) => setContattiInput(e.target.value)}
                    className="w-full bg-white border border-petruzzi-300 rounded-lg p-2 text-xs text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Step 3: Sezione Programma Messaggio Automatico & Ricorrenza */}
              <div className="p-4 bg-petruzzi-100/70 rounded-xl border border-petruzzi-300 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attivaAutoSchedule}
                      onChange={(e) => setAttivaAutoSchedule(e.target.checked)}
                      className="w-4 h-4 accent-petruzzi-800 rounded cursor-pointer"
                    />
                    <span className="text-xs font-black text-petruzzi-950 uppercase tracking-wider flex items-center space-x-1.5">
                      <Zap className="w-4 h-4 text-petruzzi-800" />
                      <span>Programma Invio per questa lista</span>
                    </span>
                  </label>
                </div>

                {attivaAutoSchedule && (
                  <div className="space-y-3 pt-2 border-t border-petruzzi-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      
                      {/* Programmazione Ricorrente (Ogni martedì, ogni sabato, ecc.) */}
                      <div>
                        <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1 flex items-center space-x-1">
                          <Repeat className="w-3.5 h-3.5 text-petruzzi-700" />
                          <span>Frequenza / Programmazione *</span>
                        </label>
                        <select
                          value={ricorrenzaForm}
                          onChange={(e) => setRicorrenzaForm(e.target.value)}
                          className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-black rounded-xl px-3 py-2 text-xs outline-none cursor-pointer focus:border-petruzzi-700 shadow-sm"
                        >
                          <option value="UNA_TANTUM">📅 Una Tantum (Data/Ora specifica)</option>
                          <option value="OGNI_MARTEDI">🔄 Ogni Martedì</option>
                          <option value="OGNI_SABATO">🔄 Ogni Sabato</option>
                          <option value="OGNI_LUNEDI">🔄 Ogni Lunedì</option>
                          <option value="OGNI_MERCOLEDI">🔄 Ogni Mercoledì</option>
                          <option value="OGNI_GIOVEDI">🔄 Ogni Giovedì</option>
                          <option value="OGNI_VENERDI">🔄 Ogni Venerdì</option>
                          <option value="OGNI_DOMENICA">🔄 Ogni Domenica</option>
                          <option value="GIORNI_FERIALI">🔄 Tutti i Giorni Feriali (Lun-Ven)</option>
                          <option value="TUTTI_I_GIORNI">🔄 Tutti i Giorni</option>
                        </select>
                      </div>

                      {/* Orario di Invio */}
                      <div>
                        <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1 flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-petruzzi-700" />
                          <span>Orario o Data/Ora *</span>
                        </label>
                        <input
                          type="datetime-local"
                          required={attivaAutoSchedule}
                          value={orarioProgrammatoForm}
                          onChange={(e) => setOrarioProgrammatoForm(e.target.value)}
                          className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-extrabold rounded-xl px-3 py-2 text-xs outline-none focus:border-petruzzi-700 shadow-sm"
                        />
                      </div>

                    </div>

                    <div>
                      <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1 flex items-center space-x-1">
                        <MessageSquare className="w-3.5 h-3.5 text-petruzzi-700" />
                        <span>Testo del Messaggio WhatsApp *</span>
                      </label>
                      <textarea
                        rows="3"
                        required={attivaAutoSchedule}
                        placeholder="Es. Gentile cliente, vi ricordiamo di inviare le ordini per la lavorazione di domani entro le 08:00 AM..."
                        value={messaggioAutoForm}
                        onChange={(e) => setMessaggioAutoForm(e.target.value)}
                        className="w-full bg-white border border-petruzzi-300 rounded-xl p-3 text-xs text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-petruzzi-700 font-sans shadow-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Pulsante Attiva Messaggio Broadcast Automatico */}
              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs uppercase tracking-wider shadow-md transition transform active:scale-95 flex items-center justify-center space-x-2"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>🚀 CREA LISTA & ATTIVA PROGRAMMAZIONE</span>
              </button>
            </form>
          </div>

          {/* Elenco Liste Salvate */}
          <div className="lg:col-span-5 petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
            <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
              <Users className="w-5 h-5 text-petruzzi-700" />
              <span>Liste Broadcast Attive ({liste.length})</span>
            </h3>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {liste.length === 0 ? (
                <p className="text-xs text-petruzzi-600 italic py-4">Nessuna lista creata. Compila il modulo a sinistra per generarne una.</p>
              ) : (
                liste.map((l) => (
                  <div key={l.id} className="p-4 bg-petruzzi-50 rounded-xl border border-petruzzi-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-petruzzi-950 text-sm">{l.nome_lista}</h4>
                      <button
                        onClick={() => handleDeleteLista(l.id)}
                        className="p-1.5 text-petruzzi-600 hover:text-red-700 rounded-lg hover:bg-red-50 transition"
                        title="Elimina Lista"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="text-xs text-petruzzi-700 block">{l.contatti?.length || 0} contatti in lista</span>

                    <button
                      onClick={() => handlePrecompilaModalitaAuto(l)}
                      className="w-full py-1.5 bg-white hover:bg-petruzzi-100 text-petruzzi-900 font-bold text-[11px] rounded-lg border border-petruzzi-300 flex items-center justify-center space-x-1 transition shadow-sm"
                    >
                      <Zap className="w-3.5 h-3.5 text-petruzzi-700" />
                      <span>⚡ Programma Messaggio per questa Lista</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* SubTab 2: Coda Programmati */}
      {activeSubTab === 'programma' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
            <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-petruzzi-700" />
              <span>Programma Messaggio su Lista Esistente</span>
            </h3>

            <form onSubmit={handleScheduleBroadcast} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">
                  Seleziona Lista Destinatari *
                </label>
                <select
                  required
                  value={selectedListaId}
                  onChange={(e) => setSelectedListaId(e.target.value)}
                  className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-3 py-2.5 text-xs outline-none focus:border-petruzzi-700 shadow-sm"
                >
                  <option value="" disabled>-- Scegli Lista Broadcast --</option>
                  {liste.map((l) => (
                    <option key={l.id} value={l.id} className="bg-white text-petruzzi-950">
                      {l.nome_lista} ({l.contatti?.length || 0} contatti)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">
                  Ricorrenza Invio *
                </label>
                <select
                  value={ricorrenzaSeparata}
                  onChange={(e) => setRicorrenzaSeparata(e.target.value)}
                  className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-3 py-2.5 text-xs outline-none focus:border-petruzzi-700 shadow-sm cursor-pointer"
                >
                  <option value="UNA_TANTUM">📅 Una Tantum (Data ed Ora specifica)</option>
                  <option value="OGNI_MARTEDI">🔄 Ogni Martedì</option>
                  <option value="OGNI_SABATO">🔄 Ogni Sabato</option>
                  <option value="OGNI_LUNEDI">🔄 Ogni Lunedì</option>
                  <option value="OGNI_MERCOLEDI">🔄 Ogni Mercoledì</option>
                  <option value="OGNI_GIOVEDI">🔄 Ogni Giovedì</option>
                  <option value="OGNI_VENERDI">🔄 Ogni Venerdì</option>
                  <option value="OGNI_DOMENICA">🔄 Ogni Domenica</option>
                  <option value="GIORNI_FERIALI">🔄 Tutti i Giorni Feriali (Lun-Ven)</option>
                  <option value="TUTTI_I_GIORNI">🔄 Tutti i Giorni</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">
                  Orario Programmato di Spedizione *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={orarioProgrammato}
                  onChange={(e) => setOrarioProgrammato(e.target.value)}
                  className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-4 py-2.5 text-xs outline-none focus:border-petruzzi-700 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">
                  Messaggio Broadcast WhatsApp *
                </label>
                <textarea
                  rows="4"
                  required
                  placeholder="Testo del messaggio..."
                  value={messaggioBroadcast}
                  onChange={(e) => setMessaggioBroadcast(e.target.value)}
                  className="w-full bg-white border border-petruzzi-300 rounded-xl p-3 text-xs text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-petruzzi-700 font-sans shadow-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs shadow-md transition"
              >
                ⏰ ATTIVA PROGRAMMAZIONE MESSAGGIO
              </button>
            </form>
          </div>

          <div className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
            <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-petruzzi-700" />
              <span>Coda Broadcast Programmati ({schedulati.length})</span>
            </h3>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {schedulati.length === 0 ? (
                <p className="text-xs text-petruzzi-600 italic py-4">Nessun broadcast programmato in coda.</p>
              ) : (
                schedulati.map((s) => {
                  const isDone = s.stato === 'INVIATO';
                  return (
                    <div key={s.id} className="p-4 bg-petruzzi-50 rounded-xl border border-petruzzi-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-petruzzi-950">{s.nome_lista}</span>
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 bg-petruzzi-100 text-petruzzi-900 border border-petruzzi-300 rounded text-[10px] font-black">
                            {getRicorrenzaLabel(s.ricorrenza)}
                          </span>

                          {isDone ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[10px] font-black uppercase">
                              ✅ Inviato
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-bold uppercase">
                              ⏳ Programmato
                            </span>
                          )}
                          <button
                            onClick={() => handleDeleteSchedulato(s.id)}
                            className="p-1 text-petruzzi-600 hover:text-red-700 rounded hover:bg-red-50 transition"
                            title="Elimina Messaggio Broadcast"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <p className="text-petruzzi-800 italic">{s.messaggio}</p>

                      <div className="flex items-center justify-between text-[11px] text-petruzzi-700 border-t border-petruzzi-200 pt-2">
                        <span>Orario: <strong className="text-petruzzi-950">{s.orario_programmato}</strong></span>
                        <button
                          onClick={() => handleDeleteSchedulato(s.id)}
                          className="text-red-700 hover:underline font-bold flex items-center space-x-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Elimina Messaggio</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
