import { supabase } from '../supabase.js'
import { isPastDueDate } from './finance.js'
import { fetchAllPages } from './pagination.js'
export { supabase }

const must = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

// ---------- Auth ----------
export const signUp = (email, password) => supabase.auth.signUp({ email, password }).then(must)
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password }).then(must)
export const signOut = () => supabase.auth.signOut()
export const getSession = () => supabase.auth.getSession().then(r => r.data.session)

// ---------- Organization ----------
export const getMyOrg = async () => {
  // Choose a stable default workspace rather than an unordered membership row.
  const rows = await supabase.from('org_members')
    .select('role, created_at, org_id, organizations(*)')
    .order('created_at', { ascending: true })
    .order('org_id', { ascending: true })
    .limit(1)
    .then(must)
  return rows[0] ? { ...rows[0].organizations, role: rows[0].role } : null
}
export const createOrg = (org) => supabase.from('organizations').insert(org).select().single().then(must)
export const updateOrg = (id, patch) => supabase.from('organizations').update(patch).eq('id', id).select().single().then(must)

// ---------- Clients ----------
export const listClients = (orgId) =>
  fetchAllPages(() => supabase.from('clients').select('*').eq('org_id', orgId).is('deleted_at', null)
    .order('created_at', { ascending: false }).order('id', { ascending: false }))
export const addClient = (orgId, c) => supabase.from('clients').insert({ ...c, org_id: orgId }).select().single().then(must)
export const updateClient = (orgId, id, patch) => supabase.from('clients').update(patch).eq('org_id', orgId).eq('id', id).select().single().then(must)
export const deleteClient = (orgId, id) => supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('org_id', orgId).eq('id', id).select('id').single().then(must)

// ---------- Products ----------
export const listProducts = (orgId) =>
  fetchAllPages(() => supabase.from('products').select('*').eq('org_id', orgId).is('deleted_at', null)
    .order('created_at', { ascending: false }).order('id', { ascending: false }))
export const addProduct = (orgId, p) => supabase.from('products').insert({ ...p, org_id: orgId }).select().single().then(must)
export const updateProduct = (orgId, id, patch) => supabase.from('products').update(patch).eq('org_id', orgId).eq('id', id).select().single().then(must)
export const deleteProduct = (orgId, id) => supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('org_id', orgId).eq('id', id).select('id').single().then(must)
export const findProductByBarcode = (orgId, barcode) =>
  supabase.from('products').select('*').eq('org_id', orgId).eq('barcode', barcode).is('deleted_at', null).maybeSingle().then(must)

// ---------- Invoices ----------
export const listInvoices = (orgId) =>
  fetchAllPages(() => supabase.from('invoices').select('*, clients(name, email)').eq('org_id', orgId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }))
export const getInvoice = (orgId, id) =>
  supabase.from('invoices').select('*, clients(*), invoice_items(*), payments(*)').eq('org_id', orgId).eq('id', id).single().then(must)

// items: [{ product_id, description, hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate }]
// Totals, GST split, number and status are all calculated by the database.
export const createInvoice = async (orgId, clientId, dueDate, items, notes = null) => {
  const id = await saveInvoice(orgId, {
    id: null,
    client_id: clientId,
    issue_date: null,
    due_date: dueDate,
    status: 'pending',
    notes,
  }, items)
  return getInvoice(orgId, id)
}
export const cancelInvoice = (orgId, id) => supabase.rpc('cancel_invoice_if_unpaid', {
  p_org_id: orgId,
  p_invoice_id: id,
}).then(must)

// ---------- Payments ----------
export const listPayments = (orgId) =>
  fetchAllPages(() => supabase.from('payments').select('*, invoices(invoice_number, clients(name))').eq('org_id', orgId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }))
export const recordPayment = (invoiceId, amount, method = 'upi', reference = null) =>
  supabase.from('payments').insert({ invoice_id: invoiceId, amount, method, reference }).select().single().then(must)

// ---------- Quotations ----------
export const listQuotations = (orgId) =>
  fetchAllPages(() => supabase.from('quotations').select('*, clients(name, email)').eq('org_id', orgId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }))
export const getQuotation = (orgId, id) =>
  supabase.from('quotations').select('*, clients(*), quotation_items(*)').eq('org_id', orgId).eq('id', id).single().then(must)
export const createQuotation = async (orgId, clientId, validUntil, items, notes = null) => {
  const id = await saveQuotation(orgId, {
    id: null,
    client_id: clientId,
    issue_date: null,
    valid_until: validUntil,
    status: 'draft',
    notes,
  }, items)
  return getQuotation(orgId, id)
}
export const setQuotationStatus = (orgId, id, status) => supabase.from('quotations').update({ status }).eq('org_id', orgId).eq('id', id).select('id').single().then(must)
export const convertQuotationToInvoice = (id, dueDate = null) =>
  supabase.rpc('convert_quotation_to_invoice', { p_quote_id: id, p_due_date: dueDate }).then(must)

// Reservations are operational stock, so every page must be included in this calculation.
export const listReservedProductQuantities = async (orgId) => {
  const rows = await fetchAllPages(() => supabase.from('sales_order_items')
    .select('product_id,reserved_qty,sales_order_id')
    .eq('org_id', orgId)
    .gt('reserved_qty', 0)
    .not('product_id', 'is', null)
    .order('sales_order_id', { ascending: true })
    .order('id', { ascending: true }))

  if (!rows.length) return {}
  const orderIds = [...new Set(rows.map((row) => row.sales_order_id).filter(Boolean))]
  const activeOrders = []
  // Keep each ID filter bounded for large organizations.
  for (let offset = 0; offset < orderIds.length; offset += 250) {
    const idChunk = orderIds.slice(offset, offset + 250)
    const page = await supabase.from('sales_orders')
      .select('id')
      .eq('org_id', orgId)
      .in('id', idChunk)
      .in('status', ['reserved', 'packing', 'packed', 'dispatched'])
      .is('stock_deducted_at', null)
      .then(must)
    activeOrders.push(...page)
  }
  const activeIds = new Set(activeOrders.map((row) => row.id))
  const totals = {}
  for (const row of rows) {
    if (!activeIds.has(row.sales_order_id) || !row.product_id) continue
    totals[row.product_id] = (totals[row.product_id] || 0) + (Number(row.reserved_qty) || 0)
  }
  return totals
}

// Backward-compatible alias for older callers.
export const convertQuotation = convertQuotationToInvoice

export const saveDocumentSignature = async (orgId, documentType, documentId, signatureData) => {
  const { data, error } = await supabase.functions.invoke('quotation-workflow', {
    body: { action: 'save_signature', orgId, documentType, documentId, signatureData },
  })
  if (error) throw new Error(error.message || 'Could not save the signature.')
  if (data?.error) throw new Error(data.error)
  return data
}

export const getDocumentSignature = async (orgId, documentType, documentId) => {
  const { data, error } = await supabase.functions.invoke('quotation-workflow', {
    body: { action: 'get_signature', orgId, documentType, documentId },
  })
  if (error) throw new Error(error.message || 'Could not load the signature.')
  if (data?.error) throw new Error(data.error)
  return data
}

export const sendDocumentEmail = async (orgId, documentType, documentId) => {
  const { data, error } = await supabase.functions.invoke('quotation-workflow', {
    body: { action: 'send', orgId, documentType, documentId },
  })

  // FunctionsHttpError carries the raw Response in error.context. Read a clone
  // as text first so JSON provider/setup errors survive the SDK's generic message.
  let responseBody = data
  let responseText = ''
  let responseStatus = null
  let responseStatusText = ''
  const context = error?.context
  if (context && typeof context.clone === 'function') {
    const response = context.clone()
    responseStatus = Number(response.status) || null
    responseStatusText = String(response.statusText || '')
    if (typeof response.text === 'function') {
      responseText = await response.text().catch(() => '')
      if (responseText) {
        try { responseBody = JSON.parse(responseText) } catch { /* Keep data when the body is not JSON. */ }
      }
    }
  } else if (context && typeof context === 'object') {
    responseBody = context.data ?? context.body ?? responseBody
  }

  if (error) {
    const serverMessage = String(
      responseBody?.error || responseBody?.message || responseBody?.msg || ''
    ).trim()
    const details = String(responseBody?.details || '').trim()
    const message = [serverMessage, details].filter(Boolean).join(' — ')
    if (message) throw new Error(message)
    if (responseStatus) {
      throw new Error(`Quotation email service returned HTTP ${responseStatus}${responseStatusText ? ` ${responseStatusText}` : ''}. ${responseText.slice(0, 400)}`.trim())
    }
    throw new Error(error.message || 'Could not send the document email.')
  }

  if (responseBody?.error) {
    const details = String(responseBody?.details || '').trim()
    throw new Error([responseBody.error, details].filter(Boolean).join(' — '))
  }
  if (responseBody?.success !== true || responseBody?.emailAcceptedByProvider !== true) {
    throw new Error('The email service did not confirm that the document email was accepted. Check the email settings and try again.')
  }
  return responseBody
}

// ---------- Dashboard ----------
export const getDashboardStats = async (orgId) => {
  const inv = await fetchAllPages(() => supabase.from('invoices')
    .select('id, grand_total, amount_paid, balance_due, status, due_date').eq('org_id', orgId)
    .neq('status', 'cancelled').neq('status', 'draft')
    .order('id', { ascending: true }))
  const sum = (k) => inv.reduce((a, r) => a + Number(r[k] || 0), 0)
  return {
    totalInvoiced: sum('grand_total'),
    totalReceived: sum('amount_paid'),
    outstanding: sum('balance_due'),
    overdueCount: inv.filter(r => Number(r.balance_due) > 0 && isPastDueDate(r.due_date)).length,
  }
}
export const listInvoicesFull = (orgId) =>
  fetchAllPages(() => supabase.from('invoices').select('*, clients(*), invoice_items(*)').eq('org_id', orgId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }))

export const saveInvoice = async (orgId, inv, items) => {
  const fields = {
    client_id: inv.client_id,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    status: inv.status,
    notes: inv.notes,
  }
  return supabase.rpc('save_invoice_with_items', {
    p_org_id: orgId,
    p_document_id: inv.id || null,
    p_invoice: fields,
    p_items: items || [],
  }).then(must)
}
export const recordPaymentFull = (orgId, invoiceId, amount, method, reference, paidAt, notes = null) =>
  supabase.from('payments').insert({
    org_id: orgId,
    invoice_id: invoiceId,
    amount,
    method,
    reference,
    notes: String(notes || '').trim() || null,
    ...(paidAt ? { paid_at: paidAt } : {}),
  }).select().single().then(must)

export const listQuotationsFull = (orgId) =>
  fetchAllPages(() => supabase
    .from('quotations')
    .select('*, clients(*), quotation_items(*)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }))

export const saveQuotation = async (orgId, quote, items = []) => {
  const fields = {
    client_id: quote.client_id ?? quote.clientId,
    issue_date: quote.issue_date ?? quote.issueDate,
    valid_until: quote.valid_until ?? quote.validUntil ?? quote.due_date ?? quote.dueDate ?? null,
    status: String(quote.status ?? 'draft').toLowerCase(),
    notes: quote.notes ?? null,
    terms: quote.terms ?? null,
  }

  const normalizedItems = items.map((it) => ({
    product_id: it.product_id ?? it.productId ?? null,
    description: it.description ?? '',
    hsn_sac: it.hsn_sac ?? it.hsnSac ?? null,
    unit: it.unit ?? 'unit',
    quantity: it.quantity ?? 1,
    unit_price: it.unit_price ?? it.unitPrice ?? 0,
    discount_pct: it.discount_pct ?? it.discountPct ?? 0,
    gst_rate: it.gst_rate ?? it.gstRate ?? 0,
  }))

  return supabase.rpc('save_quotation_with_items', {
    p_org_id: orgId,
    p_document_id: quote.id || null,
    p_quotation: fields,
    p_items: normalizedItems,
  }).then(must)
}

export const deleteQuotation = (orgId, id) =>
  supabase
    .from('quotations')
    .delete()
    .eq('org_id', orgId)
    .eq('id', id)
    .select('id')
    .single()
    .then(must)
