"use client";

import { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import Link from 'next/link';

export default function ItemDetail({ params }: any) {
  const [item, setItem] = useState<any>(null);
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const resolvedParams = await params; 
        
        const itemRef = doc(db, 'items', resolvedParams.id);
        const itemSnap = await getDoc(itemRef);

        if (itemSnap.exists()) {
          const itemData = itemSnap.data();
          setItem({ id: itemSnap.id, ...itemData });

          if (itemData.locationId) {
            const locRef = doc(db, 'locations', itemData.locationId);
            const locSnap = await getDoc(locRef);
            if (locSnap.exists()) {
              setLocation({ id: locSnap.id, ...locSnap.data() });
            }
          }
        }
      } catch (error) {
        console.error("Fehler beim Laden:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params]);

  const changeQuantity = async (amount: number) => {
    if (!item) return;
    
    const currentQty = Number(item.quantity) || 0;
    const newQty = currentQty + amount;
    
    if (newQty < 0) return;

    setIsUpdating(true);
    try {
      const itemRef = doc(db, 'items', item.id);
      await updateDoc(itemRef, { quantity: newQty });
      setItem({ ...item, quantity: newQty });
    } catch (error) {
      console.error("Fehler beim Update:", error);
      alert("Fehler beim Speichern der neuen Menge.");
    } finally {
      setIsUpdating(false);
    }
  };

  // ==========================================
  // HIER SIND DIE WICHTIGEN SCHUTZSCHALTER!
  // ==========================================
  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Lade Daten aus der Werkstatt...</div>;
  if (!item) return <div className="p-8 text-center text-red-500">Item existiert nicht.</div>;

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-orange-600 hover:underline text-sm font-medium mb-6 inline-block">
          &larr; Zurück zum Dashboard
        </Link>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          
          <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">{item.name}</h1>
            
            <div className="flex items-center gap-2">
               {/* DER NEUE EDIT BUTTON */}
               <Link href={`/item/${item.id}/edit`} className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-lg transition text-sm" title="Bearbeiten">
                  ✏️ Bearbeiten
               </Link>
               {item.ean && (
                 <span className="bg-slate-100 text-slate-500 text-xs px-2 py-2 rounded-md font-mono shrink-0">
                   EAN: {item.ean}
                 </span>
               )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-8">
            {item.tags?.map((tag: string, i: number) => (
              <span key={i} className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-md">{tag}</span>
            ))}
          </div>

          <div className="bg-orange-50 border border-orange-100 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-sm font-medium text-orange-800 mb-1">Aktueller Bestand</p>
              <p className="text-xs text-orange-600">
                {item.quantity <= 2 && item.tags?.includes('Verbrauchsmaterial') ? '⚠️ Kritisch - Nachbestellen!' : 'Status: Okay'}
              </p>
            </div>
            
            <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-orange-200 shadow-sm">
              <button 
                onClick={() => changeQuantity(-1)}
                disabled={isUpdating || item.quantity <= 0}
                className="w-12 h-12 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 text-xl font-bold rounded-md transition disabled:opacity-50"
              >
                -
              </button>
              
              <div className="w-16 text-center">
                <span className="text-3xl font-bold text-slate-800">{item.quantity}</span>
              </div>
              
              <button 
                onClick={() => changeQuantity(1)}
                disabled={isUpdating}
                className="w-12 h-12 flex items-center justify-center bg-orange-100 hover:bg-orange-200 text-orange-700 text-xl font-bold rounded-md transition disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              Lagerort: <span className="text-orange-600">{location ? location.name : 'Unbekannt'}</span>
            </h3>
            
            {location && location.imageUrl ? (
              <div className="mt-4 relative inline-block border-2 border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <img 
                  src={location.imageUrl} 
                  alt={`Lagerort von ${item.name}`} 
                  className="max-w-full h-auto"
                />
                {item.tagX !== null && item.tagY !== null && (
                  <div 
                    className="absolute w-8 h-8 bg-red-600 border-4 border-white rounded-full shadow-[0_0_15px_rgba(0,0,0,0.5)] animate-bounce"
                    style={{ 
                      left: `${item.tagX}%`, 
                      top: `${item.tagY}%`, 
                      transform: 'translate(-50%, -50%)' 
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="mt-4 p-4 bg-slate-50 text-slate-500 text-sm rounded-lg border border-slate-100">
                Kein Foto für diesen Lagerort hinterlegt.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}