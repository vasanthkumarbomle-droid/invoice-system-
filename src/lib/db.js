import { supabase } from '../supabase.js'
import { isPastDueDate } from './finance.js'
export { supabase }

const must = ({ data, error }) => {
  if (error) throw new Error(error.message)
  return data
}

// Supabase/PostgREST caps a single response (commonly at 1,000 rows). Fetch
// all pages so dashboards and reminder-related screens don't silently truncate.
const fetchAllPages = async (createQuery, pageSize = 1000) => {
  const allRows = []
  for (let offset = 0; ; offset += pageSize) {
    const rows = await createQuery()
      .range(offset, offset + pageSize - 1)
      .then(must)
    allRows.push(...rows)
    if (rows.length < pageSize) return allRows
  }
}

// ---------- Auth ----------
export const signUp = (email, password) => supabase.auth.signUp({ email, password }).then(must)
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password }).then(must)
export const signOut = () => supabase.auth.signOut()
export const getSession = () => supabase.auth.getSession().then(r => r.data.session)

// ---------- Organization ----------
export const getMyOrg = async () => {
  const rows = await supabase.from('org_members').select('role, organizations(*)').limit(1).then(must)
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
export const cancelInvoice = (orgId, id) => supabase.from('invoices').update({ status: 'cancelled' }).eq('org_id', orgId).eq('id', id).select('id').single().then(must)

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
  if (error) throw new Error(error.message || 'Could not send the document email.')
  if (data?.error) throw new Error(data.error)
  return data
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
