"use client";

import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, getDoc, doc, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CategoryConfig } from '../settings/page';
import { useWorkspace } from '../../context/WorkspaceContext';

export default function NewItem() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  
  // Standard-Felder
  const [name, setName] = useState('');
  const [ean, setEan] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState('');
  
  // Kategorien & Tags
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  
  // Attribute & Koordinaten
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [tagX, setTagX] = useState<number | null>(null);
  const [tagY, setTagY] = useState<number | null>(null);
  const [locations, setLocations] = useState<any[]>([]);

  // 🪄 Smart-Link State
  const [productUrl, setProductUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [scrapedImageUrl, setScrapedImageUrl] = useState('');

  // 🔍 EAN-Suche State
  const [isSearchingEan, setIsSearchingEan] = useState(false);
  // Diese Shops kannst du später dynamisch aus den Settings laden!
  const preferredShops = ["galaxus.ch", "hornbach.ch", "obi.ch", "brack.ch"];

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const fetchData = async () => {
      const locSnapshot = await getDocs(collection(db, 'workspaces', workspaceId, 'locations'));
      const locs: any[] = [];
      locSnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
      setLocations(locs);

      const settingsSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'settings', 'main'));
      if (settingsSnap.exists() && settingsSnap.data().categories) {
        setCategories(settingsSnap.data().categories);
      }
    };
    fetchData();
  }, [workspaceId]);

  const activeCategory = categories.find(c => c.id === selectedCategoryId);

  // Tag Logik
  const toggleTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
      if (name.trim() === '') setName(tag);
    } else {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    }
  };

  const handleAddCustomTag = (e: React.KeyboardEvent | React.FocusEvent) => {
    if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !customTagInput.trim()) return;
    e.preventDefault();
    const newTag = customTagInput.trim();
    if (!selectedTags.includes(newTag)) {
      setSelectedTags([...selectedTags, newTag]);
      if (name.trim() === '') setName(newTag);
    }
    setCustomTagInput('');
  };

  // 🪄 Smart-Link Funktion
  const handleFetchUrlInfo = async () => {
    if (!productUrl.trim() || !productUrl.startsWith('http')) {
      alert("Bitte einen gültigen Link (inkl. https://) eingeben!");
      return;
    }
    
    setIsFetchingUrl(true);
    try {
      const res = await fetch('/api/fetch-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl.trim() })
      });
      
      const data = await res.json();
      
      if (data.title && name.trim() === '') {
        let cleanTitle = data.title.split('|')[0].split('-')[0].trim();
        setName(cleanTitle);
      }
      
      if (data.imageUrl) {
        setScrapedImageUrl(data.imageUrl);
      }

      if (!data.title && !data.imageUrl) {
        alert("Konnte keine Daten von dieser Seite lesen.");
      }
    } catch (error) {
      alert("Fehler beim Abrufen des Links.");
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // 🔍 EAN-Auto-Suche Funktion
  const handleEanSearch = async () => {
    if (!ean.trim()) return;
    setIsSearchingEan(true);
    
    try {
      const res = await fetch('/api/search-ean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean: ean.trim(), shops: preferredShops })
      });
      
      const data = await res.json();
      
      if (res.ok && data.url) {
        setProductUrl(data.url); // Shop-URL eintragen
        
        if (data.title && name.trim() === '') {
          let cleanTitle = data.title.split('|')[0].split('-')[0].trim();
          setName(cleanTitle);
        }
        if (data.imageUrl) {
          setScrapedImageUrl(data.imageUrl);
        }
      } else {
        alert(data.error || "Kein Treffer in deinen Shops. Bitte manuell erfassen.");
      }
    } catch (error) {
      alert("Fehler bei der Suche.");
    } finally {
      setIsSearchingEan(false);
    }
  };

  // Speichern
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeCategory || !workspaceId) {
      alert("Bitte wähle eine Haupt-Kategorie aus!");
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, 'workspaces', workspaceId, 'items'), {
        name,
        ean,
        productUrl,
        imageUrl: scrapedImageUrl,
        category: activeCategory.name, 
        tags: selectedTags, 
        quantity,
        locationId,
        tagX,
        tagY,
        attributes,
        createdAt: new Date().toISOString()
      });

      router.push('/'); 
    } catch (error) {
      alert('Fehler beim Speichern.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!workspaceId) return <div className="p-8 text-center text-slate-500">Lade...</div>;

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
          
          {/* ========================================= */}
          {/* 🚀 DIE MAGISCHE AUTO-FILL ZONE            */}
          {/* ========================================= */}
          <div className="space-y-4 border-b border-slate-100 pb-6">
            
            {/* 1. Smart-Link */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <label className="block text-[10px] font-bold text-blue-800 uppercase mb-2 flex items-center gap-2">
                <span>🪄</span> Smart-Link (Shop-URL einfügen)
              </label>
              <div className="flex gap-2">
                <input 
                  type="url" 
                  value={productUrl} 
                  onChange={(e) => setProductUrl(e.target.value)} 
                  placeholder="https://www.galaxus.ch/..." 
                  className="flex-1 p-3 border border-blue-200 rounded-lg bg-white text-slate-900 outline-none text-sm focus:border-blue-500" 
                />
                <button 
                  type="button" 
                  onClick={handleFetchUrlInfo}
                  disabled={isFetchingUrl || !productUrl}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 whitespace-nowrap"
                >
                  {isFetchingUrl ? 'Sucht...' : 'Daten ziehen'}
                </button>
              </div>
              
              {scrapedImageUrl && (
                <div className="mt-3 flex items-start gap-4 animate-fade-in">
                  <div className="w-20 h-20 bg-white rounded-lg border border-blue-200 p-1 flex-shrink-0">
                    <img src={scrapedImageUrl} alt="Vorschau" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-blue-800 font-bold">✅ Profi-Foto & Titel gefunden!</p>
                    <p className="text-[10px] text-blue-600 mt-1">Das Bild wird automatisch als Artikelbild gespeichert.</p>
                  </div>
                </div>
              )}
            </div>

            {/* 2. EAN Scanner */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 flex justify-between items-center">
                <span className="flex items-center gap-2">📷 EAN / Barcode Scanner</span>
                <span className="text-blue-500 font-medium">Auto-Suche in {preferredShops.length} Shops</span>
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={ean} 
                  onChange={(e) => setEan(e.target.value)} 
                  className="flex-1 p-3 border border-slate-300 rounded-lg bg-white text-slate-900 outline-none font-mono text-sm focus:border-slate-500 transition" 
                  placeholder="z.B. 7611234567890" 
                />
                <button 
                  type="button"
                  onClick={handleEanSearch}
                  disabled={!ean || isSearchingEan}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isSearchingEan ? 'Sucht...' : '🔍 Auto-Fill'}
                </button>
              </div>
            </div>

          </div>

          {/* ========================================= */}
          {/* 📝 MANUELLE EINGABE / KORREKTUR           */}
          {/* ========================================= */}
          <div className="space-y-4">
            
            {/* Bezeichnung mit X-Button */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bezeichnung</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="w-full p-3 pr-10 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg focus:border-orange-500 transition" 
                  placeholder="z.B. Makita Flex" 
                  required 
                />
                {name && (
                  <button 
                    type="button"
                    onClick={() => { setName(''); setSelectedTags([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 font-bold rounded-full hover:bg-slate-100 transition"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* KATEGORIEN & TAGS */}
            <div className="pt-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Kategorie wählen</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {categories.map(cat => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => { setSelectedCategoryId(cat.id); setCustomTagInput(''); }}
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
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Tags</label>
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

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 mt-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Menge</label>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Lagerort (Optional)</label>
                <select 
                  value={locationId} 
                  onChange={(e) => { setLocationId(e.target.value); setTagX(null); setTagY(null); }} 
                  className="w-full p-3 border border-slate-300 rounded-xl bg-white text-slate-900 font-medium text-sm"
                >
                  <option value="">-- Ort wählen --</option>
                  {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </div>
            </div>

          </div>

          <div className="pt-6">
            <button type="submit" disabled={isSaving || !activeCategory} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-200 disabled:opacity-50 transition hover:bg-slate-800 text-lg">
              {isSaving ? 'Speichert...' : 'Erfassen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}