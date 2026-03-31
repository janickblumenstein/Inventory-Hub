// app/scanner/page.js
"use client";

import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import Link from 'next/link';

export default function Scanner() {
  const [scanResult, setScanResult] = useState(null);

  useEffect(() => {
    // Initialisiere den Scanner, sobald die Seite lädt
    const scanner = new Html5QrcodeScanner(
      "reader", // Die ID des div-Containers unten
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        rememberLastUsedCamera: true
      },
      false // Verbose logging ausschalten
    );

    // Was passiert, wenn er einen Code findet?
    scanner.render(
      (decodedText) => {
        setScanResult(decodedText);
        scanner.clear(); // Kamera nach Erfolg direkt wieder ausschalten
      },
      (error) => {
        // Ignoriere Fehler, solange er noch sucht
      }
    );

    // Aufräumen, wenn du die Seite verlässt (sonst bleibt die Kamera an!)
    return () => {
      scanner.clear().catch(error => console.error("Fehler beim Beenden der Kamera", error));
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">QR-Scanner</h1>
          <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">
            Abbrechen
          </Link>
        </div>

        {scanResult ? (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-green-200 text-center animate-fade-in">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Code erkannt!</h2>
            <p className="text-slate-600 mb-6 bg-slate-50 p-3 rounded-lg font-mono text-sm break-all">
              Inhalt: {scanResult}
            </p>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg hover:bg-slate-700 transition"
            >
              Noch einen scannen
            </button>
          </div>
        ) : (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            {/* HIER WIRD DIE KAMERA REINGELADEN */}
            <div id="reader" className="w-full rounded-lg overflow-hidden"></div>
            <p className="text-center text-sm text-slate-500 mt-4">
              Richte die Kamera auf einen Lagerort-Code.
            </p>
          </div>
        )}
        
      </div>
    </div>
  );
}