import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatIDR, genPONumber } from '../../lib/constants';
import { Plus, X, ArrowDown, Package } from 'lucide-react';
import type { Product, InventoryMovement, ProductAvailabilityStatus, PurchaseOrder } from '../../lib/types';
import CurrencyInput from '../../components/CurrencyInput';
import { AVAILABILITY_LABELS, productAvailabilityFromStock } from '../../lib/business';

export default function AdminInventory() {
  const [tab, setTab] = useState<'movements' | 'po'>('movements');
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ product_id: '', availability_status: 'ready' as ProductAvailabilityStatus, notes: '' });
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
    const before = product.stock;
    const after = adjustForm.availability_status === 'ready' ? 1 : 0;
    const websiteStatus = adjustForm.availability_status === 'sold' ? 'sold_out' : 'active';

    await supabase.from('products').update({
      stock: after,
      availability_status: adjustForm.availability_status,
      status: websiteStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', product.id);
    await supabase.from('inventory_movements').insert({
      product_id: product.id,
      type: 'adjustment',
      quantity: Math.abs(after - before),
      quantity_before: before,
      quantity_after: after,
      notes: adjustForm.notes || `Status changed to ${AVAILABILITY_LABELS[adjustForm.availability_status]}`,
    });
    await supabase.from('activity_logs').insert({
      action: 'inventory_adjusted',
      entity_type: 'product',
      entity_id: product.id,
      description: `Product status adjusted: ${product.name} -> ${AVAILABILITY_LABELS[adjustForm.availability_status]}`,
    });
    setShowAdjust(false);
    setAdjustForm({ product_id: '', availability_status: 'ready', notes: '' });
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
    await supabase.from('purchase_orders').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', po.id);
    await supabase.from('activity_logs').insert({
      action: 'po_received',
      entity_type: 'purchase_order',
      entity_id: po.id,
      description: `PO ${po.po_number} marked received. Create each unique product from the Produk menu.`,
    });
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
          <p className="text-sm text-neutral-500">Kelola status barang unik dan purchase orders</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdjust(true)} className="btn-secondary">
            <ArrowDown size={16} /> Ubah Status
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
        <>
        <div className="space-y-3 md:hidden">
          {movements.map((m) => {
            const product = products.find((p) => p.id === m.product_id);
            return (
              <div key={m.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{product?.name || 'Unknown'}</h2>
                    <p className="mt-1 text-xs text-neutral-500">{m.notes || '-'}</p>
                  </div>
                  <span className={`badge ${typeColors[m.type]}`}>{m.type}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-3 text-center text-xs dark:border-neutral-800">
                  <div>
                    <p className="text-neutral-500">Jumlah</p>
                    <p className="mt-1 font-semibold">{m.quantity}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Sebelum</p>
                    <p className="mt-1 font-semibold">{m.quantity_before}</p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Sesudah</p>
                    <p className="mt-1 font-semibold">{m.quantity_after}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="card hidden overflow-hidden md:block">
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
        </>
      ) : (
        <>
        <div className="space-y-3 md:hidden">
          {pos.map((po) => (
            <div key={po.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-primary-600">{po.po_number}</p>
                  <h2 className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{po.supplier_name}</h2>
                  <p className="text-xs text-neutral-500">{po.total_items} item</p>
                </div>
                <span className={`badge ${po.status === 'received' ? 'bg-success-100 text-success-700' : po.status === 'sent' ? 'bg-warning-100 text-warning-700' : 'bg-neutral-100 text-neutral-500'}`}>
                  {po.status}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <span className="text-xs text-neutral-500">Total Cost</span>
                <span className="font-semibold text-primary-600">{formatIDR(po.total_cost)}</span>
              </div>
              {po.status === 'sent' && (
                <button type="button" onClick={() => receivePO(po)} className="btn-secondary mt-4 w-full text-success-700">
                  <Package size={16} /> Terima
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="card hidden overflow-hidden md:block">
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
        </>
      )}

      {/* Adjust modal */}
      {showAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAdjust(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold">Ubah Status Produk</h2>
              <button onClick={() => setShowAdjust(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAdjust} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Produk</label>
                <select required value={adjustForm.product_id} onChange={(e) => setAdjustForm({ ...adjustForm, product_id: e.target.value })} className="input-field">
                  <option value="">Pilih produk</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({AVAILABILITY_LABELS[productAvailabilityFromStock(p)]})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Status Baru</label>
                <select value={adjustForm.availability_status} onChange={(e) => setAdjustForm({ ...adjustForm, availability_status: e.target.value as ProductAvailabilityStatus })} className="input-field">
                  <option value="ready">Ready (stok 1)</option>
                  <option value="reserved">Reserved (stok 0)</option>
                  <option value="sold">Sold (stok 0)</option>
                </select>
              </div>
              <p className="rounded-xl bg-primary-50 px-4 py-3 text-sm text-secondary-700 dark:bg-secondary-950 dark:text-primary-100">
                Stok otomatis mengikuti status: Ready = 1 item, Reserved/Sold = 0 item.
              </p>
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
