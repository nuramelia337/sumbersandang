import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatIDR, genBarcode, uploadProductImages } from '../../lib/constants';
import { getProductImageUrl } from '../../lib/imageUtils';
import type { Category, Product, ProductAvailabilityStatus, StorageLocation } from '../../lib/types';
import ImageUpload from '../../components/ImageUpload';
import CurrencyInput from '../../components/CurrencyInput';
import { useAlert } from '../../components/AlertProvider';
import {
  AVAILABILITY_LABELS,
  itemStatusColor,
  logActivity,
  normalizeStorageLocation,
  PRODUCT_CATEGORY_SLUGS,
  productAvailabilityFromStock,
  STORAGE_LOCATIONS,
  STORAGE_LOCATION_LABELS,
} from '../../lib/business';
import { Plus, Edit, Trash2, X, Search, Package, CheckCircle, Loader2, Clock, MapPin } from 'lucide-react';

type Tab = 'all' | ProductAvailabilityStatus;

const emptyForm = {
  name: '',
  product_code: '',
  category_id: '',
  brand: '',
  size: '',
  color: '',
  material: '',
  condition: 'Good',
  description: '',
  purchase_price: 0,
  selling_price: 0,
  stock: 1,
  min_stock: 1,
  is_featured: false,
  status: 'active',
  availability_status: 'ready' as ProductAvailabilityStatus,
  storage_location: 'keranjang_1' as StorageLocation,
  internal_notes: '',
};

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState<'all' | StorageLocation>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [colorFilter, setColorFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);
  const { showAlert, showConfirm } = useAlert();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [prods, cats] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('sort_order'),
    ]);
    setProducts((prods.data || []).map((p) => ({ ...p, availability_status: productAvailabilityFromStock(p) })));
    setCategories((cats.data || []).filter((cat) => PRODUCT_CATEGORY_SLUGS.includes(cat.slug as any)));
    setLoading(false);
  };

  const counts = {
    all: products.length,
    ready: products.filter((p) => productAvailabilityFromStock(p) === 'ready').length,
    reserved: products.filter((p) => productAvailabilityFromStock(p) === 'reserved').length,
    sold: products.filter((p) => productAvailabilityFromStock(p) === 'sold').length,
  };

  const filtered = products.filter((p) => {
    const availability = productAvailabilityFromStock(p);
    const matchTab = tab === 'all' || availability === tab;
    const matchLocation = locationFilter === 'all' || p.storage_location === locationFilter;
    const matchCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
    const matchSize = sizeFilter === 'all' || (p.size || '').toLowerCase() === sizeFilter;
    const matchColor = colorFilter === 'all' || (p.color || '').toLowerCase() === colorFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.product_code.toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.internal_notes || '').toLowerCase().includes(q);
    return matchTab && matchLocation && matchCategory && matchSize && matchColor && matchSearch;
  });

  const sizes = Array.from(new Set(products.map((p) => (p.size || '').trim().toLowerCase()).filter(Boolean)));
  const colors = Array.from(new Set(products.map((p) => (p.color || '').trim().toLowerCase()).filter(Boolean)));

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setImageFiles([]);
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    const availability = productAvailabilityFromStock(p);
    setEditing(p);
    setForm({
      ...emptyForm,
      ...p,
      status: p.status === 'sold_out' && availability !== 'sold' ? 'active' : p.status,
      availability_status: availability,
      storage_location: normalizeStorageLocation(p.storage_location),
      internal_notes: p.internal_notes || '',
    });
    setImageFiles([]);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const productCode = String(form.product_code || '').trim().toUpperCase();
    if (!productCode) {
      showAlert({ title: 'Kode produk belum diisi', message: 'Masukkan kode produk manual sebelum menyimpan.', variant: 'warning' });
      setSaving(false);
      return;
    }
    let images = editing?.images || [];
    let thumbnailPath = editing?.thumbnail_path || null;
    if (imageFiles.length > 0) {
      try {
        const uploaded = await uploadProductImages(imageFiles, productCode);
        images = uploaded.images;
        thumbnailPath = uploaded.thumbnailPath;
      } catch (err: any) {
        showAlert({ title: 'Upload foto gagal', message: err.message, variant: 'error' });
        setSaving(false);
        return;
      }
    }

    const availability = form.availability_status as ProductAvailabilityStatus;
    const normalizedStock = availability === 'ready' ? 1 : 0;
    const websiteStatus = availability === 'sold'
      ? 'sold_out'
      : form.status === 'inactive'
        ? 'inactive'
        : 'active';
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      brand: form.brand || null,
      size: form.size || null,
      color: form.color || null,
      material: form.material || null,
      condition: form.condition,
      description: form.description || null,
      purchase_price: Number(form.purchase_price),
      selling_price: Number(form.selling_price),
      stock: normalizedStock,
      min_stock: 1,
      images,
      image_path: images[0] || editing?.image_path || null,
      thumbnail_path: thumbnailPath,
      tags: [],
      is_featured: Boolean(form.is_featured),
      status: websiteStatus,
      availability_status: availability,
      storage_location: form.storage_location,
      internal_notes: form.internal_notes || null,
      product_code: productCode,
      barcode: genBarcode(productCode),
      updated_at: new Date().toISOString(),
    };

    const result = editing
      ? await supabase.from('products').update(payload).eq('id', editing.id)
      : await supabase.from('products').insert(payload);

    if (result.error) {
      showAlert({ title: 'Gagal menyimpan produk', message: result.error.message, variant: 'error' });
      setSaving(false);
      return;
    }

    if (!editing && normalizedStock > 0) {
      const { data: newProd } = await supabase.from('products').select('id').eq('product_code', productCode).maybeSingle();
      if (newProd) {
        await supabase.from('inventory_movements').insert({
          product_id: newProd.id,
          type: 'in',
          quantity: normalizedStock,
          quantity_before: 0,
          quantity_after: normalizedStock,
          notes: 'Initial stock',
        });
      }
    }

    await logActivity(editing ? 'product_updated' : 'product_created', 'product', editing?.id, `${editing ? 'Updated' : 'Created'} product: ${form.name}`);
    setShowForm(false);
    setSaving(false);
    loadData();
  };

  const handleDelete = async (product: Product) => {
    showConfirm({
      title: 'Hapus produk?',
      message: `Produk ${product.name} akan dihapus dari katalog.`,
      variant: 'error',
      confirmLabel: 'Hapus',
      onConfirm: async () => {
        const { error: packageItemsError } = await supabase.from('business_package_items').delete().eq('product_id', product.id);
        if (packageItemsError) throw new Error(packageItemsError.message);

        const { error: orderItemsError } = await supabase.from('order_items').update({ product_id: null }).eq('product_id', product.id);
        if (orderItemsError) throw new Error(orderItemsError.message);

        const { error: movementsError } = await supabase.from('inventory_movements').delete().eq('product_id', product.id);
        if (movementsError) throw new Error(movementsError.message);

        const { error: productError } = await supabase.from('products').delete().eq('id', product.id);
        if (productError) throw new Error(productError.message);

        await logActivity('product_deleted', 'product', product.id, `Deleted product: ${product.name}`);
        setProducts((prev) => prev.filter((item) => item.id !== product.id));
        loadData();
      },
    });
  };

  const markSold = (product: Product) => {
    showConfirm({
      title: 'Tandai Sold?',
      message: `${product.name} akan pindah ke Sold Out dan stok menjadi 0.`,
      variant: 'warning',
      confirmLabel: 'Tandai Sold',
      onConfirm: async () => {
        const { error } = await supabase.from('products').update({
          availability_status: 'sold',
          status: 'sold_out',
          stock: 0,
          updated_at: new Date().toISOString(),
        }).eq('id', product.id);
        if (error) {
          showAlert({ title: 'Gagal mengubah status', message: error.message, variant: 'error' });
          return;
        }
        await logActivity('product_marked_sold', 'product', product.id, `Marked sold: ${product.name}`);
        loadData();
      },
    });
  };

  const tabs: { val: Tab; label: string; count: number; icon: any }[] = [
    { val: 'all', label: 'Semua', count: counts.all, icon: Package },
    { val: 'ready', label: 'Ready', count: counts.ready, icon: CheckCircle },
    { val: 'reserved', label: 'Reserved', count: counts.reserved, icon: Clock },
    { val: 'sold', label: 'Sold', count: counts.sold, icon: X },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Produk</h1>
          <p className="text-sm text-neutral-500">{products.length} produk terdaftar</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={18} /> Tambah Produk
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.val} onClick={() => setTab(t.val)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t.val ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'}`}>
            <t.icon size={16} /> {t.label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${tab === t.val ? 'bg-white/20' : 'bg-neutral-200 dark:bg-neutral-700'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk, kode, catatan..." className="input-field pl-10" />
        </div>
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value as any)} className="input-field max-w-[180px]">
          <option value="all">Semua Lokasi</option>
          {STORAGE_LOCATIONS.map((loc) => <option key={loc.value} value={loc.value}>{loc.label}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input-field max-w-[190px]">
          <option value="all">Semua Kategori</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)} className="input-field max-w-[150px]">
          <option value="all">Semua Ukuran</option>
          {sizes.map((size) => <option key={size} value={size}>{size.toUpperCase()}</option>)}
        </select>
        <select value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} className="input-field max-w-[150px]">
          <option value="all">Semua Warna</option>
          {colors.map((color) => <option key={color} value={color}>{color}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-40 items-center justify-center text-neutral-400">Tidak ada produk</div>
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {filtered.map((p) => {
            const availability = productAvailabilityFromStock(p);
            return (
              <div key={p.id} className="card p-4">
                <div className="flex gap-3">
                  <img src={getProductImageUrl(p)} alt={p.name} loading="lazy" decoding="async" className="h-20 w-20 shrink-0 rounded-xl bg-neutral-50 object-contain" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-primary-600">{p.product_code}</span>
                      <span className={`badge ${itemStatusColor(availability)}`}>{AVAILABILITY_LABELS[availability]}</span>
                    </div>
                    <h2 className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{p.name}</h2>
                    <p className="text-xs text-neutral-500">{p.brand || '-'} {p.internal_notes ? '- Ada catatan' : ''}</p>
                    <p className="mt-1 text-sm font-bold text-primary-600">{formatIDR(p.selling_price)}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-neutral-500">
                      <MapPin size={13} /> {STORAGE_LOCATION_LABELS[normalizeStorageLocation(p.storage_location)]}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => openEdit(p)} className="btn-secondary px-4 py-2">
                    <Edit size={16} /> Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(p)} className="inline-flex items-center justify-center gap-2 rounded-full bg-error-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-error-700">
                    <Trash2 size={16} /> Hapus
                  </button>
                  {availability !== 'sold' && (
                    <button type="button" onClick={() => markSold(p)} className="btn-secondary col-span-2 px-4 py-2 text-success-700">
                      <CheckCircle size={16} /> Tandai Sold
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Produk</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Kode</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Harga</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Lokasi</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-300">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filtered.map((p) => {
                  const availability = productAvailabilityFromStock(p);
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={getProductImageUrl(p)} alt={p.name} loading="lazy" decoding="async" className="h-12 w-12 rounded-lg bg-neutral-50 object-contain" />
                          <div>
                            <p className="font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                            <p className="text-xs text-neutral-500">{p.brand || '-'} {p.internal_notes ? '· Ada catatan' : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">{p.product_code}</td>
                      <td className="px-4 py-3 font-semibold text-primary-600">{formatIDR(p.selling_price)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                          <MapPin size={13} /> {STORAGE_LOCATION_LABELS[normalizeStorageLocation(p.storage_location)]}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className={`badge ${itemStatusColor(availability)}`}>{AVAILABILITY_LABELS[availability]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(p)} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary-600 dark:hover:bg-neutral-700"><Edit size={16} /></button>
                          {availability !== 'sold' && <button onClick={() => markSold(p)} className="rounded-lg px-2 py-1 text-xs font-semibold text-success-700 hover:bg-success-50 dark:hover:bg-success-900/30">Tandai Sold</button>}
                          <button onClick={() => handleDelete(p)} className="rounded-lg p-2 text-neutral-500 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/30"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">{editing ? 'Edit Produk' : 'Tambah Produk'}</h2>
              <button onClick={() => !saving && setShowForm(false)} className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <ImageUpload multiple onImagesReady={setImageFiles} currentImages={editing?.images?.length ? editing.images : editing?.image_path ? [editing.image_path] : []} />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Kode Produk</label>
                  <input required type="text" value={form.product_code || ''} onChange={(e) => setForm({ ...form, product_code: e.target.value.toUpperCase() })} className="input-field" placeholder="Contoh: SS001" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Nama Produk</label>
                  <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Kategori</label>
                  <select value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="input-field">
                    <option value="">Pilih kategori</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Brand</label>
                  <input type="text" value={form.brand || ''} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Size</label>
                  <input type="text" value={form.size || ''} onChange={(e) => setForm({ ...form, size: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Warna</label>
                  <input type="text" value={form.color || ''} onChange={(e) => setForm({ ...form, color: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Material</label>
                  <input type="text" value={form.material || ''} onChange={(e) => setForm({ ...form, material: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Kondisi</label>
                  <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="input-field">
                    <option>Like New</option><option>Excellent</option><option>Good</option><option>Fair</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Status Produk</label>
                  <select value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value })} className="input-field">
                    <option value="ready">Ready</option>
                    <option value="reserved">Reserved</option>
                    <option value="sold">Sold</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Lokasi Penyimpanan</label>
                  <select value={form.storage_location} onChange={(e) => setForm({ ...form, storage_location: e.target.value })} className="input-field">
                    {STORAGE_LOCATIONS.map((loc) => <option key={loc.value} value={loc.value}>{loc.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Status Website</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-field">
                    <option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Harga Beli</label>
                  <CurrencyInput value={form.purchase_price} onValueChange={(value) => setForm({ ...form, purchase_price: value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Harga Jual</label>
                  <CurrencyInput required value={form.selling_price} onValueChange={(value) => setForm({ ...form, selling_price: value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Stok</label>
                  <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-2.5 text-sm text-secondary-800 dark:border-secondary-800 dark:bg-secondary-950 dark:text-primary-100">
                    {form.availability_status === 'ready' ? 'Otomatis 1 item' : 'Otomatis 0 item'}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Deskripsi</label>
                <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Catatan Internal Produk</label>
                <textarea value={form.internal_notes || ''} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} className="input-field" rows={2} />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="h-4 w-4 rounded" />
                <span className="text-sm font-medium">Produk Unggulan</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan...</> : editing ? 'Simpan' : 'Tambah'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="btn-secondary">Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
