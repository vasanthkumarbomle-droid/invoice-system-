import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDaysToDateString,
  calculateDocumentAmounts,
  escapeCsvCell,
  numberToWordsINR,
  isPastDueDate,
  indianFinancialYearLabel,
  paymentTermsDays,
} from '../src/lib/finance.js'

test('percentage discount is applied once before GST', () => {
  const result = calculateDocumentAmounts([
    { quantity: 2, unitPrice: 500, gstRate: 18 },
  ], 'percentage', 10)

  assert.equal(result.subtotal, 1000)
  assert.equal(result.discountAmount, 100)
  assert.equal(result.taxableAmount, 900)
  assert.equal(result.totalTaxAmount, 162)
  assert.equal(result.taxableAmount + result.totalTaxAmount, 1062)
})

test('fixed discounts are capped at the taxable subtotal', () => {
  const result = calculateDocumentAmounts([
    { quantity: 1, unitPrice: 100, gstRate: 18 },
  ], 'fixed', 500)

  assert.equal(result.discountAmount, 100)
  assert.equal(result.taxableAmount, 0)
  assert.equal(result.totalTaxAmount, 0)
})

test('a zero-GST product remains zero-rated', () => {
  const result = calculateDocumentAmounts([
    { quantity: 3, unitPrice: 25, gstRate: 0 },
  ], 'percentage', 0)

  assert.equal(result.totalTaxAmount, 0)
  assert.equal(result.taxableAmount, 75)
})

test('Indian date arithmetic crosses month boundaries without UTC day drift', () => {
  assert.equal(addDaysToDateString('2026-10-23', 30), '2026-11-22')
  assert.equal(addDaysToDateString('2026-10-23', 0), '2026-10-23')
})

test('Indian financial year label switches on 1 April', () => {
  assert.equal(indianFinancialYearLabel('2027-01-15'), 'FY 2026-27')
  assert.equal(indianFinancialYearLabel('2027-03-31'), 'FY 2026-27')
  assert.equal(indianFinancialYearLabel('2027-04-01'), 'FY 2027-28')
})

test('dashboard due-date helper handles past, current, future and invalid dates', () => {
  assert.equal(isPastDueDate('2026-10-22', '2026-10-23'), true)
  assert.equal(isPastDueDate('2026-10-23', '2026-10-23'), false)
  assert.equal(isPastDueDate('2026-10-24', '2026-10-23'), false)
  assert.equal(isPastDueDate(null, '2026-10-23'), false)
  assert.equal(isPastDueDate('not-a-date', '2026-10-23'), false)
})

test('payment terms parse due-on-receipt and numbered terms', () => {
  assert.equal(paymentTermsDays('Due on Receipt'), 0)
  assert.equal(paymentTermsDays('Net 30'), 30)
  assert.equal(paymentTermsDays('Custom'), 15)
})

test('amount-in-words preserves paise', () => {
  assert.match(numberToWordsINR(1234.56), /Rupees One Thousand Two Hundred Thirty Four and Paise Fifty Six Only/)
  assert.equal(numberToWordsINR(0), 'Rupees Zero Only')
})

test('CSV cells quote delimiters and neutralize spreadsheet formulas', () => {
  assert.equal(escapeCsvCell('Ram "Tech" Ltd'), '"Ram ""Tech"" Ltd"')
  assert.ok(escapeCsvCell('=HYPERLINK("https://example.invalid")').startsWith('"\'=HYPERLINK('))
  assert.ok(escapeCsvCell('  @SUM(A1:A2)').startsWith('"\'  @SUM'))
})
