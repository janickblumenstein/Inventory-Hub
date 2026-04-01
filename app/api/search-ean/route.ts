import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { ean, shops } = await request.json();

    if (!ean) {
      return NextResponse.json({ error: 'Keine EAN übergeben' }, { status: 400 });
    }

    // Wir bauen unsere geniale Shop-Begrenzung wieder selbst!
    const siteQuery = shops.map((shop: string) => `site:${shop}`).join(' OR ');
    const searchQuery = `${ean} ${siteQuery}`;

    const SERPER_API_KEY = process.env.SERPER_API_KEY?.trim(); 

    if (!SERPER_API_KEY) {
        return NextResponse.json({ error: 'Serper API Key fehlt in der .env.local Datei!' }, { status: 500 });
    }

    // Wir rufen die Serper API auf
    const searchRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: searchQuery,
        gl: 'ch', // Suchergebnisse auf die Schweiz priorisieren
        hl: 'de'  // Deutsche Spracheinstellungen
      })
    });
    
    const searchData = await searchRes.json();

    // Hat Serper etwas in seinen organischen Resultaten gefunden?
    if (!searchData.organic || searchData.organic.length === 0) {
        return NextResponse.json({ error: 'Kein Treffer! Zu dieser EAN wurde in deinen Shops nichts gefunden.' }, { status: 404 });
    }

    // Wir nehmen den ersten Treffer!
    const firstResultUrl = searchData.organic[0].link;
    const fallbackTitle = searchData.organic[0].title;

    // Unseren bewährten Meta-Spion auf die gefundene URL ansetzen
    const baseUrl = request.url.split('/api/')[0]; 
    const metaRes = await fetch(`${baseUrl}/api/fetch-meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: firstResultUrl })
    });

    const metaData = await metaRes.json();

    // Das perfekte Paket an die App zurückliefern
    return NextResponse.json({ 
        url: firstResultUrl, 
        title: metaData.title || fallbackTitle, 
        imageUrl: metaData.imageUrl 
    });

  } catch (error) {
    console.error("EAN Search Error:", error);
    return NextResponse.json({ error: 'Fehler bei der EAN-Suche auf dem Server.' }, { status: 500 });
  }
}