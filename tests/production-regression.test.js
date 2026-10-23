import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const reminder = await readFile(
  new URL('../supabase/functions/gmail-invoice-reminders/index.ts', import.meta.url),
  'utf8',
)

test('payment modal blocks concurrent submissions while a payment save is in flight', () => {
  const start = app.indexOf('function RecordPaymentModal(')
  const end = app.indexOf('// REPORTS & ANALYTICS VIEW', start)
  assert.ok(start >= 0 && end > start)
  const modal = app.slice(start, end)
  assert.match(modal, /if \(savingRef\.current\) return/)
  assert.ok(modal.indexOf('savingRef.current = true') < modal.indexOf('await onSave('))
  assert.match(modal, /disabled=\{saving\}/)
})

test('reminder candidate and send-log paths both normalize client relation shapes', () => {
  assert.match(reminder, /function firstClient\(/)
  assert.equal((reminder.match(/firstClient\(invoice\.clients\)/g) || []).length, 2)
})

test('issued invoices are protected from edit/cancel actions in the UI', () => {
  assert.match(app, /doc\.type === 'invoice' && doc\.status !== 'Draft'/)
  assert.match(app, /Invoices with recorded payments cannot be cancelled/)
  assert.match(app, /cancel_invoice_if_unpaid/)
})
