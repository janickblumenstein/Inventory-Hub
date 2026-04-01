"use client";

import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy, updateDoc, doc } from 'firebase/firestore';
import Link from 'next/link';
import { useWorkspace } from '../../context/WorkspaceContext'; // <--- NEU: Wächter importiert

export default function LoansOverview() {
  const { workspaceId } = useWorkspace(); // <--- NEU: Wächter aufgerufen
  
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'returned'>('active');

  const fetchLoans = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'workspaces', workspaceId, 'loans'), orderBy('borrowDate', 'desc'));
      const snap = await getDocs(q);
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchLoans();
    }
  }, [workspaceId]); // <--- NEU: Abhängigkeit hinzugefügt

  const handleReturnItem = async (loanId: string) => {
    if (!workspaceId) return;
    if (!confirm("Werkzeug wieder da?")) return;
    try {
      // FIX: Zeigt jetzt in den Workspace-Ordner
      await updateDoc(doc(db, 'workspaces', workspaceId, 'loans', loanId), { 
        status: 'returned',
        returnedDate: new Date().toISOString()
      });
      fetchLoans();
    } catch (error) {
      alert("Fehler bei der Rückgabe.");
    }
  };

  const displayedLoans = loans.filter(l => l.status === filter);

  if (!workspaceId) return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500">Lade Verleih-Center...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">🤝 Verleih-Center</h1>
          <Link href="/" className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 text-slate-500 rounded-full hover:bg-slate-100 transition text-lg shadow-sm">
            ⬅️
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
          <div className="flex border-b border-slate-200">
            <button 
              onClick={() => setFilter('active')} 
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition ${filter === 'active' ? 'bg-orange-50 text-orange-700 border-b-2 border-orange-600' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Aktuell verliehen
            </button>
            <button 
              onClick={() => setFilter('returned')} 
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition ${filter === 'returned' ? 'bg-slate-100 text-slate-800 border-b-2 border-slate-400' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Historie
            </button>
          </div>

          <div className="p-4 sm:p-6">
            {loading ? (
              <p className="text-center text-slate-400 py-8">Lade Daten...</p>
            ) : displayedLoans.length === 0 ? (
              <p className="text-center text-slate-400 py-8 italic">
                {filter === 'active' ? 'Aktuell hast du all dein Werkzeug bei dir.' : 'Noch keine Historie vorhanden.'}
              </p>
            ) : (
              <div className="space-y-4">
                {displayedLoans.map(loan => (
                  <div key={loan.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">
                        <Link href={`/item/${loan.itemId}`} className="hover:text-orange-600 transition">{loan.itemName}</Link>
                        {loan.quantity > 1 && <span className="text-sm font-normal text-slate-500 ml-2">({loan.quantity}x)</span>}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        Verliehen an: <span className="font-bold text-orange-700">{loan.borrowerName}</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-1 font-mono">
                        Seit: {new Date(loan.borrowDate).toLocaleDateString('de-CH')}
                        {loan.expectedReturnDate && loan.status === 'active' && ` • Erwartet: ${new Date(loan.expectedReturnDate).toLocaleDateString('de-CH')}`}
                        {loan.returnedDate && ` • Zurück: ${new Date(loan.returnedDate).toLocaleDateString('de-CH')}`}
                      </p>
                    </div>

                    {loan.status === 'active' && (
                      <button 
                        onClick={() => handleReturnItem(loan.id)}
                        className="w-full sm:w-auto bg-green-100 hover:bg-green-200 text-green-800 text-sm font-bold px-4 py-2.5 rounded-lg border border-green-200 transition shadow-sm"
                      >
                        ✓ Wieder zurück
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}