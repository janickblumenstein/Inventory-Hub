import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ShedSync | Deine smarte Werkstatt',
  description: 'Synchronisiere dein Werkzeug, Garantiebelege und Verleihe.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className={`${inter.className} bg-slate-50 text-slate-900`}>
        {/* HIER WURDE DER ALTE HEADER GELÖSCHT */}
        {children}
      </body>
    </html>
  );
}