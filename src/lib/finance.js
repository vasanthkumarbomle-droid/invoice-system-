export function todayInIndia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function indianFinancialYearLabel(dateString = todayInIndia()) {
  const match = String(dateString || '').match(/^(\\d{4})-(\\d{2})-\\d{2}$/)
  if (!match) return indianFinancialYearLabel(todayInIndia())
  const year = Number(match[1])
  const month = Number(match[2])
  const startYear = month >= 4 ? year : year - 1
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`
}


export function isPastDueDate(dueDate, today = todayInIndia()) {
  const due = String(dueDate || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(due) && due < today
}

export function addDaysToDateString(dateString, days) {
  const match = String(dateString || todayInIndia()).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return todayInIndia()
  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + Number(days || 0),
  ))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function paymentTermsDays(value, fallback = 15) {
  if (/due on receipt/i.test(String(value || ''))) return 0
  const match = String(value || '').match(/\d+/)
  const days = match ? Number(match[0]) : fallback
  return Number.isFinite(days) && days >= 0 ? days : fallback
}

export function numberToWordsINR(num) {
  const cents = Math.round(Math.abs(Number(num) || 0) * 100)
  const rupees = Math.floor(cents / 100)
  const paise = cents % 100
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ]
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const convertLessThanOneThousand = (value) => {
    let result = ''
    let remaining = value
    if (remaining >= 100) {
      result += a[Math.floor(remaining / 100)] + ' Hundred '
      remaining %= 100
    }
    if (remaining >= 20) {
      result += b[Math.floor(remaining / 10)] + ' '
      remaining %= 10
    }
    if (remaining > 0) result += a[remaining] + ' '
    return result.trim()
  }

  const convertInteger = (value) => {
    if (value === 0) return 'Zero'
    const crore = Math.floor(value / 10000000)
    const lakh = Math.floor((value % 10000000) / 100000)
    const thousand = Math.floor((value % 100000) / 1000)
    const remainder = value % 1000
    let words = ''
    if (crore > 0) words += convertLessThanOneThousand(crore) + ' Crore '
    if (lakh > 0) words += convertLessThanOneThousand(lakh) + ' Lakh '
    if (thousand > 0) words += convertLessThanOneThousand(thousand) + ' Thousand '
    if (remainder > 0) words += convertLessThanOneThousand(remainder) + ' '
    return words.trim()
  }

  const paiseWords = paise > 0 ? ` and Paise ${convertLessThanOneThousand(paise)}` : ''
  return `Rupees ${convertInteger(rupees)}${paiseWords} Only`
}

export function calculateDocumentAmounts(items = [], discountType = 'percentage', discountValue = 0) {
  const subtotal = items.reduce((sum, item) =>
    sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
  const value = Math.max(0, Number(discountValue) || 0)
  const discountAmount = discountType === 'percentage'
    ? Math.min(subtotal, subtotal * Math.min(100, value) / 100)
    : Math.min(subtotal, value)
  const taxableAmount = Math.max(0, subtotal - discountAmount)
  const baseTax = items.reduce((sum, item) => {
    const lineGross = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
    return sum + lineGross * (Number(item.gstRate) || 0) / 100
  }, 0)
  const discountFactor = subtotal > 0 ? taxableAmount / subtotal : 1
  return {
    subtotal,
    discountAmount,
    taxableAmount,
    totalTaxAmount: baseTax * discountFactor,
  }
}

export function escapeCsvCell(value) {
  let text = String(value ?? '')
  const firstNonWhitespace = text.trimStart()[0]
  if (typeof value === 'string' && ['=', '+', '-', '@'].includes(firstNonWhitespace)) {
    text = "'" + text
  }
  return '"' + text.replace(/"/g, '""') + '"'
}
