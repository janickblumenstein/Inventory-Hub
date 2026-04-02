"use client";

import { useState, useEffect } from 'react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, getDoc, doc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CategoryConfig } from '../settings/page';
import { useWorkspace } from '../../context/WorkspaceContext';

// 🛒 DAS SHOP-LEXIKON
const SUPPORTED_SHOPS: Record<string, { name: string, style: string, urlPattern: string }> = {
  galaxus: { name: 'Galaxus', style: 'text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100', urlPattern: 'https://www.galaxus.ch/search?q=' },
  hornbach: { name: 'Hornbach', style: 'text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100', urlPattern: 'https://www.hornbach.ch/s/' },
  migros: { name: 'Migros', style: 'text-orange-600 border-orange-200 bg-orange-50 hover:bg-orange-100', urlPattern: 'https://www.migros.ch/de/search?query=' },
  coop: { name: 'Coop', style: 'text-red-700 border-red-200 bg-red-50 hover:bg-red-100', urlPattern: 'https://www.coop.ch/de/search/?text=' },
  brack: { name: 'Brack.ch', style: 'text-yellow-700 border-yellow-300 bg-yellow-50 hover:bg-yellow-100', urlPattern: 'https://www.brack.ch/search?query=' },
  obi: { name: 'Obi', style: 'text-orange-700 border-orange-200 bg-orange-50 hover:bg-orange-100', urlPattern: 'https://www.obi.ch/search/' }
};

export default function NewItem() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  
  // BASIS DATEN
  const [name, setName] = useState('');
  const [ean, setEan] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState('');
  
  // 📸 BILD & URL DATEN
  const [imageUrl, setImageUrl] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [pastedUrl, setPastedUrl] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
  const [isSearchingEan, setIsSearchingEan] = useState(false);

  // 🔥 NEU: INLINE-SCANNER STATE
  const [showInlineScanner, setShowInlineScanner] = useState(false);

  // SHOP EINSTELLUNGEN
  const [preferredShops, setPreferredShops] = useState<string[]>([]);
  const [customShops, setCustomShops] = useState<{id: string, name: string, urlPattern: string}[]>([]);
  const [onShoppingList, setOnShoppingList] = useState(false);

  // KATEGORIEN & TAGS
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  
  // Attribute & Koordinaten
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [tagX, setTagX] = useState<number | null>(null);
  const [tagY, setTagY] = useState<number | null>(null);
  const [locations, setLocations] = useState<any[]>([]);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const fetchData = async () => {
      const locSnapshot = await getDocs(collection(db, 'workspaces', workspaceId, 'locations'));
      const locs: any[] = [];
      locSnapshot.forEach((doc) => { locs.push({ id: doc.id, ...doc.data() }); });
      setLocations(locs);

      const settingsSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'settings', 'main'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data.categories) setCategories(data.categories);
        setPreferredShops(data.preferredShops || ['galaxus', 'hornbach', 'migros', 'coop']);
        setCustomShops(data.customShops || []);
      } else {
        setPreferredShops(['galaxus', 'hornbach', 'migros', 'coop']);
      }
    };
    fetchData();
  }, [workspaceId]);

  // 🔥 NEU: Der Inline-Scanner Effekt (Vercel-sicher)
  useEffect(() => {
    if (!showInlineScanner) return;
    let scannerInstance: any = null;

    const initScanner = async () => {
      const { Html5QrcodeScanner } = await import('html5-qrcode');
      scannerInstance = new Html5QrcodeScanner("inline-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      
      scannerInstance.render(
        (decodedText: string) => {
          setEan(decodedText);
          setShowInlineScanner(false); // Scanner sofort zuklappen
          handleEanSearch(decodedText); // Automatisch die Suche starten!
        },
        () => {} // Fehler ignorieren
      );
    };
    initScanner();

    return () => {
      if (scannerInstance) scannerInstance.clear().catch(console.error);
    };
  }, [showInlineScanner]);

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

  const handleFetchMeta = async () => {
    if (!pastedUrl) return;
    setIsFetchingMeta(true);
    try {
      const res = await fetch('/api/fetch-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pastedUrl })
      });
      const data = await res.json();
      
      if (data.title && !name) setName(data.title); 
      if (data.imageUrl) setImageUrl(data.imageUrl); 
      setProductUrl(pastedUrl); 
      setPastedUrl(''); 
      
      alert('✅ Bild und Titel erfolgreich vom Shop geladen!');
    } catch (error) {
      alert('❌ Fehler beim Laden der Daten vom Shop.');
    } finally {
      setIsFetchingMeta(false);
    }
  };

  // 🔍 EAN-Auto-Suche (Akzeptiert jetzt auch einen direkten Text vom Scanner)
  const handleEanSearch = async (searchedEan?: string) => {
    const targetEan = searchedEan || ean;
    if (!targetEan.trim()) return;
    setIsSearchingEan(true);
    
    try {
      const res = await fetch('/api/search-ean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean: targetEan.trim() })
      });
      
      const data = await res.json();
      
      if (res.ok && data.title) {
        if (!name) setName(data.title);
        if (data.imageUrl) setImageUrl(data.imageUrl);
        if (data.url) setProductUrl(data.url);
        alert("✅ Item in Datenbank gefunden!");
      } else {
        alert("❌ Kein Treffer. Nutze die Shop-Suche oben, um den Link zu finden!");
      }
    } catch (error) {
      alert("Fehler bei der Suche.");
    } finally {
      setIsSearchingEan(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!activeCategory || !workspaceId) {
      alert("Bitte wähle eine Haupt-Kategorie aus!");
      return;
    }
    saveItem(activeCategory.name);
  };

  const handleExpressSave = () => {
    if (!workspaceId) return;
    saveItem(''); 
  };

  const saveItem = async (categoryName: string) => {
    setIsSaving(true);
    try {
      let finalImageUrl = imageUrl;
      
      if (newImageFile) {
        const imgRef = ref(storage, `workspaces/${workspaceId}/items/${Date.now()}_${newImageFile.name}`);
        await uploadBytes(imgRef, newImageFile);
        finalImageUrl = await getDownloadURL(imgRef);
      }

      await addDoc(collection(db, 'workspaces', workspaceId!, 'items'), {
        name: name || 'Unbenanntes Item',
        ean,
        productUrl,
        imageUrl: finalImageUrl,
        category: categoryName, 
        tags: selectedTags, 
        quantity,
        locationId,
        tagX,
        tagY,
        attributes,
        onShoppingList,
        createdAt: new Date().toISOString()
      });

      router.push('/'); 
    } catch (error) {
      alert('Fehler beim Speichern.');
      setIsSaving(false);
    }
  };

  const searchQuery = encodeURIComponent(ean || name);

  if (!workspaceId) return <div className="p-8 text-center text-slate-500">Lade...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-32">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Neues Item erfassen</h1>
          <Link href="/" className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition text-lg">
            ✖️
          </Link>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* 🔥 BILD & SHOP-LINK BEREICH */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
              <span>Produktbild & Shop-Suche</span>
            </h2>
            
            <div className="flex gap-4 items-start">
              <div className="w-20 h-20 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-1 shrink-0 overflow-hidden relative group">
                {(newImageFile || imageUrl) ? (
                  <img src={newImageFile ? URL.createObjectURL(newImageFile) : imageUrl} alt="Produkt" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-2xl opacity-50">📦</span>
                )}
              </div>
              
              <div className="flex-1 space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase">1. Im Shop suchen</p>
                <div className="flex flex-wrap gap-1.5">
                  {preferredShops.map(shopKey => {
                    const shop = SUPPORTED_SHOPS[shopKey];
                    if (!shop) return null;
                    return (
                      <a key={shopKey} href={`${shop.urlPattern}${searchQuery}`} target="_blank" rel="noopener noreferrer" className={`text-[10px] px-2 py-1 rounded font-bold transition border ${shop.style}`}>
                        🔍 {shop.name}
                      </a>
                    );
                  })}
                  {customShops.map(shop => (
                    <a key={shop.id} href={`${shop.urlPattern}${searchQuery}`} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-1 rounded font-bold transition bg-white text-slate-600 border border-slate-300 hover:bg-slate-100">
                      🔍 {shop.name}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">2. Shop-Link einfügen (Lädt Bild & Name)</p>
              <div className="flex gap-2">
                <input 
                  type="url" 
                  placeholder={productUrl || "https://www.galaxus.ch/..."}
                  value={pastedUrl}
                  onChange={(e) => setPastedUrl(e.target.value)}
                  className="flex-1 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-500"
                />
                <button 
                  type="button"
                  onClick={handleFetchMeta}
                  disabled={!pastedUrl || isFetchingMeta}
                  className="bg-orange-600 text-white px-3 py-2 rounded-xl font-bold disabled:opacity-50 text-xs shadow-sm hover:bg-orange-700"
                >
                  {isFetchingMeta ? 'Lädt...' : 'Laden'}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 mt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Oder: Eigenes Foto hochladen</p>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                onChange={(e) => e.target.files && setNewImageFile(e.target.files[0])} 
                className="text-xs text-slate-600 w-full p-2 bg-white rounded-lg border border-slate-200" 
              />
            </div>
          </div>

          {/* 📝 DATEN BEREICH */}
          <div className="space-y-4">
            
            {/* 🔥 NEU: EAN FELD MIT INTEGRIERTER KAMERA */}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 flex justify-between items-center">
                EAN / Barcode (Optional)
              </label>
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setShowInlineScanner(!showInlineScanner)}
                  className={`px-3 py-2 rounded-xl text-lg transition border shadow-sm ${showInlineScanner ? 'bg-orange-100 border-orange-300 text-orange-600' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}`}
                  title="Barcode scannen"
                >
                  📷
                </button>
                <input 
                  type="text" 
                  value={ean} 
                  onChange={(e) => setEan(e.target.value)} 
                  className="flex-1 p-2.5 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-mono text-sm focus:border-orange-500 shadow-sm" 
                  placeholder="Nummer" 
                />
                <button 
                  type="button"
                  onClick={() => handleEanSearch()}
                  disabled={!ean || isSearchingEan}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50"
                >
                  {isSearchingEan ? 'Sucht...' : '🔍 Auto-Fill'}
                </button>
              </div>

              {/* Der Inline Scanner Container */}
              {showInlineScanner && (
                <div className="mt-3 border-2 border-orange-200 rounded-2xl overflow-hidden bg-black animate-fade-in relative">
                  <div id="inline-reader" className="w-full"></div>
                  <button 
                    type="button"
                    onClick={() => setShowInlineScanner(false)}
                    className="absolute top-2 right-2 bg-slate-900/50 text-white w-8 h-8 flex items-center justify-center rounded-full z-10 hover:bg-slate-900/80"
                  >
                    ✖
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bezeichnung</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="w-full p-3 pr-10 border border-slate-300 rounded-xl bg-white text-slate-900 outline-none font-bold text-lg focus:border-orange-500 transition shadow-sm" 
                  placeholder="z.B. Makita Flex" 
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

            <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 mt-2 cursor-pointer shadow-sm">
              <input type="checkbox" checked={onShoppingList} onChange={(e) => setOnShoppingList(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-orange-500 focus:ring-orange-500" />
              <span className="text-sm font-bold text-slate-700">{onShoppingList ? '❤️ Auf Einkaufsliste' : '🤍 Auf Einkaufsliste setzen'}</span>
            </label>

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

          <div className="pt-6 space-y-3">
            <button 
              type="submit" 
              disabled={isSaving || !activeCategory} 
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg shadow-slate-200 disabled:opacity-50 transition hover:bg-slate-800 text-lg"
            >
              {isSaving ? 'Speichert...' : 'Vollständig erfassen'}
            </button>

            <button 
              type="button"
              onClick={handleExpressSave}
              disabled={isSaving || (!name && !ean && !newImageFile)} 
              className="w-full bg-orange-50 text-orange-700 font-bold py-3 rounded-xl border border-orange-200 transition hover:bg-orange-100 text-sm disabled:opacity-50"
            >
              📥 In den Eingangskorb (später sortieren)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}