import { X, Trash2, ShoppingBag } from 'lucide-react';
import { getCartItemCode, getCartItemKey, getCartItemName, getCartItemPrice, useCart } from '../lib/cart';
import { formatIDR } from '../lib/constants';
import { packageImageUrl } from '../lib/business';
import { getProductImageUrl } from '../lib/imageUtils';

interface Props {
  onCheckout: () => void;
}

export default function CartDrawer({ onCheckout }: Props) {
  const { items, isOpen, setIsOpen, removeItem, subtotal, totalItems } = useCart();
  const handleCheckout = () => {
    setIsOpen(false);
    onCheckout();
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsOpen(false)}
      />
      <div
        className={`fixed right-0 top-0 z-50 flex h-[100dvh] w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 dark:bg-secondary-900 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-primary-100 px-5 py-4 dark:border-secondary-800">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-primary-600" />
            <h2 className="font-serif text-lg font-bold text-neutral-900 dark:text-neutral-50">
              Keranjang ({totalItems})
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-400">
              <ShoppingBag size={48} strokeWidth={1} />
              <p className="text-sm">Keranjang masih kosong</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const key = getCartItemKey(item);

                return (
                  <div
                    key={key}
                    className="flex gap-3 rounded-xl border border-primary-100 bg-primary-50/40 p-3 dark:border-secondary-800 dark:bg-secondary-950/40"
                  >
                    <img
                      src={item.kind === 'product' ? getProductImageUrl(item.product) : packageImageUrl(item.package)}
                      alt={getCartItemName(item)}
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {getCartItemName(item)}
                      </h3>
                      <p className="text-xs text-neutral-500">
                        {item.kind === 'product' ? item.product.brand || 'Thrift' : 'Paket Usaha'}
                      </p>
                      <p className="font-mono text-xs text-primary-500">{getCartItemCode(item)}</p>
                      <p className="mt-1 text-sm font-bold text-primary-600">
                        {formatIDR(getCartItemPrice(item))}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-secondary-800 dark:text-primary-200">Qty 1</span>
                        <button
                          onClick={() => removeItem(key)}
                          className="text-error-500 hover:text-error-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="shrink-0 border-t border-primary-100 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] dark:border-secondary-800">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Subtotal</span>
              <span className="text-lg font-bold text-neutral-900 dark:text-neutral-50">
                {formatIDR(subtotal)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCheckout}
              className="btn-primary w-full"
            >
              Checkout Sekarang
            </button>
          </div>
        )}
      </div>
    </>
  );
}
