import React, { useState, useEffect } from 'react';
import { 
  Tablet, 
  Scale, 
  Hash, 
  CheckCircle2, 
  PackageCheck, 
  Clock, 
  RefreshCw, 
  AlertCircle, 
  Unlock, 
  Lock, 
  Layers, 
  MessageSquare, 
  Check, 
  Edit3, 
  Sparkles,
  Copy,
  Sun,
  Pizza,
  Search,
  Filter,
  Store
} from 'lucide-react';
import { formatDateIT } from '../utils/dateUtils';

// Helper di classificazione categoria ordine
const isSoleOrder = (ord) => {
  if (ord.is_sole !== undefined && ord.is_sole !== null) return Boolean(ord.is_sole);
  const m = (ord.mittente || '').toLowerCase();
  const n = (ord.note_ordine || '').toLowerCase();
  const t = (ord.testo_originale || '').toLowerCase();
  return m.includes('sole') || m.includes('365') || n.includes('sole') || n.includes('365') || t.includes('sole') || t.includes('365');
};

const isFiloniOrder = (ord) => {
  if (ord.is_filoni !== undefined && ord.is_filoni !== null) return Boolean(ord.is_filoni);
  const m = (ord.mittente || '').toLowerCase();
  if (m.includes('mulnar') || m.includes('franzoli') || m.includes('fronzaroli')) return true;
  return (ord.prodotti || []).some(p => {
    const nome = (p.nome_articolo || p.codice_articolo || '').toLowerCase();
    const cod = (p.codice_articolo || '').toLowerCase();
    return nome.includes('filon') || cod.includes('filon') || nome.includes('panetto') || nome.includes('pizza') || nome.includes('julienne') || cod.includes('tagju');
  });
};

export default function PostazioneTablet() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [ordini, setOrdini] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('tutti'); // 'tutti' | 'sole' | 'filoni'
  const [statusFilter, setStatusFilter] = useState('tutti'); // 'tutti' | 'da_confezionare' | 'confezionati'
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({});
  const [confirmedItems, setConfirmedItems] = useState({}); // { [orderId]: { [pIdx]: boolean } }
  const [itemErrors, setItemErrors] = useState({}); // { [orderId]: { [pIdx]: string } }
  const [savingId, setSavingId] = useState(null);
  const [toast, setToast] = useState('');
  const [validationError, setValidationError] = useState({});

  const fetchOrdiniTablet = async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);
    try {
      const res = await fetch(`/api/ordini?data=${selectedDate}&scomponi_pezzi=true`);
      if (res.ok) {
        const data = await res.json();
        setOrdini(data);
        
        setFormData(prev => {
          const nextForm = {};
          data.forEach(o => {
            const isConfezionato = o.stato_confezionamento === 'CONFEZIONATO';
            const prevProds = prev[o.id] || [];
            
            nextForm[o.id] = (o.prodotti || []).map((p, idx) => {
              const prevP = prevProds[idx];
              // Se l'ordine non è ancora confezionato, preserva i campi digitati localmente
              if (!isConfezionato && prevP) {
                return {
                  ...p,
                  numero_lotto: prevP.numero_lotto !== undefined && prevP.numero_lotto !== '' ? prevP.numero_lotto : (p.numero_lotto || ''),
                  grammatura: prevP.grammatura !== undefined && prevP.grammatura !== '' ? prevP.grammatura : (p.grammatura || '')
                };
              }
              return {
                ...p,
                numero_lotto: p.numero_lotto || '',
                grammatura: p.grammatura || ''
              };
            });
          });
          return nextForm;
        });

        // Inizializza o aggiorna lo stato di conferma dei singoli articoli
        setConfirmedItems(prev => {
          const nextConfirmed = { ...prev };
          data.forEach(o => {
            const isConfezionato = o.stato_confezionamento === 'CONFEZIONATO';
            if (isConfezionato) {
              const orderConf = {};
              (o.prodotti || []).forEach((_, idx) => {
                orderConf[idx] = true;
              });
              nextConfirmed[o.id] = orderConf;
            } else if (!nextConfirmed[o.id]) {
              nextConfirmed[o.id] = {};
            }
          });
          return nextConfirmed;
        });
      }
    } catch (e) {
      console.error("Errore fetch ordini tablet:", e);
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdiniTablet();
    const interval = setInterval(() => {
      fetchOrdiniTablet(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  const handleProductChange = (orderId, prodIndex, field, value) => {
    setFormData(prev => {
      const orderProds = [...(prev[orderId] || [])];
      if (orderProds[prodIndex]) {
        orderProds[prodIndex] = { ...orderProds[prodIndex], [field]: value };
      }
      return { ...prev, [orderId]: orderProds };
    });

    // Se l'utente modifica un articolo precedentemente confermato, rimuovi lo stato confermato
    setConfirmedItems(prev => {
      const orderConf = { ...(prev[orderId] || {}) };
      if (orderConf[prodIndex]) {
        delete orderConf[prodIndex];
      }
      return { ...prev, [orderId]: orderConf };
    });

    // Pulisci eventuali errori sull'articolo o sull'ordine
    setItemErrors(prev => {
      const ordErrors = { ...(prev[orderId] || {}) };
      delete ordErrors[prodIndex];
      return { ...prev, [orderId]: ordErrors };
    });
    setValidationError(prev => ({ ...prev, [orderId]: null }));
  };

  // Conferma del singolo articolo
  const handleConfirmSingleItem = (orderId, prodIndex) => {
    const prods = formData[orderId] || [];
    const p = prods[prodIndex];
    if (!p) return;

    const pVal = parseFloat(p.grammatura);
    const hasValidWeight = p.grammatura && !isNaN(pVal) && pVal > 0;
    const hasValidLotto = p.numero_lotto && p.numero_lotto.trim() !== '';

    if (!hasValidWeight || !hasValidLotto) {
      let msg = '';
      if (!hasValidWeight && !hasValidLotto) {
        msg = 'Inserisci Peso (>0) e Lotto!';
      } else if (!hasValidWeight) {
        msg = 'Inserisci Peso reale (>0)!';
      } else {
        msg = 'Inserisci Numero di Lotto!';
      }

      setItemErrors(prev => ({
        ...prev,
        [orderId]: {
          ...(prev[orderId] || {}),
          [prodIndex]: msg
        }
      }));
      return;
    }

    // Marca l'articolo come confermato
    setItemErrors(prev => {
      const ordErrors = { ...(prev[orderId] || {}) };
      delete ordErrors[prodIndex];
      return { ...prev, [orderId]: ordErrors };
    });

    setConfirmedItems(prev => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        [prodIndex]: true
      }
    }));

    setValidationError(prev => ({ ...prev, [orderId]: null }));
  };

  // Modifica / Sblocco del singolo articolo
  const handleUnlockSingleItem = (orderId, prodIndex) => {
    setConfirmedItems(prev => {
      const ordConf = { ...(prev[orderId] || {}) };
      delete ordConf[prodIndex];
      return { ...prev, [orderId]: ordConf };
    });
  };

  // Funzione rapida per copiare il lotto del primo articolo su tutti gli altri
  const handlePropagateLotto = (orderId, lottoDaCopiare) => {
    if (!lottoDaCopiare || lottoDaCopiare.trim() === '') return;
    setFormData(prev => {
      const prods = (prev[orderId] || []).map(p => ({
        ...p,
        numero_lotto: p.numero_lotto && p.numero_lotto.trim() !== '' ? p.numero_lotto : lottoDaCopiare
      }));
      return { ...prev, [orderId]: prods };
    });
  };

  // Conferma finale dell'intero ordine
  const handleConfirmConfezionamento = async (orderId) => {
    const productsToSave = formData[orderId] || [];
    const totalProds = productsToSave.length;
    const orderConfirmedMap = confirmedItems[orderId] || {};

    // Verifica che OGNI articolo sia stato confermato singolarmente
    const unconfirmedIndices = [];
    productsToSave.forEach((p, idx) => {
      const isItemConfirmed = orderConfirmedMap[idx] === true;
      const pVal = parseFloat(p.grammatura);
      const hasValidWeight = p.grammatura && !isNaN(pVal) && pVal > 0;
      const hasValidLotto = p.numero_lotto && p.numero_lotto.trim() !== '';

      if (!isItemConfirmed || !hasValidWeight || !hasValidLotto) {
        unconfirmedIndices.push(idx + 1);
      }
    });

    if (unconfirmedIndices.length > 0) {
      setValidationError(prev => ({
        ...prev,
        [orderId]: `⚠️ ATTENZIONE: Devi confermare singolarmente tutti gli articoli prima della conferma finale! (Righe da confermare: ${unconfirmedIndices.join(', ')})`
      }));
      return;
    }

    setSavingId(orderId);
    try {
      const res = await fetch(`/api/ordini/${orderId}/confezione`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prodotti: productsToSave })
      });

      if (res.ok) {
        setToast(`✅ Confezionamento registrato e salvato per Ordine #${orderId}!`);
        setTimeout(() => setToast(''), 4000);
        fetchOrdiniTablet();
      } else {
        alert("Errore durante il salvataggio.");
      }
    } catch (e) {
      alert("Errore di connessione.");
    } finally {
      setSavingId(null);
    }
  };

  const handleUnlockOrder = async (orderId) => {
    if (!window.confirm("Sbloccare temporaneamente questo ordine per modifiche dell'ultimo minuto?")) return;
    try {
      const res = await fetch(`/api/ordini/${orderId}/sblocco`, { method: 'PUT' });
      if (res.ok) {
        setToast(`🔓 Ordine #${orderId} sbloccato per modifiche!`);
        setTimeout(() => setToast(''), 4000);
        fetchOrdiniTablet();
      }
    } catch (e) {
      alert("Errore durante lo sblocco.");
    }
  };

  // Suddivisione ordini per categorie
  const ordiniSole = ordini.filter(o => isSoleOrder(o));
  const ordiniFiloni = ordini.filter(o => isFiloniOrder(o));
  const ordiniTutti = ordini;

  // Calcolo statistiche per le tab
  const getStats = (list) => {
    const total = list.length;
    const conf = list.filter(o => o.stato_confezionamento === 'CONFEZIONATO').length;
    const daConf = total - conf;
    return { total, conf, daConf };
  };

  const statsTutti = getStats(ordiniTutti);
  const statsSole = getStats(ordiniSole);
  const statsFiloni = getStats(ordiniFiloni);

  // Ordini base per la tab selezionata
  let currentCategoryOrders = [];
  if (activeTab === 'sole') currentCategoryOrders = ordiniSole;
  else if (activeTab === 'filoni') currentCategoryOrders = ordiniFiloni;
  else currentCategoryOrders = ordiniTutti;

  // Filtro stato e ricerca
  const displayedOrders = currentCategoryOrders.filter(ord => {
    const isConfezionato = ord.stato_confezionamento === 'CONFEZIONATO';
    if (statusFilter === 'da_confezionare' && isConfezionato) return false;
    if (statusFilter === 'confezionati' && !isConfezionato) return false;

    if (searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      const matchMittente = (ord.mittente || '').toLowerCase().includes(q);
      const matchId = String(ord.id).includes(q);
      const matchProd = (ord.prodotti || []).some(p => 
        (p.nome_articolo || '').toLowerCase().includes(q) || 
        (p.codice_articolo || '').toLowerCase().includes(q)
      );
      if (!matchMittente && !matchId && !matchProd) return false;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-petruzzi-950 p-3 sm:p-6 space-y-5 font-sans">
      
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-700 text-white font-black px-6 py-3.5 rounded-2xl shadow-2xl animate-bounce flex items-center space-x-2 border-2 border-white/20">
          <CheckCircle2 className="w-5 h-5 text-emerald-200" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header Postazione Tablet & Data */}
      <div className="petruzzi-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-petruzzi-200 bg-white/90 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-petruzzi-800 text-white rounded-xl border border-petruzzi-900 shadow-sm">
            <Tablet className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-petruzzi-950 flex items-center space-x-2">
              <span>Postazione Confezionamento Tablet</span>
            </h1>
            <p className="text-xs text-petruzzi-700 font-semibold">Pesatura Singoli Articoli, Lottizzazione & Chiusura Ordini</p>
          </div>
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex items-center space-x-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-petruzzi-300 text-petruzzi-950 font-bold rounded-xl px-3 py-2 text-sm outline-none shadow-sm focus:border-petruzzi-700"
          />
          <span className="text-xs font-black text-petruzzi-900 bg-white px-3 py-2 rounded-xl border border-petruzzi-300 shadow-sm font-mono">
            {formatDateIT(selectedDate)}
          </span>
          <button
            onClick={() => {
              const tmr = new Date();
              tmr.setDate(tmr.getDate() + 1);
              setSelectedDate(tmr.toISOString().split('T')[0]);
            }}
            className="px-3 py-2 bg-white hover:bg-petruzzi-100 text-petruzzi-800 font-bold text-xs rounded-xl border border-petruzzi-300 transition shadow-sm"
          >
            Domani
          </button>
          <button
            onClick={() => fetchOrdiniTablet()}
            className="p-2.5 bg-petruzzi-800 hover:bg-petruzzi-900 text-white rounded-xl border border-petruzzi-900 active:scale-95 transition shadow-sm"
            title="Rinfresca Ordini"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-petruzzi-300' : ''}`} />
          </button>
        </div>
      </div>

      {/* SELEZIONE SEZIONI TABLET (3 TABS TOUCH SCREEN) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        
        {/* 1. TAB TUTTI GLI ORDINI */}
        <button
          type="button"
          onClick={() => setActiveTab('tutti')}
          className={`p-4 rounded-2xl border transition-all text-left flex flex-col justify-between space-y-2 shadow-sm ${
            activeTab === 'tutti'
              ? 'bg-petruzzi-800 text-white border-petruzzi-900 ring-2 ring-petruzzi-700 shadow-md scale-[1.01]'
              : 'bg-white text-petruzzi-950 border-petruzzi-200 hover:bg-petruzzi-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-black flex items-center space-x-2">
              <Layers className={`w-5 h-5 ${activeTab === 'tutti' ? 'text-petruzzi-200' : 'text-petruzzi-700'}`} />
              <span>Tutti gli Ordini</span>
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
              activeTab === 'tutti'
                ? (statsTutti.daConf === 0 && statsTutti.total > 0 ? 'bg-emerald-500 text-white' : 'bg-petruzzi-950 text-amber-200')
                : (statsTutti.daConf === 0 && statsTutti.total > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-petruzzi-100 text-petruzzi-800')
            }`}>
              {statsTutti.total} totali
            </span>
          </div>
          
          <div className="flex items-center justify-between text-xs font-bold">
            <span className={activeTab === 'tutti' ? 'text-petruzzi-200' : 'text-petruzzi-600'}>
              Tutti i Clienti & Ordini
            </span>
            <span className={`text-xs font-black ${
              statsTutti.daConf === 0 && statsTutti.total > 0 
                ? (activeTab === 'tutti' ? 'text-emerald-300' : 'text-emerald-700')
                : (activeTab === 'tutti' ? 'text-amber-300' : 'text-amber-700')
            }`}>
              {statsTutti.conf}/{statsTutti.total} evasi
            </span>
          </div>
        </button>

        {/* 2. TAB SOLE 365 */}
        <button
          type="button"
          onClick={() => setActiveTab('sole')}
          className={`p-4 rounded-2xl border transition-all text-left flex flex-col justify-between space-y-2 shadow-sm ${
            activeTab === 'sole'
              ? 'bg-amber-600 text-white border-amber-700 ring-2 ring-amber-400 shadow-md scale-[1.01]'
              : 'bg-amber-50/70 text-amber-950 border-amber-300 hover:bg-amber-100/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-black flex items-center space-x-2">
              <Sun className={`w-5 h-5 ${activeTab === 'sole' ? 'text-white' : 'text-amber-600'}`} />
              <span>Gruppo Sole 365</span>
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
              activeTab === 'sole'
                ? (statsSole.daConf === 0 && statsSole.total > 0 ? 'bg-emerald-500 text-white' : 'bg-amber-800 text-white')
                : (statsSole.daConf === 0 && statsSole.total > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-200 text-amber-950')
            }`}>
              {statsSole.total} ordini
            </span>
          </div>
          
          <div className="flex items-center justify-between text-xs font-bold">
            <span className={activeTab === 'sole' ? 'text-amber-100' : 'text-amber-800'}>
              Punti Vendita Sole
            </span>
            <span className={`text-xs font-black ${
              statsSole.daConf === 0 && statsSole.total > 0 
                ? (activeTab === 'sole' ? 'text-emerald-200' : 'text-emerald-700')
                : (activeTab === 'sole' ? 'text-amber-100' : 'text-amber-900')
            }`}>
              {statsSole.conf}/{statsSole.total} evasi
            </span>
          </div>
        </button>

        {/* 3. TAB FILONI & PIZZERIE */}
        <button
          type="button"
          onClick={() => setActiveTab('filoni')}
          className={`p-4 rounded-2xl border transition-all text-left flex flex-col justify-between space-y-2 shadow-sm ${
            activeTab === 'filoni'
              ? 'bg-orange-600 text-white border-orange-700 ring-2 ring-orange-400 shadow-md scale-[1.01]'
              : 'bg-orange-50/70 text-orange-950 border-orange-300 hover:bg-orange-100/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-base sm:text-lg font-black flex items-center space-x-2">
              <Pizza className={`w-5 h-5 ${activeTab === 'filoni' ? 'text-white' : 'text-orange-600'}`} />
              <span>Filoni Pizzeria</span>
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-black ${
              activeTab === 'filoni'
                ? (statsFiloni.daConf === 0 && statsFiloni.total > 0 ? 'bg-emerald-500 text-white' : 'bg-orange-800 text-white')
                : (statsFiloni.daConf === 0 && statsFiloni.total > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-orange-200 text-orange-950')
            }`}>
              {statsFiloni.total} ordini
            </span>
          </div>
          
          <div className="flex items-center justify-between text-xs font-bold">
            <span className={activeTab === 'filoni' ? 'text-orange-100' : 'text-orange-800'}>
              Pizzerie & Filoni
            </span>
            <span className={`text-xs font-black ${
              statsFiloni.daConf === 0 && statsFiloni.total > 0 
                ? (activeTab === 'filoni' ? 'text-emerald-200' : 'text-emerald-700')
                : (activeTab === 'filoni' ? 'text-orange-100' : 'text-orange-900')
            }`}>
              {statsFiloni.conf}/{statsFiloni.total} evasi
            </span>
          </div>
        </button>

      </div>

      {/* TOOLBAR DI RICERCA E FILTRI STATO PER SEZIONE */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4 rounded-xl bg-white border border-petruzzi-200 shadow-sm">
        
        {/* Ricerca Veloce */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-petruzzi-600" />
          <input
            type="text"
            placeholder="Cerca cliente o articolo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-petruzzi-50/70 border border-petruzzi-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-petruzzi-950 font-bold placeholder-petruzzi-600/70 focus:outline-none focus:border-petruzzi-700"
          />
        </div>

        {/* Filtri Stato Ordine */}
        <div className="flex items-center space-x-1.5">
          <span className="text-[11px] font-black text-petruzzi-700 uppercase mr-1">Filtro:</span>
          
          <button
            onClick={() => setStatusFilter('tutti')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              statusFilter === 'tutti'
                ? 'bg-petruzzi-800 text-white'
                : 'bg-petruzzi-100 text-petruzzi-800 hover:bg-petruzzi-200'
            }`}
          >
            Tutti ({currentCategoryOrders.length})
          </button>
          
          <button
            onClick={() => setStatusFilter('da_confezionare')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
              statusFilter === 'da_confezionare'
                ? 'bg-amber-700 text-white'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Da Confezionare ({currentCategoryOrders.filter(o => o.stato_confezionamento !== 'CONFEZIONATO').length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('confezionati')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
              statusFilter === 'confezionati'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>Confezionati ({currentCategoryOrders.filter(o => o.stato_confezionamento === 'CONFEZIONATO').length})</span>
          </button>
        </div>

      </div>

      {/* Lista Ordini della Sezione */}
      <div className="grid grid-cols-1 gap-5">
        {displayedOrders.length === 0 ? (
          <div className="p-12 text-center petruzzi-card rounded-2xl border border-petruzzi-200 bg-white/90">
            <PackageCheck className="w-12 h-12 text-petruzzi-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-petruzzi-800">
              Nessun ordine trovato per la sezione selezionata
            </h3>
            <p className="text-xs text-petruzzi-600 mt-1">
              {searchTerm 
                ? 'Nessun ordine corrisponde ai filtri di ricerca impostati.' 
                : 'Tutti gli ordini di questa categoria sono stati elaborati o non ve ne sono per la data selezionata.'}
            </p>
          </div>
        ) : (
          displayedOrders.map((ord) => {
            const isConfezionato = ord.stato_confezionamento === 'CONFEZIONATO';
            const currentProds = formData[ord.id] || [];
            const orderConfirmedMap = confirmedItems[ord.id] || {};
            const orderItemErrors = itemErrors[ord.id] || {};
            const vErr = validationError[ord.id];

            const isThisSole = isSoleOrder(ord);
            const isThisFiloni = isFiloniOrder(ord);

            const totalProds = currentProds.length;
            const confirmedCount = isConfezionato 
              ? totalProds 
              : currentProds.filter((_, idx) => orderConfirmedMap[idx] === true).length;
            const allItemsConfirmed = totalProds > 0 && confirmedCount === totalProds;
            const progressPercent = totalProds > 0 ? Math.round((confirmedCount / totalProds) * 100) : 0;

            const primoLotto = currentProds[0]?.numero_lotto || '';

            return (
              <div
                key={ord.id}
                className={`petruzzi-card p-4 sm:p-6 rounded-2xl border space-y-4 transition ${
                  isConfezionato 
                    ? 'border-emerald-300 bg-emerald-50/40' 
                    : isThisSole
                      ? 'border-amber-300/80 bg-white'
                      : isThisFiloni
                        ? 'border-orange-300/80 bg-white'
                        : 'border-petruzzi-200 bg-white hover:border-petruzzi-300'
                }`}
              >
                {/* Header Scheda Ordine */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-petruzzi-200 pb-3.5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg sm:text-xl font-black text-petruzzi-950">{ord.mittente}</h3>
                      <span className="text-xs font-mono font-bold bg-petruzzi-100 text-petruzzi-800 px-2 py-0.5 rounded-md border border-petruzzi-300">
                        #{ord.id}
                      </span>

                      {/* BADGE CATEGORIA ORDINE */}
                      {isThisSole && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 text-[10px] font-black border border-amber-300">
                          <Sun className="w-3 h-3 text-amber-700" />
                          <span>SOLE 365</span>
                        </span>
                      )}
                      {isThisFiloni && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-orange-100 text-orange-950 text-[10px] font-black border border-orange-300">
                          <Pizza className="w-3 h-3 text-orange-700" />
                          <span>FILONI PIZZERIA</span>
                        </span>
                      )}
                      {!isThisSole && !isThisFiloni && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-petruzzi-100 text-petruzzi-900 text-[10px] font-black border border-petruzzi-300">
                          <span>🧀 STANDARD</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-petruzzi-700 font-medium">
                      Consegna Target: <strong>{formatDateIT(ord.data_consegna)}</strong>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {/* Badge Stato */}
                    {isConfezionato ? (
                      <span className="px-3.5 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-black uppercase flex items-center space-x-1.5 shadow-sm">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 stroke-[2.5]" />
                        <span>CONFEZIONATO</span>
                      </span>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase border ${
                          allItemsConfirmed 
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                        }`}>
                          {allItemsConfirmed ? 'Tutti Confermati' : 'In Lavorazione'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Barra Avanzamento Articoli dell'Ordine */}
                {!isConfezionato && totalProds > 0 && (
                  <div className="bg-petruzzi-50/80 p-3 rounded-xl border border-petruzzi-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 text-xs font-extrabold text-petruzzi-900">
                      <span>Avanzamento Articoli:</span>
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                        allItemsConfirmed ? 'bg-emerald-600 text-white' : 'bg-petruzzi-800 text-white'
                      }`}>
                        {confirmedCount} / {totalProds} confermati ({progressPercent}%)
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div 
                          className={`h-2.5 rounded-full transition-all duration-300 ${allItemsConfirmed ? 'bg-emerald-600' : 'bg-amber-500'}`} 
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                      
                      {primoLotto && totalProds > 1 && (
                        <button
                          type="button"
                          onClick={() => handlePropagateLotto(ord.id, primoLotto)}
                          className="text-[11px] font-bold bg-white hover:bg-petruzzi-100 text-petruzzi-800 px-2.5 py-1 rounded-lg border border-petruzzi-300 shadow-sm flex items-center space-x-1 transition"
                          title="Copia il lotto del primo articolo su tutte le righe vuote"
                        >
                          <Copy className="w-3 h-3 text-petruzzi-600" />
                          <span>Copia Lotto {primoLotto}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Banner Errore di Validazione */}
                {vErr && (
                  <div className="p-3.5 bg-red-100 border border-red-300 rounded-xl text-xs text-red-900 font-bold flex items-start space-x-2 shadow-sm animate-pulse">
                    <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                    <span>{vErr}</span>
                  </div>
                )}

                {/* Tabella Articoli */}
                <div className="bg-petruzzi-50/60 p-3 sm:p-4 rounded-xl border border-petruzzi-200 space-y-3">
                  
                  {/* Intestazione Colonne Desktop/Tablet */}
                  <div className="hidden md:grid md:grid-cols-12 gap-3 pb-2 border-b border-petruzzi-200 text-xs font-black text-petruzzi-800 uppercase tracking-wider">
                    <div className="col-span-4">Quantità & Articolo</div>
                    <div className="col-span-3">⚖️ Peso Reale (KG)</div>
                    <div className="col-span-3"># Lotto</div>
                    <div className="col-span-2 text-center">Conferma Articolo</div>
                  </div>

                  {/* Righe Articoli */}
                  {currentProds.map((p, pIdx) => {
                    const isItemConfirmed = isConfezionato || orderConfirmedMap[pIdx] === true;
                    const itErr = orderItemErrors[pIdx];
                    const isLottoMancante = !p.numero_lotto || p.numero_lotto.trim() === '';
                    const isGrammaturaMancante = !p.grammatura || isNaN(parseFloat(p.grammatura)) || parseFloat(p.grammatura) <= 0;

                    return (
                      <div 
                        key={pIdx} 
                        className={`p-3 rounded-xl border transition-all shadow-sm ${
                          isItemConfirmed
                            ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-200'
                            : itErr
                              ? 'bg-red-50/90 border-red-300'
                              : 'bg-white border-petruzzi-200 hover:border-amber-400'
                        }`}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                          
                          {/* Colonna Articolo e Quantità */}
                          <div className="md:col-span-4 flex items-start space-x-3">
                            <div className={`flex-shrink-0 min-w-[3.5rem] text-center rounded-lg py-1 px-2 flex flex-col justify-center items-center shadow-sm ${
                              isItemConfirmed ? 'bg-emerald-800 text-white' : 'bg-petruzzi-800 text-white'
                            }`}>
                              <span className="text-sm font-black leading-none">{p.quantita}</span>
                              <span className="text-[9px] uppercase font-bold tracking-wider leading-none mt-1">{p.unita_di_misura}</span>
                            </div>
                            
                            <div className="min-w-0">
                              <span className="font-bold text-petruzzi-950 block leading-tight truncate">{p.nome_articolo || p.codice_articolo}</span>
                              {p.pezzi_totali && (
                                <span className="text-[10px] text-petruzzi-700 font-mono block mt-0.5">Pezzo {p.pezzo_index} di {p.pezzi_totali}</span>
                              )}
                              {p.is_peso_fisso && (
                                <span className="inline-block mt-1 text-[9px] bg-petruzzi-100 text-petruzzi-800 px-1.5 py-0.5 rounded font-mono uppercase border border-petruzzi-300">
                                  Teorico: {p.peso_unitario_kg} KG
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Colonna Peso */}
                          <div className="md:col-span-3">
                            <label className="block md:hidden text-[10px] font-black text-petruzzi-700 uppercase mb-1">
                              ⚖️ Peso (KG)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="es. 0.350"
                              value={p.grammatura}
                              onChange={(e) => handleProductChange(ord.id, pIdx, 'grammatura', e.target.value)}
                              disabled={isConfezionato || isItemConfirmed}
                              className={`w-full text-base font-extrabold rounded-xl px-3 py-2.5 outline-none transition disabled:opacity-85 shadow-inner ${
                                isItemConfirmed
                                  ? 'bg-white border-2 border-emerald-400 text-emerald-950 font-black'
                                  : isGrammaturaMancante && itErr
                                    ? 'bg-white border-2 border-red-400 text-red-950 focus:ring-2 focus:ring-red-300'
                                    : 'bg-white border border-amber-400 text-amber-950 focus:border-petruzzi-700 focus:ring-2 focus:ring-amber-200'
                              }`}
                            />
                          </div>

                          {/* Colonna Lotto */}
                          <div className="md:col-span-3">
                            <label className="block md:hidden text-[10px] font-black text-petruzzi-700 uppercase mb-1">
                              # Lotto
                            </label>
                            <input
                              type="text"
                              placeholder="es. L240813"
                              value={p.numero_lotto}
                              onChange={(e) => handleProductChange(ord.id, pIdx, 'numero_lotto', e.target.value.toUpperCase())}
                              disabled={isConfezionato || isItemConfirmed}
                              className={`w-full text-sm font-bold font-mono rounded-xl px-3 py-2.5 outline-none transition disabled:opacity-85 placeholder:text-gray-400 uppercase ${
                                isItemConfirmed
                                  ? 'bg-white border-2 border-emerald-400 text-emerald-950 font-black'
                                  : isLottoMancante && itErr
                                    ? 'bg-white border-2 border-red-400 text-red-950 focus:ring-2 focus:ring-red-300'
                                    : 'bg-white border border-petruzzi-300 text-petruzzi-900 focus:border-petruzzi-700 focus:ring-2 focus:ring-petruzzi-200'
                              }`}
                            />
                          </div>

                          {/* Colonna Pulsante Conferma Articolo / Stato */}
                          <div className="md:col-span-2 flex items-center justify-end md:justify-center">
                            {isItemConfirmed ? (
                              <div className="flex items-center space-x-1.5 w-full md:w-auto">
                                <span className="flex-1 md:flex-initial inline-flex items-center justify-center space-x-1 px-3 py-2 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black uppercase">
                                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                                  <span>Confermato</span>
                                </span>
                                {!isConfezionato && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnlockSingleItem(ord.id, pIdx)}
                                    title="Modifica questo articolo"
                                    className="p-2 rounded-xl bg-white hover:bg-amber-100 text-petruzzi-700 hover:text-amber-900 border border-petruzzi-300 transition active:scale-95 shadow-sm"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConfirmSingleItem(ord.id, pIdx)}
                                className="w-full md:w-auto min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center space-x-1.5 transition"
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>Conferma Articolo</span>
                              </button>
                            )}
                          </div>

                        </div>

                        {/* Errore specifico per riga */}
                        {itErr && (
                          <div className="mt-2 text-[11px] font-bold text-red-800 flex items-center space-x-1 bg-red-100/80 px-2.5 py-1 rounded-lg">
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>{itErr}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* BOX MESSAGGIO ORIGINALE */}
                {ord.testo_originale && !ord.testo_originale.includes('Inserimento Manuale') && (
                  <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 text-xs text-blue-900">
                    <div className="flex items-center space-x-1.5 font-bold text-blue-800 uppercase tracking-wider mb-1 text-[10px]">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Msg. WhatsApp Originale:</span>
                    </div>
                    <p className="italic font-medium">"{ord.testo_originale.replace(/🎙️\s*\[VOCALE TRASCRITTO\]:\s*/g, '').replace(/\[Parser Locale di Riserva\]\s*/g, '').replace(/\[Integrazione\/Correzione\]:\s*/g, ' + ')}"</p>
                  </div>
                )}

                {/* BOX NOTE */}
                {ord.note_ordine && (
                  <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-300 text-xs text-amber-950">
                    <div className="flex items-center space-x-1.5 font-black text-amber-900 mb-0.5 text-[11px]">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
                      <span>Note Consegna / Resi:</span>
                    </div>
                    <p className="italic font-medium">{ord.note_ordine}</p>
                  </div>
                )}

                {/* SEZIONE PULSANTE FINALE */}
                {!isConfezionato ? (
                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => handleConfirmConfezionamento(ord.id)}
                      disabled={savingId === ord.id}
                      className={`w-full py-4 rounded-2xl font-black text-base sm:text-lg shadow-lg transition-all transform active:scale-98 flex items-center justify-center space-x-2 ${
                        allItemsConfirmed
                          ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-emerald-900/20 ring-2 ring-emerald-400/50 cursor-pointer animate-none'
                          : 'bg-amber-500/90 hover:bg-amber-600 text-white shadow-amber-900/10 cursor-pointer'
                      }`}
                    >
                      {savingId === ord.id ? (
                        <>
                          <RefreshCw className="w-6 h-6 animate-spin text-white" />
                          <span>SALVATAGGIO IN CORSO...</span>
                        </>
                      ) : allItemsConfirmed ? (
                        <>
                          <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                          <span>🏁 CONFERMA FINALE ORDINE E SALVA</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-5 h-5 text-amber-100" />
                          <span>CONFERMA FINALE ORDINE ({confirmedCount}/{totalProds} Confermati)</span>
                        </>
                      )}
                    </button>

                    {!allItemsConfirmed && (
                      <p className="text-center text-[11px] text-petruzzi-700 font-semibold">
                        💡 Premi il pulsante verde <span className="font-bold text-emerald-800">"Conferma Articolo"</span> su ogni riga prima della conferma finale.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="p-3 bg-white rounded-xl border border-petruzzi-200 text-sm text-petruzzi-800 flex items-center justify-between shadow-sm">
                      <span>Totale Pesato Variabile: <strong className="text-petruzzi-950 text-base">{ord.peso_reale} KG</strong></span>
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-md font-bold text-xs uppercase flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Salvato nel Server</span>
                      </span>
                    </div>

                    <button
                      onClick={() => handleUnlockOrder(ord.id)}
                      className="w-full py-3 bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 font-bold text-sm rounded-xl border border-petruzzi-300 flex items-center justify-center space-x-2 transition active:scale-98 shadow-sm"
                    >
                      <Unlock className="w-5 h-5 text-petruzzi-700" />
                      <span>🔄 ORDINE CONFEZIONATO (Sblocca per Modifiche)</span>
                    </button>
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>
    </div>
  );
}