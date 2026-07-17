import { Recycle, Heart, Sparkles, Award } from 'lucide-react';
import { BRAND } from '../lib/constants';

interface Props {
  onNavigate: (page: string) => void;
}

export default function About({ onNavigate }: Props) {
  return (
    <div className="animate-fade-in">
      <section className="relative min-h-[50vh] overflow-hidden">
        <img
          src="https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg"
          alt="About"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-900/80 to-neutral-900/40" />
        <div className="relative mx-auto flex max-w-7xl flex-col justify-center px-4 py-20 sm:px-6 lg:min-h-[50vh] lg:px-8">
          <h1 className="font-serif text-4xl font-bold text-white sm:text-5xl">
            Tentang Sumber Sandang
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">
            {BRAND.tagline} — Misi kami adalah memberi pakaian preloved kehidupan kedua yang bermakna.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Cerita Kami</h2>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Sumber Sandang lahir dari kecintaan terhadap fashion berkelanjutan. Kami percaya bahwa setiap pakaian pantas mendapat kesempatan kedua. Setiap item yang kami jual telah melalui proses kurasi dan inspeksi ketat untuk memastikan kualitas premium yang layak dipakai lagi.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Dari pakaian kasual hingga formal, dari brand lokal hingga internasional — kami menyediakan pilihan thrift terbaik dengan harga yang ramah di kantong. Karena fashion baik tidak harus selalu baru.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Recycle, title: 'Berkelanjutan', desc: 'Fashion ramah lingkungan' },
              { icon: Heart, title: 'Kurasi Penuh Cinta', desc: 'Setiap item dipilih dengan hati' },
              { icon: Sparkles, title: 'Premium Quality', desc: 'Hanya yang terbaik untuk Anda' },
              { icon: Award, title: 'Terpercaya', desc: 'Ribuan pelanggan puas' },
            ].map((v, i) => (
              <div key={i} className="card p-5">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-neutral-800 dark:text-primary-400">
                  <v.icon size={24} />
                </div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{v.title}</h3>
                <p className="text-xs text-neutral-500">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-primary-50 py-16 dark:bg-neutral-900">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl font-bold text-neutral-900 dark:text-neutral-50">Bergabung dengan Gerakan Thrift</h2>
          <p className="mt-4 text-neutral-600 dark:text-neutral-400">
            Setiap pembelian adalah langkah kecil untuk bumi yang lebih baik. Mulai perjalanan thrift-mu hari ini.
          </p>
          <button onClick={() => onNavigate('shop')} className="btn-primary mt-8">
            Lihat Koleksi
          </button>
        </div>
      </section>
    </div>
  );
}
