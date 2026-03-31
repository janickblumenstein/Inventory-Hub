"use client";

import { useEffect, useState, use } from 'react';
import { db } from '../../../lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';

export default function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  // React 19 / Next.js 15: params müssen "entpackt" werden
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [item, setItem] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  
  // NEU: Verleih-States
  const [activeLoans, setActiveLoans] = useState<any[]>([]);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  const [loanQty, setLoanQty] = useState(1);
  const [expectedReturn, setExpectedReturn] = useState('');

  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchItemAndLoans = async () => {
    try {
      // 1. Item laden
      const itemRef = doc(db, 'items', id);
      const itemSnap = await getDoc(itemRef);

      if (itemSnap.exists()) {
        const itemData = itemSnap.data();
        setItem({ id: itemSnap.id, ...itemData });

        // Lagerort laden
        if (itemData.locationId) {
          const locRef = doc(db, 'locations', itemData.locationId);
          const locSnap = await getDoc(locRef);
          if (locSnap.exists()) setLocation({ id: locSnap.id, ...locSnap.data() });
        }
      }

      // 2. Aktive Ausleihen laden
      const loansQuery = query(collection(db, 'loans'), where('itemId', '==', id), where('status', '==', 'active'));
      const loansSnap = await getDocs(loansQuery);
      setActiveLoans(loansSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    } catch (error) {
      console.error("Fehler beim Laden:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItemAndLoans();
  }, [id]);

  const changeQuantity = async (amount: number) => {
    if (!item) return;
    const currentQty = Number(item.quantity) || 0;
    const newQty = currentQty + amount;
    if (newQty < 0) return;

    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'items', item.id), { quantity: newQty });
      setItem({ ...item, quantity: newQty });
    } catch (error) {
      alert("Fehler beim Speichern.");
    } finally {
      setIsUpdating(false);
    }
  };

  // ==========================================
  // NEU: VERLEIH-LOGIK
  // ==========================================
  const handleLendItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrowerName.trim() || loanQty <= 0) return;

    setIsUpdating(true);
    try {
      await addDoc(collection(db, 'loans'), {
        itemId: item.id,
        itemName: item.name,
        borrowerName: borrowerName.trim(),
        quantity: Number(loanQty),
        borrowDate: new Date().toISOString(),
        expectedReturnDate: expectedReturn || null,
        status: 'active'
      });
      
      setBorrowerName('');
      setLoanQty(1);
      setExpectedReturn('');
      setShowLoanForm(false);
      fetchItemAndLoans(); // Liste aktualisieren
    } catch (error) {
      alert("Fehler beim Verleihen.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReturnItem = async (loanId: string) => {
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'loans', loanId), { 
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

  // ==========================================
  // BERECHNUNGEN
  // ==========================================
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

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Lade Daten...</div>;
  if (!item) return <div className="p-8 text-center text-red-500">Item existiert nicht.</div>;

  const warranty = item.purchaseDate ? checkWarranty(item.purchaseDate) : null;
  
  // Bestand berechnen
  const totalQty = item.quantity || 0;
  const lentQty = activeLoans.reduce((sum, loan) => sum + loan.quantity, 0);
  const availableQty = totalQty - lentQty;

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50 pb-20">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-orange-600 hover:underline text-sm font-medium mb-6 inline-block">
          &larr; Zurück zum Dashboard
        </Link>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          
          {/* HEADER */}
          <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">{item.name}</h1>
            <div className="flex items-center gap-2">
               <Link href={`/item/${item.id}/edit`} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg transition text-sm font-medium">
                  ✏️ Bearbeiten
               </Link>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-8">
            {item.tags?.map((tag: string, i: number) => (
              <span key={i} className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded">{tag}</span>
            ))}
          </div>

          {/* BESTANDS-KONTROLLE (Dynamisch angepasst) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Inventar</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-800">{availableQty}</span>
                <span className="text-sm font-medium text-slate-500">von {totalQty} im Regal</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
              <button onClick={() => changeQuantity(-1)} disabled={isUpdating || totalQty <= 0} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 text-xl font-bold rounded-md transition disabled:opacity-50">-</button>
              <div className="w-12 text-center font-bold text-slate-800">{totalQty}</div>
              <button onClick={() => changeQuantity(1)} disabled={isUpdating} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 text-xl font-bold rounded-md transition disabled:opacity-50">+</button>
            </div>
          </div>

          {/* ========================================== */}
          {/* NEU: DAS VERLEIH-MODUL */}
          {/* ========================================== */}
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

            {/* Verleih-Formular */}
            {showLoanForm && (
              <form onSubmit={handleLendItem} className="p-4 bg-white border-b border-blue-50 space-y-3 animate-fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] text-slate-500 uppercase font-bold">Wer bekommt es?</label>
                    <input type="text" value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="Name (z.B. Peter)" className="w-full p-2 border border-slate-300 rounded bg-slate-50 outline-none text-sm" required autoFocus />
                  </div>
                  {totalQty > 1 && (
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold">Menge</label>
                      <input type="number" min="1" max={availableQty} value={loanQty} onChange={e => setLoanQty(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded bg-slate-50 outline-none text-sm" required />
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase font-bold">Rückgabe erwartet am (Optional)</label>
                  <input type="date" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} className="w-full p-2 border border-slate-300 rounded bg-slate-50 outline-none text-sm" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={isUpdating} className="flex-1 bg-blue-600 text-white text-sm font-bold py-2 rounded hover:bg-blue-700 transition">Jetzt verleihen</button>
                  <button type="button" onClick={() => setShowLoanForm(false)} className="px-4 bg-slate-100 text-slate-600 text-sm font-bold rounded hover:bg-slate-200 transition">Abbrechen</button>
                </div>
              </form>
            )}

            {/* Liste der Verliehenen Items */}
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
                      <button 
                        onClick={() => handleReturnItem(loan.id)}
                        disabled={isUpdating}
                        className="bg-green-100 hover:bg-green-200 text-green-800 text-xs font-bold px-3 py-2 rounded border border-green-200 transition w-full sm:w-auto"
                      >
                        ✓ Zurückbekommen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ========================================== */}
          {/* DER GARANTIE-TRESOR */}
          {/* ========================================== */}
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

{/* LAGERORT INFO */}
          <div className="border-t border-slate-100 pt-6 mt-8">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Lagerort</h3>
            <p className="text-lg font-medium text-slate-800 mb-4">
              📍 {location ? location.name : 'Nicht zugewiesen'}
            </p>
            
            {location && location.imageUrl && (
              <div className="relative inline-block border-2 border-slate-200 rounded-lg overflow-hidden shadow-sm w-full">
                {/* w-full und h-auto verhindern das Abschneiden und zeigen das ganze Bild */}
                <img 
                  src={location.imageUrl} 
                  alt="Lagerort" 
                  className="w-full h-auto block" 
                />
                
                {/* Der rote Punkt (nur anzeigen, wenn Koordinaten gespeichert wurden) */}
                {item.tagX !== undefined && item.tagY !== undefined && item.tagX !== null && item.tagY !== null && (
                  <div 
                    className="absolute w-5 h-5 bg-red-600 border-2 border-white rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ left: `${item.tagX}%`, top: `${item.tagY}%` }}
                  >
                    {/* Ein dezenter Radar-Puls-Effekt, damit man den Punkt sofort sieht */}
                    <div className="absolute inset-0 bg-red-600 rounded-full animate-ping opacity-75"></div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}