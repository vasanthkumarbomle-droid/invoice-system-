import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(
  new URL('../supabase/functions/quotation-workflow/index.ts', import.meta.url),
  'utf8',
)

test('resending a document expires old links only after the email provider accepts the new email', () => {
  const providerResultIndex = source.indexOf('if (!mailResponse.ok)')
  const expiryIndex = source.indexOf('const { error: expireOldLinksError }')
  assert.ok(providerResultIndex >= 0)
  assert.ok(expiryIndex > providerResultIndex)
  assert.match(source.slice(expiryIndex, expiryIndex + 800), /\.neq\("id", tokenRow\.id\)/)
})
