import { createContext, useContext, useState, ReactNode } from 'react';
import type { BusinessPackage, CartItem, Product } from './types';
import { packageIsAvailable, productIsAvailable } from './business';

interface CartCtx {
  items: CartItem[];
  addItem: (product: Product, qty?: number) => void;
  addPackage: (pkg: BusinessPackage, qty?: number) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  clear: () => void;
  subtotal: number;
  count: number;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  totalItems: number;
  clearCart: () => void;
}

const Ctx = createContext<CartCtx | null>(null);

function cartKey(item: CartItem): string {
  return item.kind === 'product' ? `product:${item.product.id}` : `package:${item.package.id}`;
}

export function getCartItemKey(item: CartItem): string {
  return cartKey(item);
}

export function getCartItemName(item: CartItem): string {
  return item.kind === 'product' ? item.product.name : item.package.name;
}

export function getCartItemCode(item: CartItem): string {
  return item.kind === 'product' ? item.product.product_code : item.package.package_code;
}

export function getCartItemPrice(item: CartItem): number {
  return item.kind === 'product' ? item.product.selling_price : item.package.price;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem: CartCtx['addItem'] = (product, qty = 1) => {
    if (!productIsAvailable(product)) return;
    setItems((prev) => {
      const key = `product:${product.id}`;
      const ex = prev.find((item) => cartKey(item) === key);
      if (ex) return prev.map((item) => (cartKey(item) === key ? { ...item, quantity: item.quantity + qty } : item));
      return [...prev, { kind: 'product', product, quantity: qty }];
    });
  };

  const addPackage: CartCtx['addPackage'] = (pkg, qty = 1) => {
    if (!packageIsAvailable(pkg)) return;
    setItems((prev) => {
      const key = `package:${pkg.id}`;
      const ex = prev.find((item) => cartKey(item) === key);
      if (ex) return prev.map((item) => (cartKey(item) === key ? { ...item, quantity: item.quantity + qty } : item));
      return [...prev, { kind: 'package', package: pkg, quantity: qty }];
    });
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((item) => cartKey(item) !== key));
  const updateQty = (key: string, qty: number) => setItems((prev) => prev.map((item) => (cartKey(item) === key ? { ...item, quantity: Math.max(1, qty) } : item)));
  const clear = () => setItems([]);

  const subtotal = items.reduce((sum, item) => sum + getCartItemPrice(item) * item.quantity, 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Ctx.Provider value={{ items, addItem, addPackage, removeItem, updateQty, clear, subtotal, count, isOpen, setIsOpen, totalItems: count, clearCart: clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be inside CartProvider');
  return c;
}
