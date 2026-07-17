import { useState, useEffect } from 'react';
import { ArrowLeft, ShoppingBag, Heart, Share2, Truck, Shield, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatIDR, waMessage } from '../lib/constants';
import { useCart } from '../lib/cart';
import type { Product, Category } from '../lib/types';
import { AVAILABILITY_LABELS, itemStatusColor, productAvailabilityFromStock, productIsAvailable, storageImageUrl } from '../lib/business';

interface Props {
  productId: string;
  onNavigate: (page: string, data?: any) => void;
}

export default function ProductDetail({ productId, onNavigate }: Props) {
  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const { addItem, setIsOpen } = useCart();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
      if (data) {
        setProduct(data);
        if (data.category_id) {
          const { data: cat } = await supabase.from('categories').select('*').eq('id', data.category_id).maybeSingle();
          setCategory(cat);
        }
      }
      setLoading(false);
    })();
  }, [productId]);

  const handleAddToCart = () => {
    if (product && productIsAvailable(product)) {
      addItem(product, qty);
      setIsOpen(true);
    }
  };

  const handleBuyNow = () => {
    if (product && productIsAvailable(product)) {
      addItem(product, qty);
      onNavigate('checkout');
    }
  };

  const handleWhatsApp = () => {
    if (!product) return;
    const msg = `Halo Sumber Sandang! Saya tertarik dengan produk:\n\n*${product.name}*\nKode: ${product.product_code}\nHarga: ${formatIDR(product.selling_price)}\n\nApakah masih tersedia?`;
    window.open(waMessage(msg), '_blank');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="skeleton aspect-[3/4]" />
          <div className="space-y-4">
            <div className="skeleton h-8 w-3/4" />
            <div className="skeleton h-6 w-1/2" />
            <div className="skeleton h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-neutral-500">Produk tidak ditemukan</p>
        <button onClick={() => onNavigate('shop')} className="btn-primary">Kembali ke Koleksi</button>
      </div>
    );
  }

  const availability = productAvailabilityFromStock(product);
  const available = productIsAvailable(product);
  const images = product.images?.length > 0
    ? product.images.map(storageImageUrl)
    : product.image_path
      ? [storageImageUrl(product.image_path)]
      : ['https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg'];

  const trustItems = [
    { icon: Truck, label: 'Pengiriman Cepat' },
    { icon: Shield, label: 'Kualitas Terjamin' },
    { icon: Heart, label: 'No Retur' },
  ];

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <button
        onClick={() => onNavigate('shop')}
        className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-primary-600"
      >
        <ArrowLeft size={16} /> Kembali
      </button>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Images */}
        <div>
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-neutral-100">
            <img
              src={images[activeImage]}
              alt={product.name}
              className="h-full w-full object-cover"
            />
            {product.is_featured && (
              <span className="absolute left-4 top-4 badge bg-accent-500 text-white">Featured</span>
            )}
            <div className="absolute right-4 top-4">
              <span className={`badge ${itemStatusColor(availability)}`}>{AVAILABILITY_LABELS[availability]}</span>
            </div>
          </div>
          {images.length > 1 && (
            <div className="mt-4 flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                    activeImage === i ? 'border-primary-500' : 'border-transparent opacity-60'
                  }`}
                >
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <p className="text-sm uppercase tracking-wider text-primary-500">
            {product.brand || 'Thrift'} {category && `· ${category.name}`}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">
            {product.name}
          </h1>
          <p className="mt-3 text-2xl font-bold text-primary-600">
            {formatIDR(product.selling_price)}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="badge bg-primary-50 text-primary-700 dark:bg-neutral-800 dark:text-primary-400">
              Kondisi: {product.condition}
            </span>
            {product.size && (
              <span className="badge bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                Size: {product.size}
              </span>
            )}
            {product.color && (
              <span className="badge bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                Warna: {product.color}
              </span>
            )}
            {product.material && (
              <span className="badge bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {product.material}
              </span>
            )}
          </div>

          {product.description && (
            <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {product.description}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className={`font-medium ${available ? 'text-success-600' : 'text-error-600'}`}>
              {available ? `Stok: ${product.stock} pcs` : AVAILABILITY_LABELS[availability]}
            </span>
            <span className="text-neutral-400">|</span>
            <span className="text-neutral-500">Kode: {product.product_code}</span>
          </div>

          {/* Quantity */}
          <div className="mt-6 flex items-center gap-4">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Jumlah:</span>
            <div className="flex items-center gap-2 rounded-full border border-neutral-300 px-2 py-1">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="rounded-full p-1 text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <ArrowLeft size={14} className="rotate-90" />
              </button>
              <span className="w-8 text-center text-sm font-medium">{qty}</span>
              <button
                onClick={() => setQty(Math.min(Math.max(1, product.stock), qty + 1))}
                className="rounded-full p-1 text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <ArrowLeft size={14} className="rotate-[-90deg]" />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleAddToCart}
              disabled={!available}
              className="btn-secondary flex-1 disabled:opacity-50"
            >
              <ShoppingBag size={18} /> Tambah Keranjang
            </button>
            <button
              onClick={handleBuyNow}
              disabled={!available}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              Beli Sekarang
            </button>
          </div>

          <button
            onClick={handleWhatsApp}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-success-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-success-600"
          >
            <MessageCircle size={18} /> Tanya via WhatsApp
          </button>

          <div className="mt-3 flex gap-2">
            <button className="btn-ghost flex-1">
              <Heart size={18} /> Wishlist
            </button>
            <button className="btn-ghost flex-1">
              <Share2 size={18} /> Bagikan
            </button>
          </div>

          {/* Trust */}
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
            {trustItems.map((t, i) => (
              <div key={i} className="flex flex-col items-center gap-2 text-center">
                <t.icon size={24} className="text-primary-500" />
                <span className="text-xs text-neutral-600 dark:text-neutral-400">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
