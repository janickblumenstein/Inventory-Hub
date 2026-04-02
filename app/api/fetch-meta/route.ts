import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url) return NextResponse.json({ error: 'Keine URL angegeben' }, { status: 400 });

    let finalTitle = '';
    let finalImageUrl = '';

    // 1. Versuch: Microlink
    try {
      const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}`;
      const res = await fetch(microlinkUrl);
      const data = await res.json();

      if (data.status === 'success' && data.data) {
        finalTitle = data.data.title || '';
        finalImageUrl = data.data.image?.url || data.data.logo?.url || '';
      }
    } catch (e) {
      console.log("Microlink Request fehlgeschlagen");
    }

    // 2. 🔥 DER GALAXUS TROLL-SCHUTZ & URL DECODER
    const isGalaxusOrDigitec = url.includes('galaxus.ch') || url.includes('digitec.ch');
    const isTrollData = finalTitle.toLowerCase() === 'galaxus' || 
                        finalTitle.toLowerCase() === 'digitec' || 
                        finalTitle.toLowerCase().includes('access denied') || 
                        finalTitle.toLowerCase().includes('just a moment');

    if (isGalaxusOrDigitec && (!finalTitle || isTrollData)) {
      // Wir werfen das "Selbst ist der Mann" Magazin sofort in den Müll!
      finalImageUrl = ''; 

      try {
        // Wir extrahieren den Namen direkt aus der URL
        // Aus: /product/brother-p-touch-cube-plus-pt-p710bt-beschriftungsgeraet-8846428
        const urlObj = new URL(url);
        
        // Sucht nach /product/ und schneidet die ID am Ende (-8846428) weg
        const match = urlObj.pathname.match(/\/product\/(.*?)(-\d+)?\/?$/);
        
        if (match && match[1]) {
          let cleanName = match[1];
          // Striche durch Leerzeichen ersetzen
          cleanName = cleanName.replace(/-/g, ' ');
          // Jeden ersten Buchstaben groß machen (Title Case)
          cleanName = cleanName.replace(/\b\w/g, l => l.toUpperCase());
          
          finalTitle = cleanName;
        }
      } catch(e) {
        console.error("URL Parsing fehlgeschlagen", e);
      }
    }

    // Wenn wir nach allem gar nichts haben, geben wir auf.
    if (!finalTitle && !finalImageUrl) {
      return NextResponse.json({ error: 'Der Shop blockiert die Abfrage massiv.' }, { status: 403 });
    }

    return NextResponse.json({ title: finalTitle.trim(), imageUrl: finalImageUrl });

  } catch (error) {
    return NextResponse.json({ error: 'Server Fehler' }, { status: 500 });
  }
}