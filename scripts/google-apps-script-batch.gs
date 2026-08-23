/*
 * Google Apps Script receiver for sheet-sync-worker.
 *
 * Script Properties required:
 *   WEBHOOK_SECRET = same value as Supabase GOOGLE_SHEETS_WEBHOOK_SECRET
 *
 * Deploy as a Web App and use its /exec URL as GOOGLE_SHEETS_WEBHOOK_URL.
 * One HTTP request writes every item to all target sheets and the hidden
 * _SyncLog sheet prevents duplicate order delivery.
 */

const TARGET_SHEETS = [
  'Barang Keluar',
  'Dashboard Global',
  'Dashboard Terfilter',
  'Stok Barang',
  'Invoice',
  'Purchase Order',
];

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    if (!expectedSecret || payload.webhook_secret !== expectedSecret) return jsonResponse_({ error: 'Unauthorized' });
    if (payload.event !== 'order.upsert' || !payload.idempotency_key || !payload.order || !Array.isArray(payload.items)) {
      return jsonResponse_({ error: 'Invalid payload' });
    }

    const workbook = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = workbook.getSheetByName('_SyncLog') || workbook.insertSheet('_SyncLog');
    if (logSheet.getLastRow() === 0) logSheet.appendRow(['order_id', 'processed_at']);
    const existingIds = logSheet.getLastRow() > 1
      ? logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 1).getDisplayValues().flat()
      : [];
    if (existingIds.indexOf(payload.idempotency_key) !== -1) return jsonResponse_({ success: true, duplicate: true });

    const order = payload.order;
    payload.items.forEach(function (item) {
      const product = item.product || {};
      const packageData = item.package || {};
      const profit = (Number(item.unit_price || 0) - Number(item.purchase_price || 0)) * Number(item.quantity || 0);
      const row = [
        new Date().toISOString(), order.invoice_number, order.order_number, order.customer_name,
        order.customer_phone, item.item_type || 'product', item.product_code || '', item.product_name || '',
        Number(item.quantity || 0), Number(item.unit_price || 0), Number(item.purchase_price || 0),
        Number(item.subtotal || 0), profit, order.payment_method, order.shipping_method, order.order_status,
        item.item_type === 'package' ? packageData.availability_status : product.availability_status,
        product.storage_location || '', product.stock == null ? 0 : product.stock,
        JSON.stringify(item.package_items_snapshot || []), payload.idempotency_key,
      ];
      TARGET_SHEETS.forEach(function (name) {
        const sheet = workbook.getSheetByName(name);
        if (sheet) sheet.appendRow(row);
      });
    });
    logSheet.appendRow([payload.idempotency_key, new Date().toISOString()]);
    logSheet.hideSheet();
    return jsonResponse_({ success: true, item_count: payload.items.length });
  } finally {
    lock.releaseLock();
  }
}
