import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/sql/009_document_save_tenant_integrity.sql', import.meta.url),
  'utf8',
)

test('invoice and quotation save RPCs require an authenticated organization member', () => {
  assert.ok((migration.match(/IF auth\.uid\(\) IS NULL/g) || []).length >= 2)
  assert.equal((migration.match(/FROM public\.org_members AS member/g) || []).length, 4)
  assert.equal((migration.match(/member\.org_id = p_org_id AND member\.user_id = auth\.uid\(\)/g) || []).length, 3)
})

test('document save RPCs and conversion validate organization ownership', () => {
  assert.equal((migration.match(/client\.id = v_client_id AND client\.org_id = p_org_id/g) || []).length, 2)
  assert.equal((migration.match(/product\.id = v_product_id AND product\.org_id = p_org_id/g) || []).length, 2)
  assert.match(migration, /The invoice client must belong to the same organization/)
  assert.match(migration, /The quotation client must belong to the same organization/)
  assert.match(migration, /product\.id = v_item\.product_id AND product\.org_id = v_quote\.org_id/)
  assert.match(migration, /Every converted quotation product must belong to the same organization/)
})

test('both save RPCs validate financial item inputs before insert', () => {
  assert.equal((migration.match(/v_quantity <= 0 OR v_unit_price < 0/g) || []).length, 2)
  assert.equal((migration.match(/v_discount_pct < 0 OR v_discount_pct > 100/g) || []).length, 2)
  assert.equal((migration.match(/v_gst_rate < 0 OR v_gst_rate > 100/g) || []).length, 2)
})

test('internal invoice refresh helper is not executable by browser roles', () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.invoice_refresh\(uuid\)\s+FROM PUBLIC, anon, authenticated;/,
  )
})

test('save RPCs cannot forge workflow-only financial/document statuses', () => {
  assert.match(migration, /Invoice status must be draft or pending when saving/)
  assert.match(migration, /Quotation status must be draft or sent when saving/)
  assert.match(migration, /Closed quotations cannot be edited; duplicate them to create a revision/)
})

test('issued invoices cannot be edited and cancellation rejects recorded payments', () => {
  assert.match(migration, /Only draft invoices can be edited/)
  assert.match(migration, /WHERE id = v_id AND org_id = p_org_id AND lower\(status::text\) = 'draft'/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.cancel_invoice_if_unpaid/)
  assert.match(migration, /FROM public\.invoices[\s\S]*?FOR UPDATE/)
  assert.match(migration, /SUM\(payment\.amount\)/)
  assert.match(migration, /Invoices with recorded payments cannot be cancelled/)
})
