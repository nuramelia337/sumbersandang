import { useState, useEffect } from 'react';
import { BadgePercent, BriefcaseBusiness, Clock3, Gem, Shirt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { BusinessPackage, Product, Category } from '../lib/types';
import ProductCard from '../components/ProductCard';
import PackageCard from '../components/PackageCard';
import { loadPublicPackages, PRODUCT_CATEGORY_COPY, PRODUCT_CATEGORY_SLUGS } from '../lib/business';

interface Props {
  onNavigate: (page: string, data?: any) => void;
  initialCategory?: string;
  initialSearch?: string;
}

export default function Shop({ onNavigate, initialCategory, initialSearch }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<BusinessPackage[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high'>('newest');
  const [selectedCat, setSelectedCat] = useState<string>(initialCategory || 'all');
  const [search, setSearch] = useState(initialSearch || '');

  useEffect(() => {
    if (initialCategory) setSelectedCat(initialCategory);
    if (initialSearch) setSearch(initialSearch);
  }, [initialCategory, initialSearch]);

  useEffect(() => {
    (async () => {
      const { data: cats } = await supabase.from('categories').select('*').order('sort_order');
      setCategories((cats || []).filter((cat) => PRODUCT_CATEGORY_SLUGS.includes(cat.slug as any)));
      setPackages(await loadPublicPackages(12));
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (selectedCat === 'packages') {
        setProducts([]);
        setLoading(false);
        return;
      }

      let q = supabase.from('products').select('*').eq('status', 'active').eq('availability_status', 'ready').eq('stock', 1);
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
        <h1 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Koleksi Sumber Sandang</h1>
        <p className="mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300">
          Belanja lebih cepat lewat New Arrival, Promo, Normal, Premium, atau Paket Usaha untuk bundle reseller.
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama produk, brand..."
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
        <select
          value={selectedCat}
          onChange={(e) => setSelectedCat(e.target.value)}
          className="input-field max-w-[190px] md:hidden"
        >
          <option value="all">Semua Koleksi</option>
          {categories.map((cat) => {
            const copy = PRODUCT_CATEGORY_COPY[cat.slug as keyof typeof PRODUCT_CATEGORY_COPY];
            return <option key={cat.id} value={cat.slug}>{copy?.title || cat.name}</option>;
          })}
          <option value="packages">Paket Usaha</option>
        </select>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="hidden md:relative md:block md:bg-transparent">
          <div className="md:sticky md:top-24 md:w-56">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
              Kategori
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedCat('all')}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedCat === 'all'
                    ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-neutral-800 dark:text-primary-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                Semua Koleksi
              </button>
              {categories.map((cat) => {
                const copy = PRODUCT_CATEGORY_COPY[cat.slug as keyof typeof PRODUCT_CATEGORY_COPY];
                const Icon = cat.slug === 'new-arrival' ? Clock3 : cat.slug === 'promo' ? BadgePercent : cat.slug === 'premi' ? Gem : Shirt;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCat(cat.slug)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedCat === cat.slug
                        ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-neutral-800 dark:text-primary-400'
                        : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Icon size={17} className="shrink-0" />
                    <span>{copy?.title || cat.name}</span>
                  </button>
                );
              })}
              <button
                onClick={() => setSelectedCat('packages')}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedCat === 'packages'
                    ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-neutral-800 dark:text-primary-400'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                <BriefcaseBusiness size={17} className="shrink-0" />
                <span>Paket Usaha</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Products */}
        <div className="flex-1">
          {packages.length > 0 && (selectedCat === 'packages' || (selectedCat === 'all' && !search)) && (
            <div className="mb-8">
              <h2 className="mb-2 font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">Paket Usaha</h2>
              <p className="mb-4 text-sm text-neutral-500">Bundle siap jual untuk reseller dan stok awal.</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {packages.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
              </div>
            </div>
          )}
          {selectedCat === 'packages' ? null : loading ? (
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
