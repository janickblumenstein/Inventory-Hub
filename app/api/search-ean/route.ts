import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { ean } = await request.json();

    if (!ean) {
      return NextResponse.json({ error: 'Keine EAN übergeben' }, { status: 400 });
    }

    // 🚀 STUFE 1: OpenFoodFacts (Der Retter für Schweizer Lebensmittel & Snacks)
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
      console.log("OpenFoodFacts fehlgeschlagen");
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
      console.log("UPC API fehlgeschlagen");
    }

    // 🚀 Nichts gefunden? Gut so! Das triggert das Fallback-Menü in der App.
    return NextResponse.json({ error: 'Nichts in globalen Datenbanken gefunden' }, { status: 404 });

  } catch (error) {
    console.error("EAN Search Error:", error);
    return NextResponse.json({ error: 'Server Fehler' }, { status: 500 });
  }
}