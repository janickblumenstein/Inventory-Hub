"use client";

import { useState, useEffect, use } from 'react';
import { db, storage } from '../../../../lib/firebase'; 
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CategoryConfig } from '../../../settings/page'; 
import { useWorkspace } from '../../../../context/WorkspaceContext';

export default function EditItem({ params }: { params: Promise<{ id: string }> }) {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  
  const [name, setName] = useState('');
  const [ean, setEan] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState(''); 
  
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  
  const [tagX, setTagX] = useState<number | null>(null);
  const [tagY, setTagY] = useState<number | null>(null);

  const [showWarranty, setShowWarranty] = useState(false);
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [locations, setLocations] = useState<any[]>([]); 
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    const fetchData = async () => {
      try {
        const locSnapshot = await getDocs(collection(db, 'workspaces', workspaceId, 'locations'));
        const locs: any[] = [];
        locSnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
        setLocations(locs);

        const settingsSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'settings', 'main'));
        let loadedCats: CategoryConfig[] = [];
        if (settingsSnap.exists() && settingsSnap.data().categories) {
          loadedCats = settingsSnap.data().categories;
          setCategories(loadedCats);
        }

        if (id) {
          const itemRef = doc(db, 'workspaces', workspaceId, 'items', id);
          const itemSnap = await getDoc(itemRef);
          if (itemSnap.exists()) {
            const data = itemSnap.data();
            setName(data.name || '');
            setEan(data.ean || '');
            setQuantity(data.quantity || 1);
            setLocationId(data.locationId || '');
            setTagX(data.tagX ?? null);
            setTagY(data.tagY ?? null);
            setAttributes(data.attributes || {});
            setSelectedTags(data.tags || []);
            
            if (data.category) {
              const matchedCat = loadedCats.find(c => c.name === data.category);
              if (matchedCat) setSelectedCategoryId(matchedCat.id);
            }
            
            setPrice(data.price || '');
            setPurchaseDate(data.purchaseDate || '');
            setReceiptUrl(data.receiptUrl || '');
            
            if (data.price || data.purchaseDate || data.receiptUrl) {
              setShowWarranty(true);
            }
          }
        }
      } catch (error) {
        console.error("Fehler beim Laden:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id, workspaceId]); // FIX: workspaceId als Abhängigkeit hinzugefügt!

  const handleCategorySelect = (cat: CategoryConfig) => {
    setSelectedCategoryId(cat.id);
    setCustomTagInput('');
    if (cat.autoOpenWarranty) setShowWarranty(true);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleAddCustomTag = (e: React.KeyboardEvent | React.FocusEvent) => {
    if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !customTagInput.trim()) return;
    e.preventDefault();
    const newTag = customTagInput.trim();
    if (!selectedTags.includes(newTag)) {
      setSelectedTags([...selectedTags, newTag]);
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

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeCategory || !workspaceId) {
      alert("Bitte wähle eine Haupt-Kategorie aus!");
      return;
    }

    setIsSaving(true);
    try {
      let finalReceiptUrl = receiptUrl;
      if (showWarranty && receiptFile) {
        // FIX: Kassenbelege jetzt sicher im Workspace-Ordner ablegen!
        const fileRef = ref(storage, `workspaces/${workspaceId}/receipts/${id}_${Date.now()}`);
        await uploadBytes(fileRef, receiptFile);
        finalReceiptUrl = await getDownloadURL(fileRef);
      }

      const itemRef = doc(db, 'workspaces', workspaceId, 'items', id);
      await updateDoc(itemRef, {
        name,
        ean,
        category: activeCategory.name, 
        tags: selectedTags, 
        quantity,
        locationId,
        tagX,
        tagY,
        attributes,
        price: showWarranty ? (Number(price) || 0) : null,
        purchaseDate: showWarranty ? purchaseDate : null,
        receiptUrl: showWarranty ? finalReceiptUrl : null
      });

      const newCustomTags = selectedTags.filter(t => !(activeCategory.tags || []).includes(t));
      if (newCustomTags.length > 0) {
        try {
          const settingsRef = doc(db, 'workspaces', workspaceId, 'settings', 'main');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            const updatedCategories = data.categories.map((c: any) => {
              if (c.id === activeCategory.id) {
                return { ...c, tags: [...(c.tags || []), ...newCustomTags] };
              }
              return c;
            });
            await updateDoc(settingsRef, { categories: updatedCategories });
          }
        } catch (settingsError) {
          console.error("Fehler beim Erweitern der Tag-Bibliothek:", settingsError);
        }
      }

      router.push(`/item/${id}`); 
    } catch (error) {
      alert('Fehler beim Speichern.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!workspaceId) return;
    if (window.confirm("Möchtest du dieses Item wirklich dauerhaft löschen?")) {
      await deleteDoc(doc(db, 'workspaces', workspaceId, 'items', id));
      router.push('/');
    }
  };

  const selectedLoc = locations.find(l => l.id === locationId);

  if (isLoading || !workspaceId) return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500 font-medium">Lade Daten...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-32">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Item bearbeiten</h1>
          <div className="flex gap-3">
            <button type="button" onClick={handleDelete} className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition text-lg" title="Löschen">🗑️</button>
            <Link href={`/item/${id}`} className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition text-lg" title="Abbrechen">✖️</Link>
          </div>
        </div>
        
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bezeichnung</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg focus:border-orange-500 transition" required />
            </div>

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

            {activeCategory && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl animate-fade-in">
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Spezifischer Typ</label>
                <div className="flex flex-wrap gap-2 items-center">
                  
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
                        className="w-full p-2.5 bg-white border border-purple-200 rounded-lg text-sm outline-none focus:border-purple-500 text-slate-900 shadow-sm"
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
                <select 
                  value={locationId} 
                  onChange={(e) => { setLocationId(e.target.value); setTagX(null); setTagY(null); }} 
                  className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 font-medium"
                >
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
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Position im Regal (Klicken zum Ändern)</p>
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
            <input type="checkbox" id="toggleEditWarranty" checked={showWarranty} onChange={(e) => setShowWarranty(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
            <label htmlFor="toggleEditWarranty" className="text-sm font-semibold text-slate-700 cursor-pointer">🧾 Garantie & Beleg verwalten</label>
          </div>

          {showWarranty && (
            <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 space-y-4 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-orange-800 uppercase mb-1">Preis (CHF)</label>
                  <input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full p-2.5 border border-orange-200 rounded-lg bg-white text-slate-900 outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orange-800 uppercase mb-1">Kaufdatum</label>
                  <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="w-full p-2.5 border border-orange-200 rounded-lg bg-white text-slate-900 outline-none focus:border-orange-500" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-orange-800 uppercase block mb-1">Neuer Kassenbeleg</label>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files && setReceiptFile(e.target.files[0])} className="text-xs text-slate-600 w-full p-2 bg-white rounded-lg border border-orange-200" />
                {receiptUrl && <p className="text-[10px] text-green-600 mt-1 font-bold">✓ Beleg bereits gespeichert</p>}
              </div>
            </div>
          )}

          <div className="pt-6">
            <button type="submit" disabled={isSaving || !activeCategory} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-200 disabled:opacity-50 transition hover:bg-slate-800 text-lg">
              {isSaving ? 'Speichert...' : 'Änderungen speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}