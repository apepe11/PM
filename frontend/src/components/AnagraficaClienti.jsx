import React, { useState, useEffect } from 'react';
import { Users, Search, Plus, Edit3, Trash2, Phone, Brain, Sparkles, AlertTriangle, CheckCircle2, X, Save, MessageSquare, Tag, Eraser } from 'lucide-react';

export default function AnagraficaClienti({ showToast }) {
  const [clienti, setClienti] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null); // null = new, number = edit
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    n: '',
    t: '',
    p: '',
    rd: '',
    md: '',
    sd: ''
  });

  const PRESET_RULES = [
    { label: '🍕 Filoni Pizzeria (FILMZPE)', text: 'Pizzeria. Quando scrive un numero intende i filoni di mozzarella FILMZPE.' },
    { label: '🥛 Vaschette Fior di Latte 250g', text: 'Vaschette fior di latte = vaschette da 250g (BOC0250PE).' },
    { label: '🧀 Ricotta Classica 500g', text: 'Ricotta = Ricotta fresca 500g (RICOTPE).' },
    { label: '🌿 Stracciatella 1kg', text: 'Stracciatella = STRACPE sfusa da 1kg.' },
    { label: '🚫 Senza Lattosio (Delat)', text: 'Prodotti Delat Senza Lattosio.' },
    { label: '📦 Sempre a Pezzi', text: 'Calcolare le quantità sempre in pezzi (PZ).' },
    { label: '🔄 Gestione Resi Netto', text: 'Attenzione ai resi/sostituzioni tra parentesi, calcolare saldo netto.' },
  ];

  const fetchClienti = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/particolarita-clienti');
      if (res.ok) {
        const data = await res.json();
        setClienti(data);
      }
    } catch (e) {
      console.error("Errore fetch particolarità clienti:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClienti();
  }, []);

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setFormData({
      n: '',
      t: '',
      p: '',
      rd: '',
      md: '',
      sd: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cli) => {
    setEditingIndex(cli.index);
    setFormData({
      n: cli.n || '',
      t: cli.t || '',
      p: cli.p || '',
      rd: cli.rd || '',
      md: cli.md || '',
      sd: cli.sd || ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.n.trim()) {
      alert("Il nome del cliente è obbligatorio.");
      return;
    }

    try {
      let res;
      if (editingIndex !== null) {
        // Modifica esistente
        res = await fetch(`/api/particolarita-clienti/${editingIndex}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      } else {
        // Nuovo inserimento
        res = await fetch('/api/particolarita-clienti', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      }

      if (res.ok) {
        setIsModalOpen(false);
        await fetchClienti();
        if (showToast) {
          showToast(`✅ Anagrafica e regole di "${formData.n}" salvate direttamente nel JSON!`);
        }
      } else {
        const err = await res.json();
        alert(`⚠️ Errore salvataggio: ${err.detail || 'Impossibile salvare il cliente.'}`);
      }
    } catch (e) {
      alert(`❌ Errore di connessione: ${e.message}`);
    }
  };

  const handleDelete = async (index, nome) => {
    try {
      const res = await fetch(`/api/particolarita-clienti/${index}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setDeleteConfirmIndex(null);
        await fetchClienti();
        if (showToast) {
          showToast(`🗑️ Cliente "${nome}" rimosso dal file JSON.`);
        }
      } else {
        alert("⚠️ Errore durante l'eliminazione.");
      }
    } catch (e) {
      alert(`❌ Errore di connessione: ${e.message}`);
    }
  };

  // Funzione rapida 1-click per rimuovere solo la particolarità dal cliente
  const handleRemoveParticularityOnly = async (cli) => {
    if (!window.confirm(`Vuoi rimuovere la regola/particolarità da "${cli.n}"? (L'anagrafica del cliente rimarrà salvata)`)) {
      return;
    }
    try {
      const updatedCli = { ...cli, p: '' };
      delete updatedCli.index;
      const res = await fetch(`/api/particolarita-clienti/${cli.index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCli)
      });
      if (res.ok) {
        await fetchClienti();
        if (showToast) {
          showToast(`✨ Particolarità rimossa da "${cli.n}".`);
        }
      }
    } catch (e) {
      alert(`❌ Errore: ${e.message}`);
    }
  };

  const filteredClienti = clienti.filter(cli => {
    const q = searchTerm.toLowerCase();
    const nome = (cli.n || '').toLowerCase();
    const tel = (cli.t || '').toLowerCase();
    const part = (cli.p || '').toLowerCase();
    return nome.includes(q) || tel.includes(q) || part.includes(q);
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Banner & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-petruzzi-100/90 border border-petruzzi-200 shadow-md">
        <div>
          <div className="flex items-center space-x-2 text-petruzzi-800 text-xs font-bold uppercase tracking-widest mb-1">
            <Users className="w-4 h-4 text-petruzzi-700" />
            <span>CLIENTI</span>
          </div>
          <h2 className="text-xl font-black text-petruzzi-950">Rubrica & Particolarità Clienti</h2>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-white px-3 py-1.5 rounded-xl border border-petruzzi-300 shadow-sm text-xs font-bold text-petruzzi-900">
            <span>Clienti in rubrica: </span>
            <span className="font-black text-petruzzi-950 text-sm ml-1">{clienti.length}</span>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-petruzzi-800 hover:bg-petruzzi-900 text-white font-black text-xs shadow-md transition transform active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>➕ Nuovo Cliente in Rubrica</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-petruzzi-600" />
        <input
          type="text"
          placeholder="Cerca per nome, telefono o regola..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-petruzzi-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-petruzzi-950 placeholder-petruzzi-600/70 focus:outline-none focus:border-petruzzi-700 shadow-sm"
        />
      </div>

      {/* Clients Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClienti.length === 0 ? (
          <div className="col-span-full petruzzi-card p-12 rounded-2xl text-center border border-petruzzi-200">
            <Users className="w-12 h-12 text-petruzzi-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-petruzzi-800">Nessun cliente trovato</h3>
            <p className="text-xs text-petruzzi-600 mt-1">Nessun cliente corrisponde ai criteri di ricerca o la rubrica è vuota.</p>
          </div>
        ) : (
          filteredClienti.map((cli) => (
            <div
              key={cli.index}
              className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/95 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2.5">
                {/* Client Header */}
                <div className="flex items-start justify-between gap-2 border-b border-petruzzi-100 pb-2.5">
                  <div>
                    <h3 className="font-black text-petruzzi-950 text-base leading-tight">{cli.n}</h3>
                    {cli.t ? (
                      <div className="flex items-center space-x-1.5 mt-1 text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 w-fit">
                        <Phone className="w-3 h-3 text-emerald-700" />
                        <span>{cli.t}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-400 italic block mt-1">Nessun telefono registrato</span>
                    )}
                  </div>
                  
                  <span className="text-[10px] font-mono font-bold text-petruzzi-600 bg-petruzzi-100 px-1.5 py-0.5 rounded border border-petruzzi-200">
                    #{cli.index + 1}
                  </span>
                </div>

                {/* Particolarità / Regole IA */}
                {cli.p ? (
                  <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 text-[10px] font-black text-amber-900 uppercase tracking-wider">
                        <Brain className="w-3.5 h-3.5 text-amber-700" />
                        <span>Regola & Particolarità IA:</span>
                      </div>
                      <button
                        onClick={() => handleRemoveParticularityOnly(cli)}
                        className="text-[10px] text-red-600 hover:text-red-800 font-bold hover:underline"
                        title="Rimuovi solo la particolarità"
                      >
                        ❌ Leva particolarità
                      </button>
                    </div>
                    <p className="text-xs text-amber-950 italic font-medium leading-relaxed">
                      "{cli.p}"
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50/80 p-2.5 rounded-xl border border-dashed border-gray-300 text-center space-y-1.5">
                    <p className="text-[11px] text-gray-500 italic">Nessuna particolarità per questo cliente.</p>
                    <button
                      onClick={() => handleOpenEdit(cli)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 text-[11px] font-bold shadow-xs transition"
                    >
                      <Sparkles className="w-3 h-3 text-amber-700" />
                      <span>➕ Aggiungi Particolarità</span>
                    </button>
                  </div>
                )}

                {/* Defaults Badges (rd, md, sd) */}
                {(cli.rd || cli.md || cli.sd) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {cli.rd && (
                      <span className="text-[10px] font-bold bg-blue-50 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md">
                        Ricotta: <strong>{cli.rd}</strong>
                      </span>
                    )}
                    {cli.md && (
                      <span className="text-[10px] font-bold bg-purple-50 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-md">
                        Mozzarella: <strong>{cli.md}</strong>
                      </span>
                    )}
                    {cli.sd && (
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-md">
                        Stracciatella: <strong>{cli.sd}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div className="pt-2 border-t border-petruzzi-100 flex items-center justify-end space-x-2">
                <button
                  onClick={() => handleOpenEdit(cli)}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-petruzzi-100 hover:bg-petruzzi-200 text-petruzzi-900 text-xs font-bold border border-petruzzi-300 transition"
                  title="Modifica cliente e regole"
                >
                  <Edit3 className="w-3.5 h-3.5 text-petruzzi-700" />
                  <span>Modifica</span>
                </button>

                <button
                  onClick={() => setDeleteConfirmIndex(cli.index)}
                  className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-800 text-xs font-bold border border-red-200 transition"
                  title="Elimina cliente dal JSON"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-700" />
                </button>
              </div>

              {/* Confirm Delete Banner */}
              {deleteConfirmIndex === cli.index && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-center space-y-2 mt-2 animate-fadeIn">
                  <p className="text-xs font-bold text-red-900">Rimuovere {cli.n} dal JSON?</p>
                  <div className="flex justify-center space-x-2">
                    <button
                      onClick={() => handleDelete(cli.index, cli.n)}
                      className="px-3 py-1 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold shadow-sm"
                    >
                      Sì, Elimina
                    </button>
                    <button
                      onClick={() => setDeleteConfirmIndex(null)}
                      className="px-3 py-1 bg-petruzzi-200 text-petruzzi-900 rounded-lg text-xs font-bold"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal Aggiunta / Modifica Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-petruzzi-200 space-y-5 animate-scaleUp">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-petruzzi-200 pb-3">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-petruzzi-800" />
                <h3 className="text-lg font-black text-petruzzi-950">
                  {editingIndex !== null ? 'Modifica Cliente & Particolarità' : 'Aggiungi Nuovo Cliente in Rubrica'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-petruzzi-100 text-petruzzi-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="space-y-4">
              
              {/* Nome Cliente */}
              <div>
                <label className="block text-xs font-black text-petruzzi-900 uppercase tracking-wider mb-1">
                  Nome Cliente / Punto Vendita <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="es. Pizzeria da Mario, Mulnar, Giuseppe..."
                  value={formData.n}
                  onChange={(e) => setFormData({ ...formData, n: e.target.value })}
                  className="w-full border border-petruzzi-300 rounded-xl px-3.5 py-2 text-sm font-bold text-petruzzi-950 outline-none focus:border-petruzzi-700 focus:ring-1 focus:ring-petruzzi-700 shadow-sm"
                />
              </div>

              {/* Telefono */}
              <div>
                <label className="block text-xs font-black text-petruzzi-900 uppercase tracking-wider mb-1">
                  Numero di Telefono WhatsApp (con prefisso o senza)
                </label>
                <input
                  type="text"
                  placeholder="es. 3471461004 oppure +393471461004"
                  value={formData.t}
                  onChange={(e) => setFormData({ ...formData, t: e.target.value })}
                  className="w-full border border-petruzzi-300 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-petruzzi-950 outline-none focus:border-petruzzi-700 focus:ring-1 focus:ring-petruzzi-700 shadow-sm"
                />
              </div>

              {/* Particolarità / Regole IA */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-amber-900 uppercase tracking-wider flex items-center space-x-1.5">
                    <Brain className="w-3.5 h-3.5 text-amber-700" />
                    <span>Particolarità & Istruzioni IA</span>
                  </label>
                  {formData.p && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, p: '' })}
                      className="inline-flex items-center space-x-1 text-[11px] text-red-600 hover:text-red-800 font-bold"
                    >
                      <Eraser className="w-3 h-3" />
                      <span>Cancella particolarità</span>
                    </button>
                  )}
                </div>

                <textarea
                  rows="3"
                  placeholder="Scrivi qui la regola IA per questo cliente (es. quando scrive un numero intende i filoni di mozzarella FILMZPE, oppure lascia vuoto se non ha particolarità)..."
                  value={formData.p}
                  onChange={(e) => setFormData({ ...formData, p: e.target.value })}
                  className="w-full border border-amber-300 bg-amber-50/40 rounded-xl px-3.5 py-2 text-xs font-medium text-petruzzi-950 outline-none focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-sm placeholder-amber-700/50"
                />

                {/* Preset Chips Helper */}
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-bold text-amber-900 uppercase block">Regole Frequenti (clicca per inserire):</span>
                  <div className="flex flex-wrap gap-1">
                    {PRESET_RULES.map((preset, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => {
                          const current = formData.p ? `${formData.p} ${preset.text}` : preset.text;
                          setFormData({ ...formData, p: current });
                        }}
                        className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 text-[10px] font-bold border border-amber-300 transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-petruzzi-600 mt-1">
                  L'IA applicherà questa istruzione per interpretare gli ordini WhatsApp e vocali inviati da questo cliente.
                </p>
              </div>

              {/* Codici di Default (Opzionali) */}
              <div className="bg-petruzzi-50/80 p-3 rounded-2xl border border-petruzzi-200 space-y-2">
                <span className="text-[10px] font-black text-petruzzi-800 uppercase tracking-wider block">
                  Codici Prodotto di Default (Opzionale)
                </span>
                
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-petruzzi-700 uppercase mb-0.5">Def. Ricotta</label>
                    <input
                      type="text"
                      placeholder="es. RIC"
                      value={formData.rd}
                      onChange={(e) => setFormData({ ...formData, rd: e.target.value })}
                      className="w-full border border-petruzzi-300 rounded-lg px-2 py-1 text-xs font-mono font-bold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-petruzzi-700 uppercase mb-0.5">Def. Mozzarella</label>
                    <input
                      type="text"
                      placeholder="es. FIOR DE LAT"
                      value={formData.md}
                      onChange={(e) => setFormData({ ...formData, md: e.target.value })}
                      className="w-full border border-petruzzi-300 rounded-lg px-2 py-1 text-xs font-mono font-bold bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-petruzzi-700 uppercase mb-0.5">Def. Stracciatella</label>
                    <input
                      type="text"
                      placeholder="es. STRACPE"
                      value={formData.sd}
                      onChange={(e) => setFormData({ ...formData, sd: e.target.value })}
                      className="w-full border border-petruzzi-300 rounded-lg px-2 py-1 text-xs font-mono font-bold bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-petruzzi-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-petruzzi-700 hover:bg-petruzzi-100 rounded-xl transition"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-2 px-5 py-2 text-xs font-black text-white bg-petruzzi-800 hover:bg-petruzzi-900 rounded-xl shadow-md transition transform active:scale-95"
                >
                  <Save className="w-4 h-4 stroke-[2.5]" />
                  <span>💾 Salva nel JSON</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
