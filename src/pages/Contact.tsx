import { useState } from 'react';
import { Phone, Mail, MapPin, Instagram, MessageCircle, Send } from 'lucide-react';
import { BRAND, WHATSAPP_LINK, waMessage } from '../lib/constants';

export default function Contact() {
  const [form, setForm] = useState({ name: '', message: '' });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const msg = `Halo Sumber Sandang! Saya ${form.name}.\n\n${form.message}`;
    window.open(waMessage(msg), '_blank');
    setSent(true);
  };

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Hubungi Kami</h1>
        <p className="mt-2 text-neutral-500">Kami siap membantu Anda</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          {[
            { icon: Phone, title: 'WhatsApp / Telepon', value: BRAND.whatsappDisplay, href: WHATSAPP_LINK, color: 'bg-success-500' },
            { icon: Mail, title: 'Email', value: BRAND.email, href: `mailto:${BRAND.email}`, color: 'bg-primary-500' },
            { icon: MapPin, title: 'Lokasi Toko', value: 'Lihat di Google Maps', href: BRAND.mapsUrl, color: 'bg-accent-500' },
            { icon: Instagram, title: 'Instagram', value: `@${BRAND.instagram}`, href: '#', color: 'bg-secondary-500' },
          ].map((c, i) => (
            <a
              key={i}
              href={c.href}
              target={c.href.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="card flex items-center gap-4 p-5 hover:shadow-md"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${c.color} text-white`}>
                <c.icon size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{c.title}</p>
                <p className="text-sm text-neutral-500">{c.value}</p>
              </div>
            </a>
          ))}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl bg-success-500 p-5 text-white transition-all hover:bg-success-600"
          >
            <MessageCircle size={24} />
            <span className="font-semibold">Chat Langsung di WhatsApp</span>
          </a>
        </div>

        <div className="card p-6">
          <h2 className="mb-4 font-serif text-xl font-bold text-neutral-900 dark:text-neutral-50">Kirim Pesan</h2>
          {sent ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-100 text-success-600">
                <Send size={32} />
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Pesan akan dikirim via WhatsApp</p>
              <button onClick={() => setSent(false)} className="btn-ghost">Kirim lagi</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Nama</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder="Nama Anda"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Pesan</label>
                <textarea
                  required
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="input-field"
                  rows={5}
                  placeholder="Tulis pesan Anda..."
                />
              </div>
              <button type="submit" className="btn-primary w-full">
                <Send size={18} /> Kirim via WhatsApp
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
