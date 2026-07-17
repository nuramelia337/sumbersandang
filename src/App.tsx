import { useState, useEffect } from 'react';
import { CartProvider } from './lib/cart';
import { ThemeProvider } from './lib/theme';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import WhatsAppButton from './components/WhatsAppButton';
import CartDrawer from './components/CartDrawer';
import { AlertProvider } from './components/AlertProvider';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Checkout from './pages/Checkout';
import About from './pages/About';
import Contact from './pages/Contact';
import Rules from './pages/Rules';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import { supabase } from './lib/supabase';

type Page = 'home' | 'shop' | 'product' | 'checkout' | 'about' | 'contact' | 'rules' | 'admin' | 'wishlist';

const PAGE_PATHS: Record<Page, string> = {
  home: '/',
  shop: '/shop',
  product: '/product',
  checkout: '/checkout',
  about: '/about',
  contact: '/contact',
  rules: '/rules',
  admin: '/admin',
  wishlist: '/wishlist',
};

function pageFromPath(pathname: string): Page {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (cleanPath === '/admin' || cleanPath.startsWith('/admin/')) return 'admin';
  if (cleanPath === '/shop') return 'shop';
  if (cleanPath === '/checkout') return 'checkout';
  if (cleanPath === '/about') return 'about';
  if (cleanPath === '/contact') return 'contact';
  if (cleanPath === '/rules') return 'rules';
  if (cleanPath === '/wishlist') return 'wishlist';
  return 'home';
}

function App() {
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [pageData, setPageData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    const validateAdmin = async (userId?: string) => {
      if (!mounted) return;
      if (!userId) {
        setIsAdmin(false);
        setAuthChecked(true);
        return;
      }

      try {
        const profileRequest = supabase
          .from('admin_profiles')
          .select('id')
          .eq('id', userId)
          .eq('is_active', true)
          .maybeSingle();

        const timeout = new Promise<{ data: null; error: Error }>((resolve) => {
          window.setTimeout(() => resolve({ data: null, error: new Error('Admin session check timed out') }), 7000);
        });

        const { data: profile, error } = await Promise.race([profileRequest, timeout]);
        if (mounted) setIsAdmin(Boolean(profile) && !error);
      } catch {
        if (mounted) setIsAdmin(false);
      } finally {
        if (mounted) setAuthChecked(true);
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => validateAdmin(data.session?.user?.id))
      .catch(() => {
        if (!mounted) return;
        setIsAdmin(false);
        setAuthChecked(true);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthChecked(false);
      window.setTimeout(() => {
        validateAdmin(session?.user?.id);
      }, 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPage(pageFromPath(window.location.pathname));
      setPageData(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (newPage: string, data?: any, replace = false) => {
    const nextPage = newPage as Page;
    setPage(nextPage);
    setPageData(data);
    const nextPath = PAGE_PATHS[nextPage] || '/';
    if (window.location.pathname !== nextPath) {
      const method = replace ? 'replaceState' : 'pushState';
      window.history[method]({}, '', nextPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = (q: string) => {
    setSearch(q);
  };

  if (page === 'admin') {
    if (!authChecked) {
      return (
        <ThemeProvider>
          <AlertProvider>
            <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
              Memeriksa sesi admin...
            </div>
          </AlertProvider>
        </ThemeProvider>
      );
    }
    if (!isAdmin) return <AdminLogin onLogin={() => setIsAdmin(true)} />;
    return (
      <ThemeProvider>
        <AlertProvider>
          <AdminLayout onLogout={() => { setIsAdmin(false); navigate('home'); }} />
        </AlertProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AlertProvider>
        <CartProvider>
          <div className="flex min-h-screen flex-col bg-primary-50 dark:bg-secondary-950">
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
              {page === 'rules' && <Rules />}
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
      </AlertProvider>
    </ThemeProvider>
  );
}

export default App;
