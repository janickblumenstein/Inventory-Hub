import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ error: 'Ungültige URL' }, { status: 400 });
    }

    // 1. Webseite herunterladen
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = await response.text();

    // 2. Open Graph Meta-Tags extrahieren (Das sind die Infos, die auch WhatsApp für Link-Vorschauen nutzt)
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) 
                    || html.match(/<title>([^<]+)<\/title>/i);
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);

    const title = titleMatch ? titleMatch[1] : null;
    let imageUrl = imageMatch ? imageMatch[1] : null;

    // Manchmal sind Bild-URLs relativ (/bild.jpg), wir machen sie absolut
    if (imageUrl && imageUrl.startsWith('/')) {
      const urlObj = new URL(url);
      imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
    }

    return NextResponse.json({ title, imageUrl });

  } catch (error) {
    console.error("Scraping Error:", error);
    return NextResponse.json({ error: 'Fehler beim Laden der Vorschau' }, { status: 500 });
  }
}