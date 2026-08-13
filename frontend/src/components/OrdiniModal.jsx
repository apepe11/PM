import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, ShoppingBag, UserCheck, UserPlus, Users } from 'lucide-react';

export default function OrdiniModal({ isOpen, onClose, onSave, editingOrder, prodottiCatalogo }) {
  const [isNuovoCliente, setIsNuovoCliente] = useState(false);
  const [mittenteSelect, setMittenteSelect] = useState('');
  const [mittenteInput, setMittenteInput] = useState('');
  const [dataConsegna, setDataConsegna] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [clientiRegistrati, setClientiRegistrati] = useState([]);
  const [prodotti, setProdotti] = useState([
    { codice_articolo: 'FIORDPE', nome_articolo: 'Fior di latte PETRUZZI', quantita: "1", unita_di_misura: 'kg' }
  ]);

  useEffect(() => {
    const fetchClienti = async () => {
      try {
        const res = await fetch('/api/clienti');
        if (res.ok) {
          const data = await res.json();
          setClientiRegistrati(data);
          if (data.length > 0 && !editingOrder) {
            setMittenteSelect(data[0]);
          }
        }
      } catch (e) {
        console.error("Errore fetch clienti:", e);
      }
    };
    if (isOpen) {
      fetchClienti();
    }
  }, [isOpen, editingOrder]);

  useEffect(() => {
    if (editingOrder) {
      const isRegistered = clientiRegistrati.includes(editingOrder.mittente);
      if (isRegistered) {
        setIsNuovoCliente(false);
        setMittenteSelect(editingOrder.mittente);
        setMittenteInput('');
      } else {
        setIsNuovoCliente(true);
        setMittenteInput(editingOrder.mittente || '');
        setMittenteSelect('');
      }
      setDataConsegna(editingOrder.data_consegna || new Date().toISOString().split('T')[0]);
      setNote(editingOrder.note_ordine || '');
      if (editingOrder.prodotti && editingOrder.prodotti.length > 0) {
        setProdotti(editingOrder.prodotti.map(p => ({
          codice_articolo: p.codice_articolo || '',
          nome_articolo: p.nome_articolo || p.codice_articolo || '',
          quantita: p.quantita !== undefined ? p.quantita.toString() : "1", // Salviamo come stringa provvisoria
          unita_di_misura: p.unita_di_misura || 'kg'
        })));
      }
    } else {
      setIsNuovoCliente(false);
      if (clientiRegistrati.length > 0) {
        setMittenteSelect(clientiRegistrati[0]);
      }
      setMittenteInput('');
      setDataConsegna(new Date().toISOString().split('T')[0]);
      setNote('');
      setProdotti([
        { codice_articolo: 'FIORDPE', nome_articolo: 'Fior di latte PETRUZZI', quantita: "1", unita_di_misura: 'kg' }
      ]);
    }
  }, [editingOrder, isOpen, clientiRegistrati]);

  if (!isOpen) return null;

  const handleAddProductRow = () => {
    setProdotti([
      ...prodotti,
      { codice_articolo: 'TRSCAPE', nome_articolo: 'Treccia di Scamorza Petruzzi', quantita: "1", unita_di_misura: 'pezzi' }
    ]);
  };

  const handleRemoveProductRow = (index) => {
    if (prodotti.length === 1) return;
    setProdotti(prodotti.filter((_, idx) => idx !== index));
  };

  const handleProductChange = (index, field, value) => {
    const updated = [...prodotti];
    if (field === 'codice_articolo') {
      const found = prodottiCatalogo.find(p => (p.c || p.codice_prodotto) === value);
      updated[index].codice_articolo = value;
      
      if (found) {
        updated[index].nome_articolo = found.n || found.nome_prodotto || value;
        const hasWeight = found.p !== undefined ? found.p !== null : found.peso_unitario !== null;
        updated[index].unita_di_misura = hasWeight ? 'pezzi' : 'kg';
      }
    } else if (field === 'quantita') {
      // Permette numeri, punti, virgole e il segno meno per i valori negativi
      updated[index].quantita = value.replace(/[^0-9.,-]/g, ''); 
    } else {
      updated[index][field] = value;
    }
    setProdotti(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalMittente = isNuovoCliente ? mittenteInput.trim() : mittenteSelect.trim();
    if (!finalMittente) return;

    // Convertiamo le stringhe in numeri float (sostituendo eventuali virgole con punti) prima di salvare
    const finalProdotti = prodotti.map(p => ({
        ...p,
        quantita: parseFloat(p.quantita.toString().replace(',', '.')) || 0
    }));

    onSave({
      id: editingOrder?.id,
      mittente: finalMittente,
      data_consegna: dataConsegna,
      note_ordine: note,
      prodotti: finalProdotti
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-petruzzi-950/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn font-sans">
      <div className="bg-[#FFFDF9] border border-petruzzi-300 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl text-petruzzi-950">
        
        {/* Modal Header */}
        <div className="bg-petruzzi-800 px-6 py-4 border-b border-petruzzi-900 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <ShoppingBag className="w-5 h-5 text-petruzzi-300" />
            <h3 className="font-extrabold text-lg">
              {editingOrder ? '✏️ Modifica Ordine Cliente' : '➕ Aggiungi Ordine Manuale'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-petruzzi-200 hover:text-white hover:bg-petruzzi-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Client & Date Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Client Selection or New Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-petruzzi-800 uppercase tracking-wider">
                  Cliente / Mittente *
                </label>

                {/* Toggle: Cliente Esistente vs Nuovo Cliente */}
                <button
                  type="button"
                  onClick={() => setIsNuovoCliente(!isNuovoCliente)}
                  className="text-[11px] font-extrabold text-petruzzi-800 hover:underline flex items-center space-x-1"
                >
                  {isNuovoCliente ? (
                    <>
                      <Users className="w-3.5 h-3.5 text-petruzzi-700" />
                      <span>Scegli da DB</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5 text-petruzzi-700" />
                      <span>+ Nuovo Cliente</span>
                    </>
                  )}
                </button>
              </div>

              {!isNuovoCliente ? (
                <select
                  value={mittenteSelect}
                  onChange={(e) => setMittenteSelect(e.target.value)}
                  className="w-full bg-white border border-petruzzi-300 rounded-xl px-3 py-2.5 text-xs text-petruzzi-950 font-bold outline-none focus:border-petruzzi-700 shadow-sm"
                >
                  {clientiRegistrati.length === 0 ? (
                    <option value="">Nessun cliente nel DB</option>
                  ) : (
                    clientiRegistrati.map((cli, cIdx) => (
                      <option key={cIdx} value={cli}>
                        👤 {cli}
                      </option>
                    ))
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  placeholder="Inserisci nome nuovo cliente (es. Ristorante Da Mario)"
                  value={mittenteInput}
                  onChange={(e) => setMittenteInput(e.target.value)}
                  className="w-full bg-white border border-petruzzi-300 rounded-xl px-4 py-2.5 text-xs text-petruzzi-950 font-bold focus:outline-none focus:border-petruzzi-700 shadow-sm placeholder-petruzzi-600/70"
                />
              )}
            </div>

            {/* Target Delivery Date */}
            <div>
              <label className="block text-xs font-bold text-petruzzi-800 uppercase tracking-wider mb-1">
                Data Consegna
              </label>
              <input
                type="date"
                value={dataConsegna}
                onChange={(e) => setDataConsegna(e.target.value)}
                className="w-full bg-white border border-petruzzi-300 rounded-xl px-4 py-2.5 text-xs text-petruzzi-950 font-bold focus:outline-none focus:border-petruzzi-700 shadow-sm"
              />
            </div>
          </div>

          {/* Products List Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-petruzzi-800 uppercase tracking-wider">
                Articoli Catalogo e Quantità
              </label>
              <button
                type="button"
                onClick={handleAddProductRow}
                className="text-xs font-bold text-petruzzi-800 hover:text-petruzzi-900 transition flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Aggiungi Prodotto</span>
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {prodotti.map((p, idx) => {
                const existsInCatalog = prodottiCatalogo.some(cat => (cat.c || cat.codice_prodotto) === p.codice_articolo);
                
                return (
                  <div key={idx} className="flex items-center space-x-2 bg-petruzzi-50 p-3 rounded-2xl border border-petruzzi-200">
                    
                    {/* Select Product Dropdown */}
                    <select
                      value={p.codice_articolo}
                      onChange={(e) => handleProductChange(idx, 'codice_articolo', e.target.value)}
                      className="flex-1 bg-white border border-petruzzi-300 text-petruzzi-950 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-petruzzi-700 shadow-sm"
                    >
                      {!existsInCatalog && p.codice_articolo && (
                        <option value={p.codice_articolo}>{p.nome_articolo || p.codice_articolo} (Non in catalogo)</option>
                      )}

                      {prodottiCatalogo.map((catItem) => {
                        const code = catItem.c || catItem.codice_prodotto;
                        const name = catItem.n || catItem.nome_prodotto;
                        return (
                          <option key={code} value={code}>
                            {name}
                          </option>
                        );
                      })}
                    </select>

                    {/* Quantity Input - ORA E' UN CAMPO DI TESTO PER GESTIRE VIRGOLE E DECIMALI IN MODO LIBERO */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={p.quantita}
                      onChange={(e) => handleProductChange(idx, 'quantita', e.target.value)}
                      className="w-20 bg-white border border-petruzzi-300 text-petruzzi-950 font-black text-center rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-petruzzi-700 shadow-sm"
                    />

                    {/* Unit of Measure Select */}
                    <select
                      value={p.unita_di_misura}
                      onChange={(e) => handleProductChange(idx, 'unita_di_misura', e.target.value)}
                      className="w-20 bg-white border border-petruzzi-300 text-petruzzi-800 uppercase font-bold text-center rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-petruzzi-700 shadow-sm"
                    >
                      <option value="kg">KG</option>
                      <option value="pezzi">PZ</option>
                    </select>

                    {/* Remove Row Button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveProductRow(idx)}
                      disabled={prodotti.length === 1}
                      className="p-2 rounded-xl text-petruzzi-600 hover:text-red-700 disabled:opacity-30 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Special Notes Input */}
          <div>
            <label className="block text-xs font-bold text-petruzzi-800 uppercase tracking-wider mb-1">
              Note e Particolarità Ordine
            </label>
            <textarea
              rows="2"
              placeholder="Es. Consegna prima delle 09:00, confezione isotermica richiesta..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-white border border-petruzzi-300 rounded-xl p-3 text-xs text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-petruzzi-700 shadow-sm"
            />
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-petruzzi-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 font-bold text-xs transition border border-petruzzi-300"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs shadow-md transition transform active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Salva Ordine</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}