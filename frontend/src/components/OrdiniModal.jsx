import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, ShoppingBag, UserCheck, UserPlus, Users, Calendar, AlertCircle, Sun } from 'lucide-react';
import { isSoleOrder } from '../utils/soleUtils';

const PUNTI_VENDITA_SOLE_PREDEFINITI = [
  { nome: 'Annalucia Pontecagnano Sole', telefono: '3341868867', label: '☀️ Annalucia Pontecagnano Sole — Tel. 3341868867' },
  { nome: 'Carmine Sole Avellino', telefono: '3270507404', label: '☀️ Carmine Sole Avellino — Tel. 3270507404' },
  { nome: 'Costantino L Africano Sole', telefono: '3286595597', label: '☀️ Costantino L Africano Sole — Tel. 3286595597' },
  { nome: 'Gianluca Fratte Sole365', telefono: '3889867085', label: '☀️ Gianluca Fratte Sole365 — Tel. 3889867085' },
  { nome: 'Giuliano Sole 365 Italia', telefono: '3287583993', label: '☀️ Giuliano Sole 365 Italia — Tel. 3287583993' },
  { nome: 'Marco Costantino 365 Sole', telefono: '3495813205', label: '☀️ Marco Costantino 365 Sole — Tel. 3495813205' },
  { nome: 'Marco Costantino 365 Sole (+177188993269891)', telefono: '+177188993269891', label: '☀️ Marco Costantino 365 Sole (WA) — Tel. +177188993269891' },
  { nome: 'Salvatore Sole365 Italia', telefono: '3924317281', label: '☀️ Salvatore Sole365 Italia — Tel. 3924317281' },
  { nome: 'Salvatore Sole365 Italia (+199325305045099)', telefono: '+199325305045099', label: '☀️ Salvatore Sole365 Italia (WA) — Tel. +199325305045099' },
  { nome: 'Simona Maximall Sole365', telefono: '3924317281', label: '☀️ Simona Maximall Sole365 — Tel. 3924317281' },
  { nome: 'Sole 365 (3284344912)', telefono: '3284344912', label: '☀️ Sole 365 — Tel. 3284344912' },
  { nome: 'Sole 365 (181208998756424)', telefono: '181208998756424', label: '☀️ Sole 365 — Tel. 181208998756424' },
  { nome: 'Sole 365 (Sede / Generale)', telefono: '', label: '☀️ Sole 365 (Sede / Generale)' }
];

export default function OrdiniModal({ isOpen, onClose, onSave, editingOrder, prodottiCatalogo = [], selectedDate, isSoleMode = false }) {
  const [isSoleSelection, setIsSoleSelection] = useState(isSoleMode);
  const [isNuovoCliente, setIsNuovoCliente] = useState(false);
  const [mittenteSelect, setMittenteSelect] = useState('');
  const [mittenteInput, setMittenteInput] = useState('');
  const [dataConsegna, setDataConsegna] = useState(selectedDate || new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [clientiRegistrati, setClientiRegistrati] = useState([]);
  const [catalogo, setCatalogo] = useState(prodottiCatalogo || []);
  const [errorMessage, setErrorMessage] = useState('');
  const [prodotti, setProdotti] = useState([
    { codice_articolo: 'FIORDPE', nome_articolo: 'Fior di latte PETRUZZI', quantita: "1", unita_di_misura: 'kg', grammatura: '', numero_lotto: '' }
  ]);

  // Carica catalogo se non passato come prop
  useEffect(() => {
    if (prodottiCatalogo && prodottiCatalogo.length > 0) {
      setCatalogo(prodottiCatalogo);
    } else {
      fetch('/api/prodotti')
        .then(res => res.ok ? res.json() : [])
        .then(data => setCatalogo(data))
        .catch(err => console.error("Errore fetch catalogo:", err));
    }
  }, [prodottiCatalogo, isOpen]);

  // Carica rubrica clienti
  useEffect(() => {
    const fetchClienti = async () => {
      try {
        const res = await fetch('/api/clienti');
        if (res.ok) {
          const data = await res.json();
          const normalizzati = (data || []).map(c => {
            if (typeof c === 'string') return { nome: c, telefono: '', note: '' };
            const nome = (c.n || c.nome_cliente || c.nome || '').trim();
            const telefono = (c.t || c.telefono || '').trim();
            const pNote = (c.p || c.particolarita || '').trim();
            return { nome, telefono, note: pNote };
          }).filter(c => c.nome.length > 0);

          setClientiRegistrati(normalizzati);
        }
      } catch (e) {
        console.error("Errore fetch clienti:", e);
      }
    };

    if (isOpen) {
      fetchClienti();
    }
  }, [isOpen]);

  // Calcola la lista dei punti Sole (unione predefiniti + clienti Sole registrati)
  const listaPuntiSole = React.useMemo(() => {
    const lista = [...PUNTI_VENDITA_SOLE_PREDEFINITI];
    clientiRegistrati.forEach(c => {
      const lower = (c.nome + ' ' + c.note).toLowerCase();
      if (lower.includes('sole') || lower.includes('365')) {
        if (!lista.some(item => item.nome.toLowerCase() === c.nome.toLowerCase())) {
          lista.push({
            nome: c.nome,
            telefono: c.telefono,
            label: `☀️ ${c.nome} ${c.telefono ? `— Tel. ${c.telefono}` : ''}`
          });
        }
      }
    });
    return lista;
  }, [clientiRegistrati]);

  // Sincronizza stato form all'apertura o al cambio di editingOrder/isSoleMode
  useEffect(() => {
    if (editingOrder) {
      const isSole = isSoleOrder(editingOrder);
      setIsSoleSelection(isSole);

      const mitt = (editingOrder.mittente || '').trim();
      const currentList = isSole ? listaPuntiSole : clientiRegistrati;
      
      const matchInDb = currentList.find(c => {
        const cNome = (c.nome || '').toLowerCase().trim();
        const mLower = mitt.toLowerCase();
        if (cNome === mLower) return true;
        if (c.telefono && mitt.includes(c.telefono.replace(/\+/g, '').trim())) return true;
        if (cNome.length >= 4 && (mLower.includes(cNome) || cNome.includes(mLower))) return true;
        return false;
      });
      
      if (matchInDb) {
        setIsNuovoCliente(false);
        setMittenteSelect(matchInDb.nome);
        setMittenteInput('');
      } else {
        setIsNuovoCliente(true);
        setMittenteInput(mitt);
        setMittenteSelect('');
      }

      setDataConsegna(editingOrder.data_consegna || selectedDate || new Date().toISOString().split('T')[0]);
      setNote(editingOrder.note_ordine || '');
      setErrorMessage('');

      if (editingOrder.prodotti && editingOrder.prodotti.length > 0) {
        setProdotti(editingOrder.prodotti.map(p => ({
          codice_articolo: p.codice_articolo || 'FIORDPE',
          nome_articolo: p.nome_articolo || p.codice_articolo || '',
          quantita: p.quantita !== undefined ? p.quantita.toString() : "1",
          unita_di_misura: p.unita_di_misura || 'kg',
          grammatura: p.grammatura || '',
          numero_lotto: p.numero_lotto || editingOrder.numero_lotto || ''
        })));
      }
    } else {
      setIsSoleSelection(isSoleMode);
      setIsNuovoCliente(false);
      setMittenteInput('');
      setDataConsegna(selectedDate || new Date().toISOString().split('T')[0]);
      setNote('');
      setErrorMessage('');
      setProdotti([
        { codice_articolo: 'FIORDPE', nome_articolo: 'Fior di latte PETRUZZI', quantita: "1", unita_di_misura: 'kg', grammatura: '', numero_lotto: '' }
      ]);

      if (isSoleMode) {
        setMittenteSelect(PUNTI_VENDITA_SOLE_PREDEFINITI[0].nome);
      } else if (clientiRegistrati.length > 0) {
        setMittenteSelect(clientiRegistrati[0].nome);
      }
    }
  }, [editingOrder, isOpen, isSoleMode, selectedDate, clientiRegistrati, listaPuntiSole]);

  if (!isOpen) return null;

  const handleAddProductRow = () => {
    const defaultCod = catalogo.length > 0 ? (catalogo[0].c || catalogo[0].codice_articolo || 'FIORDPE') : 'FIORDPE';
    const defaultNome = catalogo.length > 0 ? (catalogo[0].n || catalogo[0].nome_articolo || 'Prodotto') : 'Fior di latte PETRUZZI';
    setProdotti([
      ...prodotti,
      { codice_articolo: defaultCod, nome_articolo: defaultNome, quantita: "1", unita_di_misura: 'kg', grammatura: '', numero_lotto: '' }
    ]);
  };

  const handleRemoveProductRow = (index) => {
    if (prodotti.length === 1) return;
    setProdotti(prodotti.filter((_, idx) => idx !== index));
  };

  const handleProductChange = (index, field, value) => {
    const updated = [...prodotti];
    if (field === 'codice_articolo') {
      const found = catalogo.find(p => (p.c || p.codice_articolo || p.codice_prodotto) === value);
      updated[index].codice_articolo = value;
      
      if (found) {
        updated[index].nome_articolo = found.n || found.nome_articolo || found.nome_prodotto || value;
        const hasWeight = (found.p !== undefined && found.p !== null) || (found.peso_unitario !== undefined && found.peso_unitario !== null);
        updated[index].unita_di_misura = hasWeight ? 'pezzi' : 'kg';
      }
    } else if (field === 'quantita') {
      updated[index].quantita = value.replace(/[^0-9.,-]/g, ''); 
    } else {
      updated[index][field] = value;
    }
    setProdotti(updated);
    setErrorMessage('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');

    let finalMittente = isNuovoCliente ? mittenteInput.trim() : mittenteSelect.trim();
    if (!finalMittente) {
      setErrorMessage("⚠️ Inserisci o seleziona il punto vendita / cliente.");
      return;
    }

    // Se siamo in modalità Sole e l'utente ha digitato un nuovo nome senza indicazione 'Sole', lo aggiustiamo per farlo riconoscere
    if (isSoleSelection && !finalMittente.toLowerCase().includes('sole') && !finalMittente.includes('365')) {
      finalMittente = `Sole 365 - ${finalMittente}`;
    }

    const validProdotti = prodotti
      .filter(p => p.codice_articolo && p.codice_articolo.trim() !== '')
      .map(p => {
        const qVal = parseFloat(p.quantita.toString().replace(',', '.')) || 1.0;
        return {
          codice_articolo: p.codice_articolo.trim(),
          nome_articolo: p.nome_articolo || p.codice_articolo,
          quantita: qVal > 0 ? qVal : 1.0,
          unita_di_misura: p.unita_di_misura || 'kg',
          grammatura: p.grammatura || '',
          numero_lotto: p.numero_lotto || ''
        };
      });

    if (validProdotti.length === 0) {
      setErrorMessage("⚠️ Aggiungi almeno un articolo valido all'ordine.");
      return;
    }

    onSave({
      id: editingOrder?.id,
      mittente: finalMittente,
      data_consegna: dataConsegna,
      note_ordine: note,
      prodotti: validProdotti
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-petruzzi-950/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn font-sans">
      <div className={`border rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl text-petruzzi-950 ${
        isSoleSelection ? 'bg-[#FFFDF4] border-amber-300' : 'bg-[#FFFDF9] border-petruzzi-300'
      }`}>
        
        {/* Modal Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between transition-colors ${
          isSoleSelection ? 'bg-amber-800 border-amber-900' : 'bg-petruzzi-800 border-petruzzi-900'
        }`}>
          <div className="flex items-center space-x-2 text-white">
            {isSoleSelection ? <Sun className="w-5 h-5 text-amber-300 animate-spin-slow" /> : <ShoppingBag className="w-5 h-5 text-petruzzi-300" />}
            <h3 className="font-extrabold text-lg">
              {editingOrder
                ? (isSoleSelection ? '☀️ ✏️ Aggiusta / Modifica Ordine Sole 365' : '✏️ Aggiusta / Modifica Ordine Cliente')
                : (isSoleSelection ? '☀️ ➕ Nuovo Ordine Gruppo Sole 365' : '➕ Aggiungi Ordine Manuale')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-black/20 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Banner Errore */}
          {errorMessage && (
            <div className="p-3 bg-red-100 border border-red-300 text-red-900 text-xs font-bold rounded-xl flex items-center space-x-2 animate-pulse">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Client & Date Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Client Selection or New Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={`block text-xs font-bold uppercase tracking-wider ${
                  isSoleSelection ? 'text-amber-950' : 'text-petruzzi-800'
                }`}>
                  {isSoleSelection ? 'Punto Vendita / Numero Sole 365 *' : 'Cliente / Mittente *'}
                </label>

                {/* Toggle: Cliente Esistente vs Nuovo Cliente */}
                <button
                  type="button"
                  onClick={() => setIsNuovoCliente(!isNuovoCliente)}
                  className={`text-[11px] font-extrabold underline flex items-center space-x-1 ${
                    isSoleSelection ? 'text-amber-900 hover:text-amber-950' : 'text-petruzzi-800 hover:text-petruzzi-950'
                  }`}
                >
                  {isNuovoCliente ? (
                    <>
                      <Users className="w-3.5 h-3.5" />
                      <span>{isSoleSelection ? 'Scegli da Lista Sole' : 'Scegli da Rubrica'}</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{isSoleSelection ? '+ Altro Punto Sole' : '+ Nuovo Cliente'}</span>
                    </>
                  )}
                </button>
              </div>

              {!isNuovoCliente ? (
                <select
                  value={mittenteSelect}
                  onChange={(e) => setMittenteSelect(e.target.value)}
                  className={`w-full bg-white border rounded-xl px-3 py-2.5 text-xs font-bold outline-none shadow-sm ${
                    isSoleSelection ? 'border-amber-400 text-amber-950 focus:border-amber-700' : 'border-petruzzi-300 text-petruzzi-950 focus:border-petruzzi-700'
                  }`}
                >
                  {isSoleSelection ? (
                    listaPuntiSole.map((soleItem, sIdx) => (
                      <option key={sIdx} value={soleItem.nome}>
                        {soleItem.label}
                      </option>
                    ))
                  ) : (
                    clientiRegistrati.length === 0 ? (
                      <option value="">Nessun cliente in rubrica (inserisci manualmente)</option>
                    ) : (
                      clientiRegistrati.map((cli, cIdx) => (
                        <option key={cIdx} value={cli.nome}>
                          👤 {cli.nome} {cli.telefono ? `(${cli.telefono})` : ''}
                        </option>
                      ))
                    )
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  placeholder={isSoleSelection ? "Es. Sole 365 - Punto Nocera (333...)" : "Nome nuovo cliente (es. Ristorante Da Mario)"}
                  value={mittenteInput}
                  onChange={(e) => setMittenteInput(e.target.value)}
                  className={`w-full bg-white border rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none shadow-sm ${
                    isSoleSelection ? 'border-amber-400 text-amber-950 focus:border-amber-700 placeholder-amber-700/60' : 'border-petruzzi-300 text-petruzzi-950 focus:border-petruzzi-700 placeholder-petruzzi-600/70'
                  }`}
                />
              )}
            </div>

            {/* Target Delivery Date */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                isSoleSelection ? 'text-amber-950' : 'text-petruzzi-800'
              }`}>
                Data Consegna
              </label>
              <input
                type="date"
                required
                value={dataConsegna}
                onChange={(e) => setDataConsegna(e.target.value)}
                className={`w-full bg-white border rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none shadow-sm ${
                  isSoleSelection ? 'border-amber-400 text-amber-950 focus:border-amber-700' : 'border-petruzzi-300 text-petruzzi-950 focus:border-petruzzi-700'
                }`}
              />
            </div>
          </div>

          {/* Products List Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-xs font-bold uppercase tracking-wider ${
                isSoleSelection ? 'text-amber-950' : 'text-petruzzi-800'
              }`}>
                Articoli Catalogo & Quantità
              </label>
              <button
                type="button"
                onClick={handleAddProductRow}
                className={`text-xs font-black transition flex items-center space-x-1 px-3 py-1 rounded-lg border shadow-sm ${
                  isSoleSelection ? 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200' : 'bg-petruzzi-100 text-petruzzi-800 border-petruzzi-300 hover:bg-petruzzi-200'
                }`}
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                <span>Aggiungi Articolo</span>
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {prodotti.map((p, idx) => {
                const existsInCatalog = catalogo.some(cat => (cat.c || cat.codice_articolo || cat.codice_prodotto) === p.codice_articolo);
                
                return (
                  <div key={idx} className={`flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 p-3 rounded-2xl border shadow-sm ${
                    isSoleSelection ? 'bg-amber-50/70 border-amber-200' : 'bg-petruzzi-50/80 border-petruzzi-200'
                  }`}>
                    
                    {/* Select Product Dropdown */}
                    <select
                      value={p.codice_articolo}
                      onChange={(e) => handleProductChange(idx, 'codice_articolo', e.target.value)}
                      className="flex-1 bg-white border border-gray-300 text-petruzzi-950 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-petruzzi-700 shadow-sm"
                    >
                      {!existsInCatalog && p.codice_articolo && (
                        <option value={p.codice_articolo}>{p.nome_articolo || p.codice_articolo} (Articolo Speciale)</option>
                      )}

                      {catalogo.map((catItem) => {
                        const code = catItem.c || catItem.codice_articolo || catItem.codice_prodotto;
                        const name = catItem.n || catItem.nome_articolo || catItem.nome_prodotto;
                        return (
                          <option key={code} value={code}>
                            {name}
                          </option>
                        );
                      })}
                    </select>

                    <div className="flex items-center space-x-2">
                      {/* Quantity Input */}
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Q.tà"
                        value={p.quantita}
                        onChange={(e) => handleProductChange(idx, 'quantita', e.target.value)}
                        className="w-20 bg-white border border-gray-300 text-petruzzi-950 font-black text-center rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-petruzzi-700 shadow-sm"
                      />

                      {/* Unit of Measure Select */}
                      <select
                        value={p.unita_di_misura}
                        onChange={(e) => handleProductChange(idx, 'unita_di_misura', e.target.value)}
                        className="w-18 bg-white border border-gray-300 text-petruzzi-900 uppercase font-extrabold text-center rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-petruzzi-700 shadow-sm"
                      >
                        <option value="kg">KG</option>
                        <option value="pezzi">PZ</option>
                      </select>

                      {/* Remove Row Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveProductRow(idx)}
                        disabled={prodotti.length === 1}
                        className="p-2 rounded-xl text-gray-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-30 transition border border-transparent hover:border-red-200"
                        title="Rimuovi articolo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Special Notes Input */}
          <div>
            <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${
              isSoleSelection ? 'text-amber-950' : 'text-petruzzi-800'
            }`}>
              Note e Particolarità Ordine (Opzionale)
            </label>
            <textarea
              rows="2"
              placeholder={isSoleSelection ? "Es. Resi da scalare, consegna al mattino presto..." : "Es. Consegna prima delle 09:00, confezione isotermica richiesta..."}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`w-full bg-white border rounded-xl p-3 text-xs text-petruzzi-950 focus:outline-none shadow-sm ${
                isSoleSelection ? 'border-amber-300 placeholder-amber-800/50 focus:border-amber-700' : 'border-petruzzi-300 placeholder-petruzzi-600/70 focus:border-petruzzi-700'
              }`}
            />
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs transition border border-gray-300 shadow-sm"
            >
              Annulla
            </button>
            <button
              type="submit"
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-white font-black text-xs shadow-md transition transform active:scale-95 ${
                isSoleSelection ? 'bg-amber-800 hover:bg-amber-900' : 'bg-emerald-700 hover:bg-emerald-800'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{editingOrder ? '💾 Salva Modifiche / Aggiusta Ordine' : (isSoleSelection ? 'Salva Ordine Sole 365' : 'Salva Ordine')}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}