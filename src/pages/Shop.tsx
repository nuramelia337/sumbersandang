import { useState, useEffect } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Product, Category } from '../lib/types';
import ProductCard from '../components/ProductCard';

interface Props {
  onNavigate: (page: string, data?: any) => void;
  initialCategory?: string;
  initialSearch?: string;
}

export default function Shop({ onNavigate, initialCategory, initialSearch }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high'>('newest');
  const [selectedCat, setSelectedCat] = useState<string>(initialCategory || 'all');
  const [search, setSearch] = useState(initialSearch || '');
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (initialCategory) setSelectedCat(initialCategory);
    if (initialSearch) setSearch(initialSearch);
  }, [initialCategory, initialSearch]);

  useEffect(() => {
    (async () => {
      const { data: cats } = await supabase.from('categories').select('*').order('sort_order');
      setCategories(cats || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from('products').select('*').eq('status', 'active');
      if (selectedCat !== 'all') {
        const cat = categories.find((c) => c.slug === selectedCat);
        if (cat) q = q.eq('category_id', cat.id);
      }
      if (search) {
        q = q.or(`name.ilike.%${search}%,brand.ilike.%${search}%,tags.cs.{${search}}`);
      }
      if (sortBy === 'price-low') q = q.order('selling_price', { ascending: true });
      else if (sortBy === 'price-high') q = q.order('selling_price', { ascending: false });
      else q = q.order('created_at', { ascending: false });

      const { data } = await q.limit(500);
      setProducts(data || []);
      setLoading(false);
    })();
  }, [selectedCat, search, sortBy, categories]);

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Koleksi</h1>
        <p className="mt-2 text-neutral-500">Jelajahi {products.length} item thrift premium</p>
      </div>

      {/* Search bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk, brand..."
          className="input-field max-w-xs"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="input-field max-w-[180px]"
        >
          <option value="newest">Terbaru</option>
          <option value="price-low">Harga Terendah</option>
          <option value="price-high">Harga Tertinggi</option>
        </select>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className="btn-secondary md:hidden"
        >
          <SlidersHorizontal size={16} /> Filter
        </button>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside
          className={`${
            filterOpen ? 'fixed inset-0 z-50 bg-black/40' : 'hidden'
          } md:relative md:block md:bg-transparent md:z-auto`}
          onClick={() => setFilterOpen(false)}
        >
          <div
            className={`${
              filterOpen ? 'fixed left-0 top-0 h-full w-72 bg-white p-6 shadow-2xl' : ''
            } md:sticky md:top-24 md:w-56 md:bg-transparent md:p-0 md:shadow-none`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between md:hidden">
              <h3 className="font-serif text-lg font-bold">Filter</h3>
              <button onClick={() => setFilterOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
              Kategori
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => {
                  setSelectedCat('all');
                  setFilterOpen(false);
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedCat === 'all'
                    ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-neutral-800 dark:text-primary-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                Semua Produk
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCat(cat.slug);
                    setFilterOpen(false);
                  }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    selectedCat === cat.slug
                      ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-neutral-800 dark:text-primary-400'
                      : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Products */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="skeleton aspect-[3/4]" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-neutral-400">
              <p className="text-sm">Tidak ada produk ditemukan</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onClick={() => onNavigate('product', { id: p.id })} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
