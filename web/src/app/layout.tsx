import type { Metadata } from 'next';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { CartProvider } from '../context/CartContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'Piatto | Il tuo ricettario personale',
  description: 'Una raccolta di ricette HelloFresh. Trova il piatto perfetto in base a quello che hai in frigo.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>
        <CartProvider>
          <nav className="navbar">
            <div className="container flex-between">
              <Link href="/" className="logo text-gradient">Piatto</Link>
              <div className="nav-links">
                <Link href="/">Ricette</Link>
                <Link href="/fridge" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>Svuota Frigo</Link>
                <Link href="/impostazioni" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Impostazioni</Link>
                <Link href="/cart" className="cart-nav-link" title="Lista della spesa">
                  <ShoppingCart size={20} />
                </Link>
              </div>
            </div>
          </nav>
          <main>{children}</main>
          <footer className="footer">
            <div className="container">
              <p>&copy; {new Date().getFullYear()} Piatto. Fatto con ❤️</p>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}
