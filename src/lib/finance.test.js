import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDaysToDateString,
  calculateDocumentAmounts,
  escapeCsvCell,
  numberToWordsINR,
  paymentTermsDays,
  todayInIndia,
} from './finance.js'

test('todayInIndia returns an ISO calendar date', () => {
  assert.match(todayInIndia(), /^\d{4}-\d{2}-\d{2}$/)
})

test('addDaysToDateString handles month and year rollover', () => {
  assert.equal(addDaysToDateString('2026-12-31', 1), '2027-01-01')
  assert.equal(addDaysToDateString('2026-01-31', 1), '2026-02-01')
})

test('paymentTermsDays handles receipt and common net terms', () => {
  assert.equal(paymentTermsDays('Due on receipt'), 0)
  assert.equal(paymentTermsDays('Net 30'), 30)
  assert.equal(paymentTermsDays('Net 45 days'), 45)
})

test('calculateDocumentAmounts applies percentage discount once before tax', () => {
  const result = calculateDocumentAmounts(
    [{ quantity: 2, unitPrice: 500, gstRate: 18 }],
    'percentage',
    10,
  )
  assert.equal(result.subtotal, 1000)
  assert.equal(result.discountAmount, 100)
  assert.equal(result.taxableAmount, 900)
  assert.equal(result.totalTaxAmount, 162)
})

test('calculateDocumentAmounts caps fixed discount at subtotal', () => {
  const result = calculateDocumentAmounts(
    [{ quantity: 1, unitPrice: 100, gstRate: 18 }],
    'fixed',
    150,
  )
  assert.equal(result.discountAmount, 100)
  assert.equal(result.taxableAmount, 0)
  assert.equal(result.totalTaxAmount, 0)
})

test('escapeCsvCell escapes quotes and protects formula-leading text', () => {
  assert.equal(escapeCsvCell('Ram "Tech" Ltd'), '"Ram ""Tech"" Ltd"')
  assert.equal(escapeCsvCell('=1+1'), '"\'=1+1"')
  assert.equal(escapeCsvCell('  @SUM(A1:A2)'), '"\'  @SUM(A1:A2)"')
})

test('numberToWordsINR preserves paise', () => {
  assert.equal(numberToWordsINR(12.34), 'Rupees Twelve and Paise Thirty Four Only')
})
