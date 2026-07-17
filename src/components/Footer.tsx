import { Instagram, Mail, MapPin, Phone, MessageCircle } from 'lucide-react';
import { BRAND, WHATSAPP_LINK } from '../lib/constants';

interface Props {
  onNavigate: (page: string) => void;
}

export default function Footer({ onNavigate }: Props) {
  return (
    <footer className="mt-20 border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1">
            <div className="flex items-center gap-3">
              <img
                src={BRAND.logo}
                alt="Sumber Sandang"
                className="h-12 w-12 rounded-full object-cover ring-2 ring-primary-200"
              />
              <div>
                <p className="font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">
                  Sumber Sandang
                </p>
                <p className="text-xs text-primary-600">Premium Thrift Fashion</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {BRAND.tagline}
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
              Jelajahi
            </h3>
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              <li><button onClick={() => onNavigate('home')} className="hover:text-primary-600">Beranda</button></li>
              <li><button onClick={() => onNavigate('shop')} className="hover:text-primary-600">Koleksi</button></li>
              <li><button onClick={() => onNavigate('rules')} className="hover:text-primary-600">Rules Belanja</button></li>
              <li><button onClick={() => onNavigate('about')} className="hover:text-primary-600">Tentang Kami</button></li>
              <li><button onClick={() => onNavigate('contact')} className="hover:text-primary-600">Kontak</button></li>
              <li><button onClick={() => onNavigate('admin')} className="hover:text-primary-600">Admin Panel</button></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
              Kontak
            </h3>
            <ul className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
              <li className="flex items-center gap-2">
                <Phone size={16} className="text-primary-500" />
                <a href={`tel:+${BRAND.whatsapp}`} className="hover:text-primary-600">{BRAND.whatsappDisplay}</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={16} className="text-primary-500" />
                <a href={`mailto:${BRAND.email}`} className="hover:text-primary-600">{BRAND.email}</a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin size={16} className="text-primary-500" />
                <a href={BRAND.mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary-600">Lihat di Google Maps</a>
              </li>
              <li className="flex items-center gap-2">
                <Instagram size={16} className="text-primary-500" />
                <a href={BRAND.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary-600">@{BRAND.instagram}</a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
              WhatsApp Kami
            </h3>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
              Ada pertanyaan? Chat langsung dengan tim kami.
            </p>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-success-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-success-600 hover:shadow-lg"
            >
              <MessageCircle size={18} />
              Chat Sekarang
            </a>
          </div>
        </div>

        <div className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <p className="text-center text-xs text-neutral-500">
            &copy; {new Date().getFullYear()} Sumber Sandang. All rights reserved. {BRAND.tagline}
          </p>
        </div>
      </div>
    </footer>
  );
}
