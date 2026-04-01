"use client";

import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Link from 'next/link';
import { useWorkspace } from '../../context/WorkspaceContext';

export type CategoryConfig = {
  id: string;
  icon: string;
  name: string; 
  lendable: boolean;
  autoOpenWarranty: boolean;
  attributes: string[]; 
  tags: string[]; 
};

// Deine detaillierte Bibliothek
const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'saegen-trennen', icon: '🪚', name: 'Sägen & Trennen', lendable: true, autoOpenWarranty: true, attributes: ['Leistung'], tags: ["Kappsäge", "Stichsäge", "Handkreissäge", "Tischkreissäge", "Winkelschleifer (Flex)", "Handsäge", "Japan-Säge", "Multitool", "Sägeblatt", "Trennscheibe"] },
  { id: 'handwerkzeug', icon: '🔨', name: 'Handwerkzeug', lendable: true, autoOpenWarranty: false, attributes: [], tags: ["Hammer", "Schraubendreher", "Zange", "Stechbeitel", "Hobel", "Feile", "Wasserwaage", "Maßband", "Schraubenschlüssel", "Inbus", "Schraubzwinge"] },
  { id: 'maschinen', icon: '🔌', name: 'Maschinen (Bohren/Schleifen)', lendable: true, autoOpenWarranty: true, attributes: ['Leistung', 'Energiequelle'], tags: ["Akkuschrauber", "Bohrmaschine", "Bohrhammer", "Oberfräse", "Exzenterschleifer", "Schwingschleifer", "Kompressor", "Staubsauger"] },
  { id: 'befestigung', icon: '🔩', name: 'Befestigung', lendable: false, autoOpenWarranty: false, attributes: ['Länge (mm)', 'Durchmesser'], tags: ["Holzschraube", "Metallschraube", "Dübel", "Nagel", "Mutter", "Unterlegscheibe", "Gewindestange", "Winkel", "Scharnier"] },
  { id: 'chemie-verbrauch', icon: '🧪', name: 'Chemie & Verbrauch', lendable: false, autoOpenWarranty: false, attributes: [], tags: ["Schmierspray", "PTFE", "WD-40", "Holzleim", "Montagekleber", "Silikon", "Acryl", "Lack", "Farbe", "Pinsel", "Schleifpapier", "Klebeband", "Öl"] },
  { id: 'gartengeraete', icon: '🌱', name: 'Gartengeräte', lendable: true, autoOpenWarranty: false, attributes: [], tags: ["Rasenmäher", "Heckenschere", "Kettensäge", "Freischneider", "Schaufel", "Spaten", "Rechen", "Besen", "Gartenschere", "Gartenschlauch", "Gießkanne"] },
  { id: 'zubehoer-sonstiges', icon: '📦', name: 'Zubehör & Sonstiges', lendable: true, autoOpenWarranty: false, attributes: [], tags: ["Aufbewahrung", "Ersatzteil", "Akku", "Ladegerät", "Schutzausrüstung", "Kabeltrommel", "Beleuchtung"] }
];

const WORKSHOP_ICONS = ['📦', '🔨', '🔌', '🔩', '🌿', '🪚', '🪜', '🧰', '🧹', '🛢️', '💡', '🔋', '⚙️', '🗜️', '🪛', '🔧', '🪓', '🚿', '📐', '✏️', '🖌️', '🪣', '🔒', '🧪'];

export default function SettingsPage() {
  const { workspaceId } = useWorkspace();
  const [ownerName, setOwnerName] = useState('');
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Formular-States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newIcon, setNewIcon] = useState('📦');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLendable, setNewLendable] = useState(true);
  const [newAutoWarranty, setNewAutoWarranty] = useState(false);
  const [newAttributes, setNewAttributes] = useState('');
  const [newTags, setNewTags] = useState('');

  useEffect(() => {
    if (!workspaceId) return;
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'workspaces', workspaceId!, 'settings', 'main'));
        if (snap.exists()) {
          const data = snap.data();
          setOwnerName(data.ownerName || '');
          if (data.categories && data.categories.length > 0) {
            const normalized = data.categories.map((c: any) => ({
              ...c,
              attributes: c.attributes || [],
              tags: c.tags || []
            }));
            setCategories(normalized);
          } else {
            setCategories(DEFAULT_CATEGORIES);
            await setDoc(doc(db, 'workspaces', workspaceId!, 'settings', 'main'), { ownerName: data.ownerName || '', categories: DEFAULT_CATEGORIES }, { merge: true });
          }
        } else {
          setCategories(DEFAULT_CATEGORIES);
          await setDoc(doc(db, 'workspaces', workspaceId!, 'settings', 'main'), { ownerName: '', categories: DEFAULT_CATEGORIES });
        }
      } catch (error) {
        console.error("Fehler beim Laden:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [workspaceId]);

  const saveSettings = async (updatedCategories = categories) => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'workspaces', workspaceId!, 'settings', 'main'), {
        ownerName,
        categories: updatedCategories
      });
    } catch (error) {
      alert("Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    const attrArray = newAttributes.split(',').map(a => a.trim()).filter(a => a.length > 0);
    const tagsArray = newTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    const catData: CategoryConfig = {
      id: editingId || (newName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') + Date.now().toString()),
      icon: newIcon.trim() || '📦',
      name: newName.trim(),
      lendable: newLendable,
      autoOpenWarranty: newAutoWarranty,
      attributes: attrArray,
      tags: tagsArray
    };

    let updated;
    if (editingId) {
      updated = categories.map(c => c.id === editingId ? catData : c);
    } else {
      updated = [...categories, catData];
    }

    setCategories(updated);
    saveSettings(updated);
    resetForm();
  };

  const editCategory = (cat: CategoryConfig) => {
    setEditingId(cat.id);
    setNewIcon(cat.icon);
    setNewName(cat.name);
    setNewLendable(cat.lendable);
    setNewAutoWarranty(cat.autoOpenWarranty);
    setNewAttributes(cat.attributes ? cat.attributes.join(', ') : '');
    setNewTags(cat.tags ? cat.tags.join(', ') : '');
    setShowIconPicker(false);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingId(null);
    setNewIcon('📦');
    setNewName('');
    setNewLendable(true);
    setNewAutoWarranty(false);
    setNewAttributes('');
    setNewTags('');
    setShowIconPicker(false);
  };

  const deleteCategory = (id: string) => {
    if(!confirm("Kategorie wirklich löschen?")) return;
    const updated = categories.filter(c => c.id !== id);
    setCategories(updated);
    saveSettings(updated);
  };

  // NEU: Die Reset-Funktion für die Standard-Bibliothek
  const restoreDefaults = () => {
    if(confirm("Möchtest du alle Kategorien auf die Standard-Bibliothek zurücksetzen? Deine eigenen Anpassungen gehen verloren!")) {
      setCategories(DEFAULT_CATEGORIES);
      saveSettings(DEFAULT_CATEGORIES);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Lade Werkstatt-Daten...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 pb-32">
      <div className="max-w-3xl mx-auto">
        
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">⚙️ Zentrale Einstellungen</h1>
          <Link href="/" className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 text-slate-500 rounded-full hover:bg-slate-100 transition shadow-sm">
            ✖️
          </Link>
        </div>

        {/* ALLGEMEIN */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Besitzer & Etiketten</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Ausgewiesener Eigentümer (Wird auf QR-Kleber gedruckt)</label>
              <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="z.B. ShedSync HQ oder Janick" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-slate-800 focus:border-orange-500 transition" />
            </div>
            <div className="flex items-end">
              <button onClick={() => saveSettings()} disabled={isSaving} className="w-full sm:w-auto bg-slate-800 text-white font-bold px-6 py-3 rounded-xl hover:bg-slate-700 transition">
                {isSaving ? 'Speichert...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>

        {/* KATEGORIEN MANAGER */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="mb-6">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Kategorien & Tag-Bibliotheken</h2>
            <p className="text-xs text-slate-500">Definiere Haupt-Kategorien und die dazugehörigen, vorauswählbaren Tags.</p>
          </div>

          {/* BESTEHENDE KATEGORIEN */}
          <div className="space-y-4 mb-8">
            {categories.map((cat) => (
              <div key={cat.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4 hover:border-orange-300 transition">
                
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-2xl shadow-sm shrink-0 mt-1">
                    {cat.icon}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{cat.name}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {cat.tags && cat.tags.length > 0 ? cat.tags.join(', ') : 'Keine spezifischen Tags hinterlegt'}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${cat.lendable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {cat.lendable ? '✅ Verleihbar' : '❌ Verleih gesperrt'}
                      </span>
                      {cat.autoOpenWarranty && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                          🧾 Garantie Auto-Offen
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 w-full sm:w-auto justify-end mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-200">
                  <button onClick={() => editCategory(cat)} className="bg-white text-slate-600 hover:text-orange-600 text-xs font-bold px-4 py-2 rounded-lg border border-slate-200 shadow-sm transition">✏️ Bearbeiten</button>
                  <button onClick={() => deleteCategory(cat.id)} className="bg-white text-slate-400 hover:text-red-500 text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 shadow-sm transition">🗑️</button>
                </div>
              </div>
            ))}
          </div>

          {/* KATEGORIE ANLEGEN / BEARBEITEN */}
          <div className={`border-t border-slate-200 pt-6 -mx-6 px-6 -mb-6 pb-6 rounded-b-2xl transition-colors ${editingId ? 'bg-orange-50 border-orange-200' : 'bg-slate-50'}`}>
            <h3 className={`text-sm font-black mb-4 flex items-center gap-2 ${editingId ? 'text-orange-800' : 'text-slate-800'}`}>
              {editingId ? '✏️ Kategorie bearbeiten' : '✨ Neue Kategorie anlegen'}
            </h3>
            
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                
                <div className="w-full sm:w-24 shrink-0 relative">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Icon</label>
                  <button 
                    type="button"
                    onClick={() => setShowIconPicker(!showIconPicker)} 
                    className="w-full h-12 bg-white border border-slate-300 rounded-xl outline-none text-center text-xl shadow-sm hover:border-orange-500 transition flex items-center justify-center"
                  >
                    {newIcon} <span className="text-[10px] ml-1 text-slate-400">▼</span>
                  </button>
                  
                  {showIconPicker && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowIconPicker(false)}></div>
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3 flex flex-wrap gap-2 z-20">
                        {WORKSHOP_ICONS.map(icon => (
                          <button key={icon} type="button" onClick={() => { setNewIcon(icon); setShowIconPicker(false); }} className="w-8 h-8 flex items-center justify-center hover:bg-orange-100 rounded text-xl transition">
                            {icon}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Haupt-Kategorie (z.B. Handwerkzeug)</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-3 bg-white border border-slate-300 rounded-xl outline-none font-bold text-slate-800 shadow-sm" required />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tag-Bibliothek (Kommagetrennt)</label>
                <textarea 
                  value={newTags} 
                  onChange={(e) => setNewTags(e.target.value)} 
                  placeholder="z.B. Hammer, Zange, Stechbeitel, Schraubendreher..." 
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl outline-none text-sm text-slate-700 shadow-sm h-24 resize-none" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zusätzliche Eingabefelder (Kommagetrennt)</label>
                <input type="text" value={newAttributes} onChange={(e) => setNewAttributes(e.target.value)} placeholder="z.B. Länge (mm), Durchmesser..." className="w-full p-3 bg-white border border-slate-300 rounded-xl outline-none text-sm text-slate-700 shadow-sm" />
              </div>

              <div className="flex flex-col sm:flex-row gap-4 p-4 bg-white rounded-xl border border-slate-300 shadow-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newLendable} onChange={(e) => setNewLendable(e.target.checked)} className="w-4 h-4 text-orange-600 rounded" />
                  <span className="text-xs font-bold text-slate-700">Darf verliehen werden</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newAutoWarranty} onChange={(e) => setNewAutoWarranty(e.target.checked)} className="w-4 h-4 text-orange-600 rounded" />
                  <span className="text-xs font-bold text-slate-700">Garantie-Tresor standardmäßig aufklappen</span>
                </label>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <div className="flex gap-2">
                  <button type="submit" disabled={isSaving} className={`flex-1 text-white font-bold py-3.5 rounded-xl transition shadow-md ${editingId ? 'bg-slate-800 hover:bg-slate-700' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-200'}`}>
                    {editingId ? 'Änderungen speichern' : '+ Neue Kategorie anlegen'}
                  </button>
                  {editingId && (
                    <button type="button" onClick={resetForm} className="px-6 bg-white border border-slate-300 text-slate-700 font-bold py-3.5 rounded-xl hover:bg-slate-50 transition shadow-sm">
                      Abbrechen
                    </button>
                  )}
                </div>
                
                {/* DER WICHTIGE RESET BUTTON */}
                {!editingId && (
                  <div className="text-center mt-2">
                    <button 
                      type="button" 
                      onClick={restoreDefaults} 
                      className="text-[10px] text-slate-400 hover:text-orange-600 transition underline decoration-dotted"
                    >
                      ⚠️ Standard-Bibliothek wiederherstellen (Überschreibt Datenbank)
                    </button>
                  </div>
                )}
              </div>

            </form>
          </div>

        </div>
      </div>
    </div>
  );
}