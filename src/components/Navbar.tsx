import { useState, useEffect } from 'react';
import { ShoppingBag, Menu, X, Search, Heart, Moon, Sun } from 'lucide-react';
import { BRAND } from '../lib/constants';
import { useCart } from '../lib/cart';
import { useTheme } from '../lib/theme';

interface Props {
  onNavigate: (page: string) => void;
  onSearch: (q: string) => void;
  currentPage: string;
}

export default function Navbar({ onNavigate, onSearch, currentPage }: Props) {
  const { totalItems, setIsOpen } = useCart();
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Beranda', page: 'home' },
    { label: 'Koleksi', page: 'shop' },
    { label: 'Rules', page: 'rules' },
    { label: 'Tentang', page: 'about' },
    { label: 'Kontak', page: 'contact' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchVal.trim()) {
      onSearch(searchVal.trim());
      setSearchOpen(false);
      onNavigate('shop');
    }
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/90 dark:bg-secondary-950/90 backdrop-blur-lg shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button onClick={() => onNavigate('home')} className="flex items-center gap-3">
            <img
              src={BRAND.logo}
              alt="Sumber Sandang"
              className="h-11 w-11 rounded-xl bg-white/90 object-contain p-1 ring-2 ring-accent-200"
            />
            <div className="hidden sm:block text-left">
              <p className="font-serif text-lg font-bold leading-none text-secondary-950 dark:text-primary-50">
                Sumber Sandang
              </p>
              <p className="text-[10px] tracking-widest text-primary-600 uppercase">Good stuff, second chance</p>
            </div>
          </button>

          <div className="hidden items-center gap-8 md:flex">
            {links.map((l) => (
              <button
                key={l.page}
                onClick={() => onNavigate(l.page)}
                className={`text-sm font-medium transition-colors hover:text-primary-600 ${
                  currentPage === l.page ? 'text-primary-600' : 'text-secondary-800 dark:text-primary-100'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="rounded-full p-2 text-secondary-800 transition-colors hover:bg-primary-100 dark:text-primary-100 dark:hover:bg-secondary-800"
              aria-label="Search"
            >
              <Search size={20} />
            </button>
            <button
              onClick={toggle}
              className="rounded-full p-2 text-secondary-800 transition-colors hover:bg-primary-100 dark:text-primary-100 dark:hover:bg-secondary-800"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <button
              onClick={() => onNavigate('wishlist')}
              className="rounded-full p-2 text-secondary-800 transition-colors hover:bg-primary-100 dark:text-primary-100 dark:hover:bg-secondary-800"
              aria-label="Wishlist"
            >
              <Heart size={20} />
            </button>
            <button
              onClick={() => setIsOpen(true)}
              className="relative rounded-full p-2 text-secondary-800 transition-colors hover:bg-primary-100 dark:text-primary-100 dark:hover:bg-secondary-800"
              aria-label="Cart"
            >
              <ShoppingBag size={20} />
              {totalItems > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-500 text-[10px] font-bold text-secondary-950">
                  {totalItems}
                </span>
              )}
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-full p-2 text-secondary-800 transition-colors hover:bg-primary-100 md:hidden dark:text-primary-100 dark:hover:bg-secondary-800"
              aria-label="Menu"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </nav>

        {searchOpen && (
          <div className="border-t border-primary-100 bg-white px-4 py-4 dark:border-secondary-800 dark:bg-secondary-950 sm:px-6 lg:px-8">
            <form onSubmit={handleSearch} className="mx-auto flex max-w-2xl gap-2">
              <input
                autoFocus
                type="text"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Cari baju, brand, kategori..."
                className="input-field"
              />
              <button type="submit" className="btn-primary whitespace-nowrap">
                Cari
              </button>
            </form>
          </div>
        )}

        {menuOpen && (
          <div className="border-t border-primary-100 bg-white px-4 py-4 dark:border-secondary-800 dark:bg-secondary-950 md:hidden">
            <div className="flex flex-col gap-3">
              {links.map((l) => (
                <button
                  key={l.page}
                  onClick={() => {
                    onNavigate(l.page);
                    setMenuOpen(false);
                  }}
                  className={`text-left text-sm font-medium py-2 ${
                    currentPage === l.page ? 'text-primary-600' : 'text-secondary-800 dark:text-primary-100'
                  }`}
                >
                  {l.label}
                </button>
              ))}
              <button
                onClick={() => {
                  onNavigate('admin');
                  setMenuOpen(false);
                }}
                className="text-left text-sm font-medium py-2 text-neutral-500"
              >
                Admin Panel
              </button>
            </div>
          </div>
        )}
      </header>
      <div className="h-20" />
    </>
  );
}
