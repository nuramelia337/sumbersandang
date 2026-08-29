import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('Supabase usage guardrails', () => {
  it('keeps checkout to one public Edge request and no direct PII table writes', () => {
    const checkout = read('src/pages/Checkout.tsx');
    expect(checkout).toContain('/functions/v1/create-order');
    expect(checkout).not.toMatch(/from\(['"](?:customers|orders|order_items|notifications|activity_logs)['"]\)/);
    expect(checkout).not.toContain('/functions/v1/sync-sheets');
  });

  it('does not run expiry cleanup from a page mount', () => {
    const app = read('src/App.tsx');
    const dashboard = read('src/pages/admin/AdminDashboard.tsx');
    const orders = read('src/pages/admin/AdminOrders.tsx');
    expect(app).not.toContain('releaseExpiredKeeps');
    expect(dashboard).not.toContain("rpc('release_expired_keeps')");
    expect(orders).not.toContain("rpc('release_expired_keeps')");
  });

  it('uses bounded public RPCs and keyset pagination', () => {
    const shop = read('src/pages/Shop.tsx');
    const detail = read('src/pages/ProductDetail.tsx');
    expect(shop).toContain('listPublicProducts');
    expect(shop).toContain('next_cursor');
    expect(shop).not.toContain("from('products')");
    expect(detail).toContain('loadPublicProduct');
    expect(detail).toContain('image_thumbnail_paths');
  });

  it('enforces immutable cached uploads and server-side access controls', () => {
    const business = read('src/lib/business.ts');
    const imageUpload = read('src/components/ImageUpload.tsx');
    const migration = read('supabase/migrations/20260823090000_supabase_usage_hardening.sql');
    const lockdown = read('supabase/migrations/20260823100000_lock_down_public_access.sql');
    expect(business).toContain("cacheControl: '31536000'");
    expect(business).toContain('upsert: false');
    expect(business).toContain('MAX_OPTIMIZED_IMAGE_UPLOAD_BYTES = 900 * 1024');
    expect(business).toContain('if (highQualityFallback) return highQualityFallback');
    expect(imageUpload).toContain('for (const [index, file] of files.entries())');
    expect(imageUpload).toContain('for (const [index, file] of selectedFiles.entries())');
    expect(imageUpload).not.toContain('Promise.all');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION create_checkout_order_internal');
    expect(migration).toContain("DROP POLICY IF EXISTS");
    expect(migration).toContain('TO anon, authenticated');
    expect(migration).toContain("file_size_limit = 1048576");
    expect(migration).toContain("interval '30 days'");
    expect(lockdown).toContain('REVOKE ALL ON TABLE');
    expect(lockdown).toContain('FROM anon');
  });

  it('guards privilege changes for legacy functions that may already be gone', () => {
    const migration = read('supabase/migrations/20260823090000_supabase_usage_hardening.sql');
    const financeMigration = read(
      'supabase/migrations/20260821090000_void_finance_entries_on_order_delete.sql',
    );

    expect(financeMigration).toContain(
      'DROP FUNCTION IF EXISTS reverse_order_cash_ledger_before_delete()',
    );
    expect(migration).toContain("to_regprocedure('public.next_product_code()')");
    expect(migration).toContain("'public.reverse_order_cash_ledger_before_delete()'");
    expect(migration).not.toContain(
      'REVOKE ALL ON FUNCTION reverse_order_cash_ledger_before_delete()',
    );
  });
});
