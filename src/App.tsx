import { useState, useEffect } from 'react';
import { CartProvider } from './lib/cart';
import { ThemeProvider } from './lib/theme';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import WhatsAppButton from './components/WhatsAppButton';
import CartDrawer from './components/CartDrawer';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import About from './pages/About';
import Contact from './pages/Contact';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';

type Page = 'home' | 'shop' | 'product' | 'checkout' | 'about' | 'contact' | 'admin' | 'wishlist';

function App() {
  const [page, setPage] = useState<Page>('home');
  const [pageData, setPageData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [authChecked] = useState(true);
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem('admin_auth') === 'true');

  useEffect(() => {
    // no supabase auth needed - using session-based credential check
  }, []);

  const navigate = (newPage: string, data?: any) => {
    setPage(newPage as Page);
    setPageData(data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = (q: string) => {
    setSearch(q);
  };

  if (page === 'admin') {
    if (!authChecked) return null;
    if (!isAdmin) return <AdminLogin onLogin={() => setIsAdmin(true)} />;
    return (
      <ThemeProvider>
        <AdminLayout onLogout={() => { setIsAdmin(false); navigate('home'); }} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <CartProvider>
        <div className="flex min-h-screen flex-col bg-[#fdfbf8] dark:bg-neutral-950">
          <Navbar onNavigate={navigate} onSearch={handleSearch} currentPage={page} />
          <main className="flex-1">
            {page === 'home' && <Home onNavigate={navigate} />}
            {page === 'shop' && (
              <Shop
                onNavigate={navigate}
                initialCategory={pageData?.category}
                initialSearch={search}
              />
            )}
            {page === 'product' && pageData?.id && (
              <ProductDetail productId={pageData.id} onNavigate={navigate} />
            )}
            {page === 'checkout' && <Checkout onNavigate={navigate} />}
            {page === 'about' && <About onNavigate={navigate} />}
            {page === 'contact' && <Contact />}
            {page === 'wishlist' && (
              <div className="mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-20 text-center">
                <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Wishlist</h1>
                <p className="mt-2 text-neutral-500">Fitur wishlist segera hadir</p>
                <button onClick={() => navigate('shop')} className="mt-6 btn-primary">Lihat Koleksi</button>
              </div>
            )}
          </main>
          <Footer onNavigate={navigate} />
          <WhatsAppButton />
          <CartDrawer onCheckout={() => navigate('checkout')} />
        </div>
      </CartProvider>
    </ThemeProvider>
  );
}

export default App;
