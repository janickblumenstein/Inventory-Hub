"use client";

import { useState, useEffect, Suspense } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, getDocs, doc, getDoc,updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { CategoryConfig } from '../settings/page'; 
import { useWorkspace } from '../../context/WorkspaceContext';

function NewItemForm() {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  
  const searchParams = useSearchParams();
  const scannedEan = searchParams?.get('ean') || '';
  const scannedName = searchParams?.get('name') || '';

  const [name, setName] = useState(scannedName);
  const [ean, setEan] = useState(scannedEan);
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState('');
  
  // Dynamische Kategorie & Tags
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  
  // NEU: Freitext-Feld für spontane Tags
  const [customTagInput, setCustomTagInput] = useState('');

  const [tagX, setTagX] = useState<number | null>(null);
  const [tagY, setTagY] = useState<number | null>(null);

  const [showWarranty, setShowWarranty] = useState(false);
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [locations, setLocations] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    // URL Parameter Fallback
    const params = new URLSearchParams(window.location.search);
    const fallbackEan = params.get('ean');
    const fallbackName = params.get('name');
    if (fallbackEan && !ean) setEan(fallbackEan);
    if (fallbackName && !name) setName(fallbackName);

    const fetchData = async () => {
      try {
        const locSnapshot = await getDocs(collection(db, 'workspaces', workspaceId!, 'locations'));
        const locs: any[] = [];
        locSnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
        setLocations(locs);

        const settingsSnap = await getDoc(doc(db, 'workspaces', workspaceId!, 'settings', 'main'));
        if (settingsSnap.exists() && settingsSnap.data().categories) {
          setCategories(settingsSnap.data().categories);
        }
      } catch (error) {
        console.error("Fehler beim Laden:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [ean, name]);

  const handleCategorySelect = (cat: CategoryConfig) => {
    setSelectedCategoryId(cat.id);
    setSelectedTags([]); 
    setAttributes({});   
    setCustomTagInput('');
    
    if (cat.autoOpenWarranty) {
      setShowWarranty(true);
    }
  };

  const toggleTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      // Tag wird neu hinzugefügt
      setSelectedTags([...selectedTags, tag]);
      // UX-Magie: Wenn der Name noch leer ist, nimm das Tag als Namen!
      if (name.trim() === '') {
        setName(tag);
      }
    } else {
      // Tag wird wieder abgewählt
      setSelectedTags(selectedTags.filter(t => t !== tag));
    }
  };

  const handleAddCustomTag = (e: React.KeyboardEvent | React.FocusEvent) => {
    if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !customTagInput.trim()) return;
    e.preventDefault();
    
    const newTag = customTagInput.trim();
    if (!selectedTags.includes(newTag)) {
      setSelectedTags([...selectedTags, newTag]);
      // UX-Magie: Auch bei eigenen Tags den Namen füllen, wenn er leer ist
      if (name.trim() === '') {
        setName(newTag);
      }
    }
    setCustomTagInput('');
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTagX(x);
    setTagY(y);
  };

  const activeCategory = categories.find(c => c.id === selectedCategoryId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory) {
      alert("Bitte wähle eine Haupt-Kategorie aus!");
      return;
    }

    setIsSaving(true);
    try {
      let receiptUrl = "";
      if (showWarranty && receiptFile) {
        const fileRef = ref(storage, `receipts/${Date.now()}_${receiptFile.name}`);
        await uploadBytes(fileRef, receiptFile);
        receiptUrl = await getDownloadURL(fileRef);
      }

      // 1. Speichert das Item in die Werkstatt
      await addDoc(collection(db, 'workspaces', workspaceId!, 'items'), {
        name,
        ean,
        category: activeCategory.name, 
        tags: selectedTags,            
        attributes,                    
        quantity,
        locationId,
        tagX,
        tagY,
        price: showWarranty ? (Number(price) || 0) : null,
        purchaseDate: showWarranty ? purchaseDate : null,
        receiptUrl: showWarranty ? receiptUrl : null,
        createdAt: new Date().toISOString()
      });

      // 2. NEU: Die Selbstlern-Funktion (Ergänzt die Settings-Bibliothek)
      // Wir filtern heraus, welche gewählten Tags noch NICHT in der Bibliothek stehen
      const newCustomTags = selectedTags.filter(t => !(activeCategory.tags || []).includes(t));
      
      if (newCustomTags.length > 0) {
        try {
          const settingsRef = doc(db, 'workspaces', workspaceId!, 'settings', 'main');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            const updatedCategories = data.categories.map((c: any) => {
              if (c.id === activeCategory.id) {
                return {
                  ...c,
                  // Fügt die neuen Tags hinten an die bestehende Liste an
                  tags: [...(c.tags || []), ...newCustomTags]
                };
              }
              return c;
            });
            await updateDoc(settingsRef, { categories: updatedCategories });
          }
        } catch (settingsError) {
          console.error("Fehler beim Erweitern der Tag-Bibliothek:", settingsError);
          // Wir werfen hier keinen Alert, da das Haupt-Item ja erfolgreich gespeichert wurde.
        }
      }

      router.push('/');
    } catch (error) {
      alert("Fehler beim Speichern.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedLoc = locations.find(l => l.id === locationId);

  if (isLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-medium">Lade Formular...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-32">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Neues Werkzeug</h1>
          <Link href="/" className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition text-lg">
            ✖️
          </Link>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bezeichnung</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 pr-10 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg focus:border-orange-500 transition" placeholder="z.B. Makita Flex" required />
              {name && (
    <button 
      type="button"
      onClick={() => { setName(''); setSelectedTags([]); }}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold"
    >
      ✕
    </button>
  )}
            </div>

            {ean && (
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-2xl">📦</span>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Verknüpfter Barcode (EAN)</p>
                  <p className="text-sm font-mono text-slate-700 font-bold">{ean}</p>
                </div>
              </div>
            )}
            
            {/* 1. DYNAMISCHE KATEGORIE-AUSWAHL */}
            <div className="pt-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Haupt-Kategorie wählen</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {categories.map(cat => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategorySelect(cat)}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                        isSelected 
                          ? 'bg-orange-50 border-orange-500 shadow-sm transform scale-[1.02]' 
                          : 'bg-white border-slate-200 opacity-70 hover:opacity-100 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-2xl">{cat.icon}</span>
                      <span className={`text-[9px] font-bold text-center leading-tight ${isSelected ? 'text-orange-900' : 'text-slate-600'}`}>
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. DYNAMISCHE TAG-BIBLIOTHEK + CUSTOM TAGS */}
            {activeCategory && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl animate-fade-in">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Spezifischer Typ</label>
                <div className="flex flex-wrap gap-2 items-center">
                  
                  {/* Bibliothek-Tags */}
                  {activeCategory.tags?.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                          isSelected 
                            ? 'bg-orange-500 text-white border-orange-600 shadow-sm' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}{tag}
                      </button>
                    );
                  })}

                  {/* Freitext-Tags (falls der User eigene in der Maske erstellt) */}
                  {selectedTags.filter(t => !activeCategory.tags?.includes(t)).map(customTag => (
                    <button
                      key={customTag}
                      type="button"
                      onClick={() => toggleTag(customTag)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 text-white border border-orange-600 shadow-sm"
                    >
                      ✓ {customTag}
                    </button>
                  ))}

                  {/* Das Input-Feld für fehlende Tags */}
                  <input 
                    type="text" 
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={handleAddCustomTag}
                    onBlur={handleAddCustomTag}
                    placeholder="+ Eigenes Tag"
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-900 placeholder-slate-400 outline-none w-32 focus:border-orange-500"
                  />
                </div>
              </div>
            )}

            {/* 3. DYNAMISCHE ATTRIBUTE */}
            {activeCategory && activeCategory.attributes && activeCategory.attributes.length > 0 && (
              <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl animate-fade-in">
                <label className="block text-[10px] font-bold text-purple-800 uppercase mb-3 flex items-center gap-1">
                  <span>⚙️</span> Spezifische Daten erfassen
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {activeCategory.attributes.map(attr => (
                    <div key={attr}>
                      <label className="block text-[10px] font-semibold text-purple-700 mb-1">{attr}</label>
                      <input 
                        type="text" 
                        value={attributes[attr] || ''} 
                        onChange={(e) => setAttributes({...attributes, [attr]: e.target.value})} 
                        className="w-full p-2.5 bg-white border border-purple-200 rounded-lg text-sm outline-none focus:border-purple-500 text-slate-800 shadow-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 mt-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Menge</label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Lagerort</label>
                <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setTagX(null); setTagY(null); }} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 font-medium" required>
                  <option value="">-- Ort wählen --</option>
                  {(() => {
                    const buildTree = (parentId: string | null, depth: number): any[] => {
                      let result: any[] = [];
                      const children = locations.filter(l => (l.parentId || null) === parentId);
                      children.forEach(child => {
                        result.push({ ...child, depth });
                        result = result.concat(buildTree(child.id, depth + 1));
                      });
                      return result;
                    };
                    return buildTree(null, 0).map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {'\u00A0\u00A0\u00A0'.repeat(loc.depth)}{loc.depth > 0 ? '↳ ' : ''}{loc.name}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            </div>

            {selectedLoc && selectedLoc.imageUrl && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl animate-fade-in">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Wo genau liegt es? (Klicke auf das Bild)</p>
                <div className="relative inline-block border-2 border-slate-300 rounded-lg overflow-hidden shadow-sm w-full">
                  <img 
                    src={selectedLoc.imageUrl} 
                    alt="Lagerort" 
                    className="w-full h-auto cursor-crosshair" 
                    onClick={handleImageClick}
                  />
                  {tagX !== null && tagY !== null && (
                    <div 
                      className="absolute w-6 h-6 bg-red-600 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all"
                      style={{ left: `${tagX}%`, top: `${tagY}%` }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-1 border-t pt-6 mt-6">
            <input type="checkbox" id="toggleWarranty" checked={showWarranty} onChange={(e) => setShowWarranty(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
            <label htmlFor="toggleWarranty" className="text-sm font-semibold text-slate-700 cursor-pointer">🧾 Garantie-Tresor & Beleg</label>
          </div>

          {showWarranty && (
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-orange-800 uppercase mb-1">Preis (CHF)</label>
                  <input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="w-full p-2.5 border border-orange-200 rounded-lg bg-white text-slate-900 outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orange-800 uppercase mb-1">Kaufdatum</label>
                  <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full p-2.5 border border-orange-200 rounded-lg bg-white text-slate-900 outline-none focus:border-orange-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-orange-800 uppercase mb-1">Kassenbeleg fotografieren</label>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files && setReceiptFile(e.target.files[0])} className="text-xs text-slate-600 w-full p-2 bg-white rounded-lg border border-orange-200" />
              </div>
            </div>
          )}

          <button type="submit" disabled={isSaving || !activeCategory} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-200 disabled:opacity-50 mt-8 transition hover:bg-slate-800 text-lg">
            {isSaving ? 'Wird gespeichert...' : 'Item in die Werkstatt legen'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function NewItem() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-medium">Lade Formular...</div>}>
      <NewItemForm />
    </Suspense>
  );
}