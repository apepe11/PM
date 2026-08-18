import React, { useState, useEffect } from 'react';
import {
  Send,
  Users,
  Calendar,
  Clock,
  Trash2,
  Zap,
  BellRing,
  CheckSquare,
  Square,
  Search,
  Repeat,
  UserPlus,
  MessageSquare,
  History,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Sparkles,
  PhoneCall,
  Flame,
  Play,
  RotateCcw,
  Info
} from 'lucide-react';

const PRESET_TEMPLATES = [
  {
    titolo: '⏰ Promemoria Ordini Domani',
    icon: '⏰',
    testo: 'Gentile cliente, vi ricordiamo di inviare i vostri ordini entro le 18:00 per garantire la consegna regolare per domani mattina. Grazie dal Caseificio Petruzzi!'
  },
  {
    titolo: '🧀 Specialità Fresche del Giorno',
    icon: '🧀',
    testo: 'Buongiorno! Oggi in lavorazione burrate speciali, trecce e caciocavallo silano DOP freschissimi. Rispondete a questo messaggio per prenotare la vostra fornitura!'
  },
  {
    titolo: '🚚 Info Orari e Festività',
    icon: '🚚',
    testo: 'Gentili clienti, vi comunichiamo che in occasione della prossima festività le consegne subiranno variazioni. Vi preghiamo di anticipare gli ordini. Caseificio Petruzzi.'
  },
  {
    titolo: '⚠️ Avviso Chiusura / Manutenzione',
    icon: '⚠️',
    testo: 'Gentile cliente, vi informiamo che il laboratorio effettuerà chiusura per manutenzione programmata. Le consegne riprenderanno regolarmente il giorno successivo.'
  }
];

export default function BroadcastManager() {
  const [activeTab, setActiveTab] = useState('invio'); // 'invio', 'liste', 'coda', 'storico'
  const [liste, setListe] = useState([]);
  const [schedulati, setSchedulati] = useState([]);
  const [logs, setLogs] = useState([]);
  const [registeredClients, setRegisteredClients] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [toast, setToast] = useState('');

  // Form Invio / Schedulazione
  const [selectedListaId, setSelectedListaId] = useState('');
  const [messaggio, setMessaggio] = useState('');
  const [isTestMode, setIsTestMode] = useState(false);
  const [testNumero, setTestNumero] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [orarioProgrammato, setOrarioProgrammato] = useState('');
  const [ricorrenza, setRicorrenza] = useState('UNA_TANTUM');

  // Form Creazione Lista
  const [nomeNuovaLista, setNomeNuovaLista] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClients, setSelectedClients] = useState([]);
  const [contattiManualInput, setContattiManualInput] = useState('');
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [newClientData, setNewClientData] = useState({ n: '', t: '', p: '' });

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
      console.error('Errore fetch broadcast:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBroadcastData();
    const nextTime = new Date(Date.now() + 15 * 60000).toISOString().slice(0, 16);
    setOrarioProgrammato(nextTime);
  }, []);

  const showNotification = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4500);
  };

  // --- AZIONI INVIO E PROGRAMMAZIONE ---
  const handleInviaBroadcastOra = async () => {
    if (!messaggio.trim()) {
      alert('Inserire il testo del messaggio!');
      return;
    }
    if (!isTestMode && !selectedListaId) {
      alert('Selezionare una lista destinatari o attivare la modalità test su numero singolo!');
      return;
    }
    if (isTestMode && !testNumero.trim()) {
      alert('Inserire il numero di telefono per il test!');
      return;
    }

    const targetLista = liste.find((l) => String(l.id) === String(selectedListaId));
    const confirmMsg = isTestMode
      ? `Inviare messaggio di TEST al numero ${testNumero}?`
      : `Sei sicuro di voler inviare ORA questo messaggio a TUTTI i ${targetLista?.contatti?.length || 0} contatti della lista "${targetLista?.nome_lista}"?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/broadcast/invia-ora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_lista: isTestMode ? null : parseInt(selectedListaId),
          messaggio: messaggio.trim(),
          numero_test: isTestMode ? testNumero.trim() : null
        })
      });

      const data = await res.json();
      if (res.ok) {
        showNotification(
          isTestMode
            ? `✅ Messaggio di TEST inviato con successo!`
            : `🚀 Broadcast completato: ${data.risultato?.inviati || 0} inviati con successo!`
        );
        if (!isTestMode) setMessaggio('');
        fetchBroadcastData();
      } else {
        alert('Errore durante l\'invio: ' + (data.detail || 'Controlla la connessione WhatsApp'));
      }
    } catch (e) {
      alert('Errore di connessione durante l\'invio del broadcast.');
    } finally {
      setIsSending(false);
    }
  };

  const handleProgrammaBroadcast = async (e) => {
    e.preventDefault();
    if (!selectedListaId || !messaggio.trim() || !orarioProgrammato) {
      alert('Compilare lista, messaggio ed orario programmato!');
      return;
    }

    const targetL = liste.find((l) => String(l.id) === String(selectedListaId));
    const nomeL = targetL ? targetL.nome_lista : 'Lista';

    try {
      const res = await fetch('/api/broadcast/schedulati', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_lista: parseInt(selectedListaId),
          nome_lista: nomeL,
          messaggio: messaggio.trim(),
          orario_programmato: orarioProgrammato.replace('T', ' '),
          ricorrenza: ricorrenza
        })
      });

      if (res.ok) {
        setMessaggio('');
        setIsScheduled(false);
        showNotification(`⏰ Broadcast programmato con successo per "${nomeL}"!`);
        fetchBroadcastData();
        setActiveTab('coda');
      } else {
        alert('Errore durante la programmazione.');
      }
    } catch (e) {
      alert('Errore di rete durante la programmazione.');
    }
  };

  const handleEseguiTaskOra = async (idSched, nomeLista) => {
    if (!window.confirm(`Forzare l'invio immediato del messaggio per la lista "${nomeLista}"?`)) return;
    try {
      const res = await fetch(`/api/broadcast/schedulati/${idSched}/esegui-ora`, { method: 'POST' });
      if (res.ok) {
        showNotification(`🚀 Invio immediato avviato per "${nomeLista}"!`);
        fetchBroadcastData();
      }
    } catch (e) {
      alert('Errore durante l\'esecuzione del task.');
    }
  };

  const handleDeleteSchedulato = async (idSched) => {
    if (!window.confirm('Eliminare questo messaggio programmato?')) return;
    try {
      await fetch(`/api/broadcast/schedulati/${idSched}`, { method: 'DELETE' });
      showNotification('🗑️ Task programmato eliminato.');
      fetchBroadcastData();
    } catch (e) {
      alert('Errore eliminazione.');
    }
  };

  // --- GESTIONE LISTE ---
  const handleSaveLista = async (e) => {
    e.preventDefault();
    if (!nomeNuovaLista.trim()) {
      alert('Inserire il nome per la lista broadcast!');
      return;
    }

    const manualContacts = contattiManualInput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => ({ nome: line }));

    const clientContacts = selectedClients.map((c) => ({ nome: c }));
    const contattiAggregati = [...clientContacts, ...manualContacts];

    if (contattiAggregati.length === 0) {
      alert('Seleziona almeno un cliente dalla rubrica o inserisci un contatto manuale!');
      return;
    }

    try {
      const resLista = await fetch('/api/broadcast/liste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_lista: nomeNuovaLista.trim(), contatti: contattiAggregati })
      });

      if (resLista.ok) {
        showNotification(`✅ Lista "${nomeNuovaLista}" salvata con ${contattiAggregati.length} contatti!`);
        setNomeNuovaLista('');
        setContattiManualInput('');
        setSelectedClients([]);
        fetchBroadcastData();
      }
    } catch (e) {
      alert('Errore salvataggio lista.');
    }
  };

  const handleDeleteLista = async (idLista) => {
    if (!window.confirm('Eliminare definitivamente questa lista broadcast?')) return;
    try {
      await fetch(`/api/broadcast/liste/${idLista}`, { method: 'DELETE' });
      showNotification('🗑️ Lista eliminata.');
      fetchBroadcastData();
    } catch (e) {
      alert('Errore eliminazione lista.');
    }
  };

  const handleClearAllLogs = async () => {
    if (!window.confirm('Cancellare tutto lo storico dei log broadcast?')) return;
    try {
      await fetch('/api/broadcast/logs-all', { method: 'DELETE' });
      showNotification('🧹 Storico log svuotato.');
      fetchBroadcastData();
    } catch (e) {
      alert('Errore eliminazione log.');
    }
  };

  const getClientName = (c) => (typeof c === 'string' ? c : (c.n || c.nome || c.name || ''));
  const getClientPhone = (c) => (typeof c === 'string' ? '' : (c.t || c.telefono || c.phone || ''));

  const toggleClientSelection = (clientName) => {
    if (selectedClients.includes(clientName)) {
      setSelectedClients(selectedClients.filter((c) => c !== clientName));
    } else {
      setSelectedClients([...selectedClients, clientName]);
    }
  };

  const handleSelectAll = () => setSelectedClients(registeredClients.map(getClientName).filter(Boolean));
  const handleDeselectAll = () => setSelectedClients([]);

  const filteredClients = registeredClients.filter((c) => {
    const name = getClientName(c).toLowerCase();
    const tel = getClientPhone(c).toLowerCase();
    const q = clientSearch.toLowerCase();
    return name.includes(q) || tel.includes(q);
  });

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

  const totalContactsCount = liste.reduce((acc, l) => acc + (l.contatti?.length || 0), 0);
  const pendingScheduledCount = schedulati.filter((s) => s.stato === 'PROGRAMMATO').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn font-sans text-slate-900 pb-12">
      {/* TOAST FLOTTANTE */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-800 text-white font-extrabold px-6 py-3.5 rounded-2xl shadow-2xl animate-bounce flex items-center space-x-3 border border-emerald-600">
          <BellRing className="w-5 h-5 text-emerald-300" />
          <span className="text-sm">{toast}</span>
        </div>
      )}

      {/* HEADER EXECUTIVE & KPI CARDS */}
      <div className="bg-gradient-to-r from-slate-900 via-petruzzi-900 to-indigo-950 rounded-3xl p-6 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center space-x-3.5">
            <div className="p-3.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-md border border-white/10">
              <Send className="w-7 h-7 text-white stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-black tracking-tight">Centro Notifiche & Broadcast WhatsApp</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                  Evolution API Live
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Comunicazioni massive, avvisi automatici ai clienti e messaggi schedulati sul canale WhatsApp aziendale.
              </p>
            </div>
          </div>

          <button
            onClick={fetchBroadcastData}
            disabled={isLoading}
            className="self-start md:self-auto px-4 py-2 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 border border-white/10"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Aggiorna Dati</span>
          </button>
        </div>

        {/* 4 KPI METRICS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-5">
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">Liste Create</span>
              <span className="text-xl font-black text-white">{liste.length}</span>
            </div>
          </div>

          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">Contatti Totali</span>
              <span className="text-xl font-black text-white">{totalContactsCount}</span>
            </div>
          </div>

          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">In Coda Attivi</span>
              <span className="text-xl font-black text-white">{pendingScheduledCount}</span>
            </div>
          </div>

          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300">
              <History className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">Invii Eseguiti</span>
              <span className="text-xl font-black text-white">{logs.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* NAVIGAZIONE SUB-TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('invio')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center space-x-2 shadow-sm ${
            activeTab === 'invio'
              ? 'bg-petruzzi-900 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>1. Componi & Invia / Programma</span>
        </button>

        <button
          onClick={() => setActiveTab('liste')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center space-x-2 shadow-sm ${
            activeTab === 'liste'
              ? 'bg-petruzzi-900 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>2. Gestione Liste & Rubrica ({liste.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coda')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center space-x-2 shadow-sm ${
            activeTab === 'coda'
              ? 'bg-petruzzi-900 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>3. Coda Schedulati ({pendingScheduledCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('storico')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center space-x-2 shadow-sm ${
            activeTab === 'storico'
              ? 'bg-petruzzi-900 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>4. Storico Invii & Log ({logs.length})</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: COMPONI & INVIA / PROGRAMMA */}
      {/* ======================================================== */}
      {activeTab === 'invio' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* COLONNA SINISTRA: EDITOR MESSAGGIO */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-blue-700" />
                <span>Composizione Messaggio Broadcast</span>
              </h2>
              <span className="text-xs text-slate-500 font-bold">
                {isTestMode ? '🧪 Modalità Test' : '📢 Invio Massivo'}
              </span>
            </div>

            {/* MODALITÀ TEST / NORMALE SWITCH */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <div>
                <span className="font-extrabold text-xs text-slate-800 block">Invio di Prova (Test Singolo)</span>
                <span className="text-[11px] text-slate-500">Invia il messaggio solo al tuo numero prima di trasmetterlo alla lista.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTestMode}
                  onChange={(e) => setIsTestMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* SELETTORE DESTINATARIO */}
            {isTestMode ? (
              <div className="space-y-1.5 animate-fadeIn">
                <label className="block text-xs font-black text-slate-700 uppercase">
                  Numero di Telefono per il Test *
                </label>
                <div className="relative">
                  <PhoneCall className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Es. +39 333 123 4567"
                    value={testNumero}
                    onChange={(e) => setTestNumero(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-600 outline-none shadow-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 uppercase">
                  Seleziona Lista Destinatari *
                </label>
                <select
                  value={selectedListaId}
                  onChange={(e) => setSelectedListaId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-black text-slate-900 focus:bg-white focus:border-blue-600 outline-none shadow-sm cursor-pointer"
                >
                  <option value="">-- Seleziona una Lista Broadcast --</option>
                  {liste.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome_lista} ({l.contatti?.length || 0} contatti inclusi)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* TEMPLATES PREIMPOSTATI AD 1-CLICK */}
            <div className="space-y-2">
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Template Preimpostati Rapidi (clicca per applicare)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMessaggio(tmpl.testo)}
                    className="p-2.5 bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-xl text-left transition group flex items-start space-x-2"
                  >
                    <span className="text-base shrink-0">{tmpl.icon}</span>
                    <div className="min-w-0">
                      <span className="font-extrabold text-xs text-slate-900 block group-hover:text-blue-900 truncate">
                        {tmpl.titolo}
                      </span>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{tmpl.testo}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* TESTO MESSAGGIO */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-black text-slate-700 uppercase">
                  Testo del Messaggio WhatsApp *
                </label>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {messaggio.length} caratteri
                </span>
              </div>
              <textarea
                rows="4"
                required
                placeholder="Scrivi qui il messaggio da inviare su WhatsApp ai clienti..."
                value={messaggio}
                onChange={(e) => setMessaggio(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-4 text-sm font-medium text-slate-900 focus:bg-white focus:border-blue-600 outline-none shadow-sm placeholder-slate-400 leading-relaxed"
              />
            </div>

            {/* OPZIONE PROGRAMMAZIONE O INVIO IMMEDIATO */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="w-4 h-4 accent-blue-700 rounded"
                />
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <Clock className="w-4 h-4 text-blue-700" />
                  <span>Programma Invio per il Futuro / Ricorrente</span>
                </span>
              </label>

              {isScheduled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200 animate-fadeIn">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Frequenza Invio *
                    </label>
                    <select
                      value={ricorrenza}
                      onChange={(e) => setRicorrenza(e.target.value)}
                      className="w-full bg-white border border-slate-300 font-bold text-xs rounded-xl px-3 py-2 text-slate-900 outline-none shadow-sm focus:border-blue-600"
                    >
                      <option value="UNA_TANTUM">📅 Una Tantum (Data Specifica)</option>
                      <option value="OGNI_LUNEDI">🔄 Ogni Lunedì</option>
                      <option value="OGNI_MARTEDI">🔄 Ogni Martedì</option>
                      <option value="OGNI_MERCOLEDI">🔄 Ogni Mercoledì</option>
                      <option value="OGNI_GIOVEDI">🔄 Ogni Giovedì</option>
                      <option value="OGNI_VENERDI">🔄 Ogni Venerdì</option>
                      <option value="OGNI_SABATO">🔄 Ogni Sabato</option>
                      <option value="OGNI_DOMENICA">🔄 Ogni Domenica</option>
                      <option value="GIORNI_FERIALI">🔄 Tutti i Giorni Feriali (Lun-Ven)</option>
                      <option value="TUTTI_I_GIORNI">🔄 Tutti i Giorni</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Data & Orario Programmato *
                    </label>
                    <input
                      type="datetime-local"
                      value={orarioProgrammato}
                      onChange={(e) => setOrarioProgrammato(e.target.value)}
                      className="w-full bg-white border border-slate-300 font-bold text-xs rounded-xl px-3 py-2 text-slate-900 outline-none shadow-sm focus:border-blue-600"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* BOTTONE AZIONE PRINCIPALE */}
            {isScheduled ? (
              <button
                type="button"
                onClick={handleProgrammaBroadcast}
                className="w-full py-4 bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition active:scale-[0.99] flex items-center justify-center space-x-2"
              >
                <Clock className="w-5 h-5" />
                <span>⏰ SALVA E PROGRAMMA MESSAGGIO</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleInviaBroadcastOra}
                disabled={isSending}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg transition active:scale-[0.99] flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <RotateCcw className="w-5 h-5 animate-spin" />
                    <span>Invio Broadcast in corso...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-white" />
                    <span>🚀 {isTestMode ? 'INVIA TEST ADESSO' : 'INVIA SUBITO A TUTTI I CONTATTI'}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* COLONNA DESTRA: ANTEPRIMA LIVE WHATSAPP */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-md border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="text-xs font-black uppercase text-slate-300 flex items-center space-x-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <span>Anteprima Live Smartphone</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  WhatsApp Preview
                </span>
              </div>

              {/* SIMULATORE CHAT WHATSAPP */}
              <div className="bg-[#0b141a] rounded-2xl p-4 min-h-[300px] border border-white/10 flex flex-col justify-between space-y-4">
                <div className="flex items-center space-x-2.5 bg-[#202c33] p-2.5 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center text-xs font-bold text-white">
                    CP
                  </div>
                  <div>
                    <span className="font-bold text-xs text-white block">Caseificio Petruzzi</span>
                    <span className="text-[10px] text-emerald-400">Canale Ufficiale WhatsApp</span>
                  </div>
                </div>

                {/* BALLOON MESSAGGIO */}
                <div className="self-end max-w-[85%] bg-[#005c4b] text-white p-3.5 rounded-2xl rounded-tr-none shadow-md space-y-1 relative">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
                    {messaggio.trim() || 'Il testo del tuo messaggio apparirà qui in tempo reale...'}
                  </p>
                  <div className="flex items-center justify-end space-x-1 text-[10px] text-emerald-200/70 pt-0.5">
                    <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>✓✓</span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 text-center italic">
                  I messaggi vengono inviati con pause progressive anti-ban.
                </div>
              </div>
            </div>

            {/* BOX CONSIGLI OPERATIVI */}
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center space-x-1.5 font-black text-amber-950">
                <Info className="w-4 h-4 text-amber-700" />
                <span>Buone Pratiche di Invio:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-900">
                <li>Usa sempre la modalità <strong>Test</strong> per verificare la formattazione prima di invii massivi.</li>
                <li>Le liste create possono essere riutilizzate per promemoria settimanali automatici.</li>
                <li>Il sistema gestisce automaticamente la pausa di sicurezza tra i messaggi.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: GESTIONE LISTE & RUBRICA */}
      {/* ======================================================== */}
      {activeTab === 'liste' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* FORM CREAZIONE LISTA */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-700" />
                <span>Crea Nuova Lista Destinatari</span>
              </h2>
              <span className="text-xs text-slate-500 font-bold">
                {selectedClients.length} clienti selezionati
              </span>
            </div>

            <form onSubmit={handleSaveLista} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  Nome della Lista *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Es. Pizzerie Potenza, Clienti Sabato, Bar & Ristoranti..."
                  value={nomeNuovaLista}
                  onChange={(e) => setNomeNuovaLista(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-blue-600 outline-none shadow-sm"
                />
              </div>

              {/* SELEZIONE DA RUBRICA */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Rubrica Clienti ({registeredClients.length})
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[10px] font-bold shadow-sm"
                    >
                      Seleziona Tutti
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[10px] font-bold shadow-sm"
                    >
                      Deseleziona
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cerca cliente per nome o telefono..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-900 outline-none shadow-sm focus:border-blue-600"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 bg-white p-2 rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {filteredClients.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-3 text-center">Nessun cliente trovato.</p>
                  ) : (
                    filteredClients.map((clientObj, cIdx) => {
                      const clientName = getClientName(clientObj);
                      const clientPhone = getClientPhone(clientObj);
                      const isSelected = selectedClients.includes(clientName);
                      return (
                        <div
                          key={cIdx}
                          onClick={() => toggleClientSelection(clientName)}
                          className="flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-slate-50 cursor-pointer transition text-xs font-bold text-slate-800"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="block truncate">{clientName}</span>
                            {clientPhone && (
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                {clientPhone}
                              </span>
                            )}
                          </div>
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-700 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* NUMERI EXTRA MANUALI */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    + Contatti / Numeri extra manuali (uno per riga)
                  </label>
                  <textarea
                    rows="2"
                    placeholder="+39 333 1122334&#10;Pizzeria Da Mario (+39333998877)"
                    value={contattiManualInput}
                    onChange={(e) => setContattiManualInput(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono placeholder-slate-400 outline-none shadow-sm focus:border-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-petruzzi-900 hover:bg-petruzzi-950 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition active:scale-95 flex items-center justify-center space-x-2"
              >
                <Zap className="w-4 h-4" />
                <span>SALVA QUESTA LISTA DESTINATARI</span>
              </button>
            </form>
          </div>

          {/* LISTA DELLE LISTE CREATE */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
            <h2 className="text-base font-black text-slate-900 flex items-center space-x-2 border-b border-slate-100 pb-3">
              <Users className="w-5 h-5 text-indigo-700" />
              <span>Liste Salvate ({liste.length})</span>
            </h2>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {liste.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-2">
                  <Users className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-xs italic">Nessuna lista salvata. Creane una adesso dal pannello a sinistra.</p>
                </div>
              ) : (
                liste.map((l) => (
                  <div
                    key={l.id}
                    className="p-4 bg-slate-50 hover:bg-blue-50/40 rounded-2xl border border-slate-200 transition space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-slate-900 text-sm">{l.nome_lista}</h3>
                      <button
                        onClick={() => handleDeleteLista(l.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                        title="Elimina lista"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                      <span>👥 {l.contatti?.length || 0} contatti associati</span>
                      <button
                        onClick={() => {
                          setSelectedListaId(l.id);
                          setActiveTab('invio');
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-petruzzi-900 hover:text-white text-petruzzi-900 font-bold text-[11px] rounded-lg border border-slate-300 shadow-sm transition"
                      >
                        Usa per Broadcast ➔
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CODA PROGRAMMATI */}
      {/* ======================================================== */}
      {activeTab === 'coda' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <span>Coda Task Schedulati ({schedulati.length})</span>
            </h2>
            <button
              onClick={() => setActiveTab('invio')}
              className="px-3 py-1.5 bg-blue-50 text-blue-900 font-bold text-xs rounded-xl hover:bg-blue-100 transition"
            >
              + Nuovo Invio Programmato
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedulati.length === 0 ? (
              <div className="col-span-2 text-center py-12 text-slate-400 space-y-2">
                <Clock className="w-12 h-12 mx-auto text-slate-300" />
                <p className="text-sm font-bold">Nessun messaggio broadcast in coda di programmazione.</p>
              </div>
            ) : (
              schedulati.map((s) => {
                const isDone = s.stato === 'INVIATO';
                return (
                  <div
                    key={s.id}
                    className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 shadow-sm hover:border-slate-300 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-extrabold text-slate-900 text-sm block">
                          {s.nome_lista}
                        </span>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-900 rounded-md text-[10px] font-black font-mono">
                            {getRicorrenzaLabel(s.ricorrenza)}
                          </span>
                          {isDone ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black uppercase">
                              ✅ Inviato
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md text-[10px] font-black uppercase">
                              ⏳ In Coda
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleEseguiTaskOra(s.id, s.nome_lista)}
                          className="p-2 text-emerald-700 hover:bg-emerald-100 rounded-xl transition"
                          title="Esegui ORA questo invio"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                        <button
                          onClick={() => handleDeleteSchedulato(s.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                          title="Elimina task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-700 italic">
                      "{s.messaggio}"
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-200 pt-2 font-medium">
                      <span>Orario: <strong className="text-slate-900">{s.orario_programmato}</strong></span>
                      {s.data_invio && <span>Ultimo invio: {s.data_invio}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: STORICO LOG & REPORT INVII */}
      {/* ======================================================== */}
      {activeTab === 'storico' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center space-x-2">
                <History className="w-5 h-5 text-indigo-600" />
                <span>Registro Storico Invii Broadcast ({logs.length})</span>
              </h2>
              <p className="text-xs text-slate-500">Log dettagliato di tutti i messaggi trasmessi tramite WhatsApp.</p>
            </div>

            {logs.length > 0 && (
              <button
                onClick={handleClearAllLogs}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl transition flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Svuota Storico</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] border-b border-slate-200">
                  <th className="p-3">Data / Ora</th>
                  <th className="p-3">Destinatario</th>
                  <th className="p-3">Esito</th>
                  <th className="p-3">Messaggio Trasmesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400 italic">
                      Nessun log di invio registrato finora.
                    </td>
                  </tr>
                ) : (
                  logs.map((lg) => (
                    <tr key={lg.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                        {lg.timestamp_invio}
                      </td>
                      <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                        {lg.destinatario}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {lg.stato_esito === 'INVIATO' ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[10px] inline-flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Inviato</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-extrabold text-[10px] inline-flex items-center space-x-1">
                            <AlertTriangle className="w-3 h-3 text-red-600" />
                            <span>Fallito</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 max-w-md truncate">
                        {lg.messaggio}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}