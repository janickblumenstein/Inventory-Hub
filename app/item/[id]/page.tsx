"use client";

import { useEffect, useState, use } from 'react';
import { db } from '../../../lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { useWorkspace } from '../../../context/WorkspaceContext';
import { tryPrintNative, tryPrintLoanNative } from '../../../lib/brotherPrint';
import { getStockMode, getStockLevel, STOCK_LEVELS, STOCK_LEVEL_ORDER, type StockLevel } from '../../../lib/stock';

// 🛒 DAS SHOP-LEXIKON FÜR DIE SCHNELLSUCHE
const SUPPORTED_SHOPS: Record<string, { name: string, style: string, urlPattern: string }> = {
  galaxus: { name: 'Galaxus', style: 'text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100', urlPattern: 'https://www.galaxus.ch/search?q=' },
  hornbach: { name: 'Hornbach', style: 'text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100', urlPattern: 'https://www.hornbach.ch/s/' },
  migros: { name: 'Migros', style: 'text-orange-600 border-orange-200 bg-orange-50 hover:bg-orange-100', urlPattern: 'https://www.migros.ch/de/search?query=' },
  coop: { name: 'Coop', style: 'text-red-700 border-red-200 bg-red-50 hover:bg-red-100', urlPattern: 'https://www.coop.ch/de/search/?text=' },
  brack: { name: 'Brack.ch', style: 'text-yellow-700 border-yellow-300 bg-yellow-50 hover:bg-yellow-100', urlPattern: 'https://www.brack.ch/search?query=' },
  obi: { name: 'Obi', style: 'text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100', urlPattern: 'https://www.obi.ch/search/' }
};

export default function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId } = useWorkspace();
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [item, setItem] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  
  const [activeLoans, setActiveLoans] = useState<any[]>([]);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  const [loanQty, setLoanQty] = useState(1);
  const [expectedReturn, setExpectedReturn] = useState('');

  const [printLoan, setPrintLoan] = useState<any>(null);
  const [printLabel, setPrintLabel] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [brotherPrinter, setBrotherPrinter] = useState<any>(null);
  const [lendableCategories, setLendableCategories] = useState<Record<string, boolean>>({});
  
  // 🛒 EINSTELLUNGEN FÜR DIE SHOPS
  const [preferredShops, setPreferredShops] = useState<string[]>([]);
  const [customShops, setCustomShops] = useState<{id: string, name: string, urlPattern: string}[]>([]);

  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // 📈 Ø-Verbrauch pro Monat, berechnet aus den Bestandsbewegungen (90 Tage)
  const [monthlyUsage, setMonthlyUsage] = useState<number | null>(null);

  const fetchItemAndLoans = async () => {
    try {
      // 1. Item laden
      const itemRef = doc(db, 'workspaces', workspaceId!, 'items', id);
      const itemSnap = await getDoc(itemRef);

      if (itemSnap.exists()) {
        const itemData = itemSnap.data();
        setItem({ id: itemSnap.id, ...itemData });

        // Lagerort laden
        if (itemData.locationId) {
          const locRef = doc(db, 'workspaces', workspaceId!, 'locations', itemData.locationId);
          const locSnap = await getDoc(locRef);
          if (locSnap.exists()) setLocation({ id: locSnap.id, ...locSnap.data() });
        }
      }

      // 2. Aktive Ausleihen laden
      const loansQuery = query(collection(db, 'workspaces', workspaceId!, 'loans'), where('itemId', '==', id), where('status', '==', 'active'));
      const loansSnap = await getDocs(loansQuery);
      setActiveLoans(loansSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // 2b. Bewegungen der letzten 90 Tage -> Ø-Verbrauch/Monat (nur Abgänge)
      try {
        const movesSnap = await getDocs(collection(db, 'workspaces', workspaceId!, 'items', id, 'movements'));
        const cutoff = Date.now() - 90 * 86400000;
        const moves = movesSnap.docs
          .map(d => d.data() as any)
          .filter(m => m.at && new Date(m.at).getTime() >= cutoff);
        const used = moves.reduce((sum, m) => sum + (m.delta < 0 ? -m.delta : 0), 0);
        if (used > 0) {
          const earliest = Math.min(...moves.map(m => new Date(m.at).getTime()));
          const days = Math.max((Date.now() - earliest) / 86400000, 14);
          setMonthlyUsage(Math.round((used / days) * 30 * 10) / 10);
        } else {
          setMonthlyUsage(null);
        }
      } catch { /* Verbrauchsanzeige ist optional */ }

      // 3. Settings & Shops laden
      const settingsSnap = await getDoc(doc(db, 'workspaces', workspaceId!, 'settings', 'main'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        setOwnerName(data.ownerName || 'ShedSync');
        setBrotherPrinter(data.brotherPrinter || null);
        setPreferredShops(data.preferredShops || ['galaxus', 'hornbach', 'migros', 'coop']);
        setCustomShops(data.customShops || []);

        const categoryMap: Record<string, boolean> = {};
        if (data.categories) {
          data.categories.forEach((c: any) => categoryMap[c.name] = c.lendable);
        }
        setLendableCategories(categoryMap);
      } else {
        setPreferredShops(['galaxus', 'hornbach', 'migros', 'coop']);
      }

    } catch (error) {
      console.error("Fehler beim Laden:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!workspaceId) return;
    fetchItemAndLoans();
  }, [id, workspaceId]); 

  const handleShareToShoppingList = async () => {
    if (!item) return;
    const bringFriendlyText = `${item.quantity}x ${item.name}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Einkauf', text: bringFriendlyText });
        return;
      } catch { /* abgebrochen -> Fallback */ }
    }
    try {
      await navigator.clipboard.writeText(bringFriendlyText);
      alert(`✅ Kopiert: "${bringFriendlyText}"\n\nÖffne jetzt Deine Bring!-App und füge den Text ein.`);
    } catch (error) {
      alert("Teilen/Kopieren fehlgeschlagen. Bitte manuell eintragen.");
    }
  };

  const changeQuantity = async (amount: number) => {
    if (!item || !workspaceId) return;
    const currentQty = Number(item.quantity) || 0;
    const newQty = currentQty + amount;
    if (newQty < 0) return;

    setIsUpdating(true);
    try {
      const update: any = { quantity: newQty };
      // Mindestbestand unterschritten -> automatisch auf die Einkaufsliste
      const hitsMinimum = item.minQuantity != null && newQty <= Number(item.minQuantity) && !item.onShoppingList;
      if (hitsMinimum) update.onShoppingList = true;

      await updateDoc(doc(db, 'workspaces', workspaceId, 'items', item.id), update);
      setItem({ ...item, ...update });

      // Bewegung loggen (Basis für den Ø-Verbrauch); Fehler hier sind egal.
      addDoc(collection(db, 'workspaces', workspaceId, 'items', item.id, 'movements'), {
        delta: amount,
        at: new Date().toISOString(),
      }).catch(() => {});
    } catch (error) {
      alert("Fehler beim Speichern.");
    } finally {
      setIsUpdating(false);
    }
  };

  // 🟢🔵🟠🔴 Füllstand setzen (Modus 'level'); Knapp/Leer -> Einkaufsliste
  const setStockLevelValue = async (level: StockLevel) => {
    if (!item || !workspaceId) return;
    setIsUpdating(true);
    try {
      const update: any = { stockLevel: level };
      if ((level === 'low' || level === 'empty') && !item.onShoppingList) update.onShoppingList = true;
      await updateDoc(doc(db, 'workspaces', workspaceId, 'items', item.id), update);
      setItem({ ...item, ...update });
    } catch {
      alert("Fehler beim Speichern.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLendItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrowerName.trim() || loanQty <= 0 || !workspaceId) return;

    setIsUpdating(true);
    try {
      const newLoanData = {
        itemId: item.id,
        itemName: item.name,
        borrowerName: borrowerName.trim(),
        quantity: Number(loanQty),
        borrowDate: new Date().toISOString(),
        expectedReturnDate: expectedReturn || null,
        status: 'active'
      };

      const docRef = await addDoc(collection(db, 'workspaces', workspaceId, 'loans'), newLoanData);
      
      setBorrowerName('');
      setLoanQty(1);
      setExpectedReturn('');
      setShowLoanForm(false);
      fetchItemAndLoans(); 

      setTimeout(() => {
        if (window.confirm(`Erfolgreich an ${newLoanData.borrowerName} verliehen!\n\n🖨️ Möchtest du jetzt direkt das Verleih-Etikett für den Koffer drucken?`)) {
          handlePrintLoan({ id: docRef.id, ...newLoanData });
        }
      }, 300);

    } catch (error) {
      alert("Fehler beim Verleihen.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReturnItem = async (loanId: string) => {
    if (!workspaceId) return;
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'workspaces', workspaceId, 'loans', loanId), { 
        status: 'returned',
        returnedDate: new Date().toISOString()
      });
      fetchItemAndLoans();
    } catch (error) {
      alert("Fehler bei der Rückgabe.");
    } finally {
      setIsUpdating(false);
    }
  };

  // 🤝 Verleih-Etikett: nativ per Bluetooth (mit Eigentümer, Ausleiher,
  // Rückgabedatum), sonst Browser-Druck.
  const handlePrintLoan = async (loan: any) => {
    const handled = await tryPrintLoanNative(
      { id: item.id, name: item.name },
      { borrowerName: loan.borrowerName, quantity: loan.quantity, borrowDate: loan.borrowDate, expectedReturnDate: loan.expectedReturnDate },
      ownerName,
      brotherPrinter,
      window.location.origin
    );
    if (handled) return;
    setPrintLoan(loan);
    setTimeout(() => { window.print(); }, 200);
  };

  // 🏷️ Item-QR-Etikett drucken (scannt zurück auf diese Item-Seite)
  // Nativ (Android-App): direkt per Bluetooth an den Brother-Drucker.
  // Sonst (PC/iPhone-Browser): window.print()-Fallback.
  const handlePrintLabel = async () => {
    const handled = await tryPrintNative(
      [{ id: item.id, name: item.name, tags: item.tags }],
      ownerName,
      brotherPrinter,
      window.location.origin
    );
    if (handled) return;
    setPrintLabel(true);
    setTimeout(() => { window.print(); }, 200);
  };

  const checkWarranty = (dateString: string) => {
    if (!dateString) return null;
    const purchaseDate = new Date(dateString);
    const now = new Date();
    const warrantyEnd = new Date(purchaseDate.getTime());
    warrantyEnd.setFullYear(warrantyEnd.getFullYear() + 2);
    
    const isValid = now <= warrantyEnd;
    const diffTime = Math.abs(warrantyEnd.getTime() - now.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    return { isValid, endDate: warrantyEnd.toLocaleDateString('de-CH'), daysLeft: diffDays };
  };

  if (loading || !workspaceId) return <div className="p-8 text-center text-slate-500 animate-pulse">Lade Daten...</div>;
  if (!item) return <div className="p-8 text-center text-red-500">Item existiert nicht.</div>;

  const warranty = item.purchaseDate ? checkWarranty(item.purchaseDate) : null;
  const totalQty = item.quantity || 0;
  const lentQty = activeLoans.reduce((sum, loan) => sum + loan.quantity, 0);
  const availableQty = totalQty - lentQty;

  const isLendable = lendableCategories[item.category] !== false;
  const searchQuery = encodeURIComponent(item.ean || item.name);

  return (
    <>
      <div className="p-4 md:p-8 min-h-screen bg-slate-50 pb-20 print:hidden">
        <div className="max-w-3xl mx-auto">
          <Link href="/" className="text-orange-600 hover:underline text-sm font-medium mb-6 inline-block">
            &larr; Zurück zum Dashboard
          </Link>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            
            <div className="flex flex-col sm:flex-row gap-6 mb-8">
              {/* BILD BEREICH */}
              <div className="w-full sm:w-40 h-40 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-2 shrink-0 shadow-sm overflow-hidden">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain mix-blend-multiply" />
                ) : (
                  <span className="text-5xl opacity-50">📦</span>
                )}
              </div>

              {/* TITEL & INFOS */}
              <div className="flex-1 flex flex-col items-start">
                <div className="w-full flex flex-col sm:flex-row justify-between items-start gap-4 mb-2">
                  <h1 className="text-3xl font-bold text-slate-900 leading-tight">{item.name}</h1>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleShareToShoppingList}
                      className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-2 rounded-lg transition text-sm font-bold flex items-center gap-2"
                      title="Auf Einkaufsliste setzen"
                    >
                      🛒 <span className="hidden sm:inline">Einkauf</span>
                    </button>
                    <button
                      onClick={handlePrintLabel}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition text-sm font-medium"
                      title="QR-Etikett drucken"
                    >
                      🖨️ <span className="hidden sm:inline">Etikett</span>
                    </button>
                    <Link href={`/item/${item.id}/edit`} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition text-sm font-medium">
                      ✏️ Bearbeiten
                    </Link>
                  </div>
                </div>

                {item.ean && (
                  <p className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md mb-3 border border-slate-200">
                    EAN: {item.ean}
                  </p>
                )}
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {item.tags?.map((tag: string, i: number) => (
                    <span key={i} className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded">{tag}</span>
                  ))}
                </div>

                {/* SHOP LINK / SCHNELLSUCHE */}
                <div className="w-full mt-auto pt-4 border-t border-slate-100">
                  {item.productUrl ? (
                    <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-bold transition border border-blue-200 shadow-sm">
                      🔗 Im Shop ansehen
                    </a>
                  ) : (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Kein Shop-Link. Hier online suchen:</p>
                      <div className="flex flex-wrap gap-2">
                        {preferredShops.map(shopKey => {
                          const shop = SUPPORTED_SHOPS[shopKey];
                          if (!shop) return null;
                          return (
                            <a key={shopKey} href={`${shop.urlPattern}${searchQuery}`} target="_blank" rel="noopener noreferrer" className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition border shadow-sm ${shop.style}`}>
                              🔍 {shop.name}
                            </a>
                          );
                        })}
                        {customShops.map(shop => (
                          <a key={shop.id} href={`${shop.urlPattern}${searchQuery}`} target="_blank" rel="noopener noreferrer" className="text-[10px] px-3 py-1.5 rounded-lg font-bold transition bg-slate-50 text-slate-600 border border-slate-300 hover:bg-slate-100 shadow-sm">
                            🔍 {shop.name}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {getStockMode(item) === 'none' ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-center gap-3">
                <span className="text-2xl">🧰</span>
                <p className="text-sm font-medium text-slate-500">Ohne Bestandsführung – der Inhalt ist über die Tags beschrieben.</p>
              </div>
            ) : getStockMode(item) === 'level' ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
                <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Füllstand</p>
                <div className="grid grid-cols-4 gap-2">
                  {STOCK_LEVEL_ORDER.map(level => {
                    const cfg = STOCK_LEVELS[level];
                    const isActive = getStockLevel(item) === level;
                    return (
                      <button
                        key={level}
                        onClick={() => setStockLevelValue(level)}
                        disabled={isUpdating}
                        className={`py-3 rounded-xl border-2 font-bold text-xs transition flex flex-col items-center gap-1 ${
                          isActive ? cfg.badge + ' shadow-inner scale-[1.03]' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-lg">{cfg.emoji}</span>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                {(getStockLevel(item) === 'low' || getStockLevel(item) === 'empty') && (
                  <p className="text-[11px] font-bold text-red-600 mt-3">⚠️ Nachschub nötig – steht auf der Einkaufsliste.</p>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Inventar</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-800">{availableQty}</span>
                    <span className="text-sm font-medium text-slate-500">von {totalQty} im Regal</span>
                  </div>
                  {item.minQuantity != null && (
                    <p className={`text-[11px] font-bold mt-1 ${totalQty <= Number(item.minQuantity) ? 'text-red-600' : 'text-slate-400'}`}>
                      {totalQty <= Number(item.minQuantity) ? '⚠️ Unter Mindestbestand' : 'Mindestbestand'}: {item.minQuantity}
                    </p>
                  )}
                  {monthlyUsage != null && (
                    <p className="text-[11px] font-bold text-slate-400 mt-1">📈 Ø Verbrauch: ~{monthlyUsage} / Monat</p>
                  )}
                </div>

                <div className="flex items-center gap-4 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                  <button onClick={() => changeQuantity(-1)} disabled={isUpdating || totalQty <= 0} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 text-xl font-bold rounded-md transition disabled:opacity-50">-</button>
                  <div className="w-12 text-center font-bold text-slate-800">{totalQty}</div>
                  <button onClick={() => changeQuantity(1)} disabled={isUpdating} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 text-xl font-bold rounded-md transition disabled:opacity-50">+</button>
                </div>
              </div>
            )}

            {isLendable && (
              <div className="mb-8 border border-blue-100 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-blue-50 p-4 flex justify-between items-center border-b border-blue-100">
                  <h3 className="font-bold text-blue-900 flex items-center gap-2">
                    🤝 Verleih-Status
                  </h3>
                  {availableQty > 0 && !showLoanForm && (
                    <button onClick={() => setShowLoanForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded shadow-sm transition">
                      + Ausleihen
                    </button>
                  )}
                </div>

                {showLoanForm && (
                  <form onSubmit={handleLendItem} className="p-4 bg-white border-b border-blue-50 space-y-3 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-500 uppercase font-bold">Wer bekommt es?</label>
                        <input 
                          type="text" 
                          value={borrowerName} 
                          onChange={e => setBorrowerName(e.target.value)} 
                          placeholder="Name (z.B. Peter)" 
                          className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-400 outline-none text-sm font-medium focus:border-blue-500" 
                          required 
                          autoFocus 
                        />
                      </div>
                      {totalQty > 1 && (
                        <div>
                          <label className="text-[10px] text-slate-500 uppercase font-bold">Menge</label>
                          <input 
                            type="number" 
                            min="1" 
                            max={availableQty} 
                            value={loanQty} 
                            onChange={e => setLoanQty(Number(e.target.value))} 
                            className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-400 outline-none text-sm font-medium focus:border-blue-500" 
                            required 
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold">Rückgabe erwartet am (Optional)</label>
                      <input 
                        type="date" 
                        value={expectedReturn} 
                        onChange={e => setExpectedReturn(e.target.value)} 
                        className="w-full p-2 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder-slate-400 outline-none text-sm font-medium focus:border-blue-500" 
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button type="submit" disabled={isUpdating} className="flex-1 bg-blue-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-blue-700 transition shadow-sm">Jetzt verleihen</button>
                      <button type="button" onClick={() => setShowLoanForm(false)} className="px-4 bg-slate-100 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-200 transition">Abbrechen</button>
                    </div>
                  </form>
                )}

                <div className="bg-white">
                  {activeLoans.length === 0 && !showLoanForm ? (
                    <p className="text-sm text-slate-500 p-4 italic">Aktuell ist alles im Regal. Nichts verliehen.</p>
                  ) : (
                    <ul className="divide-y divide-blue-50">
                      {activeLoans.map(loan => (
                        <li key={loan.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50 transition">
                          <div>
                            <p className="font-bold text-slate-800 text-sm">
                              {loan.quantity > 1 ? `${loan.quantity}x verliehen an ` : 'Verliehen an '} 
                              <span className="text-blue-700">{loan.borrowerName}</span>
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Seit: {new Date(loan.borrowDate).toLocaleDateString('de-CH')}
                              {loan.expectedReturnDate && ` • Zurück am: ${new Date(loan.expectedReturnDate).toLocaleDateString('de-CH')}`}
                            </p>
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            <button onClick={() => handlePrintLoan(loan)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded border border-slate-200 transition" title="Verleih-Etikett drucken">🖨️ Kleber</button>
                            <button onClick={() => handleReturnItem(loan.id)} disabled={isUpdating} className="bg-green-100 hover:bg-green-200 text-green-800 text-xs font-bold px-3 py-2 rounded border border-green-200 transition">✓ Zurück</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {(item.price || item.purchaseDate || item.receiptUrl) && (
              <div className="mb-8 border-t border-slate-100 pt-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  🧾 Garantie & Buchhaltung
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <div className="space-y-4">
                    {item.price && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Kaufpreis</p>
                        <p className="text-2xl font-bold text-slate-900">{Number(item.price).toFixed(2)} CHF</p>
                      </div>
                    )}
                    {item.purchaseDate && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Gekauft am</p>
                        <p className="font-medium text-slate-800 mb-1">{new Date(item.purchaseDate).toLocaleDateString('de-CH')}</p>
                        {warranty && warranty.isValid ? (
                          <span className="inline-block bg-green-100 text-green-800 text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide">✅ Garantie ({warranty.daysLeft} Tage)</span>
                        ) : warranty ? (
                          <span className="inline-block bg-slate-200 text-slate-600 text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wide">❌ Abgelaufen</span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {item.receiptUrl && (
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Originalbeleg</p>
                      <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="block relative rounded-lg overflow-hidden border border-slate-300 shadow-sm group">
                        <img src={item.receiptUrl} alt="Kassenbon" className="w-full h-24 object-cover object-top opacity-90 group-hover:opacity-100 transition" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition backdrop-blur-sm">
                           <span className="bg-white text-slate-900 font-bold text-[10px] uppercase px-3 py-1.5 rounded-full">Vollbild</span>
                        </div>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-6 mt-8">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Lagerort</h3>
              {location ? (
                <Link
                  href={`/locations/${location.id}`}
                  className="inline-flex items-center gap-2 text-lg font-medium text-slate-800 mb-4 hover:text-orange-700 transition group"
                >
                  📍 <span className="underline decoration-dotted underline-offset-4">{location.name}</span>
                  <span className="text-sm text-orange-600 opacity-70 group-hover:opacity-100 transition">→ öffnen</span>
                </Link>
              ) : (
                <p className="text-lg font-medium text-slate-800 mb-4">📍 Nicht zugewiesen</p>
              )}
              
              {location && location.imageUrl && (
                <div className="relative inline-block border-2 border-slate-200 rounded-lg overflow-hidden shadow-sm w-full">
                  <img 
                    src={location.imageUrl} 
                    alt="Lagerort" 
                    className="w-full h-auto block" 
                  />
                  
                  {item.tagX !== undefined && item.tagY !== undefined && item.tagX !== null && item.tagY !== null && (
                    <div 
                      className="absolute w-5 h-5 bg-red-600 border-2 border-white rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ left: `${item.tagX}%`, top: `${item.tagY}%` }}
                    >
                      <div className="absolute inset-0 bg-red-600 rounded-full animate-ping opacity-75"></div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <div className="hidden print:flex fixed inset-0 bg-white items-center justify-center">
        {printLoan && (
          <div className="text-center flex flex-col items-center justify-center p-2" style={{ width: '62mm', height: '29mm' }}>
            <QRCode value={window.location.href} size={48} level="M" />
            <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-black leading-tight truncate w-full px-1">{item.name}</p>
            <p className="text-[9px] font-bold text-black mt-0.5 border-b border-black pb-0.5">Eigentum: {ownerName}</p>
            <p className="text-[9px] text-black mt-0.5 leading-none">An: {printLoan.borrowerName} ({printLoan.quantity}x)</p>
            {printLoan.expectedReturnDate && <p className="text-[8px] text-black mt-0.5">Zurück: {new Date(printLoan.expectedReturnDate).toLocaleDateString('de-CH')}</p>}
          </div>
        )}
      </div>

      {/* 🏷️ Item-QR-Etikett (Endlos-Tape: QR links, Text rechts) */}
      {printLabel && (
        <div className="hidden print:flex fixed inset-0 bg-white items-center justify-center">
          <div className="flex items-center gap-2 p-1" style={{ maxWidth: '70mm' }}>
            <QRCode value={window.location.href} size={64} level="M" />
            <div className="text-left min-w-0">
              <p className="text-sm font-black uppercase tracking-tight text-black leading-tight break-words">{item.name}</p>
              {location?.code && <p className="text-[9px] font-mono text-black mt-0.5">📍 {location.code}</p>}
              {ownerName && <p className="text-[9px] font-bold text-black mt-0.5">{ownerName}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}