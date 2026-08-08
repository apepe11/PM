import React, { useState, useEffect } from 'react';
import { ShoppingBag, Milk, Award, TrendingUp, Calendar, ArrowUpRight, BarChart2, Layers, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';

export default function AnalisiStatistica({ statistiche }) {
  const [periodoTipo, setPeriodoTipo] = useState('mensile');
  const [periodoValore, setPeriodoValore] = useState('2026-08');
  const [statsData, setStatsData] = useState(statistiche);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (statistiche) {
      setStatsData(statistiche);
    }
  }, [statistiche]);

  const loadStats = async (tipo, valore) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/statistiche?periodo_tipo=${tipo}&periodo_valore=${valore}`);
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
      }
    } catch (e) {
      console.error("Errore caricamento statistiche:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTipoChange = (newTipo) => {
    setPeriodoTipo(newTipo);
    let defaultVal = '2026-08';
    if (newTipo === 'trimestrale') defaultVal = '2026-Q3';
    if (newTipo === 'semestrale') defaultVal = '2026-S2';
    if (newTipo === 'annuale') defaultVal = '2026';
    setPeriodoValore(defaultVal);
    loadStats(newTipo, defaultVal);
  };

  const handleValoreChange = (newVal) => {
    setPeriodoValore(newVal);
    loadStats(periodoTipo, newVal);
  };

  const kpi = statsData?.kpi || {
    ordini_totali_periodo: 0,
    kg_mozzarella_periodo: 0.0,
    media_kg_ordine: 0.0,
    top_cliente_periodo: '-'
  };

  const trendArticoli = statsData?.trend_articoli || [];
  const volumiTemporali = statsData?.volumi_giornalieri || [];

  const totalKgPeriod = trendArticoli
    .filter(i => (i.unita || 'KG').toUpperCase() === 'KG')
    .reduce((acc, curr) => acc + (curr.quantita || 0), 0);

  return (
    <div className="space-y-8 animate-fadeIn text-petruzzi-950">
      
      {/* Timeframe & Period Selector Toolbar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-3xl bg-petruzzi-100/90 border border-petruzzi-200 shadow-md">
        <div>
          <div className="flex items-center space-x-2 text-petruzzi-800 text-xs font-bold uppercase tracking-widest mb-1">
            <BarChart2 className="w-4 h-4 text-petruzzi-700" />
            <span>REPORT STATISTICO E CONTROLLO DI GESTIONE</span>
          </div>
          <h2 className="text-xl font-extrabold text-petruzzi-950">Analisi Volumi e Prestazioni B2B</h2>
          <p className="text-xs text-petruzzi-700 mt-0.5">Visualizza le statistiche in base alla frequenza e al periodo selezionato.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Frequency Pills (Mensile, Trimestrale, Semestrale, Annuale) */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-petruzzi-300 shadow-sm">
            <button
              onClick={() => handleTipoChange('mensile')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                periodoTipo === 'mensile'
                  ? 'bg-petruzzi-800 text-white shadow-sm'
                  : 'text-petruzzi-800 hover:bg-petruzzi-100'
              }`}
            >
              📅 Mensile
            </button>
            <button
              onClick={() => handleTipoChange('trimestrale')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                periodoTipo === 'trimestrale'
                  ? 'bg-petruzzi-800 text-white shadow-sm'
                  : 'text-petruzzi-800 hover:bg-petruzzi-100'
              }`}
            >
              📊 Trimestrale
            </button>
            <button
              onClick={() => handleTipoChange('semestrale')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                periodoTipo === 'semestrale'
                  ? 'bg-petruzzi-800 text-white shadow-sm'
                  : 'text-petruzzi-800 hover:bg-petruzzi-100'
              }`}
            >
              🗓️ 6 Mesi
            </button>
            <button
              onClick={() => handleTipoChange('annuale')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                periodoTipo === 'annuale'
                  ? 'bg-petruzzi-800 text-white shadow-sm'
                  : 'text-petruzzi-800 hover:bg-petruzzi-100'
              }`}
            >
              📈 Anno
            </button>
          </div>

          {/* Specific Period Sub-Dropdown */}
          <div className="flex items-center space-x-2 bg-white px-3.5 py-1.5 rounded-xl border border-petruzzi-300 text-xs font-bold text-petruzzi-900 shadow-sm">
            <Calendar className="w-4 h-4 text-petruzzi-700 shrink-0" />
            <select
              value={periodoValore}
              onChange={(e) => handleValoreChange(e.target.value)}
              className="bg-petruzzi-50 border border-petruzzi-300 text-petruzzi-950 font-black rounded-lg px-2.5 py-1 text-xs outline-none cursor-pointer"
            >
              {periodoTipo === 'mensile' && (
                <>
                  <option value="2026-08">Agosto 2026</option>
                  <option value="2026-07">Luglio 2026</option>
                  <option value="2026-06">Giugno 2026</option>
                  <option value="2026-05">Maggio 2026</option>
                  <option value="2026-04">Aprile 2026</option>
                  <option value="2026-03">Marzo 2026</option>
                  <option value="2026-02">Febbraio 2026</option>
                  <option value="2026-01">Gennaio 2026</option>
                </>
              )}

              {periodoTipo === 'trimestrale' && (
                <>
                  <option value="2026-Q3">3° Trimestre 2026 (Lug - Set)</option>
                  <option value="2026-Q2">2° Trimestre 2026 (Apr - Giu)</option>
                  <option value="2026-Q1">1° Trimestre 2026 (Gen - Mar)</option>
                  <option value="2025-Q4">4° Trimestre 2025 (Ott - Dic)</option>
                </>
              )}

              {periodoTipo === 'semestrale' && (
                <>
                  <option value="2026-S2">2° Semestre 2026 (Lug - Dic)</option>
                  <option value="2026-S1">1° Semestre 2026 (Gen - Giu)</option>
                  <option value="2025-S2">2° Semestre 2025 (Lug - Dic)</option>
                  <option value="2025-S1">1° Semestre 2025 (Gen - Giu)</option>
                </>
              )}

              {periodoTipo === 'annuale' && (
                <>
                  <option value="2026">Anno 2026</option>
                  <option value="2025">Anno 2025</option>
                  <option value="2024">Anno 2024</option>
                </>
              )}
            </select>
            {loading && <RefreshCw className="w-3.5 h-3.5 text-petruzzi-700 animate-spin ml-1" />}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* KPI 1: Volume Totale Periodo */}
        <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-2">
          <div className="flex items-center justify-between text-petruzzi-700">
            <span className="text-xs font-bold uppercase tracking-wider">Volume Lavorato</span>
            <Milk className="w-5 h-5 text-petruzzi-800" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-petruzzi-950">
              {(kpi.kg_mozzarella_periodo || kpi.kg_mozzarella_settimana || 0).toFixed(1)}
            </span>
            <span className="text-xs font-bold text-petruzzi-700">KG TOTALI</span>
          </div>
          <div className="pt-2 border-t border-petruzzi-200 flex items-center text-[11px] text-emerald-800 font-bold">
            <ArrowUpRight className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            <span>Frequenza: {periodoTipo.toUpperCase()}</span>
          </div>
        </div>

        {/* KPI 2: Ordini Totali Periodo */}
        <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-2">
          <div className="flex items-center justify-between text-petruzzi-700">
            <span className="text-xs font-bold uppercase tracking-wider">Ordini Acquisiti</span>
            <ShoppingBag className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-petruzzi-950">
              {kpi.ordini_totali_periodo !== undefined ? kpi.ordini_totali_periodo : (kpi.ordini_totali_oggi || 0)}
            </span>
            <span className="text-xs font-bold text-petruzzi-700">COMMESSE B2B</span>
          </div>
          <div className="pt-2 border-t border-petruzzi-200 text-[11px] text-petruzzi-700">
            Periodo attivo: <span className="font-bold text-petruzzi-900">{periodoValore}</span>
          </div>
        </div>

        {/* KPI 3: Media Lavorazione per Ordine */}
        <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-2">
          <div className="flex items-center justify-between text-petruzzi-700">
            <span className="text-xs font-bold uppercase tracking-wider">Media Volume per Ordine</span>
            <Layers className="w-5 h-5 text-petruzzi-700" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-petruzzi-950">
              {(kpi.media_kg_ordine || 0).toFixed(1)}
            </span>
            <span className="text-xs font-bold text-petruzzi-700">KG / COMMESSA</span>
          </div>
          <div className="pt-2 border-t border-petruzzi-200 text-[11px] text-petruzzi-700">
            Ripartizione: <span className="font-bold text-petruzzi-900">Standard Petruzzi</span>
          </div>
        </div>

        {/* KPI 4: Top Account B2B */}
        <div className="petruzzi-card p-5 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-2">
          <div className="flex items-center justify-between text-petruzzi-700">
            <span className="text-xs font-bold uppercase tracking-wider">Top Cliente Periodo</span>
            <Award className="w-5 h-5 text-petruzzi-800" />
          </div>
          <div className="text-lg font-black text-petruzzi-800 truncate">
            {kpi.top_cliente_periodo || kpi.top_cliente_mese || '-'}
          </div>
          <div className="pt-2 border-t border-petruzzi-200 text-[11px] text-petruzzi-700">
            Cliente principale del periodo
          </div>
        </div>

      </div>

      {/* Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Chart 1: Bar Chart - Distribuzione Formati */}
        <div className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
          <div className="flex items-center justify-between border-b border-petruzzi-200 pb-3">
            <div>
              <h3 className="text-base font-bold text-petruzzi-950 flex items-center space-x-2">
                <span>Ripartizione Volumi per Articolo</span>
              </h3>
              <p className="text-xs text-petruzzi-700 mt-0.5">Analisi quantitativa espressa in chilogrammi lavorati per formato.</p>
            </div>
            <span className="text-xs font-mono font-bold text-petruzzi-900 bg-petruzzi-100 px-2.5 py-1 rounded-md border border-petruzzi-300">
              Totale: {totalKgPeriod.toFixed(1)} KG
            </span>
          </div>

          <div className="h-72 w-full pt-2">
            {trendArticoli.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-petruzzi-600 space-y-1">
                <p className="font-bold">Nessun dato di produzione trovato per il periodo selezionato.</p>
                <p>Gli ordini ricevuti in questo arco temporale verranno mostrati qui.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendArticoli} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5d0b0" opacity={0.6} />
                  <XAxis dataKey="prodotto" stroke="#7d5236" fontSize={11} interval={0} angle={-20} textAnchor="end" />
                  <YAxis stroke="#7d5236" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFDF9', borderColor: '#d5b387', borderRadius: '10px', color: '#3d2017', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    itemStyle={{ color: '#4e2a1e', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="quantita" fill="#7d5236" radius={[6, 6, 0, 0]} name="Volume Totale (KG)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Line Chart - Andamento Giornaliero/Temporale */}
        <div className="petruzzi-card p-6 rounded-2xl border border-petruzzi-200 bg-white/90 space-y-4">
          <div className="flex items-center justify-between border-b border-petruzzi-200 pb-3">
            <div>
              <h3 className="text-base font-bold text-petruzzi-950 flex items-center space-x-2">
                <span>Andamento Domanda nel Tempo ({periodoTipo})</span>
              </h3>
              <p className="text-xs text-petruzzi-700 mt-0.5">Flusso dei chilogrammi lavorati durante il periodo.</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-300">
              {periodoTipo.toUpperCase()}
            </span>
          </div>

          <div className="h-72 w-full pt-2">
            {volumiTemporali.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-petruzzi-600 space-y-1">
                <p className="font-bold">Nessun andamento disponibile per il periodo selezionato.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volumiTemporali} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5d0b0" opacity={0.6} />
                  <XAxis dataKey="giorno" stroke="#7d5236" fontSize={11} />
                  <YAxis stroke="#7d5236" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFDF9', borderColor: '#d5b387', borderRadius: '10px', color: '#3d2017', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    itemStyle={{ color: '#047857', fontWeight: 'bold' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="volumi_kg"
                    stroke="#047857"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#047857' }}
                    activeDot={{ r: 7 }}
                    name="Volumi Lavorazione (KG)"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* Detailed Analytical Table */}
      <div className="petruzzi-card rounded-2xl overflow-hidden border border-petruzzi-200 bg-white/90">
        <div className="p-4 bg-petruzzi-800 border-b border-petruzzi-900 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Prospetto Analitico delle Lavorazioni ({periodoValore})
          </h3>
          <span className="text-xs text-petruzzi-200">Unità di Misura: KG / PZ Standard</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-petruzzi-100 text-petruzzi-950 font-bold uppercase border-b border-petruzzi-200">
                <th className="py-3 px-5">Tipologia Articolo</th>
                <th className="py-3 px-5 text-right">Volume Totale Lavorato</th>
                <th className="py-3 px-5 text-center">Unità Misura</th>
                <th className="py-3 px-5 text-right">Quota Incidenza %</th>
                <th className="py-3 px-5 text-center">Stato Reparto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-petruzzi-200/60 font-mono text-petruzzi-900">
              {trendArticoli.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-petruzzi-600 font-sans italic">
                    Nessuna lavorazione registrata per il periodo selezionato.
                  </td>
                </tr>
              ) : (
                trendArticoli.map((item, idx) => {
                  const perc = totalKgPeriod > 0 ? ((item.quantita / totalKgPeriod) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={idx} className="hover:bg-petruzzi-50">
                      <td className="py-3 px-5 font-bold font-sans text-petruzzi-950">{item.prodotto}</td>
                      <td className="py-3 px-5 text-right font-bold text-petruzzi-800 text-sm">{(item.quantita || 0).toFixed(1)}</td>
                      <td className="py-3 px-5 text-center uppercase font-bold text-petruzzi-700">{item.unita || 'KG'}</td>
                      <td className="py-3 px-5 text-right font-bold text-emerald-800">{perc}%</td>
                      <td className="py-3 px-5 text-center font-sans">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-petruzzi-100 text-petruzzi-900 border border-petruzzi-300">
                          Ottimale
                        </span>
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
