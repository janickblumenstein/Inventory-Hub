// app/item/[id]/page.js
"use client";

import { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import Link from 'next/link';

export default function ItemDetail({ params }) {
  const [item, setItem] = useState(null);
  const [location, setLocation] = useState(null); // NEU: State für den Lagerort
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const resolvedParams = await params; 
        
        // 1. Hole das Item aus der Datenbank
        const itemRef = doc(db, 'items', resolvedParams.id);
        const itemSnap = await getDoc(itemRef);

        if (itemSnap.exists()) {
          const itemData = itemSnap.data();
          setItem(itemData);

          // 2. NEU: Hole das Foto und den Namen des Lagerortes
          if (itemData.locationId) {
            const locRef = doc(db, 'locations', itemData.locationId);
            const locSnap = await getDoc(locRef);
            if (locSnap.exists()) {
              setLocation({ id: locSnap.id, ...locSnap.data() });
            }
          }
        } else {
          console.log("Item nicht gefunden!");
        }
      } catch (error) {
        console.error("Fehler beim Laden:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params]);

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Lade Daten aus der Werkstatt...</div>;
  if (!item) return <div className="p-8 text-center text-red-500">Item existiert nicht.</div>;

  return (
    <div className="p-4 md:p-8">
      <Link href="/" className="text-orange-600 hover:underline text-sm font-medium mb-6 inline-block">
        &larr; Zurück zum Dashboard
      </Link>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{item.name}</h1>
        
        <div className="flex flex-wrap gap-2 mb-6">
          {item.tags?.map((tag, i) => (
            <span key={i} className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-md">{tag}</span>
          ))}
          <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-md font-bold">
            Menge: {item.quantity}
          </span>
        </div>

        {/* FOTO & MARKIERUNG ANZEIGEN */}
        <div className="mt-6 border-t pt-6">
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
              {/* Hier setzen wir den roten Punkt mit den Koordinaten aus dem Item auf das Bild der Location! */}
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
  );
}