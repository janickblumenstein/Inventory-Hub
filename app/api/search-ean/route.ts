import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { ean } = await request.json();

    if (!ean) {
      return NextResponse.json({ error: 'Keine EAN übergeben' }, { status: 400 });
    }

    // 🚀 STUFE 1: OpenFoodFacts (Der Retter für Ovo, Cola & Co.)
    try {
      const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
      const offData = await offRes.json();
      
      if (offData.status === 1 && offData.product) {
        const productName = offData.product.product_name || offData.product.product_name_de || offData.product.generic_name;
        if (productName) {
          return NextResponse.json({ 
            title: productName, 
            imageUrl: offData.product.image_url || offData.product.image_front_url || '',
            url: `https://ch.openfoodfacts.org/product/${ean}`,
            source: 'openfoodfacts'
          });
        }
      }
    } catch (error) {
      console.log("OpenFoodFacts übersprungen");
    }

    // 🚀 STUFE 2: Globale UPC Datenbank (Für Elektronik & Standardware)
    try {
      const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`);
      const upcData = await upcRes.json();
      
      if (upcData.items && upcData.items.length > 0) {
        const item = upcData.items[0];
        return NextResponse.json({ 
          title: item.title, 
          imageUrl: item.images && item.images.length > 0 ? item.images[0] : null,
          url: item.offers && item.offers.length > 0 ? item.offers[0].link : '',
          source: 'upcitemdb'
        });
      }
    } catch (error) {
      console.log("UPC API übersprungen");
    }

    // 🚀 STUFE 3: Serper Web-Suche (Der harte Kern für Werkzeug & Galaxus)
    const SERPER_API_KEY = process.env.SERPER_API_KEY?.trim(); 

    if (SERPER_API_KEY) {
      // Wir zwingen Google, die Nummer exakt auf deinen Shops zu suchen
      const searchQuery = `"${ean}" site:galaxus.ch OR site:hornbach.ch OR site:obi.ch OR site:brack.ch`;
      
      const searchRes = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: searchQuery, gl: 'ch', hl: 'de' })
      });
      
      const searchData = await searchRes.json();

      if (searchData.organic && searchData.organic.length > 0) {
        const firstResultUrl = searchData.organic[0].link;
        const fallbackTitle = searchData.organic[0].title;

        // Meta-Spion für das Bild
        const baseUrl = request.url.split('/api/')[0]; 
        const metaRes = await fetch(`${baseUrl}/api/fetch-meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: firstResultUrl })
        });
        const metaData = await metaRes.json();

        return NextResponse.json({ 
            title: metaData.title || fallbackTitle, 
            imageUrl: metaData.imageUrl,
            url: firstResultUrl, 
            source: 'serper_web'
        });
      }
    }

    return NextResponse.json({ error: 'Nichts gefunden' }, { status: 404 });

  } catch (error) {
    console.error("EAN Search Error:", error);
    return NextResponse.json({ error: 'Server Fehler' }, { status: 500 });
  }
}