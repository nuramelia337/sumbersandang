import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BRAND } from '../../lib/constants';
import { useTheme } from '../../lib/theme';
import {
  LayoutDashboard, Package, ShoppingCart, Warehouse, FileBarChart,
  Bell, LogOut, Menu, X, Moon, Sun, Boxes, MonitorCog, Shield, Wallet
} from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import AdminProducts from './AdminProducts';
import AdminOrders from './AdminOrders';
import AdminInventory from './AdminInventory';
import AdminReports from './AdminReports';
import AdminPackages from './AdminPackages';
import AdminWebsite from './AdminWebsite';
import AdminManagement from './AdminManagement';
import AdminFinance from './AdminFinance';

interface Props {
  onLogout: () => void;
}

const ADMIN_PAGE_IDS = ['dashboard', 'products', 'packages', 'orders', 'inventory', 'finance', 'reports', 'website', 'admin'] as const;
type AdminPage = typeof ADMIN_PAGE_IDS[number];

function adminPageFromPath(pathname: string): AdminPage {
  const section = pathname.replace(/\/+$/, '').split('/')[2];
  return ADMIN_PAGE_IDS.includes(section as AdminPage) ? section as AdminPage : 'dashboard';
}

export default function AdminLayout({ onLogout }: Props) {
  const [page, setPage] = useState<AdminPage>(() => adminPageFromPath(window.location.pathname));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    const onPopState = () => setPage(adminPageFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadNotifications = async () => {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20);
    setNotifications(data || []);
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    loadNotifications();
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Produk', icon: Package },
    { id: 'packages', label: 'Paket Usaha', icon: Boxes },
    { id: 'orders', label: 'Pesanan', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory', icon: Warehouse },
    { id: 'finance', label: 'Keuangan', icon: Wallet },
    { id: 'reports', label: 'Laporan', icon: FileBarChart },
    { id: 'website', label: 'Website', icon: MonitorCog },
    { id: 'admin', label: 'Admin', icon: Shield },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const navigateAdmin = (nextPage: AdminPage) => {
    setPage(nextPage);
    setSidebarOpen(false);
    const nextPath = nextPage === 'dashboard' ? '/admin' : `/admin/${nextPage}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-primary-50 dark:bg-secondary-950">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-64 transform border-r border-primary-100 bg-white transition-transform dark:border-secondary-800 dark:bg-secondary-900 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="flex h-16 items-center justify-between border-b border-primary-100 px-4 dark:border-secondary-800">
          <div className="flex items-center gap-3">
            <img src={BRAND.logo} alt="Logo" className="h-10 w-10 rounded-xl bg-white object-contain p-1 ring-2 ring-accent-200" />
            <div>
              <p className="font-serif text-sm font-bold text-secondary-950 dark:text-primary-50">Sumber Sandang</p>
              <p className="text-[10px] text-primary-600">Admin Panel</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden">
            <X size={20} />
          </button>
        </div>

        <nav className="p-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateAdmin(item.id as AdminPage)}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                page === item.id
                  ? 'bg-primary-600 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-primary-100 p-4 dark:border-secondary-800">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-error-600 hover:bg-error-50 dark:hover:bg-error-900/30">
            <LogOut size={18} />
            Keluar
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="md:ml-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-primary-100 bg-white/90 px-4 backdrop-blur dark:border-secondary-800 dark:bg-secondary-900/90 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden">
              <Menu size={20} />
            </button>
            <h1 className="font-serif text-lg font-bold capitalize text-neutral-900 dark:text-neutral-50">
              {navItems.find((n) => n.id === page)?.label}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggle} className="rounded-full p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <div className="relative">
              <button onClick={() => setShowNotif(!showNotif)} className="relative rounded-full p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotif && (
                <div className="fixed left-4 right-4 top-16 z-50 rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80">
                  <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
                    <h3 className="font-serif text-sm font-bold">Notifikasi</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-center text-sm text-neutral-400">Tidak ada notifikasi</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={`block w-full border-b border-neutral-100 p-3 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800 ${!n.is_read ? 'bg-primary-50/50 dark:bg-neutral-800/50' : ''}`}
                        >
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{n.title}</p>
                          <p className="text-xs text-neutral-500">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700 dark:bg-neutral-800 dark:text-primary-400">
              A
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {page === 'dashboard' && <AdminDashboard />}
          {page === 'products' && <AdminProducts />}
          {page === 'packages' && <AdminPackages />}
          {page === 'orders' && <AdminOrders />}
          {page === 'inventory' && <AdminInventory />}
          {page === 'finance' && <AdminFinance />}
          {page === 'reports' && <AdminReports />}
          {page === 'website' && <AdminWebsite />}
          {page === 'admin' && <AdminManagement />}
        </main>
      </div>
    </div>
  );
}
