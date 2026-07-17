import { useEffect, useState } from 'react';
import { Boxes, CheckCircle, Edit, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatIDR } from '../../lib/constants';
import ImageUpload from '../../components/ImageUpload';
import CurrencyInput from '../../components/CurrencyInput';
import { useAlert } from '../../components/AlertProvider';
import type { BusinessPackage, Product, ProductAvailabilityStatus } from '../../lib/types';
import {
  AVAILABILITY_LABELS,
  computePackageCogs,
  itemStatusColor,
  loadPackages,
  logActivity,
  packageImageUrl,
  productAvailabilityFromStock,
  uploadImage,
} from '../../lib/business';

const emptyForm = {
  name: '',
  description: '',
  price: 0,
  is_featured: false,
  availability_status: 'ready' as ProductAvailabilityStatus,
  status: 'active',
  internal_notes: '',
  product_ids: [] as string[],
};

export default function AdminPackages() {
  const [packages, setPackages] = useState<BusinessPackage[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BusinessPackage | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const { showAlert, showConfirm } = useAlert();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [pkgs, prods] = await Promise.all([
      loadPackages(true),
      supabase.from('products').select('*').neq('availability_status', 'sold').order('name'),
    ]);
    setPackages(pkgs);
    setProducts((prods.data || []).map((p) => ({ ...p, availability_status: productAvailabilityFromStock(p) })));
    setLoading(false);
  };

  const filtered = packages.filter((pkg) => {
    const q = search.toLowerCase();
    return !q || pkg.name.toLowerCase().includes(q) || pkg.package_code.toLowerCase().includes(q);
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setCoverBlob(null);
    setShowForm(true);
  };

  const openEdit = (pkg: BusinessPackage) => {
    setEditing(pkg);
    setForm({
      ...emptyForm,
      ...pkg,
      product_ids: pkg.business_package_items?.map((item) => item.product_id) || [],
      internal_notes: pkg.internal_notes || '',
    });
    setCoverBlob(null);
    setShowForm(true);
  };

  const toggleProduct = (id: string) => {
    const ids = form.product_ids as string[];
    setForm({ ...form, product_ids: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] });
  };

  const savePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.product_ids.length === 0) {
      showAlert({ title: 'Produk belum dipilih', message: 'Pilih minimal satu produk untuk paket.', variant: 'warning' });
      return;
    }
    setSaving(true);
    let coverPath = editing?.cover_image_path || null;
    if (coverBlob) {
      try {
        coverPath = await uploadImage(coverBlob, 'packages');
      } catch (err: any) {
        showAlert({ title: 'Upload cover gagal', message: err.message, variant: 'error' });
        setSaving(false);
        return;
      }
    }

    const payload = {
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      cover_image_path: coverPath,
      is_featured: Boolean(form.is_featured),
      availability_status: form.availability_status,
      status: form.availability_status === 'sold' ? 'sold_out' : form.status,
      internal_notes: form.internal_notes || null,
      updated_at: new Date().toISOString(),
    };

    const result = editing
      ? await supabase.from('business_packages').update(payload).eq('id', editing.id).select('id').single()
      : await supabase.from('business_packages').insert(payload).select('id').single();

    if (result.error || !result.data) {
      showAlert({ title: 'Gagal menyimpan paket', message: result.error?.message || 'Unknown error', variant: 'error' });
      setSaving(false);
      return;
    }

    const packageId = result.data.id;
    await supabase.from('business_package_items').delete().eq('package_id', packageId);
    await supabase.from('business_package_items').insert(form.product_ids.map((product_id: string) => ({ package_id: packageId, product_id })));
    await logActivity(editing ? 'package_updated' : 'package_created', 'business_package', packageId, `${editing ? 'Updated' : 'Created'} package: ${form.name}`);
    setShowForm(false);
    setSaving(false);
    loadData();
  };

  const deletePackage = async (pkg: BusinessPackage) => {
    showConfirm({
      title: 'Hapus paket?',
      message: `Paket ${pkg.name} akan dihapus dari katalog.`,
      variant: 'error',
      confirmLabel: 'Hapus',
      onConfirm: async () => {
        const { error } = await supabase.from('business_packages').delete().eq('id', pkg.id);
        if (error) {
          showAlert({ title: 'Gagal hapus paket', message: error.message, variant: 'error' });
          return;
        }
        await logActivity('package_deleted', 'business_package', pkg.id, `Deleted package: ${pkg.name}`);
        loadData();
      },
    });
  };

  const markSold = async (pkg: BusinessPackage) => {
    showConfirm({
      title: 'Tandai paket Sold?',
      message: `Paket ${pkg.name} dan semua produk di dalamnya akan menjadi Sold.`,
      variant: 'warning',
      confirmLabel: 'Tandai Sold',
      onConfirm: async () => {
        await supabase.from('business_packages').update({ availability_status: 'sold', status: 'sold_out', updated_at: new Date().toISOString() }).eq('id', pkg.id);
        const productIds = pkg.business_package_items?.map((item) => item.product_id) || [];
        if (productIds.length > 0) {
          await supabase.from('products').update({ availability_status: 'sold', status: 'sold_out', stock: 0, updated_at: new Date().toISOString() }).in('id', productIds);
        }
        await logActivity('package_marked_sold', 'business_package', pkg.id, `Marked package sold: ${pkg.name}`);
        loadData();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Paket Usaha</h1>
          <p className="text-sm text-neutral-500">{packages.length} paket terdaftar</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={18} /> Buat Paket</button>
      </div>

      <div className="relative max-w-sm">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari paket..." className="input-field pl-10" />
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-40 items-center justify-center text-neutral-400">Belum ada paket</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((pkg) => (
            <div key={pkg.id} className="card overflow-hidden">
              <div className="flex gap-4 p-4">
                <img src={packageImageUrl(pkg)} alt={pkg.name} className="h-28 w-32 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-primary-600">{pkg.package_code}</span>
                    <span className={`badge ${itemStatusColor(pkg.availability_status)}`}>{AVAILABILITY_LABELS[pkg.availability_status]}</span>
                    {pkg.is_featured && <span className="badge bg-accent-100 text-accent-700">Featured</span>}
                  </div>
                  <h2 className="mt-2 font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">{pkg.name}</h2>
                  <p className="text-sm font-semibold text-primary-600">{formatIDR(pkg.price)}</p>
                  <p className="text-xs text-neutral-500">{pkg.business_package_items?.length || 0} produk · HPP {formatIDR(computePackageCogs(pkg))}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => openEdit(pkg)} className="btn-secondary px-4 py-2"><Edit size={15} /> Edit</button>
                    {pkg.availability_status !== 'sold' && <button onClick={() => markSold(pkg)} className="btn-secondary px-4 py-2 text-success-700"><CheckCircle size={15} /> Sold</button>}
                    <button onClick={() => deletePackage(pkg)} className="btn-secondary px-4 py-2 text-error-600"><Trash2 size={15} /> Hapus</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold">{editing ? 'Edit Paket' : 'Buat Paket Usaha'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <form onSubmit={savePackage} className="space-y-4">
              <ImageUpload label="Foto Cover Paket" onImageReady={setCoverBlob} currentImagePath={editing?.cover_image_path} currentImageUrl={editing?.cover_image_url} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Nama Paket</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Harga Paket</label>
                  <CurrencyInput required value={form.price} onValueChange={(value) => setForm({ ...form, price: value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Status Paket</label>
                  <select value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value })} className="input-field">
                    <option value="ready">Ready</option>
                    <option value="reserved">Reserved</option>
                    <option value="sold">Sold</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Status Website</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input-field">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Deskripsi</label>
                <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="input-field" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Catatan Internal</label>
                <textarea value={form.internal_notes || ''} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} rows={2} className="input-field" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="h-4 w-4" />
                <span className="text-sm font-medium">Paket unggulan</span>
              </label>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Boxes size={18} className="text-primary-600" />
                  <label className="text-sm font-semibold">Produk dalam paket</label>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-neutral-200 p-2 dark:border-neutral-700">
                  {products.map((product) => {
                    const checked = form.product_ids.includes(product.id);
                    return (
                      <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-neutral-50 dark:hover:bg-neutral-800">
                        <input type="checkbox" checked={checked} onChange={() => toggleProduct(product.id)} className="h-4 w-4" />
                        <span className="flex-1 text-sm">{product.name}</span>
                        <span className="font-mono text-xs text-neutral-500">{product.product_code}</span>
                        <span className={`badge ${itemStatusColor(product.availability_status)}`}>{AVAILABILITY_LABELS[product.availability_status]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan...</> : 'Simpan Paket'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
