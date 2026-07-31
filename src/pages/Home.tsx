import { useState, useEffect } from 'react';
import { ArrowRight, BadgePercent, Gem, Sparkles, Shirt, Truck, Shield, Heart, Recycle, Clock3 } from 'lucide-react';

import { supabase } from '../lib/supabase';
import type { BusinessPackage, Product, Category, PromoBannerSetting, Testimonial } from '../lib/types';
import ProductCard from '../components/ProductCard';
import PackageCard from '../components/PackageCard';
import { DEFAULT_PROMO_BANNER, loadPromoBanner, loadPublicPackages, loadTestimonials, PRODUCT_CATEGORY_COPY, PRODUCT_CATEGORY_SLUGS } from '../lib/business';

interface Props {
  onNavigate: (page: string, data?: any) => void;
}

export default function Home({ onNavigate }: Props) {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [latest, setLatest] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [packages, setPackages] = useState<BusinessPackage[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [promo, setPromo] = useState<PromoBannerSetting>(DEFAULT_PROMO_BANNER);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [feat, lat, cats, pkgs, quotes, banner] = await Promise.all([
        supabase.from('products').select('*').eq('is_featured', true).eq('status', 'active').eq('availability_status', 'ready').eq('stock', 1).limit(4),
        supabase.from('products').select('*').eq('status', 'active').eq('availability_status', 'ready').eq('stock', 1).order('created_at', { ascending: false }).limit(8),
        supabase.from('categories').select('*').order('sort_order'),
        loadPublicPackages(6),
        loadTestimonials(),
        loadPromoBanner(),
      ]);
      setFeatured(feat.data || []);
      setLatest(lat.data || []);
      setCategories((cats.data || []).filter((cat) => PRODUCT_CATEGORY_SLUGS.includes(cat.slug as any)));
      setPackages(pkgs);
      setTestimonials(quotes);
      setPromo(banner);
      setLoading(false);
    })();
  }, []);

  const heroImage = promo.is_active ? promo.image_url : 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg';
  const heroCtaPage = promo.cta_page === 'shop:packages' ? 'shop' : promo.cta_page || 'shop';
  const heroCtaData = promo.cta_page === 'shop:packages' ? { category: 'packages' } : undefined;

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="relative min-h-[80vh] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Hero"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-secondary-950/85 via-secondary-900/60 to-primary-950/10" />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col justify-center px-4 py-24 sm:px-6 lg:min-h-[80vh] lg:px-8">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
              <Sparkles size={14} /> Sumber Sandang Preloved
            </span>
            <h1 className="mt-6 font-serif text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              {promo.is_active ? promo.title : 'Good Stuff,'}<br />
              <span className="text-accent-200">{promo.is_active ? 'Siap Dipilih' : 'Second Chance,'}</span><br />
              {promo.is_active ? 'Tanpa Ribet.' : 'Better You.'}
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/80">
              {promo.is_active ? promo.subtitle : 'Pilih koleksi New Arrival, Promo, Normal, atau Premium sesuai budget dan kebutuhan. Semua item dikurasi agar jelas kondisi, harga, dan siap checkout.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <button
                onClick={() => onNavigate(heroCtaPage, heroCtaData)}
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-700 active:scale-95"
              >
                {promo.cta_label || 'Belanja Sekarang'} <ArrowRight size={18} />
              </button>
              <button
                onClick={() => onNavigate('about')}
                className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
              >
                Tentang Kami
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="border-b border-primary-100 bg-white dark:border-secondary-800 dark:bg-secondary-900">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4 lg:px-8">
          {[
            { icon: Recycle, title: 'Second Chance', desc: 'Preloved yang layak pakai' },
            { icon: Shield, title: 'Kurasi Jelas', desc: 'Kondisi dan harga transparan' },
            { icon: Truck, title: 'Pengiriman Cepat', desc: 'Ke seluruh Indonesia' },
            { icon: Heart, title: 'Pilihan Fleksibel', desc: 'New arrival, promo, normal, premium' },
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-secondary-800 dark:text-primary-300">
                <b.icon size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{b.title}</p>
                <p className="text-xs text-neutral-500">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Pilih Jalur Belanja</h2>
          <p className="mt-2 text-neutral-500">Empat kategori sederhana agar pembeli cepat menemukan rilis terbaru, harga, dan kualitas yang pas.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat) => {
            const copy = PRODUCT_CATEGORY_COPY[cat.slug as keyof typeof PRODUCT_CATEGORY_COPY];
            const Icon = cat.slug === 'new-arrival' ? Clock3 : cat.slug === 'promo' ? BadgePercent : cat.slug === 'premi' ? Gem : Shirt;
            return (
            <button
              key={cat.id}
              onClick={() => onNavigate('shop', { category: cat.slug })}
              className="group relative overflow-hidden rounded-2xl border border-primary-100 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary-300 dark:border-secondary-800 dark:bg-secondary-900"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-secondary-800 dark:text-primary-300">
                  <Icon size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-primary-600">{copy?.tone}</p>
                  <p className="mt-1 font-serif text-xl font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-primary-600">
                    {copy?.title || cat.name}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{copy?.description || cat.description}</p>
                </div>
              </div>
            </button>
            );
          })}
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Koleksi Pilihan</h2>
              <p className="mt-2 text-neutral-500">Kurasi yang paling layak dilirik duluan</p>
            </div>
            <button
              onClick={() => onNavigate('shop')}
              className="hidden items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 sm:flex"
            >
              Lihat Semua <ArrowRight size={16} />
            </button>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton aspect-[3/4]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} onClick={() => onNavigate('product', { id: p.id })} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Latest */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Baru Tiba</h2>
          <p className="mt-2 text-neutral-500">Item baru dari kategori New Arrival, Promo, Normal, dan Premium</p>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton aspect-[3/4]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {latest.map((p) => (
              <ProductCard key={p.id} product={p} onClick={() => onNavigate('product', { id: p.id })} />
            ))}
          </div>
        )}
      </section>

      {/* Business packages */}
      {packages.length > 0 && (
        <section className="bg-white py-16 dark:bg-secondary-900">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h2 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Paket Usaha</h2>
                <p className="mt-2 text-neutral-500">Bundle siap jual untuk reseller yang ingin stok lebih cepat</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {packages.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 text-center">
            <h2 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Testimoni Pelanggan</h2>
            <p className="mt-2 text-neutral-500">Cerita dari pembeli dan reseller</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.slice(0, 3).map((t) => (
              <div key={t.id} className="card p-5">
                <div className="mb-3 text-accent-500">{'★'.repeat(t.rating)}</div>
                <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">"{t.message}"</p>
                <div className="mt-4">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">{t.customer_name}</p>
                  {t.customer_handle && <p className="text-xs text-neutral-500">{t.customer_handle}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-700 via-primary-600 to-secondary-800 px-8 py-16 text-center">
          <div className="absolute inset-0 opacity-20">
            <img src="https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="relative">
            <h2 className="font-serif text-3xl font-bold text-white sm:text-4xl">
              Temukan Kategori yang Pas
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-white/80">
              Mulai dari New Arrival untuk temuan terbaru, Promo untuk hemat, Normal untuk daily wear, Premium untuk kurasi terbaik, atau Paket Usaha untuk reseller.
            </p>
            <button
              onClick={() => onNavigate('shop')}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-primary-700 shadow-sm transition-all hover:bg-accent-50 active:scale-95"
            >
              Jelajahi Koleksi <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
