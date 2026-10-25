import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import ClientDocumentPage from './ClientDocumentPage.jsx'
import PasswordResetPage from './PasswordResetPage.jsx'
import { AuthLoginPage, AuthSignupPage, AuthForgotPasswordPage } from './AuthPages.jsx'
import { useOrg } from './OrgContext'
import * as db from './lib/db'
import {
  addDaysToDateString,
  calculateDocumentAmounts,
  escapeCsvCell,
  indianFinancialYearLabel,
  numberToWordsINR,
  paymentTermsDays,
  todayInIndia,
} from './lib/finance.js'
import {
  LayoutDashboard,
  FileText,
  FileSpreadsheet,
  Users,
  Package,
  Truck,
  CreditCard,
  BarChart3,
  Settings,
  Search,
  Bell,
  Plus,
  Printer as PrintIcon,
  Download,
  Trash2,
  Edit,
  Copy,
  ScanBarcode,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  Menu,
  HelpCircle,
  Eye,
  Receipt,
  PenLine,
  Eraser,
  LoaderCircle,
  LogOut
} from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { isSupabaseConfigured } from './supabase'
import './App.css'

// ============================================================================
// Number formatting in INR
function formatINR(amount) {
  const num = Number(amount) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(num)
}

function formatDisplayDate(value) {
  if (!value) return ''
  const date = new Date(String(value).slice(0, 10) + 'T12:00:00')
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

const GST_STATE_NAMES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old code)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
}

// ============================================================================
// MAIN APP COMPONENT WRAPPER WITH ROUTER
// ============================================================================

const STATUS_FROM_DB = {
  draft: 'Draft', pending: 'Sent', partially_paid: 'Partially Paid',
  paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
}
const STATUS_TO_DB = Object.fromEntries(Object.entries(STATUS_FROM_DB).map(([key, label]) => [label.toLowerCase(), key]))
const METHOD_TO_DB = {
  'Bank Transfer (NEFT)': 'bank_transfer', 'RTGS Wire': 'bank_transfer',
  'UPI Business': 'upi', 'Corporate Credit Card': 'card', Cheque: 'cheque', Cash: 'cash',
}
const METHOD_FROM_DB = {
  bank_transfer: 'Bank Transfer', upi: 'UPI', card: 'Card',
  cheque: 'Cheque', cash: 'Cash', online: 'Online', other: 'Other',
}

function mapInvoice(r) {
  const rows = (r.invoice_items || []).slice().sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
  const gross = rows.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
  const items = rows.map((it) => {
    const qty = Number(it.quantity) || 0
    const price = Number(it.unit_price) || 0
    const gst = Number(it.gst_rate) || 0
    const lineGross = qty * price
    const discountPct = Math.max(0, Math.min(100, Number(it.discount_pct) || 0))
    const taxableLine = it.taxable_amount != null ? Number(it.taxable_amount) : lineGross * (1 - discountPct / 100)
    const storedTax = Number(it.cgst_amount || 0) + Number(it.sgst_amount || 0) + Number(it.igst_amount || 0)
    const tax = it.cgst_amount != null || it.sgst_amount != null || it.igst_amount != null
      ? storedTax
      : it.tax_amount != null ? Number(it.tax_amount) : taxableLine * gst / 100
    const total = it.line_total != null ? Number(it.line_total) : taxableLine + tax
    return {
      id: it.id, productId: it.product_id || '', description: it.description || '', sku: it.sku || '',
      hsnSac: it.hsn_sac || '', unit: it.unit || 'unit', discountPct,
      quantity: qty, unitPrice: price, gstRate: gst, subtotal: taxableLine, taxAmount: tax, total,
    }
  })
  const taxable = Number(r.subtotal ?? gross) || 0
  const rawStatus = String(r.status || 'draft').toLowerCase()
  const amountPaid = Number(r.amount_paid) || 0
  const balanceDue = r.balance_due == null
    ? Math.max(0, (Number(r.grand_total) || 0) - amountPaid)
    : (Number(r.balance_due) || 0)
  const status = rawStatus === 'cancelled' ? 'Cancelled'
    : rawStatus === 'draft' ? 'Draft'
      : balanceDue <= 0 ? 'Paid'
        : amountPaid > 0 ? 'Partially Paid'
          : ((r.due_date && String(r.due_date).slice(0, 10) < todayInIndia()) || rawStatus === 'overdue') ? 'Overdue' : 'Sent'
  const clientGstin = r.clients?.gstin || ''
  return {
    id: r.id,
    documentNumber: String(r.invoice_number || `INV-${String(r.id || '').slice(0, 8).toUpperCase()}`),
    type: 'invoice',
    clientId: r.client_id,
    clientName: r.clients?.name || '',
    clientEmail: r.clients?.email || '',
    clientPhone: r.clients?.phone || '',
    clientAddress: r.clients?.address || '',
    clientGstin,
    clientStateCode: r.clients?.state_code || String(clientGstin).slice(0, 2),
    issueDate: r.issue_date,
    dueDate: r.due_date,
    paymentTerms: r.payment_terms || 'Net 15',
    status, items, subtotal: gross,
    discountType: 'percentage',
    discountValue: rows.length ? Number(rows[0].discount_pct) || 0 : 0,
    discountAmount: Math.max(0, gross - taxable),
    taxableAmount: taxable,
    cgstAmount: Number(r.cgst_total) || 0,
    sgstAmount: Number(r.sgst_total) || 0,
    igstAmount: Number(r.igst_total) || 0,
    taxAmount: Number(r.tax_total) || 0,
    grandTotal: Number(r.grand_total) || 0,
    amountPaid, balanceDue, notes: r.notes || '',
  }
}

function mapQuotationRecord(q) {
  const client = q.clients || {}
  const rows = (q.quotation_items || []).slice().sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
  const gross = rows.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)
  const taxable = Number(q.subtotal ?? gross) || 0
  const grandTotal = Number(q.grand_total || 0)
  const rawStatus = String(q.status || 'draft')
  const items = rows.map((it) => {
    const quantity = Number(it.quantity || 0)
    const unitPrice = Number(it.unit_price || 0)
    const gstRate = Number(it.gst_rate || 0)
    const lineGross = quantity * unitPrice
    const discountPct = Math.max(0, Math.min(100, Number(it.discount_pct) || 0))
    const lineTax = Number(it.cgst_amount || 0) + Number(it.sgst_amount || 0) + Number(it.igst_amount || 0)
    const lineTaxable = it.taxable_amount != null ? Number(it.taxable_amount) : lineGross * (1 - discountPct / 100)
    return {
      id: it.id, productId: it.product_id || '', description: it.description || '', sku: it.sku || '',
      hsnSac: it.hsn_sac || '', unit: it.unit || 'unit', discountPct,
      quantity, unitPrice, gstRate, subtotal: lineTaxable,
      taxAmount: lineTax || lineTaxable * gstRate / 100,
      total: Number(it.line_total ?? (lineTaxable * (1 + gstRate / 100))),
    }
  })
  const clientGstin = client.gstin || ''
  return {
    id: q.id, documentNumber: String(q.quote_number || `QT-${String(q.id || '').slice(0, 8).toUpperCase()}`),
    type: 'quotation', clientId: q.client_id,
    clientName: client.name || '', clientEmail: client.email || '', clientPhone: client.phone || '',
    clientAddress: client.address || '', clientGstin, clientStateCode: client.state_code || String(clientGstin).slice(0, 2),
    issueDate: q.issue_date, dueDate: q.valid_until, paymentTerms: q.terms || '',
    status: rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1), items,
    subtotal: gross, discountType: 'percentage',
    discountValue: rows.length ? Number(rows[0].discount_pct) || 0 : 0,
    discountAmount: Math.max(0, gross - taxable), taxableAmount: taxable,
    cgstAmount: Number(q.cgst_total || 0), sgstAmount: Number(q.sgst_total || 0),
    igstAmount: Number(q.igst_total || 0), taxAmount: Number(q.tax_total || 0),
    grandTotal, amountPaid: 0, balanceDue: grandTotal, notes: q.notes || '',
  }
}
function mapPayment(r) {
  return {
    id: r.id,
    paymentNumber: 'PAY-' + r.id.slice(0, 6).toUpperCase(),
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoices?.invoice_number || '',
    clientName: r.invoices?.clients?.name || '',
    amount: Number(r.amount),
    paymentDate: r.paid_at,
    paymentMethod: METHOD_FROM_DB[r.method] || r.method,
    referenceNumber: r.reference || '',
    status: 'Completed',
    notes: r.notes || '',
  }
}
export default function App() {
  return (
    <Routes>
        <Route path="/login" element={<AuthLoginPage />} />
        <Route path="/signup" element={<AuthSignupPage />} />
        <Route path="/forgot-password" element={<AuthForgotPasswordPage />} />
        <Route path="/" element={<LedgerFlowShell activeTab="dashboard" />} />
        <Route path="/invoices" element={<LedgerFlowShell activeTab="invoices" />} />
        <Route path="/invoices/new" element={<LedgerFlowShell activeTab="editor" initialMode="invoice" />} />
        <Route path="/quotations" element={<LedgerFlowShell activeTab="quotations" />} />
        <Route path="/quotations/new" element={<LedgerFlowShell activeTab="editor" initialMode="quotation" />} />
        <Route path="/sales-orders" element={<LedgerFlowShell activeTab="sales-orders" />} />
        <Route path="/clients" element={<LedgerFlowShell activeTab="clients" />} />
        <Route path="/products" element={<LedgerFlowShell activeTab="products" />} />
        <Route path="/payments" element={<LedgerFlowShell activeTab="payments" />} />
        <Route path="/reports" element={<LedgerFlowShell activeTab="reports" />} />
        <Route path="/settings" element={<LedgerFlowShell activeTab="settings" />} />
        <Route path="/client-document" element={<ClientDocumentPage />} />
        <Route path="/terms" element={<TermsConditionsPage />} />
        <Route path="/reset-password" element={<PasswordResetPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
  )
}

// ============================================================================
// CORE APPLICATION SHELL & STATE MANAGEMENT
// ============================================================================

function LedgerFlowShell({ activeTab = 'dashboard', initialMode = 'invoice' }) {
  const navigate = useNavigate()

  // Persistent State in localStorage
   const org = useOrg()
  const canManageBusiness = ['owner', 'admin'].includes(String(org.role || '').toLowerCase())
const [companyProfile, setCompanyProfile] = useState(() => ({
  companyName: org.legal_name || org.name || '',
  tradeName: org.name || '',
  gstin: org.gstin || '',
  stateCode: org.state_code || String(org.gstin || '').slice(0, 2),
  pan: org.pan || '',
  email: org.email || '',
  phone: org.phone || '',
  address: org.address || '',
  website: org.website || '',
  invoicePrefix: org.invoice_prefix || 'INV-',
  quotationPrefix: org.quote_prefix || 'QT-',
  defaultPaymentTerms: `Net ${org.default_payment_terms_days || 15}`,
  defaultGstRate: Number(org.default_gst_rate ?? 18),
  bankName: org.bank_name || '',
  accountHolder: org.bank_account_holder || org.legal_name || org.name || '',
  accountNumber: org.bank_account_no || '',
  ifscCode: org.bank_ifsc || '',
  upiId: org.upi_id || '',
  notes: org.terms || '',
}))


  const [clients, setClients] = useState([])

  const loadClients = useCallback(async () => {
    try {
      const rows = await db.listClients(org.id)
      setClients(rows.map((r) => ({
        id: r.id,
        name: r.name,
        contactPerson: r.contact_person || '',
        email: r.email || '',
        phone: r.phone || '',
        gstin: r.gstin || '',
        stateCode: r.state_code || String(r.gstin || '').slice(0, 2),
        address: r.address || '',
      })))
    } catch (e) {
      console.error('Failed to load clients:', e)
    }
  }, [org.id])

  useEffect(() => {
    loadClients()
  }, [loadClients])

    const [products, setProducts] = useState([])

  const loadProducts = useCallback(async () => {
    try {
      const [rows, reservedByProduct] = await Promise.all([
        db.listProducts(org.id),
        db.listReservedProductQuantities(org.id),
      ])
      setProducts(rows.map((r) => {
        const stock = Number(r.stock_qty) || 0
        const reservedStock = Number(reservedByProduct[r.id]) || 0
        return {
          id: r.id,
          name: r.name,
          sku: r.sku || '',
          barcode: r.barcode || '',
          category: r.category || 'Hardware',
          price: Number(r.price),
          gstRate: Number(r.gst_rate),
          hsnSac: r.hsn_sac || '',
          stock,
          reservedStock,
          availableStock: Math.max(0, stock - reservedStock),
          description: r.description || '',
        }
      }))
    } catch (e) {
      console.error('Failed to load products and reservations:', e)
    }
  }, [org.id])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])
   const [invoices, setInvoices] = useState([])

  const loadInvoices = useCallback(async () => {
    try {
      const rows = await db.listInvoicesFull(org.id)
      setInvoices(rows.map(mapInvoice))
    } catch (e) {
      console.error('Failed to load invoices:', e)
    }
  }, [org.id])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  const saveInvoiceDoc = async (d) => {
    let resolvedClientId = d.clientId
    if (!resolvedClientId) {
      if (!d.clientName?.trim()) throw new Error('Enter a client name before saving.')
      const createdClient = await db.addClient(org.id, {
        name: d.clientName.trim(),
        email: d.clientEmail?.trim() || null,
        phone: d.clientPhone?.trim() || null,
        gstin: d.clientGstin?.trim().toUpperCase() || null,
        state_code: d.clientStateCode || (d.clientGstin ? d.clientGstin.slice(0, 2) : null),
        address: d.clientAddress?.trim() || null,
      })
      resolvedClientId = createdClient.id
      await loadClients()
    }
    const gross = d.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0)
    const value = Number(d.discountValue) || 0
    const pct = d.discountType === 'percentage' ? value : gross > 0 ? (value / gross) * 100 : 0
    const discountPct = Math.min(100, Math.round(pct * 100) / 100)
    const items = d.items.map((it) => ({
      product_id: it.productId || null,
      description: it.description,
      hsn_sac: it.hsnSac || null,
      unit: it.unit || 'unit',
      quantity: Number(it.quantity),
      unit_price: Number(it.unitPrice),
      discount_pct: discountPct,
      gst_rate: Number(it.gstRate),
    }))
    const isExisting = /^[0-9a-f]{8}-/i.test(d.id || '')
    await db.saveInvoice(org.id, {
      id: isExisting ? d.id : null,
      client_id: resolvedClientId,
      issue_date: d.issueDate,
      due_date: d.dueDate,
      status: STATUS_TO_DB[String(d.status || '').toLowerCase()] || (d.status === 'Draft' ? 'draft' : 'pending'),
      notes: d.notes || null,
    }, items)
    await loadInvoices()
  }

const [quotations, setQuotations] = useState([])

  const loadQuotations = useCallback(async () => {
    try {
      const rows = await db.listQuotationsFull(org.id)
      setQuotations(rows.map(mapQuotationRecord))
    } catch (e) {
      console.error('Failed to load quotations:', e)
    }
  }, [org.id])

  useEffect(() => {
    loadQuotations()
  }, [loadQuotations])

  const [salesOrders, setSalesOrders] = useState([])
  const loadSalesOrders = useCallback(async () => {
    try {
      const rows = await db.listSalesOrdersFull(org.id)
      setSalesOrders(rows)
    } catch (e) {
      console.error('Failed to load sales orders:', e)
    }
  }, [org.id])

  useEffect(() => {
    loadSalesOrders()
  }, [loadSalesOrders])

  const handleSalesOrderAction = async (order, action, fields = {}) => {
    if (!canManageBusiness) {
      showToast('Only business owners or admins can update sales orders.', 'error')
      return
    }
    try {
      const result = await db.manageSalesOrderAction(org.id, order.id, action, fields)
      await Promise.all([loadSalesOrders(), loadInvoices(), loadQuotations(), loadProducts()])
      if (action === 'generate_invoice') {
        showToast(result?.invoiceCreated === false
          ? `Invoice ${result.invoiceNumber || ''} already exists for this order.`.trim()
          : `Invoice ${result?.invoiceNumber || ''} generated successfully.`.trim(), 'success')
        navigateTo('/invoices')
      } else {
        const labels = {
          confirm_stock: 'Stock confirmed and reserved.',
          mark_advance_paid: 'Advance payment marked as received.',
          start_packing: 'Packing started.',
          mark_packed: 'Order marked packed.',
          dispatch: 'Order dispatched and tracking saved.',
          cancel_order: 'Order cancelled and reservations released.',
        }
        showToast(labels[action] || 'Sales order updated.', 'success')
      }
    } catch (e) {
      console.error('Sales order action failed:', e)
      showToast(e?.message || 'Could not update the sales order.', 'error')
    }
  }

  const handleSaveDocumentSignature = async (doc, signatureData) => {
    if (!isSupabaseConfigured) throw new Error('Connect Supabase before saving a signature.')
    if (!doc?.id || !/^[0-9a-f-]{36}$/i.test(doc.id)) {
      throw new Error('Save the document to Supabase before adding a reusable signature.')
    }
    await db.saveDocumentSignature(org.id, doc.type, doc.id, signatureData)
    setDocumentSignatures((prev) => ({ ...prev, [doc.id]: signatureData }))
  }

    const [payments, setPayments] = useState([])

  const loadPayments = useCallback(async () => {
    try {
      const rows = await db.listPayments(org.id)
      setPayments(rows.map(mapPayment))
    } catch (e) {
      console.error('Failed to load payments:', e)
    }
  }, [org.id])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  // Company settings are persisted to Supabase through the Settings form.



  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const globalSearchRef = useRef(null)
  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        globalSearchRef.current?.focus()
        globalSearchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  const [notifications, setNotifications] = useState([])

  // Active Document Preview / Editor State
  const [editingDoc, setEditingDoc] = useState(null)
  const [editorMode, setEditorMode] = useState(initialMode)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [documentSignatures, setDocumentSignatures] = useState({})

  useEffect(() => {
    let active = true
    const documentId = previewDoc?.id
    if (!documentId || !/^[0-9a-f-]{36}$/i.test(documentId)) return () => { active = false }
    db.getDocumentSignature(org.id, previewDoc.type, documentId)
      .then((result) => {
        if (active && result?.signatureData) {
          setDocumentSignatures((prev) => ({ ...prev, [documentId]: result.signatureData }))
        }
      })
      .catch((error) => console.warn('Could not load saved document signature:', error))
    return () => { active = false }
  }, [org.id, previewDoc?.id, previewDoc?.type])

  // Modals State
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentDoc, setPaymentDoc] = useState(null)
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ open: false, type: '', id: '', title: '' })

  // Toast System. A monotonic ref provides stable unique toast IDs inside event handlers.
  const [toasts, setToasts] = useState([])
  const toastSequence = useRef(0)
  const showToast = (message, type = 'success') => {
    const id = ++toastSequence.current
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }

  // Navigation Helper
  const navigateTo = useCallback((path) => {
    setMobileMenuOpen(false)
    navigate(path)
  }, [navigate])

  // Quick Action New Document
  const handleStartNewDoc = (mode = 'invoice') => {
    setEditorMode(mode)
    setEditingDoc(null)
    navigateTo(mode === 'invoice' ? '/invoices/new' : '/quotations/new')
  }

  const handleMagicCommand = (rawCommand) => {
    const command = String(rawCommand || '').trim()
    const normalized = command.toLowerCase()
    if (!command) return false
    if (/^(show )?overdue$/.test(normalized) || normalized.includes('show overdue')) {
      navigateTo('/invoices')
      setGlobalSearch('')
      showToast('Open the Invoices page and choose Overdue to review outstanding accounts.', 'success')
      return true
    }
    if (normalized.includes('go to reports') || normalized === 'reports') {
      navigateTo('/reports')
      setGlobalSearch('')
      return true
    }
    if (!/^invoice\b/i.test(command)) return false
    const body = command.replace(/^invoice\s*/i, '')
    const qtyMatch = body.match(/\b(\d+)\s+(.+?)\s+(\d{1,2})%/i)
    if (!qtyMatch) {
      showToast('Try: Invoice Ravi Traders 3 keyboards 18% due in 15 days', 'warning')
      return true
    }
    const quantity = Number(qtyMatch[1])
    const gstRate = Number(qtyMatch[3])
    const productText = qtyMatch[2].trim().toLowerCase().replace(/s$/, '')
    const client = clients.slice().sort((a, b) => String(b.name).length - String(a.name).length).find((item) => body.toLowerCase().includes(String(item.name || '').toLowerCase()))
    const product = products.slice().sort((a, b) => String(b.name).length - String(a.name).length).find((item) => {
      const name = String(item.name || '').toLowerCase()
      return name.includes(productText) || productText.includes(name.replace(/s$/, ''))
    })
    if (!client) { showToast('I could not match a client. Add the client first, then try the command again.', 'warning'); return true }
    if (!product) { showToast('I could not match that product in your catalogue. Add it first, then try again.', 'warning'); return true }
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100000) { showToast('Enter a valid item quantity.', 'warning'); return true }
    const price = Number(product.price) || 0
    const rate = Number.isFinite(gstRate) ? gstRate : Number(product.gstRate ?? 18)
    const issueDate = todayInIndia()
    const dueDays = Number((body.match(/due in (\d+) days?/i) || [])[1] || 15)
    setEditorMode('invoice')
    setEditingDoc({
      clientId: client.id, clientName: client.name, clientEmail: client.email || '', clientPhone: client.phone || '',
      clientAddress: client.address || '', clientGstin: client.gstin || '', clientStateCode: client.stateCode || String(client.gstin || '').slice(0, 2),
      issueDate, dueDate: addDaysToDateString(issueDate, dueDays), paymentTerms: dueDays === 15 ? 'Net 15' : 'Custom', status: 'Draft',
      items: [{ id: 'magic-' + String(product.id), productId: product.id, description: product.name, sku: product.sku || '', hsnSac: product.hsnSac || '', unit: product.unit || 'unit', quantity, unitPrice: price, gstRate: rate, subtotal: quantity * price, taxAmount: quantity * price * rate / 100, total: quantity * price * (1 + rate / 100) }]
    })
    setGlobalSearch('')
    navigateTo('/invoices/new')
    showToast('Draft prepared from your command. Review the details before saving.', 'success')
    return true
  }

  // Accepted/rejected/converted quotations are immutable; duplicate to create a revised offer.
  const handleEditDoc = (doc) => {
    if (doc.type === 'invoice' && doc.status !== 'Draft') {
      showToast('Issued invoices are not editable. Duplicate the invoice to prepare a corrected draft; cancel an unpaid issued invoice only when appropriate.', 'warning')
      return
    }
    if (doc.type === 'quotation' && doc.status !== 'Draft') {
      showToast(doc.status === 'Sent'
        ? 'Issued quotations cannot be edited after sending. Duplicate it to create a new draft revision.'
        : 'This quotation is closed. Duplicate it to create a new draft revision.', 'warning')
      return
    }
    setEditingDoc(doc)
    setEditorMode(doc.type)
    navigateTo(doc.type === 'invoice' ? '/invoices/new' : '/quotations/new')
  }

  // Duplicate documents into the database so they persist after refresh/sign-in.
  const handleDuplicateDoc = async (doc) => {
    if (doc.type === 'invoice') {
      try {
        await saveInvoiceDoc({ ...doc, id: null, status: 'Draft' })
        showToast('Duplicated as a new draft invoice', 'success')
      } catch (e) {
        showToast(e.message, 'error')
      }
      return
    }

    try {
      const items = (doc.items || []).map((item) => ({
        product_id: item.productId || null,
        description: item.description || '',
        hsn_sac: item.hsnSac || null,
        unit: item.unit || 'unit',
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unitPrice) || 0,
        discount_pct: Number(item.discountPct ?? doc.discountValue ?? 0),
        gst_rate: Number(item.gstRate) || 0,
      }))
      const newId = await db.saveQuotation(org.id, {
        id: null,
        client_id: doc.clientId,
        issue_date: todayInIndia(),
        valid_until: doc.dueDate || null,
        status: 'draft',
        notes: doc.notes || null,
        terms: doc.paymentTerms || null,
      }, items)
      const rows = await db.listQuotationsFull(org.id)
      const mapped = rows.map(mapQuotationRecord)
      setQuotations(mapped)
      const created = mapped.find((row) => row.id === newId)
      showToast(created ? `Created draft revision ${created.documentNumber}` : 'Quotation duplicated as a draft', 'success')
    } catch (e) {
      showToast(e.message || 'Could not duplicate quotation', 'error')
    }
  }

  // Delete Document
  const confirmDelete = (type, id, title) => {
    setDeleteConfirmModal({ open: true, type, id, title })
  }

  const executeDelete = () => {
    const { type, id } = deleteConfirmModal
    if (type === 'invoice') {
      const invoiceToCancel = invoices.find((invoice) => invoice.id === id)
      if (invoiceToCancel?.status === 'Cancelled') {
        setDeleteConfirmModal({ open: false, type: '', id: '', title: '' })
        showToast('This invoice is already cancelled.', 'warning')
        return
      }
      if (invoiceToCancel && (['Paid', 'Partially Paid'].includes(invoiceToCancel.status) || Number(invoiceToCancel.amountPaid) > 0)) {
        setDeleteConfirmModal({ open: false, type: '', id: '', title: '' })
        showToast('Invoices with recorded payments cannot be cancelled. Resolve the payment/refund through the appropriate accounting workflow.', 'warning')
        return
      }
      db.cancelInvoice(org.id, id)
        .then(async () => {
          await loadInvoices()
          showToast('Invoice cancelled and retained for audit history', 'success')
        })
        .catch((e) => showToast(e.message, 'error'))
    } else if (type === 'quotation') {
      const quoteToDelete = quotations.find((quote) => quote.id === id)
      if (quoteToDelete && quoteToDelete.status !== 'Draft') {
        setDeleteConfirmModal({ open: false, type: '', id: '', title: '' })
        showToast('Only draft quotations can be permanently deleted. Issued and answered quotations are retained for audit history.', 'warning')
        return
      }
      // Only drafts may be hard-deleted; issued/answered quotations remain in the audit trail.
      db.deleteQuotation(org.id, id)
        .then(async () => {
          await loadQuotations()
          showToast('Quotation deleted successfully', 'success')
        })
        .catch((e) => {
          console.error('Failed to delete quotation:', e)
          showToast(e.message || 'Failed to delete quotation', 'error')
          // Restore the authoritative server list if the delete was rejected.
          loadQuotations()
        })
    } else if (type === 'client') {
           db.deleteClient(org.id, id)
        .then(() => {
          setClients((prev) => prev.filter((c) => c.id !== id))
          showToast('Client removed successfully', 'success')
        })
        .catch((e) => showToast(e.message, 'error'))
    } else if (type === 'product') {
           db.deleteProduct(org.id, id)
        .then(() => {
          setProducts((prev) => prev.filter((p) => p.id !== id))
          showToast('Product removed successfully', 'success')
        })
        .catch((e) => showToast(e.message, 'error'))
    }
    setDeleteConfirmModal({ open: false, type: '', id: '', title: '' })
  }

  // Search Results Filter
  const filteredSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return []
    const q = globalSearch.toLowerCase()
    const results = []

    invoices.forEach((inv) => {
      if (String(inv.documentNumber || '').toLowerCase().includes(q) || inv.clientName.toLowerCase().includes(q)) {
        results.push({
          type: 'Invoice',
          title: inv.documentNumber,
          subtitle: `${inv.clientName} • ${formatINR(inv.grandTotal)}`,
          action: () => {
            setPreviewDoc(inv)
            setGlobalSearch('')
          }
        })
      }
    })

    quotations.forEach((qt) => {
      if (String(qt.documentNumber || '').toLowerCase().includes(q) || qt.clientName.toLowerCase().includes(q)) {
        results.push({
          type: 'Quotation',
          title: qt.documentNumber,
          subtitle: `${qt.clientName} • ${formatINR(qt.grandTotal)}`,
          action: () => {
            setPreviewDoc(qt)
            setGlobalSearch('')
          }
        })
      }
    })

    clients.forEach((c) => {
      if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) {
        results.push({
          type: 'Client',
          title: c.name,
          subtitle: `${c.email} • ${c.phone}`,
          action: () => {
            navigateTo('/clients')
            setGlobalSearch('')
          }
        })
      }
    })

    products.forEach((p) => {
      if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))) {
        results.push({
          type: 'Product',
          title: p.name,
          subtitle: `SKU: ${p.sku} • ${formatINR(p.price)}`,
          action: () => {
            navigateTo('/products')
            setGlobalSearch('')
          }
        })
      }
    })

    return results.slice(0, 8)
  }, [globalSearch, invoices, quotations, clients, products, navigateTo])

  return (
    <div className="lf-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div className="lf-sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className={`lf-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="lf-sidebar-header">
          <Link to="/" className="lf-brand-logo" onClick={() => setMobileMenuOpen(false)}>
            <svg className="lf-logo-icon" viewBox="0 0 40 40" role="img" aria-label="LedgerFlow logo" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ledgerflow-mark-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" />
                  <stop offset="100%" stopColor="#1D4ED8" />
                </linearGradient>
              </defs>
              <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#ledgerflow-mark-gradient)" />
              <path d="M10 11.5h7.5c2.1 0 3.5 1.2 3.5 3.1v14c-1.1-1.2-2.2-1.7-4-1.7H10z" fill="#FFFFFF" />
              <path d="M30 11.5h-5.5c-2.1 0-3.5 1.2-3.5 3.1v14c1.1-1.2 2.2-1.7 4-1.7H30z" fill="#DBEAFE" />
              <path d="M12.5 16h5M12.5 20h5M24 16h3.5M24 20h3.5" stroke="#2563EB" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="29.2" cy="28.2" r="5" fill="#F59E0B" />
              <path d="M26.8 28.2h4.5m-1.8-1.8 1.8 1.8-1.8 1.8" fill="none" stroke="#FFFFFF" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!sidebarCollapsed && (
              <div className="lf-brand-text">
                <span className="lf-brand-title">LedgerFlow</span>
                <span className="lf-brand-subtitle">INVOICE WORKSPACE</span>
              </div>
            )}
          </Link>
          <button
            type="button"
            className="lf-sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="lf-sidebar-nav">
          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => navigateTo('/')}
            title="Overview"
          >
            <span className="lf-nav-icon"><LayoutDashboard size={18} /></span>
            {!sidebarCollapsed && <span>Overview</span>}
          </button>

          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'invoices' ? 'active' : ''}`}
            onClick={() => navigateTo('/invoices')}
            title="Invoices"
          >
            <span className="lf-nav-icon"><FileText size={18} /></span>
            {!sidebarCollapsed && <span>Invoices</span>}
            {!sidebarCollapsed && invoices.length > 0 && (
              <span className="lf-nav-badge">{invoices.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'quotations' ? 'active' : ''}`}
            onClick={() => navigateTo('/quotations')}
            title="Quotations"
          >
            <span className="lf-nav-icon"><FileSpreadsheet size={18} /></span>
            {!sidebarCollapsed && <span>Quotations</span>}
            {!sidebarCollapsed && quotations.length > 0 && (
              <span className="lf-nav-badge">{quotations.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'sales-orders' ? 'active' : ''}`}
            onClick={() => navigateTo('/sales-orders')}
            title="Sales Orders"
          >
            <span className="lf-nav-icon"><Truck size={18} /></span>
            {!sidebarCollapsed && <span>Sales Orders</span>}
            {!sidebarCollapsed && salesOrders.length > 0 && (
              <span className="lf-nav-badge">{salesOrders.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'clients' ? 'active' : ''}`}
            onClick={() => navigateTo('/clients')}
            title="Clients"
          >
            <span className="lf-nav-icon"><Users size={18} /></span>
            {!sidebarCollapsed && <span>Clients</span>}
          </button>

          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => navigateTo('/products')}
            title="Products & Inventory"
          >
            <span className="lf-nav-icon"><Package size={18} /></span>
            {!sidebarCollapsed && <span>Products & Inventory</span>}
          </button>

          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => navigateTo('/payments')}
            title="Payments"
          >
            <span className="lf-nav-icon"><CreditCard size={18} /></span>
            {!sidebarCollapsed && <span>Payments</span>}
          </button>

          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => navigateTo('/reports')}
            title="Reports"
          >
            <span className="lf-nav-icon"><BarChart3 size={18} /></span>
            {!sidebarCollapsed && <span>Reports & Analytics</span>}
          </button>

          <button
            type="button"
            className={`lf-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => navigateTo('/settings')}
            title="Settings"
          >
            <span className="lf-nav-icon"><Settings size={18} /></span>
            {!sidebarCollapsed && <span>Settings</span>}
          </button>
        </nav>

        <div className="lf-sidebar-footer">
          <Link
            to="/terms"
            className="lf-nav-item"
            style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--lf-text-muted)' }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <HelpCircle size={14} />
            {!sidebarCollapsed && <span>Terms & Conditions</span>}
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <div className={`lf-main-wrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* TOP NAVIGATION BAR */}
        <header className="lf-top-nav lf-non-printable">
          <div className="lf-top-nav-left">
            <button
              type="button"
              className="lf-mobile-toggle"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Toggle Navigation Menu"
            >
              <Menu size={20} />
            </button>

            <div className="lf-page-breadcrumbs">
              <div className="lf-breadcrumb-trail">
                <span>LedgerFlow</span>
                <ChevronRight size={10} />
                <span style={{ color: 'var(--lf-brand)' }}>
                  {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </span>
              </div>
              <h1 className="lf-page-title">
                {activeTab === 'dashboard' && 'Financial Overview'}
                {activeTab === 'invoices' && 'Invoices'}
                {activeTab === 'quotations' && 'Quotations & Estimates'}
                {activeTab === 'sales-orders' && 'Sales Orders & Fulfillment'}
                {activeTab === 'clients' && 'Client Directory'}
                {activeTab === 'products' && 'Product Catalogue & Inventory'}
                {activeTab === 'payments' && 'Payment Transactions'}
                {activeTab === 'reports' && 'Financial Reports & Insights'}
                {activeTab === 'settings' && 'System Configuration'}
                {activeTab === 'editor' && (editorMode === 'invoice' ? 'New Tax Invoice' : 'New Price Quotation')}
              </h1>
            </div>
          </div>

          <div className="lf-top-nav-right">
            {/* Global Search */}
            <div className="lf-search-box">
              <Search size={16} className="lf-search-icon" />
              <input
                ref={globalSearchRef}
                type="text"
                className="lf-search-input"
                placeholder="Search or type a command…  (Ctrl+K)"
                aria-label="Search records or enter a command"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleMagicCommand(globalSearch) }}
              />
              {filteredSearchResults.length > 0 && (
                <div className="lf-search-results-dropdown">
                  {filteredSearchResults.map((res, idx) => (
                    <div
                      key={idx}
                      className="lf-search-result-item"
                      onClick={() => res.action()}
                    >
                      <span className="lf-badge lf-badge-draft" style={{ fontSize: '10px' }}>
                        {res.type}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '12px' }}>{res.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>{res.subtitle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications Panel */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="lf-icon-btn"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                title="Notifications"
                aria-label="View notifications"
              >
                <Bell size={18} />
                {notifications.some((n) => n.unread) && <span className="lf-btn-badge" />}
              </button>

              {notificationsOpen && (
                <div className="lf-notification-panel">
                  <div className="lf-panel-header">
                    <h4>Notifications</h4>
                    <button
                      type="button"
                      className="lf-btn lf-btn-ghost lf-btn-sm"
                      onClick={() => {
                        setNotifications(notifications.map((n) => ({ ...n, unread: false })))
                        showToast('All notifications marked as read', 'success')
                      }}
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="lf-panel-body">
                    {notifications.map((n) => (
                      <div key={n.id} className={`lf-notification-item ${n.unread ? 'unread' : ''}`}>
                        <div style={{ color: 'var(--lf-brand)' }}><CheckCircle2 size={16} /></div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '12px', color: 'var(--lf-text)' }}>{n.text}</p>
                          <span style={{ fontSize: '10px', color: 'var(--lf-text-muted)' }}>{n.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="lf-user-profile-menu">
              <button
                type="button"
                className="lf-profile-pill"
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                aria-label="User Account Menu"
              >
                <div className="lf-avatar">{String(companyProfile.tradeName || companyProfile.companyName || 'LF').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase()}</div>
                <div className="lf-profile-info">
                  <span className="lf-profile-name">{companyProfile.tradeName || companyProfile.companyName || 'Your Business'}</span>
                  <span className="lf-profile-role">{String(org.role || 'member').replace(/^\w/, (letter) => letter.toUpperCase())}</span>
                </div>
                <ChevronDown size={14} style={{ color: 'var(--lf-text-muted)' }} />
              </button>

              {profileMenuOpen && (
                <div className="lf-dropdown-menu">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--lf-border)' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{companyProfile.tradeName || companyProfile.companyName || 'Your Business'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>{companyProfile.email || 'No business email configured'}</div>
                  </div>
                  <button
                    type="button"
                    className="lf-dropdown-item"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      navigateTo('/settings')
                    }}
                  >
                    <Settings size={15} />
                    <span>Company Settings</span>
                  </button>
                  <button
                    type="button"
                    className="lf-dropdown-item"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      navigateTo('/reports')
                    }}
                  >
                    <BarChart3 size={15} />
                    <span>Financial Reports</span>
                  </button>
                  <div className="lf-dropdown-divider" />
                  <button type="button" className="lf-dropdown-item lf-dropdown-signout" onClick={async () => {
                    setProfileMenuOpen(false)
                    try { await org.signOut?.() } catch (error) { showToast(error?.message || 'Could not sign out. Try again.', 'error') }
                  }}>
                    <LogOut size={15} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* MAIN BODY VIEWPORT */}
        <main className="lf-content-viewport">
          {activeTab === 'dashboard' && (
            <DashboardView
              invoices={invoices}
              payments={payments}
              quotations={quotations}
              companyProfile={companyProfile}
              userName={org.user?.user_metadata?.full_name || org.full_name || (org.email ? org.email.split('@')[0] : 'there')}
              onViewDoc={(doc) => setPreviewDoc(doc)}
              onGoSettings={() => navigateTo('/settings')}
            />
          )}

          {activeTab === 'invoices' && (
            <DocumentsListView
              type="invoice"
              documents={invoices}
              onNewDoc={() => handleStartNewDoc('invoice')}
              onViewDoc={(doc) => setPreviewDoc(doc)}
              onEditDoc={handleEditDoc}
              onDuplicateDoc={handleDuplicateDoc}
              onDeleteDoc={(doc) => confirmDelete('invoice', doc.id, doc.documentNumber)}
              onRecordPayment={(doc) => {
                if (['Draft', 'Cancelled', 'Paid'].includes(doc.status) || Number(doc.balanceDue) <= 0) {
                  showToast('Only issued invoices with an outstanding balance can receive payments.', 'warning')
                  return
                }
                setPaymentDoc(doc)
                setPaymentModalOpen(true)
              }}
            />
          )}

          {activeTab === 'quotations' && (
            <DocumentsListView
              type="quotation"
              documents={quotations}
              onNewDoc={() => handleStartNewDoc('quotation')}
              onViewDoc={(doc) => setPreviewDoc(doc)}
              onEditDoc={handleEditDoc}
              onDuplicateDoc={handleDuplicateDoc}
              onDeleteDoc={(doc) => confirmDelete('quotation', doc.id, doc.documentNumber)}
            />
          )}

          {activeTab === 'sales-orders' && (
            <SalesOrdersView
              orders={salesOrders}
              canManage={canManageBusiness}
              onAction={handleSalesOrderAction}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsView
              clients={clients}
              invoices={invoices}
              onAddClient={() => {
                setEditingClient(null)
                setClientModalOpen(true)
              }}
              onEditClient={(client) => {
                setEditingClient(client)
                setClientModalOpen(true)
              }}
              onDeleteClient={(client) => confirmDelete('client', client.id, client.name)}
              onSelectClientToInvoice={(client) => {
                setEditorMode('invoice')
                setEditingDoc({
                  clientId: client.id,
                  clientName: client.name,
                  clientEmail: client.email,
                  clientPhone: client.phone,
                  clientAddress: client.address,
                  clientGstin: client.gstin,
                  items: []
                })
                navigateTo('/invoices/new')
              }}
            />
          )}

          {activeTab === 'products' && (
            <ProductsView
              products={products}
              onAddProduct={() => {
                setEditingProduct(null)
                setProductModalOpen(true)
              }}
              onEditProduct={(p) => {
                setEditingProduct(p)
                setProductModalOpen(true)
              }}
              onDeleteProduct={(p) => confirmDelete('product', p.id, p.name)}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsView
              payments={payments}
              onOpenPaymentModal={() => {
                setPaymentDoc(null)
                setPaymentModalOpen(true)
              }}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              invoices={invoices}
              payments={payments}
            />
          )}

          {activeTab === 'settings' && (
            canManageBusiness ? <SettingsView
              profile={companyProfile}
            onSaveProfile={async (updated) => {
  try {
    const termsMatch = String(updated.defaultPaymentTerms || '').match(/\d+/)
    const gstin = String(updated.gstin || '').trim()

    const saved = await db.updateOrg(org.id, {
      name: updated.tradeName?.trim() || updated.companyName?.trim(),
      legal_name: updated.companyName?.trim() || null,
      gstin: gstin || null,
      pan: updated.pan?.trim() || null,
      state_code: /^\d{2}$/.test(String(updated.stateCode || '')) ? String(updated.stateCode) : (gstin.slice(0, 2) || org.state_code || null),
      bank_account_holder: updated.accountHolder?.trim() || null,
      email: updated.email?.trim() || null,
      phone: updated.phone?.trim() || null,
      address: updated.address?.trim() || null,
      website: updated.website?.trim() || null,
      invoice_prefix: updated.invoicePrefix?.trim() || 'INV-',
      quote_prefix: updated.quotationPrefix?.trim() || 'QT-',
      default_gst_rate: Number(updated.defaultGstRate) || 0,
      default_payment_terms_days: termsMatch
        ? Number(termsMatch[0])
        : Number(org.default_payment_terms_days || 15),
      bank_name: updated.bankName?.trim() || null,
      bank_account_no: updated.accountNumber?.trim() || null,
      bank_ifsc: updated.ifscCode?.trim() || null,
      upi_id: updated.upiId?.trim() || null,
      terms: updated.notes?.trim() || null,
    })

    setCompanyProfile({
      ...updated,
      companyName: saved.legal_name || saved.name || '',
      tradeName: saved.name || '',
      gstin: saved.gstin || '',
      pan: saved.pan || '',
      email: saved.email || '',
      phone: saved.phone || '',
      address: saved.address || '',
      website: saved.website || '',
      invoicePrefix: saved.invoice_prefix || 'INV-',
      quotationPrefix: saved.quote_prefix || 'QT-',
      defaultPaymentTerms: `Net ${saved.default_payment_terms_days || 15}`,
      defaultGstRate: Number(saved.default_gst_rate ?? 18),
      stateCode: saved.state_code || String(saved.gstin || '').slice(0, 2),
      bankName: saved.bank_name || '',
      accountHolder: saved.bank_account_holder || saved.legal_name || saved.name || '',
      accountNumber: saved.bank_account_no || '',
      ifscCode: saved.bank_ifsc || '',
      upiId: saved.upi_id || '',
      notes: saved.terms || '',
    })

    showToast('Company settings saved to Supabase', 'success')
  } catch (e) {
    console.error('Failed to save company settings:', e)
    showToast(e.message || 'Failed to save company settings', 'error')
  }
}}
              showToast={showToast}
            /> : (
              <div className="lf-card" role="alert">
                <h2 className="lf-card-title">Business settings are restricted</h2>
                <p className="lf-card-subtitle">Only organization owners and admins can change company-wide settings. Ask an owner or admin if these details need updating.</p>
              </div>
            )
          )}

          {activeTab === 'editor' && (
            <DocumentEditorView
              mode={editorMode}
              companyProfile={companyProfile}
              clients={clients}
              products={products}
              existingDoc={editingDoc}
              onCancel={() => navigateTo(editorMode === 'invoice' ? '/invoices' : '/quotations')}
              onGoSettings={() => navigateTo('/settings')}
  onSave={async (savedDoc) => {
  if (savedDoc.type === 'invoice') {
    try {
      await saveInvoiceDoc(savedDoc)
      showToast('Invoice saved successfully', 'success')
      navigateTo('/invoices')
    } catch (e) {
      showToast(e.message, 'error')
    }
  } else {
    try {
      let resolvedClientId = savedDoc.clientId
      if (!resolvedClientId) {
        if (!savedDoc.clientName?.trim()) throw new Error('Enter a client name before saving.')
        const createdClient = await db.addClient(org.id, {
          name: savedDoc.clientName.trim(),
          email: savedDoc.clientEmail?.trim() || null,
          phone: savedDoc.clientPhone?.trim() || null,
          gstin: savedDoc.clientGstin?.trim().toUpperCase() || null,
          state_code: savedDoc.clientStateCode || (savedDoc.clientGstin ? savedDoc.clientGstin.slice(0, 2) : null),
          address: savedDoc.clientAddress?.trim() || null,
        })
        resolvedClientId = createdClient.id
        await loadClients()
      }

      const gross = (savedDoc.items || []).reduce(
        (sum, item) =>
          sum +
          (Number(item.quantity) || 0) *
          (Number(item.unitPrice) || 0),
        0
      )

      const discountValue = Number(savedDoc.discountValue) || 0

      const discountPercent =
        savedDoc.discountType === 'percentage'
          ? discountValue
          : gross > 0
            ? (discountValue / gross) * 100
            : 0

      const discountPct = Math.min(
        100,
        Math.round(discountPercent * 100) / 100
      )

      const isExisting = /^[0-9a-f]{8}-/i.test(savedDoc.id || '')

      const items = (savedDoc.items || []).map((item) => ({
        product_id: item.productId || null,
        description: item.description || '',
        hsn_sac: item.hsnSac || null,
        unit: item.unit || 'unit',
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unitPrice) || 0,
        discount_pct: discountPct,
        gst_rate: Number(item.gstRate) || 0,
      }))

      const requestedStatus = String(savedDoc.status || 'draft').toLowerCase()
      const wasDraft = !isExisting || String(editingDoc?.status || 'draft').toLowerCase() === 'draft'
      const shouldSendIssueEmail = requestedStatus === 'sent' && wasDraft

      // A quotation must not be marked Sent until the email provider accepts it.
      // Keep it as a draft while sending so a failed email can be retried safely.
      const quotationId = await db.saveQuotation(
        org.id,
        {
          id: isExisting ? savedDoc.id : null,
          client_id: resolvedClientId,
          issue_date: savedDoc.issueDate,
          valid_until: savedDoc.dueDate || null,
          status: shouldSendIssueEmail ? 'draft' : requestedStatus,
          notes: savedDoc.notes || null,
          terms: savedDoc.paymentTerms || null,
        },
        items
      )

      let emailError = null
      if (shouldSendIssueEmail) {
        try {
          await db.sendDocumentEmail(org.id, 'quotation', quotationId)
        } catch (error) {
          emailError = error
          console.error('Quotation saved, but client email could not be sent:', error)
        }
      }

      await loadQuotations()
      if (emailError) {
        showToast('Quotation saved, but email was not sent: ' + (emailError.message || 'Check email configuration and try again.'), 'error')
      } else if (shouldSendIssueEmail) {
        showToast('Quotation issued and email accepted by the provider for ' + (savedDoc.clientEmail || 'the client'), 'success')
      } else {
        showToast('Quotation saved successfully', 'success')
      }
      navigateTo('/quotations')
    } catch (e) {
      console.error('Failed to save quotation:', e)
      showToast(e.message, 'error')
    }
  }
}}

              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          companyProfile={companyProfile}
          onClose={() => setPreviewDoc(null)}
          onEdit={() => {
            const docToEdit = previewDoc
            setPreviewDoc(null)
            handleEditDoc(docToEdit)
          }}
          showToast={showToast}
          signatureData={documentSignatures[previewDoc.id] || ''}
          onSignatureChange={(value) => handleSaveDocumentSignature(previewDoc, value)}
            onGoSettings={() => { setPreviewDoc(null); navigateTo('/settings') }}
        />
      )}

      {/* DEDICATED A4 PRINT CONTAINER (ALWAYS IN DOM, PRINTED ONLY VIA WINDOW.PRINT) */}
      {previewDoc && (
        <div id="ledgerflow-printable-document" className="lf-printable-document">
          <PrintableInvoiceTemplate doc={previewDoc} companyProfile={companyProfile} signatureData={documentSignatures[previewDoc.id] || ''} />
        </div>
      )}

      {/* CLIENT ADD/EDIT MODAL */}
      {clientModalOpen && (
        <ClientModal
          client={editingClient}
          onClose={() => setClientModalOpen(false)}
                  onSave={async (savedClient) => {
            try {
              const payload = {
                name: savedClient.name,
                contact_person: savedClient.contactPerson,
                 state_code: savedClient.stateCode || (savedClient.gstin ? savedClient.gstin.substring(0, 2) : null),
                email: savedClient.email,
                phone: savedClient.phone,
                gstin: savedClient.gstin,
                address: savedClient.address,
              }
              if (editingClient) await db.updateClient(org.id, editingClient.id, payload)
              else await db.addClient(org.id, payload)
              await loadClients()
              setClientModalOpen(false)
              showToast(`Client ${savedClient.name} saved`, 'success')
            } catch (e) {
              showToast(e.message, 'error')
            }
          }}
        />
      )}

      {/* PRODUCT ADD/EDIT MODAL */}
      {productModalOpen && (
        <ProductModal
          product={editingProduct}
          onClose={() => setProductModalOpen(false)}
                  onSave={async (savedProduct) => {
            try {
              const payload = {
                name: savedProduct.name,
                sku: savedProduct.sku || null,
                barcode: savedProduct.barcode || null,
                hsn_sac: savedProduct.hsnSac || null,
                category: savedProduct.category,
                price: savedProduct.price,
                gst_rate: savedProduct.gstRate,
                stock_qty: savedProduct.stock,
                description: savedProduct.description,
              }
              if (editingProduct) await db.updateProduct(org.id, editingProduct.id, payload)
              else await db.addProduct(org.id, payload)
              await loadProducts()
              setProductModalOpen(false)
              showToast(`Product ${savedProduct.name} saved`, 'success')
            } catch (e) {
              showToast(e.message, 'error')
            }
          }}
        />
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentModalOpen && (
        <RecordPaymentModal
          preselectedDoc={paymentDoc}
          invoices={invoices.filter((i) => !['Draft', 'Cancelled', 'Paid'].includes(i.status) && Number(i.balanceDue) > 0)}
          onClose={() => {
            setPaymentModalOpen(false)
            setPaymentDoc(null)
          }}
             onSave={async (p) => {
            try {
              await db.recordPaymentFull(
                org.id,
                p.invoiceId,
                p.amount,
                METHOD_TO_DB[p.paymentMethod] || 'other',
                p.referenceNumber || null,
                p.paymentDate,
                p.notes || null
              )
              await Promise.all([loadInvoices(), loadPayments()])
              setPaymentModalOpen(false)
              setPaymentDoc(null)
              showToast(`Payment of ${formatINR(p.amount)} recorded`, 'success')
            } catch (e) {
              showToast(e.message, 'error')
            }
          }}
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmModal.open && (
        <div className="lf-modal-backdrop">
          <div className="lf-modal" style={{ maxWidth: '420px' }}>
            <div className="lf-modal-header">
              <h3 className="lf-modal-title" style={{ color: 'var(--lf-danger)' }}>
                Confirm Deletion
              </h3>
              <button
                type="button"
                className="lf-icon-btn"
                onClick={() => setDeleteConfirmModal({ open: false, type: '', id: '', title: '' })}
              >
                <X size={16} />
              </button>
            </div>
            <div className="lf-modal-body">
              <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
                {deleteConfirmModal.type === 'invoice'
                  ? <>Cancel invoice <strong>{deleteConfirmModal.title}</strong>? Its record will be retained for audit history.</>
                  : <>Are you sure you want to permanently delete <strong>{deleteConfirmModal.title}</strong>? This action cannot be undone.</>}
              </p>
            </div>
            <div className="lf-modal-footer">
              <button
                type="button"
                className="lf-btn lf-btn-secondary"
                onClick={() => setDeleteConfirmModal({ open: false, type: '', id: '', title: '' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="lf-btn lf-btn-danger"
                onClick={executeDelete}
              >
                {deleteConfirmModal.type === 'invoice' ? 'Cancel Invoice' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOASTS CONTAINER */}
      <div className="lf-toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`lf-toast lf-toast-${toast.type}`}>
            {toast.type === 'success' && <CheckCircle2 size={16} color="var(--lf-brand)" />}
            {toast.type === 'error' && <AlertCircle size={16} color="var(--lf-danger)" />}
            {toast.type === 'warning' && <AlertCircle size={16} color="var(--lf-highlight)" />}
            <span style={{ flex: 1 }}>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// DASHBOARD (OVERVIEW) VIEW
// ============================================================================
function RevenueTrendChart({ data }) {
  const [selectedBar, setSelectedBar] = useState(null)
  const [chartWidth, setChartWidth] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 480 ? 360 : 720)
  useEffect(() => {
    const updateWidth = () => setChartWidth(window.innerWidth <= 480 ? 360 : 720)
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const width = chartWidth
  const height = 270
  const margin = { top: 16, right: chartWidth <= 420 ? 8 : 16, bottom: 42, left: chartWidth <= 420 ? 58 : 76 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const values = data.flatMap((row) => [Number(row.Invoiced) || 0, Number(row.Received) || 0])
  const maxValue = Math.max(0, ...values)
  const scaleMax = maxValue > 0 ? Math.ceil(maxValue / 4) * 4 : 4
  const tickValues = Array.from({ length: 5 }, (_, index) => scaleMax * index / 4)
  const slotWidth = plotWidth / Math.max(data.length, 1)
  const barWidth = Math.min(chartWidth <= 420 ? 14 : 25, slotWidth * 0.25)
  const yFor = (value) => margin.top + plotHeight - ((Number(value) || 0) / scaleMax) * plotHeight
  const axisMoney = (value) => {
    if (value >= 1000000) return '₹' + (value / 1000000).toFixed(1) + 'm'
    if (value >= 1000) return '₹' + (value / 1000).toFixed(value >= 10000 ? 0 : 1) + 'k'
    return '₹' + Math.round(value)
  }
  const hasActivity = maxValue > 0

  return (
    <div className="lf-revenue-chart">
      {selectedBar && (
        <div className="lf-chart-selection" role="status" aria-live="polite">
          <span>{selectedBar.month} · {selectedBar.label}</span>
          <strong>{formatINR(selectedBar.amount)}</strong>
          <button type="button" className="lf-chart-selection-clear" onClick={() => setSelectedBar(null)} aria-label="Clear selected chart amount">×</button>
        </div>
      )}
      <svg className="lf-revenue-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Last six months comparing invoiced amounts with payments received">
        {tickValues.map((tick, index) => {
          const y = yFor(tick)
          return <g key={index}>
            <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="#E2E8F0" strokeDasharray={index === 0 ? '0' : '3 5'} />
            <text x={margin.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#64748B">{axisMoney(tick)}</text>
          </g>
        })}
        {data.map((row, index) => {
          const groupX = margin.left + slotWidth * index
          const pairWidth = barWidth * 2 + 8
          const firstX = groupX + (slotWidth - pairWidth) / 2
          const invoiced = Math.max(0, Number(row.Invoiced) || 0)
          const received = Math.max(0, Number(row.Received) || 0)
          const baseY = margin.top + plotHeight
          const invoiceY = yFor(invoiced)
          const receivedY = yFor(received)
          return <g key={row.month}>
            <rect className="lf-chart-bar lf-chart-bar-invoiced" x={firstX} y={invoiceY} width={barWidth} height={Math.max(hasActivity && invoiced > 0 ? 2 : 0, baseY - invoiceY)} rx="4" fill="#2563EB" role="button" tabIndex="0" style={{ cursor: 'pointer', outline: 'none' }} aria-label={`${row.month} invoiced: ${formatINR(invoiced)}`} aria-pressed={selectedBar?.month === row.month && selectedBar?.label === 'Invoiced'} onClick={() => setSelectedBar({ month: row.month, label: 'Invoiced', amount: invoiced })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedBar({ month: row.month, label: 'Invoiced', amount: invoiced }) } }}>
              <title>{row.month} invoiced: {formatINR(invoiced)} — click to view amount</title>
            </rect>
            <rect className="lf-chart-bar lf-chart-bar-received" x={firstX + barWidth + 8} y={receivedY} width={barWidth} height={Math.max(hasActivity && received > 0 ? 2 : 0, baseY - receivedY)} rx="4" fill="#D97706" role="button" tabIndex="0" style={{ cursor: 'pointer', outline: 'none' }} aria-label={`${row.month} received: ${formatINR(received)}`} aria-pressed={selectedBar?.month === row.month && selectedBar?.label === 'Received'} onClick={() => setSelectedBar({ month: row.month, label: 'Received', amount: received })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedBar({ month: row.month, label: 'Received', amount: received }) } }}>
              <title>{row.month} received: {formatINR(received)} — click to view amount</title>
            </rect>
            <text x={groupX + slotWidth / 2} y={height - 19} textAnchor="middle" fontSize="12" fill="#64748B">{row.month}</text>
          </g>
        })}
        {!hasActivity && <text x={margin.left + plotWidth / 2} y={margin.top + plotHeight / 2} textAnchor="middle" fontSize="13" fill="#64748B">Your invoice and collection activity will appear here.</text>}
      </svg>
      <div className="lf-revenue-legend" aria-hidden="true">
        <span><i className="lf-legend-invoiced" /> Invoiced</span>
        <span><i className="lf-legend-received" /> Received</span>
        <span className="lf-chart-period">Last 6 months</span>
      </div>
    </div>
  )
}


function DashboardView({ invoices, payments, quotations, companyProfile, userName, onViewDoc, onGoSettings }) {
  const reportableInvoices = useMemo(() => invoices.filter((invoice) => !['Draft', 'Cancelled'].includes(invoice.status)), [invoices])
  const reportableInvoiceIds = useMemo(() => new Set(reportableInvoices.map((invoice) => invoice.id)), [reportableInvoices])
  const totalInvoiced = useMemo(() => reportableInvoices.reduce((sum, i) => sum + (Number(i.grandTotal) || 0), 0), [reportableInvoices])
  const amountReceived = useMemo(() => reportableInvoices.reduce((sum, i) => sum + (Number(i.amountPaid) || 0), 0), [reportableInvoices])
  const outstandingBalance = useMemo(() => reportableInvoices.reduce((sum, i) => sum + (Number(i.balanceDue) || 0), 0), [reportableInvoices])
  const pendingQuotations = useMemo(() => quotations.filter((q) => q.status === 'Sent'), [quotations])
  const pendingQuotationsValue = useMemo(() => pendingQuotations.reduce((sum, q) => sum + (q.grandTotal || 0), 0), [pendingQuotations])

 const chartData = useMemo(() => {
  const now = new Date(`${todayInIndia()}T12:00:00`)

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    return {
      key,
      month: date.toLocaleDateString('en-IN', { month: 'short' }),
      Invoiced: 0,
      Received: 0,
    }
  })

  const monthMap = new Map(months.map((month) => [month.key, month]))

  reportableInvoices.forEach((invoice) => {
    const key = String(invoice.issueDate || '').slice(0, 7)
    const month = monthMap.get(key)

    if (month) {
      month.Invoiced += Number(invoice.grandTotal) || 0
    }
  })

  payments.filter((payment) => reportableInvoiceIds.has(payment.invoiceId)).forEach((payment) => {
    const key = String(payment.paymentDate || '').slice(0, 7)
    const month = monthMap.get(key)

    if (month) {
      month.Received += Number(payment.amount) || 0
    }
  })

  return months.map(({ month, Invoiced, Received }) => ({
    month,
    Invoiced,
    Received,
  }))
}, [reportableInvoices, reportableInvoiceIds, payments])

  return (
    <div>
      {/* Welcome & Primary Actions Bar */}
      <section className="lf-card lf-dashboard-hero">
        <div className="lf-dashboard-hero-content">
          <div className="lf-dashboard-hero-copy">
            <span className="lf-dashboard-eyebrow">YOUR BUSINESS AT A GLANCE</span>
            <h2 className="lf-dashboard-hero-title">
              Welcome back, {userName || 'there'}
            </h2>
            <p className="lf-dashboard-hero-description">
              Here is your financial billing activity, tax calculations, and receivables status.
            </p>
          </div>

        </div>
      </section>

      {(() => {
        const checklist = [
          { label: 'GSTIN', complete: Boolean(String(companyProfile.gstin || '').trim()) },
          { label: 'Registered address', complete: Boolean(String(companyProfile.address || '').trim()) },
          { label: 'Bank name', complete: Boolean(String(companyProfile.bankName || '').trim()) },
          { label: 'Account number', complete: Boolean(String(companyProfile.accountNumber || '').trim()) },
          { label: 'IFSC code', complete: Boolean(String(companyProfile.ifscCode || '').trim()) },
        ]
        const done = checklist.filter((item) => item.complete).length
        if (done === checklist.length) return null
        return (
          <section className="lf-profile-checklist" aria-label="Complete your business profile">
            <div className="lf-profile-checklist-head">
              <div>
                <h3 className="lf-card-title">Complete your business profile</h3>
                <p className="lf-card-subtitle">Add your business details once to personalize invoices and quotations.</p>
              </div>
              <button type="button" className="lf-btn lf-btn-secondary lf-btn-sm" onClick={onGoSettings}>Go to Settings</button>
            </div>
            <div className="lf-profile-progress" role="progressbar" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={done}>
              <span style={{ width: (done / checklist.length * 100) + '%' }} />
            </div>
            <div className="lf-profile-checklist-items">
              {checklist.map((item) => <span key={item.label} className={item.complete ? 'complete' : ''}>{item.complete ? '✓' : '○'} {item.label}</span>)}
            </div>
          </section>
        )
      })()}

      {/* METRIC CARDS */}
      <div className="lf-metrics-grid">
        <div className="lf-metric-card">
          <div className="lf-metric-header">
            <span className="lf-metric-label">Total Invoiced</span>
            <div className="lf-metric-icon-wrap"><Receipt size={18} /></div>
          </div>
          <div className="lf-metric-value">{formatINR(totalInvoiced)}</div>
          <div className="lf-metric-subtext">
            <span>Based on issued invoices; drafts and cancelled invoices are excluded.</span>
          </div>
        </div>

        <div className="lf-metric-card">
          <div className="lf-metric-header">
            <span className="lf-metric-label">Amount Received</span>
            <div className="lf-metric-icon-wrap"><CheckCircle2 size={18} /></div>
          </div>
          <div className="lf-metric-value">{formatINR(amountReceived)}</div>
          <div className="lf-metric-subtext">
            <span>{totalInvoiced > 0 ? Math.round((amountReceived / totalInvoiced) * 100) : 0}% collection rate</span>
          </div>
        </div>

        <div className="lf-metric-card">
          <div className="lf-metric-header">
            <span className="lf-metric-label">Outstanding Balance</span>
            <div className="lf-metric-icon-wrap amber"><Clock size={18} /></div>
          </div>
          <div className="lf-metric-value" style={{ color: 'var(--lf-highlight)' }}>
            {formatINR(outstandingBalance)}
          </div>
          <div className="lf-metric-subtext">
            <span className={invoices.some((i) => i.status === 'Overdue') ? 'lf-trend-amber' : ''} style={!invoices.some((i) => i.status === 'Overdue') ? { color: 'var(--lf-text-muted)' } : undefined}>{invoices.filter((i) => i.status === 'Overdue').length} overdue {invoices.filter((i) => i.status === 'Overdue').length === 1 ? 'account' : 'accounts'}</span>
          </div>
        </div>

        <div className="lf-metric-card">
          <div className="lf-metric-header">
            <span className="lf-metric-label">Pending Quotations</span>
            <div className="lf-metric-icon-wrap"><FileSpreadsheet size={18} /></div>
          </div>
          <div className="lf-metric-value">{formatINR(pendingQuotationsValue)}</div>
          <div className="lf-metric-subtext">
            <span>{pendingQuotations.length} quotes awaiting client response</span>
          </div>
        </div>
      </div>

      {/* REVENUE CHART & RECENT INVOICES GRID */}
      <div className="lf-dashboard-grid">
        {/* Revenue Activity Chart */}
        <div className="lf-card">
          <div className="lf-card-header">
            <div>
              <h3 className="lf-card-title">Invoice performance</h3>
              <p className="lf-card-subtitle">Monthly invoiced value vs. payments received</p>
            </div>
            <span className="lf-badge lf-badge-sent">{indianFinancialYearLabel()}</span>
          </div>
          <div className="lf-chart-summary" aria-label="Six-month invoicing totals">
            <div className="lf-chart-summary-item is-invoiced">
              <span>Total invoiced · 6 months</span>
              <strong>{formatINR(chartData.reduce((sum, row) => sum + (Number(row.Invoiced) || 0), 0))}</strong>
            </div>
            <div className="lf-chart-summary-item is-received">
              <span>Total received · 6 months</span>
              <strong>{formatINR(chartData.reduce((sum, row) => sum + (Number(row.Received) || 0), 0))}</strong>
            </div>
            <div className="lf-chart-summary-item is-outstanding">
              <span>Outstanding now</span>
              <strong>{formatINR(outstandingBalance)}</strong>
            </div>
          </div>
          <div className="lf-chart-wrap">
            <RevenueTrendChart data={chartData} />
          </div>
        </div>

        {/* Recent Invoices Quick Table */}
        <div className="lf-card">
          <div className="lf-card-header">
            <div>
              <h3 className="lf-card-title">Latest invoice activity</h3>
              <p className="lf-card-subtitle">Recent documents, amounts and payment status</p>
            </div>
          </div>
          <div className="lf-table-container">
            <table className="lf-table">
              <thead>
                <tr>
                  <th>Doc #</th>
                  <th>Client</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.slice(0, 4).map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, color: 'var(--lf-brand)' }}>{inv.documentNumber}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{inv.clientName}</div>
                      <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>Due {inv.dueDate}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatINR(inv.grandTotal)}</td>
                    <td>
                      <span className={`lf-badge lf-badge-${inv.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="lf-btn lf-btn-ghost lf-btn-sm"
                        onClick={() => onViewDoc(inv)}
                        title="View Document"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// DOCUMENTS LIST VIEW (INVOICES & QUOTATIONS)
// ============================================================================

function DocumentsListView({
  type = 'invoice',
  documents,
  onNewDoc,
  onViewDoc,
  onEditDoc,
  onDuplicateDoc,
   onDeleteDoc,
  onRecordPayment
}) {
  const [filterStatus, setFilterStatus] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('issueDate')
  const [sortOrder, setSortOrder] = useState('desc')

  const isInvoice = type === 'invoice'

  // Filter & Sort
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchesStatus = filterStatus === 'All' || doc.status.toLowerCase() === filterStatus.toLowerCase()
      const matchesSearch =
        String(doc.documentNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.clientName.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesStatus && matchesSearch
    }).sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]
      if (sortField === 'grandTotal') {
        valA = Number(valA) || 0
        valB = Number(valB) || 0
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
  }, [documents, filterStatus, searchQuery, sortField, sortOrder])

  return (
    <div className="lf-card">
      {/* Top Action Bar */}
      <div className="lf-card-header">
        <div>
          <h2 className="lf-card-title">{isInvoice ? 'Invoices' : 'Quotations & Estimates'}</h2>
          <p className="lf-card-subtitle">
            Manage, issue, track, and export your professional {isInvoice ? 'tax invoices' : 'price quotations'}
          </p>
        </div>
        <button type="button" className="lf-btn lf-btn-primary" onClick={onNewDoc}>
          <Plus size={16} />
          <span>Create {isInvoice ? 'Invoice' : 'Quotation'}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--lf-text-muted)' }} />
          <input
            type="text"
            className="lf-form-input"
            style={{ paddingLeft: '32px' }}
            placeholder={`Search ${isInvoice ? 'invoices' : 'quotations'} by # or client...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Status Filter Buttons */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {(isInvoice ? ['All', 'Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'] : ['All', 'Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted']).map((st) => (
            <button
              key={st}
              type="button"
              className={`lf-btn lf-btn-sm ${filterStatus === st ? 'lf-btn-primary' : 'lf-btn-secondary'}`}
              onClick={() => setFilterStatus(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      {filteredDocs.length === 0 ? (
        <div className="lf-empty-state">
          <div className="lf-empty-icon"><FileText size={28} /></div>
          <h4 className="lf-empty-title">No {isInvoice ? 'invoices' : 'quotations'} found</h4>
          <p className="lf-empty-desc">
            {searchQuery || filterStatus !== 'All'
              ? 'Try adjusting your search query or filter to view results.'
              : `Create your first ${isInvoice ? 'tax invoice' : 'price quotation'} to get started.`}
          </p>
          <button type="button" className="lf-btn lf-btn-primary" onClick={onNewDoc}>
            <Plus size={16} />
            <span>Create {isInvoice ? 'Invoice' : 'Quotation'}</span>
          </button>
        </div>
      ) : (
        <div className="lf-table-container">
          <table className="lf-table">
            <thead>
              <tr>
                <th onClick={() => { setSortField('documentNumber'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc') }} style={{ cursor: 'pointer' }}>
                  Document # {sortField === 'documentNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>Client Name</th>
                <th onClick={() => { setSortField('issueDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc') }} style={{ cursor: 'pointer' }}>
                  Issue Date {sortField === 'issueDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                <th>{isInvoice ? 'Due Date' : 'Valid Until'}</th>
                <th onClick={() => { setSortField('grandTotal'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc') }} style={{ cursor: 'pointer' }}>
                  Total Amount (&#8377;) {sortField === 'grandTotal' && (sortOrder === 'asc' ? '↑' : '↓')}
                </th>
                {isInvoice && <th>Balance Due</th>}
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ fontWeight: 600, color: 'var(--lf-brand)' }}>
                    {doc.documentNumber}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{doc.clientName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>{doc.clientEmail}</div>
                  </td>
                  <td>{formatDisplayDate(doc.issueDate)}</td>
                  <td>{formatDisplayDate(doc.dueDate)}</td>
                  <td style={{ fontWeight: 700 }}>{formatINR(doc.grandTotal)}</td>
                  {isInvoice && (
                    <td style={{ fontWeight: 600, color: doc.status === 'Cancelled' ? 'var(--lf-text-muted)' : Number(doc.balanceDue) > 0 ? 'var(--lf-warning)' : 'var(--lf-text-muted)' }}>
                      {doc.status === 'Cancelled' ? '—' : formatINR(doc.balanceDue || 0)}
                    </td>
                  )}
                  <td>
                    <span className={`lf-badge lf-badge-${doc.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="lf-btn lf-btn-ghost lf-btn-sm"
                        onClick={() => onViewDoc(doc)}
                        title="View / Print Document"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        className="lf-btn lf-btn-ghost lf-btn-sm"
                        onClick={() => onEditDoc(doc)}
                        title="Edit Document"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="lf-btn lf-btn-ghost lf-btn-sm"
                        onClick={() => onDuplicateDoc(doc)}
                        title="Duplicate as Draft"
                      >
                        <Copy size={15} />
                      </button>
                      {isInvoice && !['Paid', 'Cancelled', 'Draft'].includes(doc.status) && Number(doc.balanceDue) > 0 && onRecordPayment && (
                        <button
                          type="button"
                          className="lf-btn lf-btn-outline-brand lf-btn-sm"
                          onClick={() => onRecordPayment(doc)}
                          title="Record Received Payment"
                        >
                          <CreditCard size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="lf-btn lf-btn-ghost lf-btn-sm"
                        style={{ color: 'var(--lf-danger)' }}
                        disabled={isInvoice && (['Paid', 'Partially Paid', 'Cancelled'].includes(doc.status) || Number(doc.amountPaid) > 0)}
                        onClick={() => onDeleteDoc(doc)}
                        title={isInvoice && (['Paid', 'Partially Paid', 'Cancelled'].includes(doc.status) || Number(doc.amountPaid) > 0)
                          ? 'Invoices with payments or an existing cancellation cannot be cancelled'
                          : 'Cancel document'}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// DOCUMENT EDITOR (CREATE & EDIT INVOICES / QUOTATIONS)
// ============================================================================

function DocumentEditorView({
  mode = 'invoice',
  companyProfile,
  clients,
  products,
  existingDoc,
  onSave,
  onCancel,
  onGoSettings = () => {},
  showToast
}) {
  const isInvoice = mode === 'invoice'
  const missingSellerFields = [
    !String(companyProfile.gstin || '').trim() && 'GSTIN',
    !String(companyProfile.address || '').trim() && 'registered address',
    !String(companyProfile.bankName || '').trim() && 'bank name',
    !String(companyProfile.accountNumber || '').trim() && 'bank account number',
    !String(companyProfile.ifscCode || '').trim() && 'IFSC code',
  ].filter(Boolean)
  const submitLockRef = useRef(false)
  const [saving, setSaving] = useState(false)

  // The database assigns the permanent document number when a new document is saved.
  const documentNumber = existingDoc?.documentNumber || ''
  const [selectedClientId, setSelectedClientId] = useState(existingDoc?.clientId || '')
  const [clientName, setClientName] = useState(existingDoc?.clientName || '')
  const [clientEmail, setClientEmail] = useState(existingDoc?.clientEmail || '')
  const [clientPhone, setClientPhone] = useState(existingDoc?.clientPhone || '')
  const [clientAddress, setClientAddress] = useState(existingDoc?.clientAddress || '')
  const [clientGstin, setClientGstin] = useState(existingDoc?.clientGstin || '')
  const [clientStateCode, setClientStateCode] = useState(existingDoc?.clientStateCode || '')

  const [issueDate, setIssueDate] = useState(() => existingDoc?.issueDate || todayInIndia())
  const [dueDate, setDueDate] = useState(() =>
    existingDoc?.dueDate || addDaysToDateString(
      existingDoc?.issueDate || todayInIndia(),
      paymentTermsDays(existingDoc?.paymentTerms || companyProfile.defaultPaymentTerms)
    )
  )
  const [paymentTerms, setPaymentTerms] = useState(existingDoc?.paymentTerms || companyProfile.defaultPaymentTerms)
  const [status] = useState(existingDoc?.status || 'Draft')
  const [notes, setNotes] = useState(existingDoc?.notes || companyProfile.notes)

  // Line Items
  const [items, setItems] = useState(() => {
    if (existingDoc?.items?.length) return existingDoc.items.map((item) => {
      const quantity = Number(item.quantity) || 0
      const unitPrice = Number(item.unitPrice) || 0
      const gstRate = Number(item.gstRate) || 0
      const subtotal = quantity * unitPrice
      const taxAmount = subtotal * gstRate / 100
      return { ...item, subtotal, taxAmount, total: subtotal + taxAmount }
    })
    return [
      {
        id: `item-${Date.now()}`,
        productId: '',
        description: '',
        sku: '',
        hsnSac: '',
        quantity: 1,
        unitPrice: 0,
        gstRate: Number(companyProfile.defaultGstRate ?? 18),
        subtotal: 0,
        taxAmount: 0,
        total: 0
      }
    ]
  })

  // Discount
  const [discountType, setDiscountType] = useState(existingDoc?.discountType || 'percentage')
  const [discountValue, setDiscountValue] = useState(existingDoc?.discountValue || 0)

  // Barcode Scanner Modal State
  const [scannerOpen, setScannerOpen] = useState(false)

  // Handle Client Auto-fill
  const handleClientChange = (clientId) => {
    setSelectedClientId(clientId)
    const client = clients.find((c) => c.id === clientId)
    if (client) {
      setClientName(client.name)
      setClientEmail(client.email)
      setClientPhone(client.phone)
      setClientAddress(client.address)
      setClientGstin(client.gstin)
      setClientStateCode(client.stateCode || String(client.gstin || '').slice(0, 2))
    }
  }

  // Handle Product Selection for Line Item
  const handleProductSelect = (index, productId) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return

    setItems((prev) => {
      const updated = [...prev]
      const qty = updated[index].quantity || 1
      const price = product.price
      const gst = Number(product.gstRate ?? 18)
      const subtotal = qty * price
      const taxAmount = (subtotal * gst) / 100

      updated[index] = {
        ...updated[index],
        productId: product.id,
        description: product.name,
        sku: product.sku,
        hsnSac: product.hsnSac || '',
        unitPrice: price,
        gstRate: gst,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount
      }
      return updated
    })
  }

  // Handle Line Item Quantity/Price/GST updates
  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index], [field]: value }

      const qty = Number(item.quantity) || 0
      const price = Number(item.unitPrice) || 0
      const gst = Number(item.gstRate) || 0

      const subtotal = qty * price
      const taxAmount = (subtotal * gst) / 100

      item.subtotal = subtotal
      item.taxAmount = taxAmount
      item.total = subtotal + taxAmount

      updated[index] = item
      return updated
    })
  }

  // Add Empty Line Item
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random()}`,
        productId: '',
        description: '',
        sku: '',
        hsnSac: '',
        quantity: 1,
        unitPrice: 0,
        gstRate: Number(companyProfile.defaultGstRate ?? 18),
        subtotal: 0,
        taxAmount: 0,
        total: 0
      }
    ])
  }

  // Remove Line Item
  const handleRemoveItem = (index) => {
    if (items.length <= 1) {
      showToast('A document must have at least one line item', 'warning')
      return
    }
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Add saved products immediately; otherwise look up public product data by barcode.
  const addScannedLineItem = (incoming) => {
    setItems((prev) => {
      const incomingSku = String(incoming.sku || '').trim().toLowerCase()
      const existingIndex = prev.findIndex((item) => {
        if (incoming.productId) return item.productId === incoming.productId
        return !item.productId && incomingSku &&
          String(item.sku || '').trim().toLowerCase() === incomingSku
      })

      if (existingIndex >= 0) {
        const updated = [...prev]
        const old = updated[existingIndex]
        const quantity = (Number(old.quantity) || 1) + 1
        const unitPrice = Number(old.unitPrice) || 0
        const gstRate = Number(old.gstRate) || 0
        const subtotal = quantity * unitPrice
        const taxAmount = subtotal * gstRate / 100

        updated[existingIndex] = {
          ...old, quantity, subtotal, taxAmount,
          total: subtotal + taxAmount
        }
        return updated
      }

      const blankIndex = prev.findIndex((item) =>
        !item.productId &&
        !String(item.description || '').trim() &&
        !String(item.sku || '').trim() &&
        Number(item.unitPrice) === 0
      )

      if (blankIndex >= 0) {
        const updated = [...prev]
        updated[blankIndex] = { ...incoming, id: prev[blankIndex].id }
        return updated
      }

      return [...prev, incoming]
    })
  }

  const handleAddProductByCode = useCallback(async (code) => {
    const rawCode = String(code || '').trim()
    if (!rawCode) return false

    const normalized = rawCode.toLowerCase()
    const product = products.find((p) =>
      (p.barcode && String(p.barcode).trim().toLowerCase() === normalized) ||
      (p.sku && String(p.sku).trim().toLowerCase() === normalized)
    )

    if (product) {
      const price = Number(product.price) || 0
      const gstRate = Number(product.gstRate ?? companyProfile.defaultGstRate ?? 18)
      const subtotal = price
      const taxAmount = subtotal * gstRate / 100

      addScannedLineItem({
        id: `item-${Date.now()}-${Math.random()}`,
        productId: product.id,
        description: product.name,
        sku: product.sku || product.barcode || rawCode,
        quantity: 1,
        unitPrice: price,
        gstRate,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount
      })

      showToast(`Added "${product.name}" from your catalogue.`, 'success')
      return true
    }

    // Open Food Facts lookup is for numeric retail barcodes, not arbitrary QR text or SKUs.
    const barcode = rawCode.replace(/\s+/g, '')
    if (!/^\d{8,14}$/.test(barcode)) {
      showToast(`No catalogue match for "${rawCode}". Enter the product details manually.`, 'warning')
      return false
    }

    try {
      showToast('Searching the public product database...', 'warning')

      const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,product_name_en,brands,quantity,generic_name,categories`
      const response = await fetch(url, {
        headers: { Accept: 'application/json' }
      })

      if (!response.ok) {
        throw new Error(`Product lookup returned HTTP ${response.status}`)
      }

      const data = await response.json()
      const external = data?.product
      const productName = external?.product_name ||
        external?.product_name_en ||
        external?.generic_name

      if (!external || !productName) {
        showToast(`Barcode ${barcode} was not found online. Enter the product manually.`, 'warning')
        return false
      }

      const brand = String(external.brands || '').split(',')[0].trim()
      const quantityLabel = String(external.quantity || '').trim()
      const description = [
        productName,
        brand && brand !== productName ? brand : '',
        quantityLabel
      ].filter(Boolean).join(' — ')

      const gstRate = Number(companyProfile.defaultGstRate ?? 18)

      addScannedLineItem({
        id: `item-${Date.now()}-${Math.random()}`,
        productId: '',
        description,
        sku: barcode,
        quantity: 1,
        unitPrice: 0,
        gstRate,
        subtotal: 0,
        taxAmount: 0,
        total: 0
      })

      showToast(
        `Found "${productName}". Enter its selling price and verify GST/HSN before issuing.`,
        'success'
      )
      return true
    } catch (error) {
      console.warn('Public barcode lookup failed:', error)
      showToast('Online lookup failed. Enter the product details manually.', 'error')
      return false
    }
  }, [products, showToast, companyProfile.defaultGstRate])
  // Calculate discounts and tax from gross line values exactly once.
  const { subtotal, discountAmount, taxableAmount, totalTaxAmount } = useMemo(
    () => calculateDocumentAmounts(items, discountType, discountValue),
    [items, discountType, discountValue]
  )

  // GST Calculation (Intra-state split or IGST)
  const sellerStateCode = String(companyProfile.stateCode || companyProfile.gstin?.slice(0, 2) || '').trim()
  const buyerStateCode = String(clientStateCode || clientGstin?.slice(0, 2) || '').trim()
  const hasTaxJurisdiction = /^\d{2}$/.test(sellerStateCode) && /^\d{2}$/.test(buyerStateCode)
  const isInterState = useMemo(
    () => hasTaxJurisdiction && sellerStateCode !== buyerStateCode,
    [hasTaxJurisdiction, sellerStateCode, buyerStateCode]
  )

  const cgstAmount = hasTaxJurisdiction && !isInterState ? totalTaxAmount / 2 : 0
  const sgstAmount = hasTaxJurisdiction && !isInterState ? totalTaxAmount / 2 : 0
  const igstAmount = hasTaxJurisdiction && isInterState ? totalTaxAmount : 0
  const grandTotal = Math.round((taxableAmount + totalTaxAmount) * 100) / 100

  const livePreviewDoc = {
    ...(existingDoc || {}),
    type: mode,
    documentNumber: existingDoc?.documentNumber || (isInvoice ? 'DRAFT PREVIEW' : 'QUOTE PREVIEW'),
    clientName: clientName || 'Client name',
    clientEmail,
    clientPhone,
    clientAddress,
    clientGstin,
    clientStateCode: String(clientStateCode || clientGstin.slice(0, 2) || ''),
    issueDate,
    dueDate,
    paymentTerms,
    status: existingDoc?.status || 'Draft',
    items: items.map((item) => ({ ...item, total: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) * (1 + (Number(item.gstRate) || 0) / 100) })),
    subtotal,
    discountAmount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxAmount: totalTaxAmount,
    grandTotal,
    amountPaid: Number(existingDoc?.amountPaid) || 0,
    balanceDue: Math.max(0, grandTotal - (Number(existingDoc?.amountPaid) || 0)),
    notes,
  }

  // Validation & Save Handler
  // Lock synchronously as well as disabling the buttons so a rapid double-click
  // cannot create two database records before React re-renders.
  const handleSubmit = async (finalStatus) => {
    if (submitLockRef.current) return
    if (!clientName.trim()) {
      showToast('Please specify a client name', 'error')
      return
    }

    const invalidItem = items.find(
      (it) => !it.description.trim() || Number(it.quantity) <= 0 || Number(it.unitPrice) < 0
    )
    if (invalidItem) {
      showToast('All items must have a description, positive quantity, and valid rate', 'error')
      return
    }

    const workflowManagedStatus = (isInvoice && ['Paid', 'Partially Paid', 'Overdue', 'Cancelled'].includes(status)) ||
      (!isInvoice && ['Accepted', 'Rejected', 'Expired', 'Converted'].includes(status))
    const savedDoc = {
      id: existingDoc?.id || `${isInvoice ? 'inv' : 'qt'}-${Date.now()}`,
      documentNumber,
      type: mode,
      clientId: selectedClientId || null,
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim(),
      clientPhone: clientPhone.trim(),
      clientAddress: clientAddress.trim(),
      clientGstin: clientGstin.trim(),
      clientStateCode: String(clientStateCode || clientGstin.slice(0, 2) || '').trim(),
      issueDate,
      dueDate,
      paymentTerms,
      status: workflowManagedStatus && existingDoc ? status : (finalStatus || status),
      items,
      subtotal,
      discountType,
      discountValue: Number(discountValue) || 0,
      discountAmount,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      taxAmount: totalTaxAmount,
      grandTotal,
      amountPaid: existingDoc?.amountPaid || 0,
      balanceDue: Math.max(0, grandTotal - (existingDoc?.amountPaid || 0)),
      notes: notes.trim()
    }

    submitLockRef.current = true
    setSaving(true)
    try {
      await onSave(savedDoc)
    } catch (error) {
      showToast(error?.message || 'Could not save document', 'error')
    } finally {
      submitLockRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="lf-card">
      {/* Editor Header */}
      <div className="lf-card-header" style={{ borderBottom: '1px solid var(--lf-border)', paddingBottom: '16px' }}>
        <div>
          <h2 className="lf-card-title">
            {existingDoc ? 'Edit' : 'Create'} {isInvoice ? 'Tax Invoice' : 'Price Quotation'}
          </h2>
          <p className="lf-card-subtitle">
            Fill in the billing details, add product line items via search or barcode scanner, and issue document.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="lf-btn lf-btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="lf-btn lf-btn-secondary"
            onClick={() => handleSubmit('Draft')}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save as Draft'}
          </button>
          <button
            type="button"
            className="lf-btn lf-btn-primary"
            onClick={() => handleSubmit('Sent')}
            disabled={saving}
          >
            {saving ? <LoaderCircle size={16} className="lf-spin" /> : <Check size={16} />}
            <span>{saving ? 'Saving…' : (isInvoice ? 'Save & Issue' : 'Save & Send to Client')}</span>
          </button>
        </div>
      </div>

      <div className="lf-live-editor-grid">
        <div className="lf-live-editor-form">
      {missingSellerFields.length > 0 && (
        <div className="lf-profile-completion-alert" role="alert">
          <div className="lf-profile-completion-copy">
            <strong>Business details can be added later</strong>
            <span>You can create documents now. Add {missingSellerFields.join(', ')} later in Settings.</span>
          </div>
          <button type="button" className="lf-btn lf-btn-secondary lf-btn-sm" onClick={onGoSettings}>Go to Settings</button>
        </div>
      )}

      {/* DOCUMENT METADATA FORM */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', margin: '24px 0' }}>
        {/* Customer Information */}
        <div className="lf-card" style={{ backgroundColor: 'var(--lf-bg)', border: '1px solid var(--lf-border)' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', color: 'var(--lf-brand)' }}>
            Client & Billing Details
          </h4>

          <div className="lf-form-group" style={{ marginBottom: '12px' }}>
            <label className="lf-form-label">Select Registered Client</label>
            <select
              className="lf-form-select"
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
            >
              <option value="">-- Choose existing client or enter manual details --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.gstin || 'No GSTIN'})
                </option>
              ))}
            </select>
          </div>

          <div className="lf-form-group" style={{ marginBottom: '12px' }}>
            <label className="lf-form-label">Client Name *</label>
            <input
              type="text"
              className="lf-form-input"
              placeholder="Full Legal / Company Name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div className="lf-form-group">
              <label className="lf-form-label">Email</label>
              <input
                type="email"
                className="lf-form-input"
                placeholder="billing@client.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Phone</label>
              <input
                type="text"
                className="lf-form-input"
                placeholder="+91..."
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="lf-form-group" style={{ marginBottom: '12px' }}>
            <label className="lf-form-label">GSTIN (for GST invoice tax credit)</label>
            <input
              type="text"
              className="lf-form-input"
              placeholder="e.g. 27AABCR1234F1Z5"
              value={clientGstin}
              onChange={(e) => {
                const value = e.target.value.toUpperCase()
                setClientGstin(value)
                if (/^\d{2}/.test(value)) setClientStateCode(value.slice(0, 2))
              }}
            />
          </div>
          <div className="lf-form-group" style={{ marginBottom: '12px' }}>
            <label className="lf-form-label">Client State Code (GST place of supply)</label>
            <input type="text" inputMode="numeric" maxLength={2} className="lf-form-input" placeholder="e.g. 36" value={clientStateCode} onChange={(e) => setClientStateCode(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>

          <div className="lf-form-group">
            <label className="lf-form-label">Billing Address</label>
            <textarea
              className="lf-form-textarea"
              style={{ minHeight: '60px' }}
              placeholder="Street, City, State, PIN..."
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
            />
          </div>
        </div>

        {/* Document Attributes */}
        <div className="lf-card" style={{ backgroundColor: 'var(--lf-bg)', border: '1px solid var(--lf-border)' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '14px', color: 'var(--lf-brand)' }}>
            Document Parameters
          </h4>

          <div className="lf-form-group" style={{ marginBottom: '12px' }}>
            <label className="lf-form-label">Document Number (assigned on save)</label>
            <input
              type="text"
              className="lf-form-input"
              value={existingDoc?.documentNumber || 'Assigned by the database when saved'}
              disabled
              readOnly
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div className="lf-form-group">
              <label className="lf-form-label">Issue Date</label>
              <input
                type="date"
                className="lf-form-input"
                value={issueDate}
                onChange={(e) => {
                  const value = e.target.value
                  setIssueDate(value)
                  setDueDate(addDaysToDateString(value, paymentTermsDays(paymentTerms)))
                }}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">{isInvoice ? 'Due Date' : 'Validity Date'}</label>
              <input
                type="date"
                className="lf-form-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div className="lf-form-group">
              <label className="lf-form-label">Payment Terms</label>
              <select
                className="lf-form-select"
                value={paymentTerms}
                onChange={(e) => {
                  const value = e.target.value
                  setPaymentTerms(value)
                  setDueDate(addDaysToDateString(issueDate, paymentTermsDays(value)))
                }}
              >
                <option value="Due on Receipt">Due on Receipt</option>
                <option value="Net 15">Net 15 Days</option>
                <option value="Net 30">Net 30 Days</option>
                <option value="Net 45">Net 45 Days</option>
                <option value="Custom">Custom Terms</option>
              </select>
            </div>
          </div>

          <div className="lf-form-group">
            <label className="lf-form-label">Place of Supply / Tax Jurisdiction</label>
            <div style={{ padding: '8px 12px', background: '#FFFFFF', border: '1px solid var(--lf-border)', borderRadius: '6px', fontSize: '12px' }}>
              {!hasTaxJurisdiction ? (
                <span style={{ color: 'var(--lf-danger)', fontWeight: 600 }}>
                  State codes required: enter the seller state code in Settings and the client state code/GSTIN before issuing GST.
                </span>
              ) : isInterState ? (
                <span style={{ color: 'var(--lf-highlight)', fontWeight: 600 }}>
                  Inter-State Supply: IGST applies (buyer state {buyerStateCode})
                </span>
              ) : (
                <span style={{ color: 'var(--lf-brand)', fontWeight: 600 }}>
                  Intra-State Supply: CGST (50%) + SGST (50%) apply (state {sellerStateCode})
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* LINE ITEMS SECTION */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Line Items & Products</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="lf-btn lf-btn-accent lf-btn-sm"
              onClick={() => setScannerOpen(true)}
            >
              <ScanBarcode size={15} />
              <span>Scan Barcode</span>
            </button>
            <button
              type="button"
              className="lf-btn lf-btn-secondary lf-btn-sm"
              onClick={handleAddItem}
            >
              <Plus size={15} />
              <span>Add Line Item</span>
            </button>
          </div>
        </div>

        <div className="lf-table-container">
          <table className="lf-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ width: '220px' }}>Product Catalog</th>
                <th>Item Description *</th>
                <th style={{ width: '100px' }}>SKU</th>
                <th style={{ width: '110px' }}>HSN / SAC</th>
                <th style={{ width: '80px' }}>Qty *</th>
                <th style={{ width: '110px' }}>Unit Price (&#8377;)</th>
                <th style={{ width: '90px' }}>GST Rate</th>
                <th style={{ width: '110px' }}>Total (&#8377;)</th>
                <th style={{ width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id || idx}>
                  <td style={{ color: 'var(--lf-text-muted)' }}>{idx + 1}</td>
                  <td>
                    <select
                      className="lf-form-select"
                      style={{ fontSize: '12px', padding: '6px' }}
                      value={item.productId || ''}
                      onChange={(e) => handleProductSelect(idx, e.target.value)}
                    >
                      <option value="">-- Pick from catalog --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatINR(p.price)})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="lf-form-input"
                      placeholder="Item name / description"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="lf-form-input"
                      placeholder="SKU"
                      value={item.sku || ''}
                      onChange={(e) => handleItemChange(idx, 'sku', e.target.value)}
                    />
                  </td>
                  <td>
                    <input type="text" className="lf-form-input" placeholder="HSN/SAC" value={item.hsnSac || ''} onChange={(e) => handleItemChange(idx, 'hsnSac', e.target.value)} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      className="lf-form-input"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="lf-form-input"
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="lf-form-select"
                      value={item.gstRate}
                      onChange={(e) => handleItemChange(idx, 'gstRate', Number(e.target.value))}
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="3">3%</option>
                      <option value="12">12%</option>
                      <option value="40">40% (classification-specific)</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </td>
                  <td style={{ fontWeight: 600 }}>{formatINR(item.total)}</td>
                  <td>
                    <button
                      type="button"
                      className="lf-btn lf-btn-ghost lf-btn-sm"
                      style={{ color: 'var(--lf-danger)', padding: '4px' }}
                      onClick={() => handleRemoveItem(idx)}
                      title="Remove Item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTTOM SECTION: NOTES & CALCULATED TOTALS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Notes & Bank Terms */}
        <div>
          <div className="lf-form-group" style={{ marginBottom: '14px' }}>
            <label className="lf-form-label">Notes & Terms of Payment</label>
            <textarea
              className="lf-form-textarea"
              style={{ minHeight: '110px' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div style={{ padding: '12px', background: 'var(--lf-bg)', borderRadius: '8px', border: '1px solid var(--lf-border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--lf-text-muted)', marginBottom: '4px' }}>
              BANK PAYMENT DETAILS DISPLAYED ON INVOICE
            </div>
            <div style={{ fontSize: '12px' }}>
              <strong>{companyProfile.bankName}</strong> • A/C: {companyProfile.accountNumber} • IFSC: {companyProfile.ifscCode}
            </div>
          </div>
        </div>

        {/* Financial Summary Box */}
        <div className="lf-card" style={{ backgroundColor: 'var(--lf-bg)', border: '1px solid var(--lf-border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--lf-text)' }}>
            Financial Summary
          </h4>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
            <span style={{ color: 'var(--lf-text-secondary)' }}>Item Subtotal:</span>
            <span style={{ fontWeight: 600 }}>{formatINR(subtotal)}</span>
          </div>

          {/* Discount input */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--lf-border)', borderBottom: '1px solid var(--lf-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--lf-text-secondary)' }}>Discount:</span>
              <select
                className="lf-form-select"
                style={{ width: '80px', padding: '2px 4px', height: '28px', fontSize: '11px' }}
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
              >
                <option value="percentage">%</option>
                <option value="fixed">&#8377; Fixed</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number"
                min="0"
                style={{ width: '80px', height: '28px', textAlign: 'right' }}
                className="lf-form-input"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
              <span style={{ fontWeight: 600, color: 'var(--lf-highlight)' }}>-{formatINR(discountAmount)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
            <span style={{ color: 'var(--lf-text-secondary)' }}>Taxable Value:</span>
            <span style={{ fontWeight: 600 }}>{formatINR(taxableAmount)}</span>
          </div>

          {isInterState ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', color: 'var(--lf-text-secondary)' }}>
              <span>IGST (Integrated Tax):</span>
              <span>{formatINR(igstAmount)}</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', color: 'var(--lf-text-secondary)' }}>
                <span>CGST (Central Tax 50%):</span>
                <span>{formatINR(cgstAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px', color: 'var(--lf-text-secondary)' }}>
                <span>SGST (State Tax 50%):</span>
                <span>{formatINR(sgstAmount)}</span>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 6px', borderTop: '2px solid var(--lf-brand)', marginTop: '8px' }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--lf-brand)' }}>Grand Total:</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--lf-brand)' }}>{formatINR(grandTotal)}</span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)', textAlign: 'right', marginTop: '4px' }}>
            {numberToWordsINR(grandTotal)}
          </div>
        </div>
      </div>

        </div>
        <aside className="lf-live-paper-panel" aria-label="Live invoice paper preview">
          <div className="lf-live-paper-heading">
            <div><strong>Live paper preview</strong><span>Updates as you type</span></div>
            <span className="lf-badge lf-badge-draft">DRAFT</span>
          </div>
          {missingSellerFields.length > 0 && <button type="button" className="lf-live-paper-warning" onClick={onGoSettings} aria-label="Add optional seller details in Settings">
            <strong>Optional business details</strong><span>Add these later: {missingSellerFields.join(', ')}</span><small>Settings (optional) →</small>
          </button>}
          <div className="lf-live-paper">
            <PrintableInvoiceTemplate doc={livePreviewDoc} companyProfile={companyProfile} />
          </div>
        </aside>
      </div>

      {/* BARCODE SCANNER MODAL */}
      {scannerOpen && (
        <BarcodeScannerModal
          onClose={() => setScannerOpen(false)}
          onDetected={async (code) => {
            const added = await handleAddProductByCode(code)
            if (added) setScannerOpen(false)
          }}
          onManualSubmit={async (code) => {
            const added = await handleAddProductByCode(code)
            if (added) setScannerOpen(false)
          }}
          products={products}
        />
      )}
    </div>
  )
}

// ============================================================================
// BARCODE SCANNER MODAL (POWERED BY HTML5-QRCODE)
// ============================================================================

function BarcodeScannerModal({ onClose, onDetected, onManualSubmit, products }) {
  const [manualCode, setManualCode] = useState('')
  const [scannerError, setScannerError] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const html5QrCodeRef = useRef(null)
  const hasProcessedScanRef = useRef(false)

  const onDetectedRef = useRef(onDetected)
  const onManualSubmitRef = useRef(onManualSubmit)

  useEffect(() => {
    onDetectedRef.current = onDetected
    onManualSubmitRef.current = onManualSubmit
  }, [onDetected, onManualSubmit])

  useEffect(() => {
    const scannerId = 'ledgerflow-barcode-reader'
    let cancelled = false
    let started = false
    const scannerInstance = new Html5Qrcode(scannerId)
    html5QrCodeRef.current = scannerInstance

    const startScanner = async () => {
      try {
        setScannerError(null)
        await scannerInstance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 160 }, aspectRatio: 1.777778 },
          async (decodedText) => {
            if (cancelled || hasProcessedScanRef.current) return
            hasProcessedScanRef.current = true
            try {
              if (scannerInstance.isScanning) await scannerInstance.stop()
              if (cancelled) return
              const added = await onDetectedRef.current(decodedText)
              if (!cancelled && added === false) {
                // An unmatched barcode should not force the user to close and
                // reopen the scanner; allow another attempt after the notice.
                hasProcessedScanRef.current = false
                await startScanner()
              }
            } catch (err) {
              if (!cancelled) {
                setScannerError(err?.message || 'Could not process this barcode. Try again or enter it manually.')
                hasProcessedScanRef.current = false
                await startScanner()
              }
            }
          },
          () => {}
        )
        started = true
        if (cancelled) {
          await scannerInstance.stop().catch(() => {})
          scannerInstance.clear()
        } else {
          setIsScanning(true)
        }
      } catch (err) {
        if (!cancelled) {
          setScannerError(err?.message || 'Unable to access camera. Check camera permissions and use HTTPS or localhost.')
          setIsScanning(false)
        }
      }
    }

    startScanner()
    return () => {
      cancelled = true
      if (started && scannerInstance.isScanning) {
        scannerInstance.stop().then(() => scannerInstance.clear()).catch(() => {})
      } else if (!started) {
        // startScanner checks cancelled after camera initialization resolves.
      } else {
        try { scannerInstance.clear() } catch { /* already cleared */ }
      }
    }
  }, [])

  const handleManualAdd = async (e) => {
    e.preventDefault()
    const code = manualCode.trim()
    if (!code) return
    try {
      const result = await onManualSubmitRef.current(code)
      if (result !== false) setManualCode('')
    } catch (err) {
      setScannerError(err?.message || 'Could not add this barcode. Please try again.')
    }
  }

  return (
    <div className="lf-modal-backdrop">
      <div className="lf-modal" style={{ maxWidth: '520px' }}>
        <div className="lf-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ScanBarcode size={20} style={{ color: 'var(--lf-highlight)' }} />
            <h3 className="lf-modal-title">Live Barcode & SKU Scanner</h3>
          </div>
          <button type="button" className="lf-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="lf-modal-body">
          <div className="lf-scanner-container">
            <div className="lf-scanner-frame">
              <div id="ledgerflow-barcode-reader" />
              {isScanning && <div className="lf-scanner-laser" />}
            </div>

            {scannerError ? (
              <div style={{ padding: '10px 14px', background: 'var(--lf-warning-bg)', border: '1px solid var(--lf-highlight-border)', borderRadius: '6px', fontSize: '12px', color: 'var(--lf-warning)' }}>
                <strong>Camera Notice:</strong> {scannerError}
                <div style={{ marginTop: '4px' }}>Use the manual barcode/SKU entry below to look up items.</div>
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--lf-text-secondary)', textAlign: 'center' }}>
                Position a product barcode or QR code within the viewfinder to automatically add it.
              </p>
            )}

            {/* Quick add by saved barcode */}
            <div style={{ width: '100%', padding: '10px', background: 'var(--lf-bg)', borderRadius: '10px', border: '1px solid var(--lf-border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--lf-text-secondary)', marginBottom: '6px' }}>
                QUICK ADD FROM YOUR CATALOGUE
              </div>
              <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)', marginBottom: '8px' }}>
                Select a saved product to look it up by its registered barcode.
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {products.filter((p) => String(p.barcode || '').trim()).slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="lf-badge lf-badge-draft"
                    style={{ cursor: 'pointer', border: '1px solid var(--lf-brand-subtle)', background: '#FFFFFF' }}
                    onClick={() => onDetected(p.barcode)}
                  >
                    {p.name.slice(0, 16)}... ({p.barcode})
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Barcode / SKU Fallback Form */}
            <form onSubmit={handleManualAdd} style={{ width: '100%', display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="lf-form-input"
                placeholder="Enter or paste Barcode or SKU (e.g. 890103080001)..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
              <button type="submit" className="lf-btn lf-btn-primary">
                Add
              </button>
            </form>
          </div>
        </div>

        <div className="lf-modal-footer">
          <button type="button" className="lf-btn lf-btn-secondary" onClick={onClose}>
            Done Scanning
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// DOCUMENT PREVIEW MODAL & A4 PRINT TEMPLATE
// ============================================================================

function DocumentPreviewModal({ doc, companyProfile, onClose, onEdit, showToast, signatureData = '', onSignatureChange, onGoSettings }) {
  const isInvoice = doc.type === 'invoice'
  const missingSellerFields = [!companyProfile.gstin?.trim() && 'GSTIN', !companyProfile.address?.trim() && 'registered address', !companyProfile.bankName?.trim() && 'bank name', !companyProfile.accountNumber?.trim() && 'bank account number', !companyProfile.ifscCode?.trim() && 'IFSC code'].filter(Boolean)
  const [signatureModalOpen, setSignatureModalOpen] = useState(false)
  // Print Action — write the full standalone document before opening the print dialog.
  const handlePrint = () => {
    const printableHtml = generatePrintableHtml(doc, companyProfile, signatureData)
    const printWindow = window.open('', '_blank', 'width=1000,height=800')

    if (!printWindow) {
      showToast('Allow pop-ups to print or save this document as PDF.', 'error')
      return
    }

    try {
      printWindow.document.open()
      printWindow.document.write(printableHtml)
      printWindow.document.close()

      // about:blank may fire load before document.write; use one guarded print path.
      let didPrint = false
      const printWhenReady = () => {
        if (didPrint) return
        const bodyText = printWindow.document.body?.innerText?.trim()
        if (!bodyText) return
        didPrint = true
        printWindow.focus()
        printWindow.print()
      }
      printWindow.addEventListener('load', printWhenReady, { once: true })

      // Fallback for browsers that fired load before the listener was attached.
      printWindow.setTimeout(() => {
        if (printWindow.document.body?.innerText?.trim()) {
          printWhenReady()
        } else {
          showToast('The invoice did not render for printing. Please reopen the preview and try again.', 'error')
          printWindow.close()
        }
      }, 700)
    } catch {
      printWindow.close()
      showToast('Could not prepare the invoice for printing. Please try again.', 'error')
    }
  }

  return (
    <>
    <div className="lf-modal-backdrop lf-non-printable">
      <div className="lf-modal lf-modal-lg" style={{ maxHeight: '92vh' }}>
        {missingSellerFields.length > 0 && (
          <div className="lf-profile-completion-alert" role="status">
            <div className="lf-profile-completion-copy"><strong>Complete your business details</strong><span>To make this document more professional, add: {missingSellerFields.join(', ')}. You can still preview or download it now.</span></div>
            <button type="button" className="lf-btn lf-btn-secondary lf-btn-sm" onClick={onGoSettings}>Edit profile</button>
          </div>
        )}
        {/* Modal Top Bar */}
        <div className="lf-modal-header lf-document-preview-header">
          <div className="lf-document-preview-heading">
            <h3 className="lf-modal-title lf-document-preview-title">
              {isInvoice ? 'Tax Invoice Preview' : 'Price Quotation Preview'} - {doc.documentNumber}
            </h3>
            <span className={`lf-badge lf-badge-${doc.status.toLowerCase().replace(/\s+/g, '-')}`}>
              {doc.status}
            </span>
          </div>

          <div className="lf-document-preview-actions">
            <button
              type="button"
              className="lf-btn lf-btn-primary lf-btn-sm"
              onClick={handlePrint}
              title="Print document or Save as PDF"
            >
              <PrintIcon size={15} />
              <span>Download / Save PDF</span>
            </button>
            <button type="button" className="lf-btn lf-btn-secondary lf-btn-sm" onClick={onEdit}>
              <Edit size={15} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className="lf-btn lf-btn-secondary lf-btn-sm lf-signature-action"
              onClick={() => setSignatureModalOpen(true)}
              title={signatureData ? 'Edit the authorized signature' : 'Add an authorized signature to the document'}
            >
              <PenLine size={15} />
              <span>{signatureData ? 'Edit Signature' : 'Add Signature'}</span>
            </button>
            <button type="button" className="lf-icon-btn" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body Previewing A4 Document */}
        <div className="lf-modal-body lf-preview-canvas">
          <div className="lf-preview-paper">
            <PrintableInvoiceTemplate doc={doc} companyProfile={companyProfile} signatureData={signatureData} showSignatureControl onRequestSignature={() => setSignatureModalOpen(true)} />
          </div>
        </div>

        <div className="lf-modal-footer">
          <span style={{ fontSize: '11px', color: 'var(--lf-text-muted)', marginRight: 'auto' }}>
            Document formatted to A4 commercial standards with GST compliance breakdown.
          </span>
          <button type="button" className="lf-btn lf-btn-secondary" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
    {signatureModalOpen && (
      <SignaturePadModal
        initialSignature={signatureData}
        onClose={() => setSignatureModalOpen(false)}
        onSave={async (value) => {
          try {
            await onSignatureChange?.(value)
            setSignatureModalOpen(false)
            showToast('Signature saved to this document', 'success')
          } catch (error) {
            showToast(error.message || 'Could not save the signature', 'error')
          }
        }}
      />
    )}
    </>
  )
}

function SignaturePadModal({ initialSignature, onClose, onSave }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const hasDrawingRef = useRef(false)
  const [hasDrawing, setHasDrawing] = useState(Boolean(initialSignature))
  const [signatureTool, setSignatureTool] = useState('pen')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !initialSignature) return
    const context = canvas.getContext('2d')
    const image = new Image()
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      hasDrawingRef.current = true
      setHasDrawing(true)
    }
    image.src = initialSignature
  }, [initialSignature])

  const pointFor = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }
  const startDrawing = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawingRef.current = true
    hasDrawingRef.current = true
    setHasDrawing(true)
    canvas.setPointerCapture?.(event.pointerId)
    const point = pointFor(event)
    const context = canvas.getContext('2d')
    context.beginPath()
    context.moveTo(point.x, point.y)
    context.globalCompositeOperation = signatureTool === 'eraser' ? 'destination-out' : 'source-over'
    context.lineWidth = signatureTool === 'eraser' ? 26 : 3
    context.strokeStyle = '#1D4ED8'
    context.lineCap = 'round'
    context.lineJoin = 'round'
  }
  const draw = (event) => {
    if (!drawingRef.current || !canvasRef.current) return
    const point = pointFor(event)
    const context = canvasRef.current.getContext('2d')
    context.lineTo(point.x, point.y)
    context.stroke()
  }
  const clearSignature = () => {
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    hasDrawingRef.current = false
    setHasDrawing(false)
  }

  return (
    <div className="lf-modal-backdrop lf-non-printable" role="presentation">
      <div className="lf-modal" role="dialog" aria-modal="true" aria-labelledby="lf-signature-title">
        <div className="lf-modal-header">
          <h3 className="lf-modal-title" id="lf-signature-title">Add authorized signature</h3>
          <button type="button" className="lf-icon-btn" onClick={onClose} aria-label="Close signature pad"><X size={16} /></button>
        </div>
        <div className="lf-modal-body">
          <p style={{ marginTop: 0, color: 'var(--lf-text-muted)', fontSize: '12px' }}>Draw with a mouse, trackpad or touchscreen. Select Eraser to remove unwanted strokes without clearing your whole signature.</p>
          <div className="lf-signature-tools" role="toolbar" aria-label="Signature tools">
            <button type="button" className={`lf-btn lf-btn-sm ${signatureTool === 'pen' ? 'lf-btn-primary' : 'lf-btn-secondary'}`} aria-pressed={signatureTool === 'pen'} onClick={() => setSignatureTool('pen')}>
              <PenLine size={15} /> Pen
            </button>
            <button type="button" className={`lf-btn lf-btn-sm ${signatureTool === 'eraser' ? 'lf-btn-primary' : 'lf-btn-secondary'}`} aria-pressed={signatureTool === 'eraser'} onClick={() => setSignatureTool('eraser')}>
              <Eraser size={15} /> Eraser
            </button>
            <span className="lf-signature-tool-hint">{signatureTool === 'eraser' ? 'Erase unwanted strokes' : 'Draw in LedgerFlow blue'}</span>
          </div>
          <canvas ref={canvasRef} width={680} height={180} aria-label="Signature drawing area"
            onPointerDown={startDrawing} onPointerMove={draw}
            onPointerUp={() => { drawingRef.current = false }} onPointerCancel={() => { drawingRef.current = false }}
            onPointerLeave={() => { drawingRef.current = false }}
            style={{ display: 'block', width: '100%', height: 'auto', border: '1px dashed var(--lf-border-strong)', borderRadius: '8px', background: '#fff', touchAction: 'none', cursor: signatureTool === 'eraser' ? 'cell' : 'crosshair' }} />
        </div>
        <div className="lf-modal-footer" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="lf-btn lf-btn-secondary" onClick={clearSignature}>Clear</button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="lf-btn lf-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="lf-btn lf-btn-primary" disabled={!hasDrawing}
              onClick={() => { if (hasDrawingRef.current && canvasRef.current) onSave(canvasRef.current.toDataURL('image/png')) }}>
              <Check size={15} /> Save Signature
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Pure Printable Template Component
function PrintableInvoiceTemplate({ doc, companyProfile, signatureData = '', showSignatureControl = false, onRequestSignature }) {
  const isInvoice = doc.type === 'invoice'
  const sellerStateCode = String(companyProfile.stateCode || companyProfile.gstin?.slice(0, 2) || '')
  const buyerStateCode = String(doc.clientStateCode || doc.clientGstin?.slice(0, 2) || '')
  const hasPlaceOfSupply = /^\d{2}$/.test(sellerStateCode) && /^\d{2}$/.test(buyerStateCode)
  const isInterState = Number(doc.igstAmount) > 0 || (hasPlaceOfSupply && sellerStateCode !== buyerStateCode)

  return (
    <div className={`lf-print-paper lf-print-paper-${String(doc.status || 'draft').toLowerCase().replace(/\s+/g, '-')}`} style={{ position: 'relative', fontFamily: 'Arial, sans-serif', color: '#252A32' }}>
      {['Draft', 'Paid', 'Cancelled'].includes(doc.status) || doc.status === 'Sent' ? <div className={`lf-paper-watermark lf-paper-watermark-${String(doc.status || 'draft').toLowerCase().replace(/\s+/g, '-')}`} aria-label={`Document status: ${doc.status}`}>{doc.status === 'Sent' ? 'ISSUED' : String(doc.status || 'Draft').toUpperCase()}</div> : null}
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #2563EB', paddingBottom: '16px', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563EB' }}>
            {companyProfile.tradeName || companyProfile.companyName}
          </div>
          <div style={{ fontSize: '11px', color: '#7B818B', maxWidth: '340px', marginTop: '4px', lineHeight: '1.4' }}>
            {companyProfile.address}
          </div>
          <div style={{ fontSize: '11px', color: '#7B818B', marginTop: '4px' }}>
            {companyProfile.gstin && <>GSTIN: <strong>{companyProfile.gstin}</strong></>}{companyProfile.gstin && companyProfile.pan ? ' | ' : ''}{companyProfile.pan && <>PAN: <strong>{companyProfile.pan}</strong></>}
          </div>
          <div style={{ fontSize: '11px', color: '#7B818B' }}>
            {[companyProfile.email && `Email: ${companyProfile.email}`, companyProfile.phone && `Phone: ${companyProfile.phone}`].filter(Boolean).join(' | ')}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#252A32', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isInvoice ? 'Tax Invoice' : 'Price Quotation'}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB', marginTop: '4px' }}>
            #{doc.documentNumber}
          </div>
          <div style={{ fontSize: '11px', color: '#7B818B', marginTop: '4px' }}>
            Original for Recipient
          </div>
        </div>
      </div>

      {/* Meta Grid: Billed To & Document Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div style={{ padding: '12px', background: '#F6F4F0', borderRadius: '4px', border: '1px solid #E6E1DA' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', marginBottom: '6px' }}>
            Billed To / Customer Details
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#252A32' }}>{doc.clientName}</div>
          <div style={{ fontSize: '11px', color: '#7B818B', marginTop: '3px' }}>{doc.clientAddress}</div>
          {doc.clientGstin && (
            <div style={{ fontSize: '11px', marginTop: '4px' }}>
              GSTIN: <strong>{doc.clientGstin}</strong>
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#7B818B', marginTop: '2px' }}>
            Phone: {doc.clientPhone} | Email: {doc.clientEmail}
          </div>
        </div>

        <div style={{ padding: '12px', background: '#F6F4F0', borderRadius: '4px', border: '1px solid #E6E1DA' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', marginBottom: '6px' }}>
            Document Reference & Terms
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
            <span style={{ color: '#7B818B' }}>Issue Date:</span>
            <span style={{ fontWeight: 600 }}>{formatDisplayDate(doc.issueDate)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
            <span style={{ color: '#7B818B' }}>{isInvoice ? 'Due Date:' : 'Valid Until:'}</span>
            <span style={{ fontWeight: 600 }}>{formatDisplayDate(doc.dueDate)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
            <span style={{ color: '#7B818B' }}>Payment Terms:</span>
            <span style={{ fontWeight: 600 }}>{doc.paymentTerms}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
            <span style={{ color: '#7B818B' }}>Place of Supply:</span>
            <span style={{ fontWeight: 600 }}>{buyerStateCode ? `${buyerStateCode} – ${GST_STATE_NAMES[buyerStateCode] || 'State'}` : 'Not specified'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
            <span style={{ color: '#7B818B' }}>Supply Type:</span>
            <span style={{ fontWeight: 600 }}>{hasPlaceOfSupply ? (isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)') : 'Verify state codes'}</span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '11px' }}>
        <thead>
          <tr style={{ backgroundColor: '#FBF0E7', borderBottom: '1.5px solid #2563EB' }}>
            <th style={{ padding: '8px', textAlign: 'left', width: '30px', color: '#2563EB' }}>#</th>
            <th style={{ padding: '8px', textAlign: 'left', color: '#2563EB' }}>Description</th>
            <th style={{ padding: '8px', textAlign: 'left', width: '70px', color: '#2563EB' }}>SKU</th>
            <th style={{ padding: '8px', textAlign: 'left', width: '70px', color: '#2563EB' }}>HSN / SAC</th>
            <th style={{ padding: '8px', textAlign: 'right', width: '50px', color: '#2563EB' }}>Qty</th>
            <th style={{ padding: '8px', textAlign: 'right', width: '80px', color: '#2563EB' }}>Rate (&#8377;)</th>
            <th style={{ padding: '8px', textAlign: 'right', width: '60px', color: '#2563EB' }}>GST</th>
            <th style={{ padding: '8px', textAlign: 'right', width: '90px', color: '#2563EB' }}>Total (&#8377;)</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((it, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #E6E1DA' }}>
              <td style={{ padding: '8px', color: '#7B818B' }}>{idx + 1}</td>
              <td style={{ padding: '8px', fontWeight: 600 }}>{it.description}</td>
              <td style={{ padding: '8px', color: '#7B818B' }}>{it.sku || '-'}</td>
              <td style={{ padding: '8px', color: '#7B818B' }}>{it.hsnSac || '-'}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{it.quantity}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{formatINR(it.unitPrice)}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{it.gstRate}%</td>
              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{formatINR(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '24px' }}>
        {/* Bank & Notes Details */}
        <div style={{ flex: 1 }}>
          {(companyProfile.bankName || companyProfile.accountHolder || companyProfile.accountNumber || companyProfile.ifscCode || companyProfile.upiId) && (
            <div style={{ padding: '10px 14px', background: '#F6F4F0', border: '1px solid #E6E1DA', borderRadius: '4px', marginBottom: '12px', fontSize: '11px' }}>
              <div style={{ fontWeight: 700, color: '#2563EB', marginBottom: '4px' }}>BANK PAYMENT DETAILS</div>
              {companyProfile.bankName && <div>Bank: <strong>{companyProfile.bankName}</strong></div>}
              {companyProfile.accountHolder && <div>A/C Name: <strong>{companyProfile.accountHolder}</strong></div>}
              {companyProfile.accountNumber && <div>A/C Number: <strong>{companyProfile.accountNumber}</strong></div>}
              {(companyProfile.ifscCode || companyProfile.upiId) && <div>{companyProfile.ifscCode && <>IFSC Code: <strong>{companyProfile.ifscCode}</strong></>}{companyProfile.ifscCode && companyProfile.upiId ? ' | ' : ''}{companyProfile.upiId && <>UPI ID: <strong>{companyProfile.upiId}</strong></>}</div>}
            </div>
          )}
          {doc.notes && (
            <div style={{ fontSize: '10px', color: '#7B818B', lineHeight: '1.4' }}>
              <strong>Terms:</strong> {doc.notes}
            </div>
          )}
        </div>

        {/* Totals Table */}
        <div style={{ width: '280px', border: '1px solid #E6E1DA', borderRadius: '4px', padding: '12px', background: '#FFFFFF', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: '#7B818B' }}>Subtotal:</span>
            <span style={{ fontWeight: 600 }}>{formatINR(doc.subtotal)}</span>
          </div>

          {doc.discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#2563EB' }}>
              <span>Discount:</span>
              <span>-{formatINR(doc.discountAmount)}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ color: '#7B818B' }}>Taxable Amount:</span>
            <span style={{ fontWeight: 600 }}>{formatINR(doc.taxableAmount)}</span>
          </div>

          {isInterState ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: '#7B818B' }}>IGST:</span>
              <span>{formatINR(doc.igstAmount)}</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#7B818B' }}>CGST:</span>
                <span>{formatINR(doc.cgstAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#7B818B' }}>SGST:</span>
                <span>{formatINR(doc.sgstAmount)}</span>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px', borderTop: '2px solid #2563EB', marginTop: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#2563EB' }}>Total:</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#2563EB' }}>{formatINR(doc.grandTotal)}</span>
          </div>

          <div style={{ fontSize: '9px', color: '#7B818B', textAlign: 'right', marginTop: '2px' }}>
            {numberToWordsINR(doc.grandTotal)}
          </div>
        </div>
      </div>

      {/* Footer Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #E6E1DA', paddingTop: '16px', marginTop: '20px' }}>
        <div style={{ fontSize: '9px', color: '#7B818B' }}>
          This is a computer generated document. Generated via LedgerFlow.
        </div>
        <div style={{ textAlign: 'center', minWidth: '170px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', marginBottom: '6px' }}>
            For {companyProfile.tradeName || companyProfile.companyName}
          </div>
          <div className="lf-signature-area" style={{ position: 'relative', width: '170px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 3px' }}>
            {signatureData ? <img src={signatureData} alt="Authorized signatory signature" style={{ maxWidth: '160px', maxHeight: '42px', objectFit: 'contain' }} /> : <span style={{ display: 'block', width: '160px', height: '38px' }} aria-hidden="true" />}
            {showSignatureControl && <button type="button" className="lf-non-printable lf-signature-pen" onClick={onRequestSignature} title={signatureData ? 'Edit signature' : 'Add signature'} aria-label={signatureData ? 'Edit authorized signature' : 'Add authorized signature'}><PenLine size={14} /></button>}
          </div>
          <div style={{ fontSize: '9px', borderTop: '1px solid #252A32', paddingTop: '3px', width: '160px', margin: '0 auto' }}>Authorized Signatory</div>
        </div>
      </div>
    </div>
  )
}

// Generate Standalone HTML Document. Escape every user/database value before inserting it into HTML.
function generatePrintableHtml(doc, profile, signatureData = '') {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char])
  const money = (value) => (Number(value) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  })
  const safeItems = (doc.items || []).map((it, index) => `<tr>
    <td>${index + 1}</td><td><strong>${esc(it.description)}</strong></td><td>${esc(it.sku || '-')}</td><td>${esc(it.hsnSac || '-')}</td>
    <td class="num">${esc(it.quantity)}</td><td class="num">&#8377;${money(it.unitPrice)}</td>
    <td class="num">${esc(it.gstRate)}%</td><td class="num">&#8377;${money(it.total)}</td>
  </tr>`).join('')
  const isInvoice = doc.type === 'invoice'
  const supplyState = String(doc.clientStateCode || doc.clientGstin?.slice(0, 2) || '')
  const taxRows = Number(doc.igstAmount) > 0
    ? `<div class="row"><span>IGST:</span><span>&#8377;${money(doc.igstAmount)}</span></div>`
    : `<div class="row"><span>CGST:</span><span>&#8377;${money(doc.cgstAmount)}</span></div><div class="row"><span>SGST:</span><span>&#8377;${money(doc.sgstAmount)}</span></div>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.documentNumber)} - ${esc(profile.tradeName)}</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#252b27;background:#fff}
.header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #2563EB;padding-bottom:16px;margin-bottom:20px}
.title{font-size:24px;font-weight:800;color:#2563EB}.muted{font-size:12px;color:#6b756d;margin-top:4px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.box{padding:12px;background:#f8faf8;border:1px solid #e6eae5;border-radius:4px;font-size:12px;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}th{background:#eef5f1;color:#2563EB;text-align:left;padding:8px;border-bottom:1.5px solid #2563EB}
td{padding:8px;border-bottom:1px solid #e6eae5}.num{text-align:right;white-space:nowrap}
.total-box{margin-left:auto;width:280px;max-width:100%;border:1px solid #e6eae5;border-radius:4px;padding:12px;font-size:12px}
.row{display:flex;justify-content:space-between;gap:12px;padding:3px 0}.grand{border-top:2px solid #2563EB;margin-top:6px;padding-top:6px;font-size:15px;font-weight:800;color:#2563EB}
.footer{margin-top:36px;border-top:1px solid #e6eae5;padding-top:12px;font-size:11px;color:#6b756d}.signature-image{display:block;max-width:160px;max-height:42px;object-fit:contain;margin:0 auto 4px}
@media(max-width:600px){body{margin:14px}.header{flex-direction:column}.grid{grid-template-columns:1fr}table{font-size:10px}th,td{padding:5px}}
@media print{body{margin:0}.no-print{display:none}}
</style></head><body>
<div class="header"><div><div class="title">${esc(profile.tradeName || profile.companyName)}</div>
<div class="muted">${esc(profile.address)}</div><div class="muted">GSTIN: ${esc(profile.gstin)} | PAN: ${esc(profile.pan)}</div>
<div class="muted">${esc(profile.email)} ${profile.phone ? ' | ' + esc(profile.phone) : ''}</div></div>
<div style="text-align:right"><div style="font-size:24px;font-weight:800;text-transform:uppercase">${isInvoice ? 'Tax Invoice' : 'Price Quotation'}</div>
<div style="font-size:14px;font-weight:700;color:#2563EB">#${esc(doc.documentNumber)}</div><div class="muted">Date: ${esc(doc.issueDate)}</div></div></div>
<div class="grid"><div class="box"><strong>Billed To:</strong><br><strong>${esc(doc.clientName)}</strong><br>
${esc(doc.clientAddress)}<br>${doc.clientGstin ? 'GSTIN: ' + esc(doc.clientGstin) : ''}<br>${esc(doc.clientEmail)}</div>
<div class="box"><strong>Payment & Due Details:</strong><br>Due Date: ${esc(doc.dueDate)}<br>Terms: ${esc(doc.paymentTerms)}<br>Place of Supply (state code): ${esc(supplyState || 'Not specified')}<br>
Bank: ${esc(profile.bankName)} (A/C: ${esc(profile.accountNumber)}, IFSC: ${esc(profile.ifscCode)})<br>UPI: ${esc(profile.upiId)}</div></div>
<table><thead><tr><th>#</th><th>Description</th><th>SKU</th><th>HSN/SAC</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">GST</th><th class="num">Total</th></tr></thead>
<tbody>${safeItems}</tbody></table>
<div class="total-box"><div class="row"><span>Subtotal:</span><span>&#8377;${money(doc.subtotal)}</span></div>
<div class="row"><span>Discount:</span><span>&#8377;${money(doc.discountAmount)}</span></div>
${taxRows}
<div class="row grand"><span>Total:</span><span>&#8377;${money(doc.grandTotal)}</span></div></div>
<div class="footer">Generated via LedgerFlow.
<div style="float:right;text-align:center;min-width:170px"><div style="font-weight:700;color:#2563EB">For ${esc(profile.tradeName || profile.companyName)}</div>
${signatureData ? `<img class="signature-image" src="${esc(signatureData)}" alt="Authorized signatory signature">` : '<div style="height:42px"></div>'}
<div style="border-top:1px solid #252b27;padding-top:3px">Authorized Signatory</div></div>
<div style="margin-top:8px;white-space:pre-wrap;clear:both">${esc(doc.notes)}</div></div>
</body></html>`
}

// ============================================================================
// CLIENTS MANAGEMENT VIEW
// ============================================================================

function ClientsView({ clients, invoices, onAddClient, onEditClient, onDeleteClient, onSelectClientToInvoice }) {
  const [search, setSearch] = useState('')

  const filteredClients = useMemo(() => {
    return clients.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.gstin && c.gstin.toLowerCase().includes(search.toLowerCase()))
    )
  }, [clients, search])

  return (
    <div className="lf-card">
      <div className="lf-card-header">
        <div>
          <h2 className="lf-card-title">Client Directory</h2>
          <p className="lf-card-subtitle">Manage customer profiles, billing addresses, and GST numbers</p>
        </div>
        <button type="button" className="lf-btn lf-btn-primary" onClick={onAddClient}>
          <Plus size={16} />
          <span>Add New Client</span>
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          className="lf-form-input"
          placeholder="Search clients by name, email, or GSTIN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="lf-table-container">
        <table className="lf-table">
          <thead>
            <tr>
              <th>Client / Company</th>
              <th>Contact Info</th>
              <th>GSTIN</th>
              <th>State / Location</th>
              <th>Total Invoices</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => {
              const clientInvoices = invoices.filter((i) => i.clientId === client.id)
              const totalBilled = clientInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0)

              return (
                <tr key={client.id}>
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--lf-text)' }}>{client.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>{client.contactPerson}</div>
                  </td>
                  <td>
                    <div>{client.email}</div>
                    <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>{client.phone}</div>
                  </td>
                  <td>
                    {client.gstin ? (
                      <span className="lf-badge lf-badge-draft">{client.gstin}</span>
                    ) : (
                      <span style={{ color: 'var(--lf-text-muted)' }}>Unregistered</span>
                    )}
                  </td>
                  <td>{client.state || client.stateName || (client.gstin && GST_STATE_NAMES[client.gstin.slice(0, 2)]) || 'Not specified'}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{clientInvoices.length} {clientInvoices.length === 1 ? 'invoice' : 'invoices'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--lf-brand)' }}>{formatINR(totalBilled)}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="lf-btn lf-btn-outline-brand lf-btn-sm"
                        onClick={() => onSelectClientToInvoice(client)}
                        title="Create Invoice for Client"
                      >
                        <Receipt size={14} />
                        <span>Invoice</span>
                      </button>
                      <button
                        type="button"
                        className="lf-btn lf-btn-ghost lf-btn-sm"
                        onClick={() => onEditClient(client)}
                        title="Edit Client"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="lf-btn lf-btn-ghost lf-btn-sm"
                        style={{ color: 'var(--lf-danger)' }}
                        onClick={() => onDeleteClient(client)}
                        title="Delete Client"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ClientModal({ client, onClose, onSave }) {
  const [name, setName] = useState(client?.name || '')
  const [contactPerson, setContactPerson] = useState(client?.contactPerson || '')
  const [email, setEmail] = useState(client?.email || '')
  const [phone, setPhone] = useState(client?.phone || '')
  const [gstin, setGstin] = useState(client?.gstin || '')
  const [stateCode, setStateCode] = useState(client?.stateCode || String(client?.gstin || '').slice(0, 2))
  const [address, setAddress] = useState(client?.address || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      id: client?.id,
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      email: email.trim(),
      phone: phone.trim(),
      gstin: gstin.trim().toUpperCase(),
      stateCode: stateCode.trim(),
      address: address.trim()
    })
  }

  return (
    <div className="lf-modal-backdrop">
      <div className="lf-modal" style={{ maxWidth: '500px' }}>
        <div className="lf-modal-header">
          <h3 className="lf-modal-title">{client ? 'Edit Client' : 'Add New Client'}</h3>
          <button type="button" className="lf-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="lf-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="lf-form-group">
              <label className="lf-form-label">Client / Company Name *</label>
              <input type="text" required className="lf-form-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Contact Person</label>
              <input type="text" className="lf-form-input" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="lf-form-group">
                <label className="lf-form-label">Email</label>
                <input type="email" className="lf-form-input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="lf-form-group">
                <label className="lf-form-label">Phone</label>
                <input type="text" className="lf-form-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">GSTIN</label>
              <input type="text" className="lf-form-input" placeholder="e.g. 27AABCR1234F1Z5" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">State Code (GST place of supply)</label>
              <input type="text" inputMode="numeric" maxLength={2} className="lf-form-input" placeholder="e.g. 36" value={stateCode} onChange={(e) => setStateCode(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Billing Address</label>
              <textarea className="lf-form-textarea" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <div className="lf-modal-footer">
            <button type="button" className="lf-btn lf-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="lf-btn lf-btn-primary">Save Client</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// PRODUCTS & INVENTORY VIEW
// ============================================================================

function ProductsView({ products, onAddProduct, onEditProduct, onDeleteProduct }) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category))
    return ['All', ...Array.from(set)]
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = categoryFilter === 'All' || p.category === categoryFilter
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode && p.barcode.includes(search))
      return matchCat && matchSearch
    })
  }, [products, categoryFilter, search])

  return (
    <div className="lf-card">
      <div className="lf-card-header">
        <div>
          <h2 className="lf-card-title">Products & Inventory Catalogue</h2>
          <p className="lf-card-subtitle">Manage catalog items, barcodes, prices, stock levels, and HSN codes</p>
        </div>
        <button type="button" className="lf-btn lf-btn-primary" onClick={onAddProduct}>
          <Plus size={16} />
          <span>Add Product</span>
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <input
          type="text"
          className="lf-form-input"
          style={{ flex: 1, minWidth: '220px' }}
          placeholder="Search products by title, SKU, or Barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="lf-form-select"
          style={{ width: '160px' }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="lf-table-container">
        <table className="lf-table">
          <thead>
            <tr>
              <th>Product Details</th>
              <th>SKU / Barcode</th>
              <th>Category</th>
              <th>Unit Price</th>
              <th>GST Rate</th>
              <th>Stock</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 700, color: 'var(--lf-text)' }}>{p.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>{p.description}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{p.sku}</div>
                  <div style={{ fontSize: '12px', color: p.barcode ? 'var(--lf-text-muted)' : 'var(--lf-text-muted)' }}>
                    {p.barcode ? `Barcode: ${p.barcode}` : 'No Barcode'}
                  </div>
                </td>
                <td>
                  <span className="lf-badge lf-badge-draft">{p.category}</span>
                </td>
                <td style={{ fontWeight: 700 }}>{formatINR(p.price)}</td>
                <td>{p.gstRate}%</td>
                <td>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span className="lf-badge lf-badge-draft" style={{ width: 'fit-content' }}>On hand: {p.stock}</span>
                    <span style={{ fontSize: 11, color: 'var(--lf-text-muted)' }}>Reserved: {p.reservedStock || 0}</span>
                    <span className={`lf-badge ${(p.availableStock ?? p.stock) <= 5 ? 'lf-badge-overdue' : (p.availableStock ?? p.stock) > 5 ? 'lf-badge-paid' : 'lf-badge-draft'}`} style={{ width: 'fit-content' }}>
                      Available: {p.availableStock ?? p.stock}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="lf-btn lf-btn-ghost lf-btn-sm"
                      onClick={() => onEditProduct(p)}
                    >
                      <Edit size={15} />
                    </button>
                    <button
                      type="button"
                      className="lf-btn lf-btn-ghost lf-btn-sm"
                      style={{ color: 'var(--lf-danger)' }}
                      onClick={() => onDeleteProduct(p)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProductModal({ product, onClose, onSave }) {
  const [name, setName] = useState(product?.name || '')
  const [sku, setSku] = useState(product?.sku || '')
  const [barcode, setBarcode] = useState(product?.barcode || '')
  const [category, setCategory] = useState(product?.category || 'Hardware')
  const [price, setPrice] = useState(product?.price ?? '')
  const [gstRate, setGstRate] = useState(product?.gstRate ?? 18)
  const [stock, setStock] = useState(product?.stock ?? 10)
  const [hsnSac, setHsnSac] = useState(product?.hsnSac || '')
  const [description, setDescription] = useState(product?.description || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      id: product?.id,
      name: name.trim(),
      sku: sku.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      barcode: barcode.trim(),
      hsnSac: hsnSac.trim(),
      category: category.trim(),
      price: Number(price) || 0,
      gstRate: Number(gstRate),
      stock: Number(stock ?? 0),
      description: description.trim()
    })
  }

  return (
    <div className="lf-modal-backdrop">
      <div className="lf-modal" style={{ maxWidth: '520px' }}>
        <div className="lf-modal-header">
          <h3 className="lf-modal-title">{product ? 'Edit Product' : 'Add New Product'}</h3>
          <button type="button" className="lf-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="lf-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="lf-form-group">
              <label className="lf-form-label">Product / Service Name *</label>
              <input type="text" required className="lf-form-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="lf-form-group">
                <label className="lf-form-label">SKU</label>
                <input type="text" className="lf-form-input" placeholder="e.g. HRD-01" value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div className="lf-form-group">
                <label className="lf-form-label">Barcode Number (EAN/UPC)</label>
                <input type="text" className="lf-form-input" placeholder="e.g. 890103080001" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
              </div>
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">HSN / SAC Code</label>
              <input type="text" className="lf-form-input" value={hsnSac} onChange={(e) => setHsnSac(e.target.value)} placeholder="Enter applicable HSN/SAC" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div className="lf-form-group">
                <label className="lf-form-label">Price (&#8377;) *</label>
                <input type="number" required min="0" step="0.01" className="lf-form-input" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="lf-form-group">
                <label className="lf-form-label">GST Rate</label>
                <select className="lf-form-select" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))}>
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="3">3%</option>
                      <option value="12">12%</option>
                      <option value="40">40% (classification-specific)</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
              <div className="lf-form-group">
                <label className="lf-form-label">Stock Units</label>
                <input type="number" min="0" className="lf-form-input" value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Category</label>
              <select className="lf-form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Consulting">Consulting</option>
                <option value="Services">Services</option>
                <option value="Accessories">Accessories</option>
              </select>
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Description</label>
              <textarea className="lf-form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div className="lf-modal-footer">
            <button type="button" className="lf-btn lf-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="lf-btn lf-btn-primary">Save Product</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// PAYMENTS VIEW & RECORD PAYMENT MODAL
// ============================================================================

function SalesOrdersView({ orders, canManage, onAction }) {
  const [search, setSearch] = useState('')
  const [dispatchFields, setDispatchFields] = useState({})
  const [busyOrderId, setBusyOrderId] = useState('')

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    return orders.filter((order) => {
      const clientName = String(order.clients?.name || '').toLowerCase()
      const quoteNumber = String(order.quotations?.quote_number || '').toLowerCase()
      return !query || String(order.order_number || '').toLowerCase().includes(query) ||
        clientName.includes(query) || quoteNumber.includes(query)
    })
  }, [orders, search])

  const patchDispatch = (orderId, field, value) => {
    setDispatchFields((current) => ({
      ...current,
      [orderId]: { ...(current[orderId] || {}), [field]: value },
    }))
  }

  const runAction = async (order, action, fields = {}) => {
    if (busyOrderId) return
    if (action === 'cancel_order' && !window.confirm('Cancel this order and release its stock reservations?')) return
    if (action === 'mark_advance_paid' && !window.confirm('Confirm that the required advance payment has actually been received? This records the fulfillment confirmation, not a payment transaction.')) return
    setBusyOrderId(order.id)
    try {
      await onAction(order, action, fields)
    } finally {
      setBusyOrderId('')
    }
  }

  const statusLabel = (value) => String(value || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  const invoiceFor = (order) => Array.isArray(order.invoices) ? order.invoices[0] : order.invoices
  const quoteFor = (order) => Array.isArray(order.quotations) ? order.quotations[0] : order.quotations

  return (
    <div className="lf-sales-orders-view">
      <div className="lf-card">
        <div className="lf-card-header">
          <div>
            <h2 className="lf-card-title">Sales Orders & Fulfillment</h2>
            <p className="lf-card-subtitle">Track accepted quotations from stock confirmation through packing, dispatch and invoice creation.</p>
          </div>
        </div>
        <div className="lf-sales-orders-intro">
          A client's acceptance creates a sales order first. Confirm stock, complete packing and add tracking before generating the final tax invoice.
        </div>
        <div className="lf-sales-orders-search">
          <Search size={16} />
          <input
            type="search"
            className="lf-form-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by sales order, quotation or client"
            aria-label="Search sales orders"
          />
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="lf-card lf-sales-orders-empty">
          <div className="lf-sales-orders-empty-icon"><Truck size={24} /></div>
          <h3>{orders.length === 0 ? 'No sales orders yet' : 'No orders match this search'}</h3>
          <p>{orders.length === 0
            ? 'When a client accepts a sent quotation through its secure link, the sales order will appear here.'
            : 'Try a different order number, quotation number or client name.'}</p>
        </div>
      ) : (
        <div className="lf-sales-order-list">
          {filteredOrders.map((order) => {
            const quote = quoteFor(order)
            const invoice = invoiceFor(order)
            const items = Array.isArray(order.sales_order_items) ? order.sales_order_items : []
            const fields = dispatchFields[order.id] || {
              carrier: order.carrier || '',
              trackingNumber: order.tracking_number || '',
              trackingUrl: order.tracking_url || '',
            }
            const busy = busyOrderId === order.id
            const statusClass = String(order.status || '').toLowerCase().replace(/_/g, '-')
            return (
              <article className="lf-card lf-sales-order-card" key={order.id}>
                <div className="lf-sales-order-heading">
                  <div>
                    <p className="lf-sales-order-eyebrow">Sales order</p>
                    <h3>{order.order_number}</h3>
                    <p className="lf-sales-order-client">{order.clients?.name || 'Client'}</p>
                  </div>
                  <span className={`lf-badge lf-badge-${statusClass}`}>{statusLabel(order.status)}</span>
                </div>

                <div className="lf-sales-order-metrics">
                  <div><span>Quotation</span><strong>{quote?.quote_number || '—'}</strong></div>
                  <div><span>Order value</span><strong>{formatINR(quote?.grand_total)}</strong></div>
                  <div><span>Stock status</span><strong>{statusLabel(order.stock_status)}</strong></div>
                  <div><span>Payment terms</span><strong>{statusLabel(order.payment_type)}{order.payment_type === 'advance' ? (order.advance_paid ? ' · received' : ' · required') : ''}</strong></div>
                </div>

                <div className="lf-sales-order-items">
                  <strong>Items ({items.length})</strong>
                  {items.map((item) => (
                    <div className="lf-sales-order-item" key={item.id}>
                      <span>{item.description}</span>
                      <span>Qty {Number(item.quantity) || 0}</span>
                      {item.product_id && <span>Reserved {Number(item.reserved_qty) || 0}</span>}
                    </div>
                  ))}
                </div>

                {(order.carrier || order.tracking_number || order.tracking_url) && (
                  <div className="lf-sales-order-tracking">
                    <strong>Shipment</strong>
                    <span>{[order.carrier, order.tracking_number].filter(Boolean).join(' · ') || 'Tracking details saved'}</span>
                    {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer">Open tracking link</a>}
                  </div>
                )}

                {invoice?.invoice_number && (
                  <div className="lf-sales-order-invoice">
                    Invoice created: <strong>{invoice.invoice_number}</strong> · {statusLabel(invoice.status)}
                  </div>
                )}

                {canManage && (
                  <div className="lf-sales-order-actions">
                    {order.status === 'awaiting_stock' && (
                      <>
                        <button type="button" className="lf-btn lf-btn-primary lf-btn-sm" disabled={busy} onClick={() => runAction(order, 'confirm_stock')}>Confirm stock</button>
                        <button type="button" className="lf-btn lf-btn-secondary lf-btn-sm" disabled={busy} onClick={() => runAction(order, 'cancel_order')}>Cancel order</button>
                      </>
                    )}
                    {order.status === 'reserved' && (
                      <>
                        {order.payment_type === 'advance' && !order.advance_paid ? (
                          <button type="button" className="lf-btn lf-btn-primary lf-btn-sm" disabled={busy} onClick={() => runAction(order, 'mark_advance_paid')}>Mark advance received</button>
                        ) : (
                          <button type="button" className="lf-btn lf-btn-primary lf-btn-sm" disabled={busy} onClick={() => runAction(order, 'start_packing')}>Start packing</button>
                        )}
                        <button type="button" className="lf-btn lf-btn-secondary lf-btn-sm" disabled={busy} onClick={() => runAction(order, 'cancel_order')}>Cancel order</button>
                      </>
                    )}
                    {order.status === 'packing' && (
                      <button type="button" className="lf-btn lf-btn-primary lf-btn-sm" disabled={busy} onClick={() => runAction(order, 'mark_packed')}>Mark packed</button>
                    )}
                    {order.status === 'packed' && (
                      <form className="lf-sales-order-dispatch" onSubmit={(event) => {
                        event.preventDefault()
                        if (!fields.carrier.trim() || !fields.trackingNumber.trim()) return
                        void runAction(order, 'dispatch', fields)
                      }}>
                        <label>Courier / carrier
                          <input className="lf-form-input" required maxLength={120} value={fields.carrier} onChange={(event) => patchDispatch(order.id, 'carrier', event.target.value)} placeholder="e.g. Blue Dart" />
                        </label>
                        <label>Tracking number
                          <input className="lf-form-input" required maxLength={180} value={fields.trackingNumber} onChange={(event) => patchDispatch(order.id, 'trackingNumber', event.target.value)} placeholder="Shipment tracking ID" />
                        </label>
                        <label>Tracking URL (optional)
                          <input className="lf-form-input" type="url" pattern="https://.*" value={fields.trackingUrl} onChange={(event) => patchDispatch(order.id, 'trackingUrl', event.target.value)} placeholder="https://…" />
                        </label>
                        <button type="submit" className="lf-btn lf-btn-primary lf-btn-sm" disabled={busy}>Confirm dispatch</button>
                      </form>
                    )}
                    {order.status === 'dispatched' && (
                      <button type="button" className="lf-btn lf-btn-primary lf-btn-sm" disabled={busy} onClick={() => runAction(order, 'generate_invoice')}>Generate tax invoice</button>
                    )}
                  </div>
                )}
                {busy && <p className="lf-sales-order-busy" role="status">Updating sales order…</p>}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PaymentsView({ payments, onOpenPaymentModal }) {
  const totalReceived = useMemo(() => payments.reduce((sum, p) => sum + (p.amount || 0), 0), [payments])

  return (
    <div className="lf-card">
      <div className="lf-card-header">
        <div>
          <h2 className="lf-card-title">Payment Collections</h2>
          <p className="lf-card-subtitle">Record and audit client payments, bank transfers, and receipts</p>
        </div>
        <button type="button" className="lf-btn lf-btn-primary" onClick={onOpenPaymentModal}>
          <Plus size={16} />
          <span>Record Received Payment</span>
        </button>
      </div>

      <div className="lf-metrics-grid" style={{ marginBottom: '20px' }}>
        <div className="lf-metric-card">
          <span className="lf-metric-label">Total Collections Recorded</span>
          <div className="lf-metric-value">{formatINR(totalReceived)}</div>
          <div className="lf-metric-subtext">Across {payments.length} verified transactions</div>
        </div>
      </div>

      <div className="lf-table-container">
        <table className="lf-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Invoice #</th>
              <th>Client</th>
              <th>Date</th>
              <th>Method</th>
              <th>Reference #</th>
              <th>Amount (&#8377;)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600, color: 'var(--lf-brand)' }}>{p.paymentNumber}</td>
                <td><strong>{p.invoiceNumber}</strong></td>
                <td>{p.clientName}</td>
                <td>{p.paymentDate}</td>
                <td>
                  <span className="lf-badge lf-badge-draft">{p.paymentMethod}</span>
                </td>
                <td style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>{p.referenceNumber || 'N/A'}</td>
                <td style={{ fontWeight: 700, color: 'var(--lf-brand)' }}>{formatINR(p.amount)}</td>
                <td>
                  <span className="lf-badge lf-badge-paid">{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RecordPaymentModal({ preselectedDoc, invoices, onClose, onSave, showToast = (message) => window.alert(message) }) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(preselectedDoc?.id || (invoices[0]?.id || ''))
  const [amount, setAmount] = useState(preselectedDoc?.balanceDue || invoices[0]?.balanceDue || '')
  const [paymentDate, setPaymentDate] = useState(todayInIndia())
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer (NEFT)')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const activeInvoice = invoices.find((i) => i.id === selectedInvoiceId) || preselectedDoc

  const handleInvoiceChange = (id) => {
    setSelectedInvoiceId(id)
    const inv = invoices.find((i) => i.id === id)
    if (inv) {
      setAmount(inv.balanceDue)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (savingRef.current) return
    const numAmount = Number(amount)
    if (!activeInvoice) {
      showToast('Select an invoice before recording a payment.')
      return
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      showToast('Enter a payment amount greater than zero.')
      return
    }
    if (numAmount > Number(activeInvoice.balanceDue) + 0.005) {
      showToast(`Payment cannot exceed the outstanding balance of ${formatINR(activeInvoice.balanceDue)}.`)
      return
    }

    savingRef.current = true
    setSaving(true)
    try {
      await onSave({
        invoiceId: activeInvoice.id,
        invoiceNumber: activeInvoice.documentNumber,
        clientName: activeInvoice.clientName,
        amount: numAmount,
        paymentDate,
        paymentMethod,
        referenceNumber: referenceNumber.trim(),
        status: 'Completed',
        notes: notes.trim()
      })
    } catch (error) {
      showToast(error?.message || 'Could not record this payment.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="lf-modal-backdrop">
      <div className="lf-modal" style={{ maxWidth: '480px' }}>
        <div className="lf-modal-header">
          <h3 className="lf-modal-title">Record Payment Received</h3>
          <button type="button" className="lf-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="lf-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="lf-form-group">
              <label className="lf-form-label">Target Invoice</label>
              {preselectedDoc ? (
                <div style={{ padding: '8px 12px', background: 'var(--lf-bg)', borderRadius: '6px', fontSize: '13px', fontWeight: 600 }}>
                  {preselectedDoc.documentNumber}  -  {preselectedDoc.clientName} (Due: {formatINR(preselectedDoc.balanceDue)})
                </div>
              ) : (
                <select
                  className="lf-form-select"
                  value={selectedInvoiceId}
                  onChange={(e) => handleInvoiceChange(e.target.value)}
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.documentNumber} • {inv.clientName} (Bal: {formatINR(inv.balanceDue)})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="lf-form-group">
              <label className="lf-form-label">Payment Amount (&#8377;) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                className="lf-form-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="lf-form-group">
                <label className="lf-form-label">Payment Date</label>
                <input
                  type="date"
                  className="lf-form-input"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="lf-form-group">
                <label className="lf-form-label">Payment Method</label>
                <select
                  className="lf-form-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="Bank Transfer (NEFT)">Bank Transfer (NEFT)</option>
                  <option value="RTGS Wire">RTGS Wire</option>
                  <option value="UPI Business">UPI Business</option>
                  <option value="Corporate Credit Card">Corporate Credit Card</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
            </div>

            <div className="lf-form-group">
              <label className="lf-form-label">Bank Reference / UTR Number</label>
              <input
                type="text"
                className="lf-form-input"
                placeholder="e.g. HDFC202610190012"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>

            <div className="lf-form-group">
              <label className="lf-form-label">Notes</label>
              <input
                type="text"
                className="lf-form-input"
                placeholder="Optional payment notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="lf-modal-footer">
            <button type="button" className="lf-btn lf-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="lf-btn lf-btn-primary" disabled={saving}>
              {saving ? 'Recording Payment...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// REPORTS & ANALYTICS VIEW
// ============================================================================

function ReportsView({ invoices, payments }) {
  const [dateRange, setDateRange] = useState('YTD')
  const today = new Date(`${todayInIndia()}T12:00:00`)

  const rangeStart = (() => {
    if (dateRange === 'YTD') {
      return new Date(
        today.getFullYear() - (today.getMonth() < 3 ? 1 : 0),
        3,
        1
      )
    }

    if (dateRange === 'Q3') {
      const q3Year = today.getMonth() >= 9 ? today.getFullYear() : today.getFullYear() - 1
      return new Date(q3Year, 9, 1)
    }

    if (dateRange === '30D') {
      const start = new Date(today)
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - 29)
      return start
    }

    return null
  })()

  const rangeEnd = dateRange === 'Q3'
    ? new Date(rangeStart.getFullYear(), 12, 1)
    : (() => {
        const end = new Date(today)
        end.setHours(0, 0, 0, 0)
        end.setDate(end.getDate() + 1)
        return end
      })()

  const isInRange = (value) => {
    if (dateRange === 'ALL') return true
    if (!value) return false

    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)

    return (
      !Number.isNaN(date.getTime()) &&
      date >= rangeStart &&
      date < rangeEnd
    )
  }

  const reportableInvoices = invoices.filter((inv) => !['Cancelled', 'Draft'].includes(inv.status))
  const reportableInvoiceIds = new Set(reportableInvoices.map((inv) => inv.id))
  const filteredInvoices = reportableInvoices.filter((inv) => isInRange(inv.issueDate))

  const filteredPayments = payments.filter((payment) =>
    reportableInvoiceIds.has(payment.invoiceId) && isInRange(payment.paymentDate)
  )

  const totalInvoiced = filteredInvoices.reduce(
    (sum, invoice) => sum + (Number(invoice.grandTotal) || 0),
    0
  )

  const totalTaxCollected = filteredInvoices.reduce(
    (sum, invoice) => sum + (Number(invoice.taxAmount) || 0),
    0
  )

  const totalCollected = filteredPayments.reduce(
    (sum, payment) => sum + (Number(payment.amount) || 0),
    0
  )

  const cgstTotal = filteredInvoices.reduce(
    (sum, invoice) => sum + (Number(invoice.cgstAmount) || 0),
    0
  )

  const sgstTotal = filteredInvoices.reduce(
    (sum, invoice) => sum + (Number(invoice.sgstAmount) || 0),
    0
  )

  const igstTotal = filteredInvoices.reduce(
    (sum, invoice) => sum + (Number(invoice.igstAmount) || 0),
    0
  )
  // CSV Export
  const handleExportCsv = () => {
    const csvCell = escapeCsvCell
    const rows = [
      ['Invoice Number', 'Client', 'Issue Date', 'Due Date', 'Subtotal', 'Discount', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Tax Total', 'Grand Total', 'Status'],
      ...filteredInvoices.map((inv) => [
        inv.documentNumber, inv.clientName, inv.issueDate, inv.dueDate,
        inv.subtotal, inv.discountAmount, inv.taxableAmount, inv.cgstAmount, inv.sgstAmount, inv.igstAmount, inv.taxAmount, inv.grandTotal, inv.status,
      ]),
    ]
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledgerflow_financial_report_${todayInIndia()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="lf-card" style={{ marginBottom: '24px' }}>
        <div className="lf-card-header">
          <div>
            <h2 className="lf-card-title">Financial Reports & GST Tax Audit</h2>
            <p className="lf-card-subtitle">Comprehensive tax summary, GST collected, and exportable financial reports</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              className="lf-form-select"
              style={{ width: '150px' }}
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="ALL">All Time</option>
              <option value="YTD">Current Financial Year (YTD)</option>
              <option value="Q3">Q3 Oct-Dec</option>
              <option value="30D">Last 30 Days</option>
            </select>
            <button type="button" className="lf-btn lf-btn-primary" onClick={handleExportCsv}>
              <Download size={16} />
              <span>Export Report (CSV)</span>
            </button>
          </div>
        </div>

        <div className="lf-metrics-grid">
          <div className="lf-metric-card">
            <span className="lf-metric-label">Gross Billed Value</span>
            <div className="lf-metric-value">{formatINR(totalInvoiced)}</div>
            <div className="lf-metric-subtext">Total invoices issued</div>
          </div>
          <div className="lf-metric-card">
            <span className="lf-metric-label">GST Tax Billed</span>
            <div className="lf-metric-value" style={{ color: 'var(--lf-brand)' }}>{formatINR(totalTaxCollected)}</div>
            <div className="lf-metric-subtext">CGST + SGST + IGST on invoices issued</div>
          </div>
          <div className="lf-metric-card">
            <span className="lf-metric-label">Collections Received</span>
            <div className="lf-metric-value">{formatINR(totalCollected)}</div>
            <div className="lf-metric-subtext">Bank & UPI cleared receipts</div>
          </div>
        </div>

        {/* GST Audit Breakdown Card */}
        <div style={{ marginTop: '20px', padding: '16px', background: 'var(--lf-bg)', borderRadius: '8px', border: '1px solid var(--lf-border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--lf-brand)' }}>
            GST Tax Breakdown (Government Compliance)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div style={{ padding: '10px', background: '#FFFFFF', borderRadius: '6px', border: '1px solid var(--lf-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>CGST (Central Tax)</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{formatINR(cgstTotal)}</div>
            </div>
            <div style={{ padding: '10px', background: '#FFFFFF', borderRadius: '6px', border: '1px solid var(--lf-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>SGST (State Tax)</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{formatINR(sgstTotal)}</div>
            </div>
            <div style={{ padding: '10px', background: '#FFFFFF', borderRadius: '6px', border: '1px solid var(--lf-border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--lf-text-muted)' }}>IGST (Integrated Tax)</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{formatINR(igstTotal)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SETTINGS VIEW (COMPANY PROFILE, INVOICING PREFERENCES & SUPABASE SYNC)
// ============================================================================

function SettingsView({ profile, onSaveProfile }) {
  const [formData, setFormData] = useState({ ...profile })
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState('')
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(profile)
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined
    const warnBeforeLeave = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [hasUnsavedChanges])
  const handleChange = (field, val) => {
    setValidationError('')
    setFormData((prev) => {
      const next = { ...prev, [field]: val }
      if (field === 'gstin') {
        // Normalize pasted GSTINs (including spaces/newlines) before validation.
        next.gstin = String(val || '').toUpperCase().replace(/\s+/g, '')
        const gstStateCode = next.gstin.slice(0, 2)
        if (/^\d{2}$/.test(gstStateCode) && GST_STATE_NAMES[gstStateCode]) {
          next.stateCode = gstStateCode
        }
      }
      if (field === 'ifscCode') {
        const prefix = String(val || '').trim().toUpperCase().slice(0, 4)
        const bankNames = { SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank', PUNB: 'Punjab National Bank', BARB: 'Bank of Baroda', CNRB: 'Canara Bank', UBIN: 'Union Bank of India', IDFB: 'IDFC FIRST Bank', YESB: 'Yes Bank' }
        if (bankNames[prefix]) next.bankName = bankNames[prefix]
      }
      return next
    })
  }

  const handleSaveAll = async (e) => {
    e.preventDefault()
    const gstin = String(formData.gstin || '').toUpperCase().replace(/\s+/g, '')
    const pan = String(formData.pan || '').trim().toUpperCase()
    const ifsc = String(formData.ifscCode || '').trim().toUpperCase()
    // GSTIN is 2-digit state code + 10-character PAN/TAN + entity code + Z + checksum.
    // It is optional for businesses that are not GST-registered.
    const gstinFormat = /^[0-9]{2}(?:[A-Z]{5}[0-9]{4}[A-Z]|[A-Z]{4}[0-9]{5}[A-Z])[1-9A-Z]Z[0-9A-Z]$/
    if (gstin && !gstinFormat.test(gstin)) {
      setValidationError('GSTIN must be 15 characters: state code + PAN/TAN + entity code + Z + checksum. Leave it blank if your business is not GST-registered.')
      return
    }
    if (gstin) {
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const values = [...gstin.slice(0, 14)].reverse().map((ch) => chars.indexOf(ch))
      let sum = 0
      values.forEach((value, index) => { const product = value * (index % 2 === 0 ? 2 : 1); sum += Math.floor(product / 36) + product % 36 })
      const check = chars[(36 - (sum % 36)) % 36]
      if (check !== gstin[14]) { setValidationError('The GSTIN checksum does not match. Check the number and try again.'); return }
    }
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) { setValidationError('Enter PAN in the format ABCDE1234F.'); return }
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { setValidationError('Enter a valid 11-character IFSC code.'); return }
    setSaving(true)
    try { await onSaveProfile({ ...formData, gstin, pan, ifscCode: ifsc }); setFormData((prev) => ({ ...prev, gstin, pan, ifscCode: ifsc })); setValidationError('') }
    finally { setSaving(false) }
   }

  return (
    <div className="lf-card">
      <div className="lf-card-header lf-settings-save-bar">
        <div>
          <h2 className="lf-card-title">System & Company Configuration</h2>
          <p className="lf-card-subtitle">Set your company details, GSTIN, invoice numbering prefixes, and cloud database</p>
        </div>
        <button type="button" className="lf-btn lf-btn-primary" onClick={handleSaveAll} disabled={saving}>
          <Check size={16} />
          <span>{saving ? "Saving…" : hasUnsavedChanges ? "Save Changes •" : "Save Changes"}</span>
        </button>
      </div>

      {validationError && <div className="lf-profile-completion-alert" role="alert"><div className="lf-profile-completion-copy"><strong>Check your business details</strong><span>{validationError}</span></div></div>}
      <form onSubmit={handleSaveAll}>
        {/* Business Profile */}
        <div style={{ marginBottom: '28px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '16px' }}>
            Business Legal Entity
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div className="lf-form-group">
              <label className="lf-form-label">Company Legal Name *</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.companyName}
                onChange={(e) => handleChange('companyName', e.target.value)}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Trade / Brand Name</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.tradeName}
                onChange={(e) => handleChange('tradeName', e.target.value)}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">GSTIN <span style={{ fontWeight: 500, color: 'var(--lf-text-muted)' }}>(optional)</span></label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.gstin}
                placeholder="15-character GSTIN"
                maxLength={15}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(e) => handleChange('gstin', e.target.value)}
              />
              <span style={{ display: 'block', marginTop: '5px', fontSize: '12px', lineHeight: 1.5, color: 'var(--lf-text-muted)' }}>
                Spaces in pasted values are removed automatically. Leave blank if you are not GST-registered.
              </span>
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">State Code (place of supply)</label>
              <select className="lf-form-select" value={formData.stateCode || String(formData.gstin || '').slice(0, 2)} onChange={(e) => handleChange('stateCode', e.target.value)}>
                <option value="">Select state code</option>
                {Object.entries(GST_STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
              </select>
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">PAN</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.pan}
                onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Business Email</label>
              <input
                type="email"
                className="lf-form-input"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Phone Number</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>
          </div>
          <div className="lf-form-group" style={{ marginTop: '14px' }}>
            <label className="lf-form-label">Registered Office Address</label>
            <textarea
              className="lf-form-textarea"
              style={{ minHeight: '60px' }}
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
            />
          </div>
        </div>

        {/* Bank Account Details */}
        <div style={{ marginBottom: '28px', borderTop: '1px solid var(--lf-border)', paddingTop: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '16px' }}>
            Bank Account & Remittance Information
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div className="lf-form-group">
              <label className="lf-form-label">Bank Name</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.bankName}
                onChange={(e) => handleChange('bankName', e.target.value)}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Account Holder Name</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.accountHolder}
                onChange={(e) => handleChange('accountHolder', e.target.value)}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">Account Number</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.accountNumber}
                onChange={(e) => handleChange('accountNumber', e.target.value)}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">IFSC Code</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.ifscCode}
                onChange={(e) => handleChange('ifscCode', e.target.value.toUpperCase())}
              />
            </div>
            <div className="lf-form-group">
              <label className="lf-form-label">UPI ID / VPA</label>
              <input
                type="text"
                className="lf-form-input"
                value={formData.upiId}
                onChange={(e) => handleChange('upiId', e.target.value)}
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

// ============================================================================
// CUSTOM 404 PAGE — tiny copy, big personality
// ============================================================================

function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--lf-bg)',
        display: 'grid',
        placeItems: 'center',
        padding: '24px'
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: '520px',
          textAlign: 'center',
          padding: '24px'
        }}
      >
        <div
          aria-label="404"
          style={{
            fontSize: 'clamp(100px, 22vw, 168px)',
            fontWeight: 950,
            lineHeight: 0.9,
            letterSpacing: '-0.09em',
            color: 'var(--lf-brand)',
            margin: '0 0 28px',
            userSelect: 'none'
          }}
        >
          4<span style={{ color: 'var(--lf-highlight)', display: 'inline-block', transform: 'rotate(-9deg)' }}>0</span>4
        </div>

        <h1
          style={{
            fontSize: 'clamp(22px, 4vw, 30px)',
            fontWeight: 850,
            letterSpacing: '-0.04em',
            color: 'var(--lf-text)',
            margin: '0 0 8px'
          }}
        >
          Well, this is awkward.
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--lf-text-secondary)', margin: '0 0 28px' }}>
          Even our paperwork couldn’t find this page.
        </p>

        <button
          type="button"
          className="lf-btn lf-btn-primary lf-btn-lg"
          onClick={() => navigate('/')}
        >
          Take me back
        </button>
      </section>
    </main>
  )
}

// ============================================================================

// MANDATORY TERMS & CONDITIONS PAGE (FEATURE 14.B)
// ============================================================================

function TermsConditionsPage() {
  const navigate = useNavigate()

  const sections = [
    { id: 'sec-1', title: '1. Introduction and Acceptance of Terms' },
    { id: 'sec-2', title: '2. Description of the Invoicing and Quotation Service' },
    { id: 'sec-3', title: '3. User Accounts and Account Security' },
    { id: 'sec-4', title: '4. Accuracy of Customer Information, Products, and Invoices' },
    { id: 'sec-5', title: '5. User Responsibility for Verifying Tax Calculations & GST' },
    { id: 'sec-6', title: '6. Permitted Use and Prohibited Misuse' },
    { id: 'sec-7', title: '7. Data Storage, Backups, and Service Availability' },
    { id: 'sec-8', title: '8. Third-Party Services (Including Supabase)' },
    { id: 'sec-9', title: '9. Intellectual Property and Permitted Use' },
    { id: 'sec-10', title: '10. Service Suspension, Termination, and Closure' },
    { id: 'sec-11', title: '11. Limitations of Liability and Disclaimers' },
    { id: 'sec-12', title: '12. Updates to These Terms' },
    { id: 'sec-13', title: '13. Contact Details and Effective Date' }
  ]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--lf-bg)', padding: '40px 20px' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        {/* Top Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg className="lf-logo-icon" viewBox="0 0 40 40" role="img" aria-label="LedgerFlow logo" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ledgerflow-mark-gradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" />
                  <stop offset="100%" stopColor="#1D4ED8" />
                </linearGradient>
              </defs>
              <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#ledgerflow-mark-gradient)" />
              <path d="M10 11.5h7.5c2.1 0 3.5 1.2 3.5 3.1v14c-1.1-1.2-2.2-1.7-4-1.7H10z" fill="#FFFFFF" />
              <path d="M30 11.5h-5.5c-2.1 0-3.5 1.2-3.5 3.1v14c1.1-1.2 2.2-1.7 4-1.7H30z" fill="#DBEAFE" />
              <path d="M12.5 16h5M12.5 20h5M24 16h3.5M24 20h3.5" stroke="#2563EB" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="29.2" cy="28.2" r="5" fill="#F59E0B" />
              <path d="M26.8 28.2h4.5m-1.8-1.8 1.8 1.8-1.8 1.8" fill="none" stroke="#FFFFFF" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--lf-text)' }}>LedgerFlow</div>
              <div style={{ fontSize: '11px', color: 'var(--lf-brand)', fontWeight: 600 }}>Terms & Conditions Documentation</div>
            </div>
          </div>
          <button
            type="button"
            className="lf-btn lf-btn-secondary"
            onClick={() => navigate('/')}
          >
            <ChevronLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {/* Content Container */}
        <div className="lf-card" style={{ padding: '36px', lineHeight: '1.7' }}>
          <div style={{ borderBottom: '1px solid var(--lf-border)', paddingBottom: '16px', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--lf-text)', marginBottom: '6px' }}>
              Terms & Conditions of Service
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--lf-text-muted)' }}>
              Effective Date: October 21, 2026 | Last Revised: October 2026 | Version: 1.0.0
            </p>
          </div>

          {/* Quick Table of Contents */}
          <div style={{ padding: '16px', background: 'var(--lf-bg)', borderRadius: '8px', marginBottom: '32px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--lf-brand)' }}>
              Table of Contents
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '6px', fontSize: '12px' }}>
              {sections.map((sec) => (
                <a key={sec.id} href={`#${sec.id}`} style={{ color: 'var(--lf-text-secondary)' }}>
                  {sec.title}
                </a>
              ))}
            </div>
          </div>

          {/* All 13 Sections Content */}
          <section id="sec-1" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              1. Introduction and Acceptance of Terms
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              By accessing, browsing, deploying, or utilizing the LedgerFlow Invoice and Quotation Management System ("LedgerFlow", "the Service", "the Application"), you ("the User", "the Enterprise") acknowledge and agree to be bound by these Terms and Conditions. If you do not accept these terms in their entirety, you must discontinue use immediately.
            </p>
          </section>

          <section id="sec-2" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              2. Description of the Invoicing and Quotation Service
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              LedgerFlow provides commercial software capabilities for generating, managing, issuing, and printing tax invoices, price estimates, quotations, product catalog management, barcode optical recognition, and financial transaction recording.
            </p>
          </section>

          <section id="sec-3" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              3. User Accounts and Account Security
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              Users are responsible for safeguarding any credentials, session tokens, API configurations, and browser storage utilized to access LedgerFlow. You agree to notify administrators immediately of any unauthorized access or compromise of your environment.
            </p>
          </section>

          <section id="sec-4" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              4. Accuracy of Customer Information, Products, Invoices, and Tax Entries
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              The User bears exclusive responsibility for the veracity, legality, and correctness of customer identities, billing addresses, Goods and Services Tax Identification Numbers (GSTIN), Permanent Account Numbers (PAN), product descriptions, and unit prices entered into LedgerFlow.
            </p>
          </section>

          <section id="sec-5" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              5. User Responsibility for Verifying Tax Calculations, GST Details, and Documents
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              While LedgerFlow provides automated mathematical calculations for Central Goods and Services Tax (CGST), State Goods and Services Tax (SGST), Integrated Goods and Services Tax (IGST), and commercial discounts, the User must verify and validate all generated documents against prevailing statutory requirements before dispatching to customers or tax authorities.
            </p>
          </section>

          <section id="sec-6" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              6. Permitted Use and Prohibited Misuse
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              You agree not to use LedgerFlow for fraudulent invoicing, illegal tax evasion, money laundering, transmitting malicious payloads, or attempting unauthorized access to multi-tenant database infrastructures.
            </p>
          </section>

          <section id="sec-7" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              7. Data Storage, Backups, Service Availability, and Technical Limitations
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              LedgerFlow stores records in the connected Supabase project. Operators must configure database access controls, backups, and retention policies appropriately. Service availability and data recovery depend on the configured hosting and database providers.
            </p>
          </section>

          <section id="sec-8" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              8. Third-Party Services (Including Supabase)
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              When connected to cloud backends such as Supabase, users are subject to third-party terms of service, uptime schedules, and privacy practices. LedgerFlow enforces Row Level Security (RLS) and public key segregation to protect data confidentiality.
            </p>
          </section>

          <section id="sec-9" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              9. Intellectual Property and Permitted Use
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              All software interfaces, trademarks, graphic assets, typography styles, and source architecture of LedgerFlow remain the proprietary intellectual property of the project authors, protected by applicable copyright and trade secret laws.
            </p>
          </section>

          <section id="sec-10" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              10. Service Suspension, Termination, and Account Closure
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              We reserve the right to suspend or terminate service access without liability in the event of confirmed terms violations, security breaches, legal directives, or technical discontinuations.
            </p>
          </section>

          <section id="sec-11" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              11. Limitations of Liability and Disclaimers
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              LedgerFlow is provided on an "as-is" and "as-available" basis without warranties of any kind. Under no circumstances shall the authors or maintainers be liable for indirect, punitive, or consequential damages arising from document errors, lost business revenues, or tax penalties.
            </p>
          </section>

          <section id="sec-12" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              12. Updates to These Terms
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              We may revise these Terms and Conditions from time to time. Continued interaction with the system following such modifications represents binding acceptance of the updated terms.
            </p>
          </section>

          <section id="sec-13" style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--lf-brand)', marginBottom: '8px' }}>
              13. Contact Details and Effective Date
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--lf-text)' }}>
              For legal inquiries, compliance audits, or enterprise deployment agreements, contact:
              <br />
              <strong>Project:</strong> LedgerFlow — Invoice & Quotation Generation System
              <br />
              <strong>Contact:</strong> Contact the project administrator
              <br />
              <strong>Effective Date:</strong> October 23, 2026
            </p>
          </section>

          <div style={{ borderTop: '1px solid var(--lf-border)', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="lf-btn lf-btn-primary"
              onClick={() => navigate('/')}
            >
              Return to LedgerFlow Application
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
