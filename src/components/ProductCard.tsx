import { ShoppingBag } from 'lucide-react';
import { useCart } from '../lib/cart';
import { formatIDR } from '../lib/constants';
import { getProductImageUrl } from '../lib/imageUtils';
import type { Product } from '../lib/types';

interface Props {
  product: Product;
  onClick: () => void;
}

export default function ProductCard({ product, onClick }: Props) {
  const { addItem } = useCart();
  const img = getProductImageUrl(product);

  const conditionColors: Record<string, string> = {
    'Like New': 'bg-success-100 text-success-700',
    Excellent: 'bg-primary-100 text-primary-700',
    Good: 'bg-warning-100 text-warning-700',
    Fair: 'bg-neutral-100 text-neutral-600',
  };

  return (
    <div onClick={onClick} className="group card cursor-pointer overflow-hidden">
      <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100">
        <img
          src={img}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex gap-2">
          {product.is_featured && <span className="badge bg-accent-500 text-white">Featured</span>}
          <span className={`badge ${conditionColors[product.condition] || conditionColors.Good}`}>{product.condition}</span>
        </div>
        <div className="absolute right-3 top-3">
          {product.stock > 0 ? (
            <span className="badge bg-success-500 text-white">Ready</span>
          ) : (
            <span className="badge bg-neutral-900 text-white">Sold</span>
          )}
        </div>
        {product.stock <= 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-neutral-900">Sold Out</span>
          </div>
        )}
        {product.stock > 0 && product.stock <= product.min_stock && (
          <div className="absolute bottom-3 left-3">
            <span className="badge bg-warning-500 text-white">Sisa {product.stock}</span>
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); addItem(product); }}
          disabled={product.stock <= 0}
          className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-primary-600 opacity-0 shadow-lg transition-all duration-300 hover:bg-primary-600 hover:text-white group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShoppingBag size={18} />
        </button>
      </div>
      <div className="p-4">
        <p className="text-xs uppercase tracking-wider text-primary-500">{product.brand || 'Thrift'}</p>
        <h3 className="mt-1 truncate font-serif text-base font-semibold text-neutral-900 dark:text-neutral-100">{product.name}</h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
          {product.size && <span>Size {product.size}</span>}
          {product.color && <span>&middot; {product.color}</span>}
        </div>
        <p className="mt-2 text-lg font-bold text-primary-600">{formatIDR(product.selling_price)}</p>
      </div>
    </div>
  );
}
