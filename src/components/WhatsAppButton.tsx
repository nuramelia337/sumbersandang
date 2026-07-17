import { MessageCircle } from 'lucide-react';
import { WHATSAPP_LINK } from '../lib/constants';

export default function WhatsAppButton() {
  return (
    <a
      href={WHATSAPP_LINK}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-success-500 text-white shadow-lg shadow-success-500/30 transition-all hover:scale-110 hover:bg-success-600 animate-float"
      aria-label="WhatsApp"
    >
      <MessageCircle size={28} />
      <span className="absolute -top-1 -right-1 flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75"></span>
        <span className="relative inline-flex h-3 w-3 rounded-full bg-success-500"></span>
      </span>
    </a>
  );
}
