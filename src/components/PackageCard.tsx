import { Boxes, ShoppingBag } from 'lucide-react';
import { AVAILABILITY_LABELS, itemStatusColor, packageImageUrl, packageIsAvailable } from '../lib/business';
import { formatIDR } from '../lib/constants';
import { useCart } from '../lib/cart';
import type { BusinessPackage } from '../lib/types';

interface Props {
  pkg: BusinessPackage;
}

export default function PackageCard({ pkg }: Props) {
  const { addPackage } = useCart();
  const available = packageIsAvailable(pkg);
  const itemCount = pkg.business_package_items?.length || 0;

  return (
    <div className="group card overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        <img src={packageImageUrl(pkg)} alt={pkg.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex gap-2">
          {pkg.is_featured && <span className="badge bg-accent-400 text-secondary-950">Featured</span>}
          <span className={`badge ${itemStatusColor(pkg.availability_status)}`}>{AVAILABILITY_LABELS[pkg.availability_status]}</span>
        </div>
        {!available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-neutral-900">
              {pkg.availability_status === 'reserved' ? 'Reserved' : 'Sold'}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-primary-600">
          <Boxes size={14} /> Paket Usaha
        </div>
        <h3 className="font-serif text-base font-semibold text-neutral-900 dark:text-neutral-100">{pkg.name}</h3>
        {pkg.description && <p className="mt-1 text-xs text-neutral-500">{pkg.description}</p>}
        <p className="mt-2 text-xs text-neutral-500">{itemCount} produk dalam paket</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-lg font-bold text-primary-600">{formatIDR(pkg.price)}</p>
          <button
            onClick={() => addPackage(pkg)}
            disabled={!available}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            aria-label="Tambah paket ke keranjang"
          >
            <ShoppingBag size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
