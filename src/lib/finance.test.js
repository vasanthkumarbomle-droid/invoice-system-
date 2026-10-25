import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDaysToDateString,
  calculateDocumentAmounts,
  calculateBillingAdjustments,
  escapeCsvCell,
  numberToWordsINR,
  isPastDueDate,
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


test('isPastDueDate compares calendar dates without depending on browser timezone', () => {
  assert.equal(isPastDueDate('2026-10-22', '2026-10-23'), true)
  assert.equal(isPastDueDate('2026-10-23', '2026-10-23'), false)
  assert.equal(isPastDueDate('2026-10-24', '2026-10-23'), false)
  assert.equal(isPastDueDate(null, '2026-10-23'), false)
  assert.equal(isPastDueDate('not-a-date', '2026-10-23'), false)
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

test('calculateBillingAdjustments includes shipping, TDS and TCS in total', () => {
  const result = calculateBillingAdjustments({
    taxableAmount: 1000, taxAmount: 180, shippingCharge: 50,
    tdsRate: 2, tcsRate: 1, roundOffMode: 'manual', roundOffValue: 0,
  })
  assert.equal(result.tdsAmount, 20)
  assert.equal(result.tcsAmount, 10)
  assert.equal(result.shippingChargeAmount, 50)
  assert.equal(result.roundOffAmount, 0)
  assert.equal(result.grandTotal, 1220)
})

test('calculateBillingAdjustments rounds to the nearest rupee', () => {
  const result = calculateBillingAdjustments({ taxableAmount: 100, taxAmount: 18, roundOffMode: 'nearest_rupee' })
  assert.equal(result.roundOffAmount, 0)
  assert.equal(result.grandTotal, 118)
  const paiseCase = calculateBillingAdjustments({ taxableAmount: 100, taxAmount: 18.38, roundOffMode: 'nearest_rupee' })
  assert.equal(paiseCase.roundOffAmount, -0.38)
  assert.equal(paiseCase.grandTotal, 118)
})

test('calculateBillingAdjustments caps manual round-off and normalizes negative inputs', () => {
  const result = calculateBillingAdjustments({ taxableAmount: -1, taxAmount: 18, shippingCharge: -10, roundOffValue: 8 })
  assert.equal(result.shippingChargeAmount, 0)
  assert.equal(result.roundOffAmount, 1)
  assert.equal(result.grandTotal, 19)
})