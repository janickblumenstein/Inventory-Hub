import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: 'Werkstatt Hub',
  description: 'Inventar und Lagerplatz Verwaltung',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body className="bg-slate-50 text-slate-900">
        {/* Globale Navigation */}
        <nav className="bg-slate-900 text-white p-4 shadow-md">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <Link href="/" className="text-xl font-bold text-orange-500 tracking-tight">
              Werkstatt<span className="text-white">Hub</span>
            </Link>
            <div className="space-x-4 text-sm font-medium flex items-center">
              <Link href="/scanner" className="text-orange-400 hover:text-orange-300 transition text-xl" title="Scanner">
                📷
              </Link>
              <Link href="/" className="hover:text-orange-400 transition">Dashboard</Link>
              <Link href="/new" className="bg-orange-600 hover:bg-orange-700 px-3 py-1.5 rounded-md transition">
                + Neu
              </Link>
            </div>
          </div>
        </nav>
        
        {/* Der Inhalt der jeweiligen Seite */}
        <main className="max-w-4xl mx-auto">
          {children}
        </main>
      </body>
    </html>
  )
}