import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { WorkspaceProvider } from '../context/WorkspaceContext' // <--- NEU
import BackButtonHandler from '../components/BackButtonHandler'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ShedSync',
  description: 'Dein smartes Inventar',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className={inter.className}>
        {/* NEU: Der Wächter umschließt die gesamte App */}
        <WorkspaceProvider>
          <BackButtonHandler />
          {children}
        </WorkspaceProvider>
      </body>
    </html>
  )
}