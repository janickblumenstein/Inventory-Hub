"use client";

import { useState, useEffect } from 'react';
import { db, storage } from '../../../lib/firebase';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../../../context/WorkspaceContext';

export default function NewLocation() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  
  // FIX 1: TypeScript sagen, was in diese States reinkommt!
  const [existingLocations, setExistingLocations] = useState<any[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const fetchLocations = async () => {
      const querySnapshot = await getDocs(collection(db, 'workspaces', workspaceId, 'locations'));
      const locs: any[] = [];
      querySnapshot.forEach((doc) => {
        locs.push({ id: doc.id, ...doc.data() });
      });
      setExistingLocations(locs);
    };
    fetchLocations();
  }, [workspaceId]);

  // FIX 2: Event-Typ für Datei-Uploads definieren
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // FIX 3: Event-Typ für Formular-Submit definieren
  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!workspaceId) return;
    
    setIsSaving(true);

    try {
      let finalImageUrl = "";

      if (imageFile) {
        // Bildpfad mit Workspace-ID absichern, damit Bilder nicht durcheinander kommen
        const imageRef = ref(storage, `workspaces/${workspaceId}/location_images/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imageRef, imageFile);
        finalImageUrl = await getDownloadURL(imageRef);
      }

      const docRef = await addDoc(collection(db, 'workspaces', workspaceId, 'locations'), {
        name,
        parentId: parentId || null,
        imageUrl: finalImageUrl,
        qrCodeId: '',
        createdAt: serverTimestamp()
      });

      // Direkt in den neuen Ort – dort will man meist gleich Items erfassen.
      router.push(`/locations/${docRef.id}`);
      
    } catch (error) {
      console.error("Fehler: ", error);
      alert('Fehler beim Speichern des Ortes.');
    } finally {
      setIsSaving(false);
    }
  };

  // Wenn der Wächter die ID noch nicht geladen hat, kurz warten
  if (!workspaceId) return <div className="min-h-screen bg-slate-50 p-8 text-center text-slate-500">Lade...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Neuen Lagerort anlegen</h1>
          <button onClick={() => router.push('/')} className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition text-lg">
            ✖️
          </button>
        </div>
        
        <form onSubmit={handleSave} className="space-y-6">
          

          <div>
             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Befindet sich dieser Ort IN einem anderen?</label>
             <select 
                value={parentId} 
                onChange={(e) => setParentId(e.target.value)}
                // Darkmode fixiert:
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-medium outline-none focus:border-orange-500 transition"
              >
                <option value="">-- Nein, das ist ein Hauptraum --</option>
                {existingLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
             </select>
             <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">Lass dies leer für ganze Räume. Wähle z.B. "Kellerraum 1", wenn du gerade einen Schrank für diesen Raum anlegst.</p>
          </div>

          <div className="border-t border-slate-100 pt-6 mt-2">
            <p className="block text-xs font-bold text-slate-500 uppercase mb-2">
              Foto des Ortes <span className="text-orange-500">*</span>
            </p>
            <div className="flex gap-2">
              <label className="flex-1 bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold py-3 px-3 rounded-lg text-center cursor-pointer hover:bg-orange-100 transition shadow-sm">
                📷 Kamera
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  onChange={handleImageChange} 
                  className="hidden" 
                />
              </label>
              <label className="flex-1 bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold py-3 px-3 rounded-lg text-center cursor-pointer hover:bg-orange-100 transition shadow-sm">
                🖼️ Galerie
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageChange} 
                  className="hidden" 
                />
              </label>
            </div>
            {/* Optional: Hier kannst du den Namen der ausgewählten Datei anzeigen, falls gewünscht */}
          </div>

          {previewUrl && (
            <div className="mt-4 border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <img src={previewUrl} alt="Vorschau" className="w-full h-auto" />
            </div>
          )}

          <button type="submit" disabled={isSaving} className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl hover:bg-orange-700 disabled:opacity-50 mt-8 shadow-md transition text-lg">
            {isSaving ? 'Speichert Ort...' : 'Lagerort speichern'}
          </button>
        </form>
      </div>
    </div>
  );
}