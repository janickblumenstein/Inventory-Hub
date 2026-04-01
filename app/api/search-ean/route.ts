import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { ean } = await request.json();

    if (!ean) {
      return NextResponse.json({ error: 'Keine EAN übergeben' }, { status: 400 });
    }

    const SERPER_API_KEY = process.env.SERPER_API_KEY?.trim(); 

    if (!SERPER_API_KEY) {
        return NextResponse.json({ error: 'Serper Key fehlt' }, { status: 500 });
    }

    // 🚀 NEU: Wir nutzen den /shopping Endpunkt! 
    // Hier sind EANs nativ hinterlegt, weil die Shops sie direkt an Google übermitteln.
    const searchRes = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: ean, // Einfach die nackte Nummer
        gl: 'ch', // Zwingend Schweiz
        hl: 'de'  // Sprache Deutsch
      })
    });
    
    const searchData = await searchRes.json();

    if (!searchData.shopping || searchData.shopping.length === 0) {
        return NextResponse.json({ error: 'Nichts im Schweizer Google Shopping gefunden' }, { status: 404 });
    }

    // Unsere präferierten Shops (in Kleinbuchstaben für den Abgleich)
    const preferredShops = ['galaxus', 'hornbach', 'obi', 'brack'];

    let bestResult = null;

    // 1. Priorität: Suche in den Shopping-Resultaten nach unseren Lieblings-Shops
    for (const item of searchData.shopping) {
        const sourceName = item.source.toLowerCase();
        // Prüfen, ob der Verkäufer (source) einer unserer Shops ist
        if (preferredShops.some(shop => sourceName.includes(shop))) {
            bestResult = item;
            console.log(`Bingo! Gefunden bei deinem Lieblingsshop: ${item.source}`);
            break; 
        }
    }

    // 2. Fallback: Wenn keiner der Lieblings-Shops das Produkt hat, nehmen wir das allererste (z.B. Coop/Migros für Cola)
    if (!bestResult) {
        bestResult = searchData.shopping[0];
        console.log(`Lieblingsshops hatten es nicht. Fallback auf: ${bestResult.source}`);
    }

    // Das Schöne an Google Shopping: Wir bekommen das hochauflösende Bild direkt mit! 
    // Wir brauchen den Meta-Spion (fetch-meta) hier gar nicht mehr!
    return NextResponse.json({ 
        title: bestResult.title, 
        imageUrl: bestResult.imageUrl,
        url: bestResult.link,
        source: bestResult.source // Speichern wir aus Spaß mit ab, damit du weisst, woher es kommt
    });

  } catch (error) {
    console.error("EAN Search Error:", error);
    return NextResponse.json({ error: 'Fehler bei der EAN-Suche auf dem Server.' }, { status: 500 });
  }
}