import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ProduzioneGiornaliera from './components/ProduzioneGiornaliera';
import FiloniPizzeria from './components/FiloniPizzeria';
import PreparazioneOrdini from './components/PreparazioneOrdini';
import OrdiniConfermati from './components/OrdiniConfermati';
import PostazioneTablet from './components/PostazioneTablet';
import AdminRemoteHub from './components/AdminRemoteHub';
import BroadcastManager from './components/BroadcastManager';
import AnalisiStatistica from './components/AnalisiStatistica';
import ConnessioneBanco from './components/ConnessioneBanco';
import OrdiniModal from './components/OrdiniModal';
import OrdiniSole from './components/OrdiniSole';
import ProduzioneSole from './components/ProduzioneSole'; // NUOVA PRODUZIONE SOLE 365
import AnagraficaClienti from './components/AnagraficaClienti'; // NUOVA RUBRICA & PARTICOLARITÀ
import VistaCorriere from './components/VistaCorriere'; // VISTA MOBILE CORRIERE
import { Printer, CheckCircle, AlertCircle } from 'lucide-react';

export default function App() {
  const isTabletPath = typeof window !== 'undefined' && window.location.pathname === '/tablet';
  const isAdminPath = typeof window !== 'undefined' && window.location.pathname === '/admin';
  const isBroadcastPath = typeof window !== 'undefined' && window.location.pathname === '/broadcast';
  const isCorrierePath = typeof window !== 'undefined' && (window.location.pathname === '/corriere' || window.location.pathname === '/corriere.html');
  const [activeTab, setActiveTab] = useState(
    isCorrierePath ? 'corriere' : (isBroadcastPath ? 'broadcast' : (isAdminPath ? 'admin' : (isTabletPath ? 'tablet' : 'produzione')))
  );
  
  const getDeliveryDateDefault = () => {
    const now = new Date();
    const w = now.getDay();
    const h = now.getHours();

    let daysAhead = 0;
    if ((w === 6 && h >= 8) || w === 0 || (w === 1 && h < 8)) {
      if (w === 6) daysAhead = 2;
      else if (w === 0) daysAhead = 1;
      else daysAhead = 0;
    } else if (h >= 8) {
      daysAhead = 1;
    }
    now.setDate(now.getDate() + daysAhead);
    return now.toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState(getDeliveryDateDefault());
  const [ordini, setOrdini] = useState([]);
  const [produzione, setProduzione] = useState([]);
  const [produzioneSole, setProduzioneSole] = useState([]);
  const [statistiche, setStatistiche] = useState(null);
  const [prodottiCatalogo, setProdottiCatalogo] = useState([]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const API_BASE = '/api';

  const fetchDashboardData = async () => {
    setIsRefreshing(true);
    try {
      const resOrdini = await fetch(`${API_BASE}/ordini?scomponi_pezzi=true`);
      if (resOrdini.ok) {
        const dataOrdini = await resOrdini.json();
        setOrdini(dataOrdini);
      }

      const resProd = await fetch(`${API_BASE}/produzione?data=${selectedDate}`);
      if (resProd.ok) {
        const dataProd = await resProd.json();
        setProduzione(dataProd);
      }

      const resProdSole = await fetch(`${API_BASE}/produzione-sole?data=${selectedDate}`);
      if (resProdSole.ok) {
        const dataProdSole = await resProdSole.json();
        setProduzioneSole(dataProdSole);
      }

      const resStats = await fetch(`${API_BASE}/statistiche`);
      if (resStats.ok) {
        const dataStats = await resStats.json();
        setStatistiche(dataStats);
      }

      if (prodottiCatalogo.length === 0) {
        const resCat = await fetch(`${API_BASE}/prodotti`);
        if (resCat.ok) {
          const dataCat = await resCat.json();
          setProdottiCatalogo(dataCat);
        }
      }
    } catch (e) {
      console.error("Errore fetch dashboard data:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    try {
      await fetch(`${API_BASE}/whatsapp/rescan`, { method: 'POST' });
    } catch (_) {}
    await fetchDashboardData();
    showToast("🔄 Sincronizzazione immediata WhatsApp e Dashboard completata!");
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, [selectedDate]);

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleOpenNewOrderModal = () => {
    setEditingOrder(null);
    setIsModalOpen(true);
  };

  const handleOpenEditOrderModal = (ord) => {
    setEditingOrder(ord);
    setIsModalOpen(true);
  };

  const handleSaveOrder = async (orderData) => {
    try {
      if (orderData.id) {
        const res = await fetch(`${API_BASE}/ordini/${orderData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prodotti: orderData.prodotti,
            note_ordine: orderData.note_ordine,
            data_consegna: orderData.data_consegna
          })
        });
        if (res.ok) {
          showToast('Ordine aggiornato con successo!');
          fetchDashboardData();
        }
      } else {
        const res = await fetch(`${API_BASE}/ordini`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mittente: orderData.mittente,
            prodotti: orderData.prodotti,
            note_ordine: orderData.note_ordine,
            data_consegna: orderData.data_consegna
          })
        });
        if (res.ok) {
          showToast('Nuovo ordine manuale salvato!');
          fetchDashboardData();
        }
      }
    } catch (e) {
      showToast("Errore durante il salvataggio dell'ordine", 'error');
    }
  };

  const handleDeleteOrder = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE}/ordini/${orderId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Ordine rimosso dalla produzione.');
        fetchDashboardData();
      }
    } catch (e) {
      showToast("Errore durante la cancellazione", 'error');
    }
  };

  const handleConfirmOrderInline = async (orderId, lotto, prodottiAggiornati) => {
    try {
      const res = await fetch(`${API_BASE}/ordini/${orderId}/conferma`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_lotto: lotto,
          prodotti: prodottiAggiornati
        })
      });
      if (res.ok) {
        showToast('✅ Ordine confermato e salvato con successo!');
        fetchDashboardData();
      } else {
        showToast("Errore durante la conferma dell'ordine", 'error');
      }
    } catch (e) {
      showToast("Errore di connessione", 'error');
    }
  };

  const handleReprocessAll = async () => {
    if (!window.confirm("Vuoi rielaborare solo gli ordini delle ultime 48 ore usando l'IA aggiornata?")) return;
    setIsRefreshing(true);
    showToast("🧠 Rielaborazione ordini delle ultime 48 ore in corso...");
    try {
      const res = await fetch(`${API_BASE}/ordini/rielabora-tutti?ore=48`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(`✅ ${data.message}`);
        fetchDashboardData();
      } else {
        showToast("Errore durante la rielaborazione degli ordini", 'error');
      }
    } catch (e) {
      showToast("Errore di connessione", 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePrintProduction = () => {
    setIsPrintModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6F0] text-petruzzi-950 selection:bg-petruzzi-300 selection:text-petruzzi-950">
      
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center space-x-2 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-bold transition-all animate-bounce ${
          toastMessage.type === 'error'
            ? 'bg-red-600 text-white border-red-500'
            : 'bg-emerald-800 text-white border-emerald-700'
        }`}>
          {toastMessage.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onOpenNewOrderModal={handleOpenNewOrderModal}
        onRefresh={handleRefreshClick}
        onReprocessAll={handleReprocessAll}
        isRefreshing={isRefreshing}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'produzione' && (
          <ProduzioneGiornaliera
            produzione={produzione}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onPrint={handlePrintProduction}
          />
        )}

        {/* NUOVA SEZIONE DISTINTA PRODUZIONE TOTALE SOLE 365 */}
        {activeTab === 'produzione-sole' && (
          <ProduzioneSole
            produzioneSole={produzioneSole}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
          />
        )}

        {activeTab === 'filoni' && (
          <FiloniPizzeria
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onEditOrder={handleOpenEditOrderModal}
            onDeleteOrder={handleDeleteOrder}
          />
        )}

        {/* NUOVA SEZIONE ORDINI SOLE 365 */}
        {activeTab === 'sole' && (
          <OrdiniSole
            ordini={ordini}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onEditOrder={handleOpenEditOrderModal}
            onDeleteOrder={handleDeleteOrder}
            onConfirmOrder={handleConfirmOrderInline}
          />
        )}

        {activeTab === 'ordini' && (
          <PreparazioneOrdini
            ordini={ordini}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            onEditOrder={handleOpenEditOrderModal}
            onDeleteOrder={handleDeleteOrder}
            onConfirmOrder={handleConfirmOrderInline}
            onOpenNewOrderModal={handleOpenNewOrderModal}
            onReprocessAll={handleReprocessAll}
          />
        )}

        {activeTab === 'confermati' && (
          <OrdiniConfermati
            ordini={ordini}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
          />
        )}

        {activeTab === 'corriere' && (
          <VistaCorriere
            ordini={ordini}
            selectedDate={selectedDate}
            onOrderDelivered={fetchDashboardData}
            showToast={showToast}
          />
        )}

        {activeTab === 'anagrafica' && <AnagraficaClienti showToast={showToast} />}
        {activeTab === 'tablet' && <PostazioneTablet />}
        {activeTab === 'admin' && <AdminRemoteHub />}
        {activeTab === 'broadcast' && <BroadcastManager />}
        {activeTab === 'connessione' && <ConnessioneBanco />}
        {activeTab === 'statistiche' && <AnalisiStatistica statistiche={statistiche} />}
      </main>

      <OrdiniModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveOrder}
        editingOrder={editingOrder}
        prodottiCatalogo={prodottiCatalogo}
      />

      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white text-black rounded-2xl w-full max-w-4xl p-8 shadow-2xl print-container">
            <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight">Caseificio Petruzzi</h1>
                <p className="text-sm font-semibold">Foglio di Produzione Laboratorio — Casaro</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold uppercase text-gray-500">Data Produzione:</span>
                <p className="text-lg font-bold">{selectedDate}</p>
              </div>
            </div>

            <table className="w-full text-left print-table mb-6 border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-black font-bold text-sm">
                  <th className="p-2 border">Codice Articolo</th>
                  <th className="p-2 border">Nome Prodotto / Formato</th>
                  <th className="p-2 border text-right">Quantità Totale</th>
                  <th className="p-2 border text-center">Unità</th>
                  <th className="p-2 border text-center">Ordini</th>
                </tr>
              </thead>
              <tbody>
                {produzione.map((p, idx) => (
                  <tr key={idx} className="border-b font-medium text-sm">
                    <td className="p-2 border font-mono font-bold">{p.codice_articolo}</td>
                    <td className="p-2 border font-bold">{p.nome_prodotto}</td>
                    <td className="p-2 border text-right font-black text-base">
                      {p.quantita_totale.toLocaleString('it-IT', { minimumFractionDigits: 1 })}
                    </td>
                    <td className="p-2 border text-center uppercase font-bold">{p.unita_di_misura}</td>
                    <td className="p-2 border text-center">{p.numero_ordini}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between pt-4 border-t border-gray-300 no-print">
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-sm"
              >
                Chiudi
              </button>
              <button
                onClick={() => window.print()}
                className="px-6 py-2 rounded-xl bg-black text-white hover:bg-gray-800 font-bold text-sm flex items-center space-x-2 shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Stampa Ora</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}