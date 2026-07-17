import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatIDR, genPONumber } from '../../lib/constants';
import { Plus, X, ArrowDown, Package } from 'lucide-react';
import type { Product, InventoryMovement, PurchaseOrder } from '../../lib/types';
import CurrencyInput from '../../components/CurrencyInput';

export default function AdminInventory() {
  const [tab, setTab] = useState<'movements' | 'po'>('movements');
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ product_id: '', type: 'in', quantity: 0, notes: '' });
  const [poForm, setPoForm] = useState({
    supplier_name: '', supplier_phone: '', supplier_address: '',
    items: [{ product_name: '', category: '', quantity: 1, unit_cost: 0 }],
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [movs, prods, poList] = await Promise.all([
      supabase.from('inventory_movements').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('products').select('*').order('name'),
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
    ]);
    setMovements(movs.data || []);
    setProducts(prods.data || []);
    setPos(poList.data || []);
    setLoading(false);
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find((p) => p.id === adjustForm.product_id);
    if (!product) return;
    const qty = Number(adjustForm.quantity);
    const before = product.stock;
    let after = before;
    if (adjustForm.type === 'in') after = before + qty;
    else if (adjustForm.type === 'out') after = Math.max(0, before - qty);
    else if (adjustForm.type === 'adjustment') after = qty;
    else if (adjustForm.type === 'damaged' || adjustForm.type === 'lost') after = Math.max(0, before - qty);

    await supabase.from('products').update({
      stock: after,
      availability_status: after > 0 ? 'ready' : 'sold',
      status: after > 0 ? 'active' : 'sold_out',
      updated_at: new Date().toISOString(),
    }).eq('id', product.id);
    await supabase.from('inventory_movements').insert({
      product_id: product.id,
      type: adjustForm.type,
      quantity: qty,
      quantity_before: before,
      quantity_after: after,
      notes: adjustForm.notes,
    });
    await supabase.from('activity_logs').insert({
      action: 'inventory_adjusted',
      entity_type: 'product',
      entity_id: product.id,
      description: `Stock adjusted: ${product.name} ${before} -> ${after}`,
    });
    setShowAdjust(false);
    setAdjustForm({ product_id: '', type: 'in', quantity: 0, notes: '' });
    loadData();
  };

  const handlePO = async (e: React.FormEvent) => {
    e.preventDefault();
    const poNumber = genPONumber();
    const totalItems = poForm.items.reduce((s, i) => s + Number(i.quantity), 0);
    const totalCost = poForm.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost), 0);

    const { data: po } = await supabase.from('purchase_orders').insert({
      po_number: poNumber,
      supplier_name: poForm.supplier_name,
      supplier_phone: poForm.supplier_phone,
      supplier_address: poForm.supplier_address,
      total_items: totalItems,
      total_cost: totalCost,
      status: 'sent',
      ordered_at: new Date().toISOString(),
      notes: poForm.notes,
    }).select('id').single();

    if (po) {
      const items = poForm.items.map((i) => ({
        po_id: po.id,
        product_name: i.product_name,
        category: i.category,
        quantity: Number(i.quantity),
        unit_cost: Number(i.unit_cost),
        subtotal: Number(i.quantity) * Number(i.unit_cost),
      }));
      await supabase.from('purchase_order_items').insert(items);
      await supabase.from('activity_logs').insert({
        action: 'po_created',
        entity_type: 'purchase_order',
        entity_id: po.id,
        description: `PO ${poNumber} created for ${poForm.supplier_name}`,
      });
    }

    setShowPO(false);
    setPoForm({
      supplier_name: '', supplier_phone: '', supplier_address: '',
      items: [{ product_name: '', category: '', quantity: 1, unit_cost: 0 }],
      notes: '',
    });
    loadData();
  };

  const receivePO = async (po: PurchaseOrder) => {
    const { data: items } = await supabase.from('purchase_order_items').select('*').eq('po_id', po.id);
    if (!items) return;
    for (const item of items) {
      const existing = products.find((p) => p.name === item.product_name);
      if (existing) {
        const before = existing.stock;
        const after = before + item.quantity;
        await supabase.from('products').update({ stock: after, availability_status: 'ready', status: 'active', updated_at: new Date().toISOString() }).eq('id', existing.id);
        await supabase.from('inventory_movements').insert({
          product_id: existing.id,
          type: 'in',
          quantity: item.quantity,
          quantity_before: before,
          quantity_after: after,
          reference_type: 'purchase_order',
          reference_id: po.id,
          notes: `PO ${po.po_number} received`,
        });
      }
    }
    await supabase.from('purchase_orders').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', po.id);
    loadData();
  };

  const typeColors: Record<string, string> = {
    in: 'bg-success-100 text-success-700',
    out: 'bg-error-100 text-error-700',
    adjustment: 'bg-warning-100 text-warning-700',
    damaged: 'bg-error-100 text-error-700',
    lost: 'bg-neutral-100 text-neutral-500',
    return: 'bg-primary-100 text-primary-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-neutral-900 dark:text-neutral-50">Inventory</h1>
          <p className="text-sm text-neutral-500">Kelola stok dan purchase orders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdjust(true)} className="btn-secondary">
            <ArrowDown size={16} /> Adjust Stok
          </button>
          <button onClick={() => setShowPO(true)} className="btn-primary">
            <Plus size={16} /> Purchase Order
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setTab('movements')}
          className={`px-4 py-2 text-sm font-medium ${tab === 'movements' ? 'border-b-2 border-primary-500 text-primary-600' : 'text-neutral-500'}`}
        >
          Riwayat Stok
        </button>
        <button
          onClick={() => setTab('po')}
          className={`px-4 py-2 text-sm font-medium ${tab === 'po' ? 'border-b-2 border-primary-500 text-primary-600' : 'text-neutral-500'}`}
        >
          Purchase Orders
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : tab === 'movements' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Produk</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Tipe</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Jumlah</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Sebelum</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Sesudah</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {movements.map((m) => {
                  const product = products.find((p) => p.id === m.product_id);
                  return (
                    <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                      <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{product?.name || 'Unknown'}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${typeColors[m.type]}`}>{m.type}</span>
                      </td>
                      <td className="px-4 py-3">{m.quantity}</td>
                      <td className="px-4 py-3 text-neutral-500">{m.quantity_before}</td>
                      <td className="px-4 py-3 font-semibold">{m.quantity_after}</td>
                      <td className="px-4 py-3 text-xs text-neutral-500">{m.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">No. PO</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Supplier</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Items</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Total Cost</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-700 dark:text-neutral-300">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-300">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {pos.map((po) => (
                  <tr key={po.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3 font-mono text-xs">{po.po_number}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{po.supplier_name}</td>
                    <td className="px-4 py-3">{po.total_items}</td>
                    <td className="px-4 py-3 font-semibold text-primary-600">{formatIDR(po.total_cost)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${po.status === 'received' ? 'bg-success-100 text-success-700' : po.status === 'sent' ? 'bg-warning-100 text-warning-700' : 'bg-neutral-100 text-neutral-500'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {po.status === 'sent' && (
                        <button onClick={() => receivePO(po)} className="btn-ghost text-success-600">
                          <Package size={16} /> Terima
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAdjust(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold">Adjust Stok</h2>
              <button onClick={() => setShowAdjust(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAdjust} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Produk</label>
                <select required value={adjustForm.product_id} onChange={(e) => setAdjustForm({ ...adjustForm, product_id: e.target.value })} className="input-field">
                  <option value="">Pilih produk</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} (Stok: {p.stock})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Tipe</label>
                <select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })} className="input-field">
                  <option value="in">Barang Masuk</option>
                  <option value="out">Barang Keluar</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="damaged">Rusak</option>
                  <option value="lost">Hilang</option>
                  <option value="return">Retur</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Jumlah</label>
                <input required type="number" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })} className="input-field" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Catatan</label>
                <input type="text" value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} className="input-field" />
              </div>
              <button type="submit" className="btn-primary w-full">Simpan</button>
            </form>
          </div>
        </div>
      )}

      {/* PO modal */}
      {showPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPO(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold">Buat Purchase Order</h2>
              <button onClick={() => setShowPO(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handlePO} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Nama Supplier</label>
                  <input required type="text" value={poForm.supplier_name} onChange={(e) => setPoForm({ ...poForm, supplier_name: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">No. Telepon</label>
                  <input type="text" value={poForm.supplier_phone} onChange={(e) => setPoForm({ ...poForm, supplier_phone: e.target.value })} className="input-field" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Alamat Supplier</label>
                <textarea value={poForm.supplier_address} onChange={(e) => setPoForm({ ...poForm, supplier_address: e.target.value })} className="input-field" rows={2} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Items</label>
                {poForm.items.map((item, i) => (
                  <div key={i} className="mb-2 grid grid-cols-12 gap-2">
                    <input required type="text" placeholder="Nama produk" value={item.product_name} onChange={(e) => {
                      const items = [...poForm.items]; items[i].product_name = e.target.value; setPoForm({ ...poForm, items });
                    }} className="input-field col-span-4" />
                    <input type="text" placeholder="Kategori" value={item.category} onChange={(e) => {
                      const items = [...poForm.items]; items[i].category = e.target.value; setPoForm({ ...poForm, items });
                    }} className="input-field col-span-3" />
                    <input required type="number" placeholder="Qty" value={item.quantity} onChange={(e) => {
                      const items = [...poForm.items]; items[i].quantity = Number(e.target.value); setPoForm({ ...poForm, items });
                    }} className="input-field col-span-2" />
                    <CurrencyInput value={item.unit_cost} onValueChange={(value) => {
                      const items = [...poForm.items]; items[i].unit_cost = value; setPoForm({ ...poForm, items });
                    }} className="col-span-2" />
                    <button type="button" onClick={() => setPoForm({ ...poForm, items: poForm.items.filter((_, idx) => idx !== i) })} className="col-span-1 rounded-lg bg-error-50 text-error-600 hover:bg-error-100">
                      <X size={16} className="mx-auto" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setPoForm({ ...poForm, items: [...poForm.items, { product_name: '', category: '', quantity: 1, unit_cost: 0 }] })} className="btn-ghost">
                  <Plus size={16} /> Tambah Item
                </button>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Catatan</label>
                <input type="text" value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} className="input-field" />
              </div>
              <button type="submit" className="btn-primary w-full">Buat PO</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
