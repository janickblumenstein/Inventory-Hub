"use client";

import { useState, useEffect } from 'react';
import { db, storage } from '../../../lib/firebase';
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useRouter } from 'next/navigation';

export default function NewLocation() {
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(''); // Ist es ein Raum (leer) oder ein Schrank IN einem Raum?
  const [existingLocations, setExistingLocations] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Lade alle bisherigen Orte, damit wir sie als "Übergeordneten Ort" (Parent) auswählen können
  useEffect(() => {
    const fetchLocations = async () => {
      const querySnapshot = await getDocs(collection(db, 'locations'));
      const locs = [];
      querySnapshot.forEach((doc) => {
        locs.push({ id: doc.id, ...doc.data() });
      });
      setExistingLocations(locs);
    };
    fetchLocations();
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      let finalImageUrl = "";

      if (imageFile) {
        const imageRef = ref(storage, `location_images/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(imageRef, imageFile);
        finalImageUrl = await getDownloadURL(snapshot.ref);
      }

      // Speichere den neuen Ort in der "locations" Tabelle
      await addDoc(collection(db, 'locations'), {
        name,
        parentId: parentId || null, // null bedeutet: Das ist die oberste Ebene (z.B. der ganze Raum)
        imageUrl: finalImageUrl,
        qrCodeId: '', // Platzhalter für später
        createdAt: serverTimestamp()
      });
      
      router.push('/'); 
      
    } catch (error) {
      console.error("Fehler: ", error);
      alert('Fehler beim Speichern des Ortes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h1 className="text-2xl font-bold mb-6 text-slate-800">Neuen Lagerort (Raum/Schrank) anlegen</h1>
        
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name des Ortes</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
              placeholder="z.B. Kellerraum 1 oder Roter Metallschrank"
              required 
            />
          </div>

          <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">Befindet sich dieser Ort IN einem anderen?</label>
             <select 
                value={parentId} 
                onChange={(e) => setParentId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg outline-none bg-white"
              >
                <option value="">-- Nein, das ist ein Hauptraum --</option>
                {existingLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
             </select>
             <p className="text-xs text-slate-500 mt-1">Lass dies leer für ganze Räume. Wähle z.B. "Kellerraum 1", wenn du gerade einen Schrank für diesen Raum anlegst.</p>
          </div>

          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Foto des Ortes</label>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              onChange={handleImageChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700"
              required
            />
          </div>

          {previewUrl && (
            <div className="mt-4 border-2 border-slate-200 rounded-lg overflow-hidden">
              <img src={previewUrl} alt="Vorschau" className="max-w-full h-auto" />
            </div>
          )}

          <button type="submit" disabled={isSaving} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 mt-8">
            {isSaving ? 'Speichert Ort...' : 'Lagerort speichern'}
          </button>
        </form>
      </div>
    </div>
  );
}