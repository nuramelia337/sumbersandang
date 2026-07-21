import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PromoBannerSetting, Testimonial } from '../../lib/types';
import { DEFAULT_PROMO_BANNER, loadPromoBanner, loadTestimonials, logActivity, savePromoBanner, storageImageUrl, uploadImage } from '../../lib/business';
import { useAlert } from '../../components/AlertProvider';
import ImageUpload from '../../components/ImageUpload';

const emptyTestimonial = {
  customer_name: '',
  customer_handle: '',
  message: '',
  rating: 5,
  is_active: true,
  sort_order: 0,
};

export default function AdminWebsite() {
  const [banner, setBanner] = useState<PromoBannerSetting>(DEFAULT_PROMO_BANNER);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [testimonialForm, setTestimonialForm] = useState(emptyTestimonial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bannerImage, setBannerImage] = useState<Blob | null>(null);
  const { showAlert, showConfirm } = useAlert();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [promo, quotes] = await Promise.all([loadPromoBanner(), loadTestimonials(true)]);
    setBanner(promo);
    setTestimonials(quotes);
    setLoading(false);
  };

  const saveBanner = async () => {
    setSaving(true);
    let nextBanner = banner;
    try {
      if (bannerImage) {
        const path = await uploadImage(bannerImage, 'banners');
        nextBanner = { ...banner, image_url: storageImageUrl(path) };
      }
    } catch (err) {
      showAlert({ title: 'Upload banner gagal', message: err instanceof Error ? err.message : 'Gagal mengupload gambar banner.', variant: 'error' });
      setSaving(false);
      return;
    }

    const { error } = await savePromoBanner(nextBanner);
    if (error) showAlert({ title: 'Gagal simpan banner', message: error.message, variant: 'error' });
    else {
      setBanner(nextBanner);
      setBannerImage(null);
      await logActivity('website_banner_updated', 'site_settings', undefined, 'Updated promo banner');
    }
    setSaving(false);
  };

  const addTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('testimonials').insert(testimonialForm);
    if (error) showAlert({ title: 'Gagal tambah testimoni', message: error.message, variant: 'error' });
    else {
      await logActivity('testimonial_created', 'testimonial', undefined, `Added testimonial: ${testimonialForm.customer_name}`);
      setTestimonialForm(emptyTestimonial);
      loadData();
    }
  };

  const toggleTestimonial = async (testimonial: Testimonial) => {
    await supabase.from('testimonials').update({ is_active: !testimonial.is_active }).eq('id', testimonial.id);
    await logActivity('testimonial_toggled', 'testimonial', testimonial.id, `Toggled testimonial: ${testimonial.customer_name}`);
    loadData();
  };

  const deleteTestimonial = async (testimonial: Testimonial) => {
    showConfirm({
      title: 'Hapus testimoni?',
      message: `Testimoni ${testimonial.customer_name} akan dihapus.`,
      variant: 'error',
      confirmLabel: 'Hapus',
      onConfirm: async () => {
        const { error } = await supabase.from('testimonials').delete().eq('id', testimonial.id);
        if (error) throw new Error(error.message);
        await logActivity('testimonial_deleted', 'testimonial', testimonial.id, `Deleted testimonial: ${testimonial.customer_name}`);
        setTestimonials((prev) => prev.filter((item) => item.id !== testimonial.id));
        loadData();
      },
    });
  };

  if (loading) {
    return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Tampilan Website</h1>
        <p className="text-sm text-neutral-500">Kelola banner promo dan testimoni pelanggan</p>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold">Banner Promo</h2>
          <button onClick={saveBanner} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={18} />} Simpan Banner
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Judul</label>
            <input value={banner.title} onChange={(e) => setBanner({ ...banner, title: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Label Tombol</label>
            <input value={banner.cta_label} onChange={(e) => setBanner({ ...banner, cta_label: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Halaman Tujuan</label>
            <select value={banner.cta_page} onChange={(e) => setBanner({ ...banner, cta_page: e.target.value })} className="input-field">
              <option value="shop">Koleksi</option>
              <option value="shop:packages">Koleksi - Paket Usaha</option>
              <option value="about">Tentang</option>
              <option value="contact">Kontak</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">URL Gambar Banner</label>
            <input value={banner.image_url} onChange={(e) => setBanner({ ...banner, image_url: e.target.value })} className="input-field" />
          </div>
          <div className="md:col-span-2">
            <ImageUpload
              label="Upload Gambar Banner"
              onImageReady={setBannerImage}
              currentImageUrl={banner.image_url}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Subtitle</label>
            <textarea value={banner.subtitle} onChange={(e) => setBanner({ ...banner, subtitle: e.target.value })} className="input-field" rows={2} />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2">
          <input type="checkbox" checked={banner.is_active} onChange={(e) => setBanner({ ...banner, is_active: e.target.checked })} className="h-4 w-4" />
          <span className="text-sm font-medium">Banner aktif</span>
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-serif text-lg font-bold">Tambah Testimoni</h2>
          <form onSubmit={addTestimonial} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Nama</label>
                <input required value={testimonialForm.customer_name} onChange={(e) => setTestimonialForm({ ...testimonialForm, customer_name: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Handle</label>
                <input value={testimonialForm.customer_handle} onChange={(e) => setTestimonialForm({ ...testimonialForm, customer_handle: e.target.value })} className="input-field" placeholder="@username" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Rating</label>
                <input type="number" min={1} max={5} value={testimonialForm.rating} onChange={(e) => setTestimonialForm({ ...testimonialForm, rating: Number(e.target.value) })} className="input-field" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Urutan</label>
                <input type="number" value={testimonialForm.sort_order} onChange={(e) => setTestimonialForm({ ...testimonialForm, sort_order: Number(e.target.value) })} className="input-field" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Pesan</label>
              <textarea required value={testimonialForm.message} onChange={(e) => setTestimonialForm({ ...testimonialForm, message: e.target.value })} className="input-field" rows={3} />
            </div>
            <button className="btn-primary"><Plus size={18} /> Tambah Testimoni</button>
          </form>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-neutral-200 p-5 dark:border-neutral-800">
            <h2 className="font-serif text-lg font-bold">Daftar Testimoni</h2>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {testimonials.map((testimonial) => (
              <div key={testimonial.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{testimonial.customer_name}</p>
                    <p className="text-xs text-neutral-500">{testimonial.customer_handle || '-'} · {'★'.repeat(testimonial.rating)}</p>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{testimonial.message}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleTestimonial(testimonial)} className={`badge ${testimonial.is_active ? 'bg-success-100 text-success-700' : 'bg-neutral-100 text-neutral-500'}`}>
                      {testimonial.is_active ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <button onClick={() => deleteTestimonial(testimonial)} className="rounded-lg p-2 text-error-600 hover:bg-error-50"><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
