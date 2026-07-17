import { createContext, useContext, useState, ReactNode } from 'react';
import type { Product } from './types';

interface CartItem {
  product: Product;
  quantity: number;
}

interface CartCtx {
  items: CartItem[];
  addItem: (product: Product, qty?: number) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clear: () => void;
  subtotal: number;
  count: number;
  // Backwards-compatible aliases
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  totalItems: number;
  clearCart: () => void;
}

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem: CartCtx['addItem'] = (product, qty = 1) => {
    setItems((prev) => {
      const ex = prev.find((i) => i.product.id === product.id);
      if (ex) return prev.map((i) => (i.product.id === product.id ? { ...i, quantity: i.quantity + qty } : i));
      return [...prev, { product, quantity: qty }];
    });
  };

  const removeItem = (id: string) => setItems((p) => p.filter((i) => i.product.id !== id));
  const updateQty = (id: string, qty: number) => setItems((p) => p.map((i) => (i.product.id === id ? { ...i, quantity: Math.max(1, qty) } : i)));
  const clear = () => setItems([]);

  const subtotal = items.reduce((s, i) => s + i.product.selling_price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Ctx.Provider value={{ items, addItem, removeItem, updateQty, clear, subtotal, count, isOpen, setIsOpen, totalItems: count, clearCart: clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be inside CartProvider');
  return c;
}
