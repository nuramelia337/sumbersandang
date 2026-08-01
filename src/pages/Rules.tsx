import { CheckCircle, Clock, PackageCheck, Truck } from 'lucide-react';

const rules = [
  'Sistem mix diperbolehkan (bebas memilih berbagai produk dalam satu pesanan).',
  'Keep barang tanpa konfirmasi admin maksimal 3 hari.',
  'Keep barang yang sudah melakukan pembayaran (DP atau pelunasan) maksimal 7 hari.',
  'Barang yang sudah dibeli tidak dapat ditukar atau dikembalikan (No Return & No Refund), kecuali terjadi kesalahan dari pihak toko.',
  'Semua barang telah dicek sebelum dikirim.',
  'Warna produk dapat sedikit berbeda karena pencahayaan atau layar perangkat.',
  'Pengiriman tersedia melalui JNT, SPX, Maxim, atau Ambil Sendiri.',
  'Pesanan diproses setelah pembayaran dikonfirmasi admin.',
  'Pembeli wajib mengisi data lengkap (Nama, Alamat, Instagram, dan Nomor WhatsApp).',
  'Dengan melakukan checkout, pembeli dianggap telah membaca dan menyetujui seluruh Rules Belanja.',
];

export default function Rules() {
  return (
    <div className="animate-fade-in">
      <section className="bg-neutral-950 px-4 py-16 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm uppercase tracking-widest text-secondary-300">Sumber Sandang</p>
          <h1 className="mt-3 font-serif text-4xl font-bold">Rules Belanja</h1>
          <p className="mt-4 max-w-2xl text-white/70">Mohon baca aturan belanja sebelum checkout agar proses keep, pembayaran, dan pengiriman berjalan rapi.</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Clock, label: 'Keep 3 hari' },
            { icon: PackageCheck, label: 'No Return & Refund' },
            { icon: Truck, label: 'JNT, SPX, Maxim' },
          ].map((item) => (
            <div key={item.label} className="card p-5 text-center">
              <item.icon className="mx-auto h-8 w-8 text-primary-600" />
              <p className="mt-3 text-sm font-semibold">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="card mt-8 p-6">
          <div className="space-y-4">
            {rules.map((rule, index) => (
              <div key={rule} className="flex gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-success-600" />
                <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  <span className="font-semibold">{index + 1}.</span> {rule}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
