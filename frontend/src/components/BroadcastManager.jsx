import React, { useState, useEffect } from 'react';
import { Send, Users, Calendar, Clock, Trash2, Zap, BellRing, CheckSquare, Square, Search, Repeat, UserPlus, MessageSquare } from 'lucide-react';

export default function BroadcastManager() {
  const [activeSubTab, setActiveSubTab] = useState('liste');
  const [liste, setListe] = useState([]);
  const [schedulati, setSchedulati] = useState([]);
  const [registeredClients, setRegisteredClients] = useState([]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Stati per aggiunta nuovo utente in rubrica (JSON)
  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientData, setNewClientData] = useState({ n: '', t: '', p: '' });

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
      const [resListe, resSched, resClienti] = await Promise.all([
        fetch('/api/broadcast/liste'),
        fetch('/api/broadcast/schedulati'),
        fetch('/api/clienti')
      ]);

      if (resListe.ok) setListe(await resListe.json());
      if (resSched.ok) setSchedulati(await resSched.json());
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

  // --- LOGICA AGGIUNTA NUOVO CLIENTE AL JSON ---
  const handleAddNewClientToJSON = async (e) => {
    e.preventDefault();
    if (!newClientData.n.trim()) return alert("Il nome è obbligatorio!");
    
    try {
      const res = await fetch('/api/clienti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClientData)
      });
      
      if (res.ok) {
        setToast(`✅ Cliente ${newClientData.n} salvato in rubrica!`);
        setNewClientData({ n: '', t: '', p: '' });
        setShowAddClient(false);
        fetchBroadcastData(); 
        setTimeout(() => setToast(''), 4000);
      }
    } catch (error) {
      alert("Errore salvataggio nuovo cliente.");
    }
  };

  const toggleClientSelection = (clientName) => {
    if (selectedClients.includes(clientName)) {
      setSelectedClients(selectedClients.filter(c => c !== clientName));
    } else {
      setSelectedClients([...selectedClients, clientName]);
    }
  };

  const handleSelectAllClients = () => {
    setSelectedClients(registeredClients.map(c => c.n || c));
  };

  const handleDeselectAllClients = () => {
    setSelectedClients([]);
  };

  const filteredClientsList = registeredClients.filter(c =>
    (c.n || '').toLowerCase().includes(clientSearch.toLowerCase())
  );

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
        alert("Specifica orario e testo del messaggio per programmare l'invio!");
        return;
      }
    }

    try {
      const resLista = await fetch('/api/broadcast/liste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_lista: nomeNuovaLista, contatti: contattiAggregati })
      });

      if (!resLista.ok) return alert("Errore salvataggio lista.");

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

        setToast(`🚀 Lista "${nomeNuovaLista}" creata ed Invio ATTIVATO!`);
      } else {
        setToast(`✅ Lista "${nomeNuovaLista}" salvata con successo!`);
      }

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
    if (!window.confirm("Eliminare questo messaggio broadcast programmato?")) return;
    try {
      await fetch(`/api/broadcast/schedulati/${idSched}`, { method: 'DELETE' });
      setToast("🗑️ Messaggio programmato eliminato.");
      setTimeout(() => setToast(''), 3000);
      fetchBroadcastData();
    } catch (e) {
      alert("Errore eliminazione schedulazione.");
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

      {/* Banner Intestazione */}
      <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-petruzzi-100 text-petruzzi-800 rounded-xl border border-petruzzi-300">
            <Send className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-petruzzi-950">Gestione Broadcast & Notifiche Schedulate</h1>
            <p className="text-xs text-petruzzi-700">Gestisci la rubrica, crea liste e programma invii automatici ricorsivi su WhatsApp.</p>
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
            <span>Liste & Rubrica</span>
          </button>
          <button
            onClick={() => setActiveSubTab('programma')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              activeSubTab === 'programma' ? 'bg-petruzzi-800 text-white shadow-sm' : 'text-petruzzi-900 hover:text-petruzzi-950 hover:bg-petruzzi-200/50'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Coda ({schedulati.filter(s=>s.stato==='PROGRAMMATO').length})</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'liste' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-7 petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-5">
            <div className="border-b border-petruzzi-200 pb-3 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
                <Users className="w-5 h-5 text-petruzzi-700" />
                <span>1. Seleziona Clienti & Crea Lista</span>
              </h3>
            </div>

            <form onSubmit={handleSaveListaEProgrammaAuto} className="space-y-5">
              
              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">
                  Nome della Lista Broadcast *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Pizzerie Martedì / Clienti Sabato"
                  value={nomeNuovaLista}
                  onChange={(e) => setNomeNuovaLista(e.target.value)}
                  className="w-full bg-white border border-petruzzi-300 rounded-xl px-4 py-2.5 text-sm text-petruzzi-950 focus:outline-none focus:border-petruzzi-700 font-bold shadow-sm"
                />
              </div>

              {/* GESTIONE RUBRICA / NUOVO CLIENTE JSON */}
              <div className="space-y-3 bg-petruzzi-50/90 p-4 rounded-xl border border-petruzzi-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-petruzzi-200 pb-2">
                  <label className="text-xs font-black text-petruzzi-950 uppercase tracking-wider flex items-center space-x-1.5">
                    <Users className="w-4 h-4 text-petruzzi-800" />
                    <span>Rubrica ({registeredClients.length}) - Selezionati: {selectedClients.length}</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <button 
                      type="button"
                      onClick={() => setShowAddClient(!showAddClient)}
                      className="px-2 py-1 bg-petruzzi-800 text-white border border-petruzzi-800 rounded text-[10px] font-bold hover:bg-petruzzi-900 transition flex items-center gap-1 shadow-sm"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> NUOVO CLIENTE
                    </button>
                  </div>
                </div>

                {/* Form Aggiunta Nuovo Utente */}
                {showAddClient && (
                  <div className="bg-white p-3 rounded-lg border border-petruzzi-300 shadow-inner space-y-2 mb-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        type="text" placeholder="Nome Cliente *" required
                        value={newClientData.n} onChange={e => setNewClientData({...newClientData, n: e.target.value})}
                        className="border border-petruzzi-200 rounded px-2 py-1.5 text-xs text-petruzzi-900 focus:outline-none focus:border-petruzzi-600 w-full"
                      />
                      <input 
                        type="text" placeholder="Telefono (es. +39...)"
                        value={newClientData.t} onChange={e => setNewClientData({...newClientData, t: e.target.value})}
                        className="border border-petruzzi-200 rounded px-2 py-1.5 text-xs text-petruzzi-900 focus:outline-none focus:border-petruzzi-600 w-full"
                      />
                    </div>
                    <input 
                      type="text" placeholder="Note / Regole IA (es. Stracciatella 1kg)"
                      value={newClientData.p} onChange={e => setNewClientData({...newClientData, p: e.target.value})}
                      className="border border-petruzzi-200 rounded px-2 py-1.5 text-xs text-petruzzi-900 focus:outline-none focus:border-petruzzi-600 w-full"
                    />
                    <button 
                      type="button" 
                      onClick={handleAddNewClientToJSON}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] py-1.5 rounded-md font-extrabold transition shadow-sm uppercase"
                    >
                      Salva in Rubrica JSON
                    </button>
                  </div>
                )}

                <div className="flex items-center space-x-2 mb-2">
                    <button type="button" onClick={handleSelectAllClients} className="px-2 py-0.5 bg-white text-petruzzi-800 border border-petruzzi-300 rounded text-[10px] font-bold hover:bg-petruzzi-100">
                      Seleziona Tutti
                    </button>
                    <button type="button" onClick={handleDeselectAllClients} className="px-2 py-0.5 bg-white text-petruzzi-700 border border-petruzzi-300 rounded text-[10px] font-bold hover:bg-petruzzi-100">
                      Deseleziona
                    </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-petruzzi-600" />
                  <input
                    type="text" placeholder="Cerca in rubrica..."
                    value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full bg-white border border-petruzzi-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-petruzzi-950 focus:outline-none"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1 pr-1 bg-white p-2.5 rounded-lg border border-petruzzi-200 divide-y divide-petruzzi-100">
                  {filteredClientsList.length === 0 ? (
                    <p className="text-xs text-petruzzi-600 italic py-2 text-center">Nessun cliente trovato.</p>
                  ) : (
                    filteredClientsList.map((clientObj, cIdx) => {
                      const clientName = clientObj.n;
                      const isSelected = selectedClients.includes(clientName);
                      return (
                        <label key={cIdx} onClick={() => toggleClientSelection(clientName)} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-petruzzi-50 cursor-pointer transition text-xs font-bold text-petruzzi-900">
                          <div>
                            <span>{clientName}</span>
                            {clientObj.t && <span className="text-[10px] text-petruzzi-500 font-normal ml-2 block sm:inline">{clientObj.t}</span>}
                          </div>
                          {isSelected ? <CheckSquare className="w-4 h-4 text-petruzzi-800" /> : <Square className="w-4 h-4 text-petruzzi-400" />}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 border-t border-petruzzi-200">
                  <label className="block text-[11px] font-bold text-petruzzi-800 uppercase mb-1">
                    + Numeri/Contatti manuali extra (1 per riga)
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

              {/* Schedulazione Automatica */}
              <div className="p-4 bg-petruzzi-100/70 rounded-xl border border-petruzzi-300 space-y-4">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input type="checkbox" checked={attivaAutoSchedule} onChange={(e) => setAttivaAutoSchedule(e.target.checked)} className="w-4 h-4 accent-petruzzi-800 rounded" />
                  <span className="text-xs font-black text-petruzzi-950 uppercase tracking-wider flex items-center space-x-1.5">
                    <Zap className="w-4 h-4 text-petruzzi-800" /><span>Programma Invio per questa lista</span>
                  </span>
                </label>

                {attivaAutoSchedule && (
                  <div className="space-y-3 pt-2 border-t border-petruzzi-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1 flex items-center space-x-1">
                          <Repeat className="w-3.5 h-3.5 text-petruzzi-700" /><span>Frequenza *</span>
                        </label>
                        <select value={ricorrenzaForm} onChange={(e) => setRicorrenzaForm(e.target.value)} className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-black rounded-xl px-3 py-2 text-xs outline-none cursor-pointer focus:border-petruzzi-700 shadow-sm">
                          <option value="UNA_TANTUM">📅 Una Tantum</option>
                          <option value="OGNI_MARTEDI">🔄 Ogni Martedì</option>
                          <option value="OGNI_SABATO">🔄 Ogni Sabato</option>
                          <option value="OGNI_LUNEDI">🔄 Ogni Lunedì</option>
                          <option value="OGNI_MERCOLEDI">🔄 Ogni Mercoledì</option>
                          <option value="OGNI_GIOVEDI">🔄 Ogni Giovedì</option>
                          <option value="OGNI_VENERDI">🔄 Ogni Venerdì</option>
                          <option value="OGNI_DOMENICA">🔄 Ogni Domenica</option>
                          <option value="GIORNI_FERIALI">🔄 Giorni Feriali (Lun-Ven)</option>
                          <option value="TUTTI_I_GIORNI">🔄 Tutti i Giorni</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1 flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-petruzzi-700" /><span>Orario/Data *</span>
                        </label>
                        <input type="datetime-local" required={attivaAutoSchedule} value={orarioProgrammatoForm} onChange={(e) => setOrarioProgrammatoForm(e.target.value)} className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-extrabold rounded-xl px-3 py-2 text-xs outline-none focus:border-petruzzi-700 shadow-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1 flex items-center space-x-1">
                        <MessageSquare className="w-3.5 h-3.5 text-petruzzi-700" /><span>Testo WhatsApp *</span>
                      </label>
                      <textarea rows="3" required={attivaAutoSchedule} value={messaggioAutoForm} onChange={(e) => setMessaggioAutoForm(e.target.value)} className="w-full bg-white border border-petruzzi-300 rounded-xl p-3 text-xs text-petruzzi-950 focus:outline-none focus:border-petruzzi-700 font-sans shadow-sm" />
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs uppercase tracking-wider shadow-md transition transform active:scale-95 flex items-center justify-center space-x-2">
                <Zap className="w-4 h-4 fill-white" /><span>SALVA LISTA {attivaAutoSchedule && "& PROGRAMMA"}</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-5 petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
            <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
              <Users className="w-5 h-5 text-petruzzi-700" /><span>Liste Broadcast Attive ({liste.length})</span>
            </h3>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {liste.length === 0 ? (
                <p className="text-xs text-petruzzi-600 italic py-4">Nessuna lista creata.</p>
              ) : (
                liste.map((l) => (
                  <div key={l.id} className="p-4 bg-petruzzi-50 rounded-xl border border-petruzzi-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-petruzzi-950 text-sm">{l.nome_lista}</h4>
                      <button onClick={() => handleDeleteLista(l.id)} className="p-1.5 text-petruzzi-600 hover:text-red-700 rounded-lg hover:bg-red-50 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-xs text-petruzzi-700 block">{l.contatti?.length || 0} contatti in lista</span>
                    <button onClick={() => handlePrecompilaModalitaAuto(l)} className="w-full py-1.5 bg-white hover:bg-petruzzi-100 text-petruzzi-900 font-bold text-[11px] rounded-lg border border-petruzzi-300 flex items-center justify-center space-x-1 shadow-sm">
                      <Zap className="w-3.5 h-3.5 text-petruzzi-700" /><span>Programma Messaggio per questa Lista</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'programma' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
            <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-petruzzi-700" /><span>Programma Messaggio</span>
            </h3>

            <form onSubmit={handleScheduleBroadcast} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">Seleziona Lista *</label>
                <select required value={selectedListaId} onChange={(e) => setSelectedListaId(e.target.value)} className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-3 py-2.5 text-xs outline-none focus:border-petruzzi-700">
                  <option value="" disabled>-- Scegli Lista --</option>
                  {liste.map((l) => (
                    <option key={l.id} value={l.id}>{l.nome_lista} ({l.contatti?.length || 0})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">Ricorrenza *</label>
                <select value={ricorrenzaSeparata} onChange={(e) => setRicorrenzaSeparata(e.target.value)} className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-3 py-2.5 text-xs outline-none focus:border-petruzzi-700">
                  <option value="UNA_TANTUM">📅 Una Tantum</option>
                  <option value="OGNI_MARTEDI">🔄 Ogni Martedì</option>
                  <option value="OGNI_SABATO">🔄 Ogni Sabato</option>
                  <option value="OGNI_LUNEDI">🔄 Ogni Lunedì</option>
                  <option value="OGNI_MERCOLEDI">🔄 Ogni Mercoledì</option>
                  <option value="OGNI_GIOVEDI">🔄 Ogni Giovedì</option>
                  <option value="OGNI_VENERDI">🔄 Ogni Venerdì</option>
                  <option value="OGNI_DOMENICA">🔄 Ogni Domenica</option>
                  <option value="GIORNI_FERIALI">🔄 Tutti i Giorni Feriali</option>
                  <option value="TUTTI_I_GIORNI">🔄 Tutti i Giorni</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">Orario Programmato *</label>
                <input type="datetime-local" required value={orarioProgrammato} onChange={(e) => setOrarioProgrammato(e.target.value)} className="w-full bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-4 py-2.5 text-xs outline-none focus:border-petruzzi-700" />
              </div>

              <div>
                <label className="block text-xs font-bold text-petruzzi-800 uppercase mb-1">Messaggio *</label>
                <textarea rows="4" required value={messaggioBroadcast} onChange={(e) => setMessaggioBroadcast(e.target.value)} className="w-full bg-white border border-petruzzi-300 rounded-xl p-3 text-xs text-petruzzi-950 focus:outline-none focus:border-petruzzi-700 font-sans" />
              </div>

              <button type="submit" className="w-full py-3 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs shadow-md transition">
                ⏰ PROGRAMMA MESSAGGIO
              </button>
            </form>
          </div>

          <div className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
            <h3 className="text-base font-extrabold text-petruzzi-950 flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-petruzzi-700" /><span>Coda Programmati ({schedulati.length})</span>
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
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[10px] font-black uppercase">✅ Inviato</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-bold uppercase">⏳ Programmato</span>
                          )}
                          <button onClick={() => handleDeleteSchedulato(s.id)} className="p-1 text-petruzzi-600 hover:text-red-700 rounded hover:bg-red-50 transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-petruzzi-800 italic">{s.messaggio}</p>
                      <div className="flex items-center justify-between text-[11px] text-petruzzi-700 border-t border-petruzzi-200 pt-2">
                        <span>Orario: <strong className="text-petruzzi-950">{s.orario_programmato}</strong></span>
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