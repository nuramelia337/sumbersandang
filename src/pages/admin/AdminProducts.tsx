import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatIDR, genProductCode, genBarcode, uploadProductImage } from '../../lib/constants';
import { getProductImageUrl } from '../../lib/imageUtils';
import type { Product, Category } from '../../lib/types';
import ImageUpload from '../../components/ImageUpload';
import { Plus, Edit, Trash2, X, Search, ScanLine, Package, CheckCircle, Loader2 } from 'lucide-react';

type Tab = 'all' | 'ready' | 'sold';

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scanMode, setScanMode] = useState(false);
  const [scanVal, setScanVal] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', category_id: '', brand: '', size: '', color: '', material: '',
    condition: 'Good', description: '', purchase_price: 0, selling_price: 0,
    stock: 0, min_stock: 3, tags: [], is_featured: false, status: 'active',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [prods, cats] = await Promise.all([
      supabase.from('products').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('sort_order'),
    ]);
    setProducts(prods.data || []);
    setCategories(cats.data || []);
    setLoading(false);
  };

  const readyProducts = products.filter((p) => p.stock > 0);
  const soldProducts = products.filter((p) => p.stock <= 0);

  const tabbed = tab === 'ready' ? readyProducts : tab === 'sold' ? soldProducts : products;

  const filtered = tabbed.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.product_code.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode || '').includes(search.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanVal) return;
    const found = products.find((p) => p.barcode === scanVal || p.product_code.toLowerCase() === scanVal.toLowerCase());
    if (found) { openEdit(found); setScanVal(''); setScanMode(false); }
    else alert('Produk tidak ditemukan untuk kode: ' + scanVal);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', category_id: '', brand: '', size: '', color: '', material: '', condition: 'Good', description: '', purchase_price: 0, selling_price: 0, stock: 0, min_stock: 3, tags: [], is_featured: false, status: 'active' });
    setImageBlob(null);
    setShowForm(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ ...p });
    setImageBlob(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const cat = categories.find((c) => c.id === form.category_id);
    const productCode = editing?.product_code || genProductCode(cat?.slug || 'GEN', products.length + 1);
    const barcode = editing?.barcode || genBarcode(productCode);

    let imagePath = editing?.image_path || null;
    if (imageBlob) {
      try {
        imagePath = await uploadProductImage(imageBlob, productCode);
      } catch (err: any) {
        alert('Upload foto gagal: ' + err.message);
        setSaving(false);
        return;
      }
    }

    const payload = {
      ...form,
      product_code: productCode,
      barcode,
      purchase_price: Number(form.purchase_price),
      selling_price: Number(form.selling_price),
      stock: Number(form.stock),
      min_stock: Number(form.min_stock),
      image_path: imagePath,
      tags: Array.isArray(form.tags) ? form.tags : String(form.tags).split(',').filter(Boolean),
      updated_at: new Date().toISOString(),
    };
    delete payload.images;

    if (editing) {
      await supabase.from('products').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('products').insert(payload);
      if (Number(form.stock) > 0) {
        const newProd = await supabase.from('products').select('id').eq('product_code', productCode).maybeSingle();
        if (newProd.data) {
          await supabase.from('inventory_movements').insert({
            product_id: newProd.data.id, type: 'in', quantity: Number(form.stock),
            quantity_before: 0, quantity_after: Number(form.stock), notes: 'Initial stock',
          });
        }
      }
    }

    await supabase.from('activity_logs').insert({
      action: editing ? 'product_updated' : 'product_created',
      entity_type: 'product',
      description: `${editing ? 'Updated' : 'Created'} product: ${form.name}`,
    });

    setShowForm(false);
    setSaving(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus produk ini?')) return;
    await supabase.from('products').delete().eq('id', id);
    loadData();
  };

  const tabs: { val: Tab; label: string; count: number; icon: any }[] = [
    { val: 'all', label: 'Semua', count: products.length, icon: Package },
    { val: 'ready', label: 'Ready', count: readyProducts.length, icon: CheckCircle },
    { val: 'sold', label: 'Sold Out', count: soldProducts.length, icon: X },
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

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button key={t.val} onClick={() => setTab(t.val)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.val ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
            }`}>
            <t.icon size={16} /> {t.label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${tab === t.val ? 'bg-white/20' : 'bg-neutral-200 dark:bg-neutral-700'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk, kode, barcode..." className="input-field pl-10" />
        </div>
        <button onClick={() => setScanMode(!scanMode)} className={`btn-secondary ${scanMode ? 'bg-primary-50 border-primary-300' : ''}`}>
          <ScanLine size={16} /> Scan
        </button>
      </div>

      {scanMode && (
        <form onSubmit={handleScan} className="flex gap-2">
          <input autoFocus type="text" value={scanVal} onChange={(e) => setScanVal(e.target.value)} placeholder="Scan barcode / ketik kode produk..." className="input-field" />
          <button type="submit" className="btn-primary whitespace-nowrap">Cari Produk</button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-40 items-center justify-center text-neutral-400">Tidak ada produk</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Produk</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Kode</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Harga</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Stok</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-300">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={getProductImageUrl(p)} alt={p.name} className="h-10 w-10 rounded-lg object-contain bg-neutral-50" />
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-neutral-100">{p.name}</p>
                          <p className="text-xs text-neutral-500">{p.brand || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{p.product_code}</td>
                    <td className="px-4 py-3 font-semibold text-primary-600">{formatIDR(p.selling_price)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${p.stock <= 0 ? 'bg-error-100 text-error-700' : p.stock <= p.min_stock ? 'bg-warning-100 text-warning-700' : 'bg-success-100 text-success-700'}`}>{p.stock}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${p.stock > 0 ? 'bg-success-100 text-success-700' : 'bg-neutral-200 text-neutral-500'}`}>
                        {p.stock > 0 ? 'Ready' : 'Sold'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-primary-600 dark:hover:bg-neutral-700"><Edit size={16} /></button>
                        <button onClick={() => handleDelete(p.id)} className="rounded-lg p-2 text-neutral-500 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-900/30"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">{editing ? 'Edit Produk' : 'Tambah Produk'}</h2>
              <button onClick={() => !saving && setShowForm(false)} className="rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <ImageUpload
                onImageReady={(blob) => setImageBlob(blob)}
                currentImagePath={editing?.image_path}
                currentImageUrl={editing?.images?.[0]}
              />

              <div className="rounded-lg bg-primary-50 p-3 dark:bg-neutral-800">
                <p className="text-xs text-neutral-500">Kode Produk & Barcode (otomatis saat simpan):</p>
                <p className="mt-1 font-mono text-sm font-bold text-primary-600">
                  {editing?.product_code || genProductCode(categories.find((c) => c.id === form.category_id)?.slug || 'GEN', products.length + 1)}
                  {editing?.barcode && <span className="ml-3 text-neutral-400">{editing.barcode}</span>}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Nama Produk</label>
                  <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Kategori</label>
                  <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="input-field">
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
                  <input type="text" value={form.size || ''} onChange={(e) => setForm({ ...form, size: e.target.value })} className="input-field" placeholder="S, M, L, XL" />
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
                  <label className="mb-1 block text-sm font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-field">
                    <option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Harga Beli</label>
                  <input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Harga Jual</label>
                  <input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Stok</label>
                  <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Min Stok</label>
                  <input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} className="input-field" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Deskripsi</label>
                <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={3} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Tags (pisahkan dengan koma)</label>
                <input type="text" value={Array.isArray(form.tags) ? form.tags.join(',') : form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').filter(Boolean) })} className="input-field" placeholder="vintage, casual, summer" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="h-4 w-4 rounded" />
                <span className="text-sm font-medium">Featured Product</span>
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
