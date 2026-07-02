"use client";

// 🧾 Käufe & Garantie: alle Items mit Kaufdatum/Preis auf einen Blick.
// Beantwortet: "Welche Geräte habe ich wann gekauft, was haben sie gekostet,
// und läuft die Garantie noch?"
import { useEffect, useState, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { useWorkspace } from '../../context/WorkspaceContext';

function warrantyInfo(purchaseDate: string) {
  const end = new Date(purchaseDate);
  end.setFullYear(end.getFullYear() + 2);
  const now = new Date();
  const isValid = now <= end;
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
  return { isValid, daysLeft, endDate: end.toLocaleDateString('de-CH') };
}

export default function PurchasesPage() {
  const { workspaceId } = useWorkspace();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyWithWarranty, setOnlyWithWarranty] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const fetchItems = async () => {
      try {
        const snap = await getDocs(collection(db, 'workspaces', workspaceId, 'items'));
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(i => i.price || i.purchaseDate);
        setItems(list);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [workspaceId]);

  const sorted = useMemo(() => {
    const filtered = onlyWithWarranty
      ? items.filter(i => i.purchaseDate && warrantyInfo(i.purchaseDate).isValid)
      : items;
    return [...filtered].sort((a, b) => {
      if (!a.purchaseDate) return 1;
      if (!b.purchaseDate) return -1;
      return b.purchaseDate.localeCompare(a.purchaseDate);
    });
  }, [items, onlyWithWarranty]);

  const totalValue = useMemo(
    () => sorted.reduce((sum, i) => sum + (Number(i.price) || 0), 0),
    [sorted]
  );

  if (!workspaceId || loading) return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500 font-medium">Lade Käufe...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-20">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">🧾 Käufe & Garantie</h1>
          <Link href="/" className="text-orange-600 font-medium hover:underline">← Dashboard</Link>
        </div>

        {/* Übersicht */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Erfasster Warenwert</p>
            <p className="text-3xl font-black text-slate-900">{totalValue.toFixed(2)} <span className="text-lg font-bold text-slate-500">CHF</span></p>
            <p className="text-xs text-slate-500 mt-1">{sorted.length} Käufe mit Preis oder Kaufdatum erfasst</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <input type="checkbox" checked={onlyWithWarranty} onChange={(e) => setOnlyWithWarranty(e.target.checked)} className="w-4 h-4 rounded text-orange-500" />
            <span className="text-sm font-bold text-slate-700">Nur mit laufender Garantie</span>
          </label>
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200 border-dashed">
            <p className="text-slate-400 font-medium mb-2">Noch keine Käufe erfasst.</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">Trage bei einem Item unter „Bearbeiten → Garantie &amp; Beleg" Preis und Kaufdatum ein, dann erscheint es hier.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {sorted.map(item => {
              const w = item.purchaseDate ? warrantyInfo(item.purchaseDate) : null;
              return (
                <Link key={item.id} href={`/item/${item.id}`} className="flex items-center gap-4 p-4 hover:bg-orange-50 transition group">
                  <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-lg shrink-0 overflow-hidden flex items-center justify-center p-1">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain mix-blend-multiply" /> : <span className="opacity-40">📦</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate group-hover:text-orange-700 transition">{item.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {item.purchaseDate && (
                        <span className="text-[10px] text-slate-500">Gekauft: {new Date(item.purchaseDate).toLocaleDateString('de-CH')}</span>
                      )}
                      {w && (
                        w.isValid ? (
                          <span className="text-[9px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold uppercase">✅ Garantie · {w.daysLeft} Tage</span>
                        ) : (
                          <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase">Abgelaufen</span>
                        )
                      )}
                      {item.receiptUrl && <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase">🧾 Beleg</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {item.price ? (
                      <span className="font-bold text-slate-800">{Number(item.price).toFixed(2)} CHF</span>
                    ) : (
                      <span className="text-xs text-slate-400">–</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
