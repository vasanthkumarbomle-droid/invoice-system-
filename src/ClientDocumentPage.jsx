import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, LoaderCircle, MailCheck, XCircle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from './supabase'
import './client-document.css'

const formatINR = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
}).format(Number(value) || 0)

export default function ClientDocumentPage() {
  const token = new URLSearchParams(window.location.search).get('token') || ''
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(null)

  const loadDocument = useCallback(async () => {
    setLoading(true)
    setError('')
    if (!token) {
      setError('This document link is missing its secure token.')
      setLoading(false)
      return
    }
    if (!isSupabaseConfigured || !supabase) {
      setError('The secure document portal is not configured. Please contact the sender.')
      setLoading(false)
      return
    }
    const { data, error: invokeError } = await supabase.functions.invoke('quotation-workflow', {
      body: { action: 'view', token },
    })
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || 'Could not open this document.')
      setLoading(false)
      return
    }
    if (!data?.document || !data?.organization) {
      setError('This document link is invalid or has expired.')
      setLoading(false)
      return
    }
    setPayload(data)
    setLoading(false)
  }, [token])

  useEffect(() => { loadDocument() }, [loadDocument])

  const respond = async (decision) => {
    if (!supabase || submitting) return
    setSubmitting(true)
    setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('quotation-workflow', {
      body: { action: 'respond', token, decision },
    })
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || 'Could not record your response.')
    } else {
      setPayload((current) => current ? {
        ...current,
        responseStatus: decision,
        ownerNotified: Boolean(data?.ownerNotified),
        document: { ...current.document, status: decision },
      } : current)
    }
    setSubmitting(false)
  }

  if (loading) {
    return <main className="client-document-page"><div className="client-document-state"><LoaderCircle className="client-spin" size={24} /> Opening secure document…</div></main>
  }

  if (error && !payload) {
    return <main className="client-document-page"><div className="client-document-state"><h1>Document unavailable</h1><p>{error}</p><p className="client-muted">Ask the sender for a new link if this document has expired.</p></div></main>
  }
  if (!payload) return null

  const doc = payload.document
  const org = payload.organization
  const isQuotation = doc.type === 'quotation'
  const hasResponse = Boolean(payload.responseStatus)
  const validUntil = String(doc.dueDate || '').slice(0, 10)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  const canRespond = isQuotation && !hasResponse && String(doc.status || '').toLowerCase() === 'sent' && (!validUntil || validUntil >= today)

  return (
    <main className="client-document-page">
      <header className="client-document-topbar">
        <div className="client-document-brand">
          <span className="client-document-mark">LF</span>
          <div><strong>LedgerFlow</strong><span>Secure client document</span></div>
        </div>
        <button type="button" className="client-btn client-btn-primary client-print-action" onClick={() => window.print()}>
          <Download size={16} /> Download / Save PDF
        </button>
      </header>

      <section className="client-document-sheet" id="client-document-print-sheet">
        <div className="client-doc-heading">
          <div>
            <div className="client-company-name">{org.name || org.legal_name || 'Business'}</div>
            <div className="client-muted">{org.address || ''}</div>
            {org.gstin && <div className="client-muted">GSTIN: {org.gstin}</div>}
            <div className="client-muted">{org.email || ''}{org.phone ? ' · ' + org.phone : ''}</div>
          </div>
          <div className="client-doc-ref">
            <h1>{isQuotation ? 'Price Quotation' : 'Tax Invoice'}</h1>
            <strong>#{doc.documentNumber}</strong>
            <span>{isQuotation ? 'Valid until' : 'Due date'}: {doc.dueDate || '—'}</span>
          </div>
        </div>

        <div className="client-doc-meta">
          <div className="client-doc-meta-box">
            <span className="client-label">Prepared for</span>
            <strong>{doc.client?.name || 'Client'}</strong>
            {doc.client?.address && <span>{doc.client.address}</span>}
            {doc.client?.email && <span>{doc.client.email}</span>}
            {doc.client?.gstin && <span>GSTIN: {doc.client.gstin}</span>}
          </div>
          <div className="client-doc-meta-box">
            <span className="client-label">Document details</span>
            <span>Issue date: {doc.issueDate || '—'}</span>
            <span>Status: {hasResponse ? payload.responseStatus : (doc.status || 'Issued')}</span>
            {doc.paymentTerms && <span>Terms: {doc.paymentTerms}</span>}
          </div>
        </div>

        <div className="client-table-wrap">
          <table className="client-doc-items">
            <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>GST</th><th className="client-num">Total</th></tr></thead>
            <tbody>
              {(doc.items || []).map((item, index) => (
                <tr key={item.id || index}>
                  <td>{index + 1}</td>
                  <td><strong>{item.description || 'Item'}</strong>{item.sku && <small>{item.sku}</small>}</td>
                  <td>{item.quantity}</td>
                  <td>{formatINR(item.unitPrice)}</td>
                  <td>{Number(item.gstRate || 0)}%</td>
                  <td className="client-num">{formatINR(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="client-doc-bottom">
          <div className="client-doc-notes">
            {doc.notes && <><span className="client-label">Notes / terms</span><p>{doc.notes}</p></>}
            {(org.bank_name || org.bank_account_no || org.bank_ifsc || org.upi_id) && (
              <div className="client-payment-details">
                <span className="client-label">Payment details</span>
                {org.bank_name && <span>Bank: {org.bank_name}</span>}
                {org.bank_account_no && <span>A/C: {org.bank_account_no}</span>}
                {org.bank_ifsc && <span>IFSC: {org.bank_ifsc}</span>}
                {org.upi_id && <span>UPI: {org.upi_id}</span>}
              </div>
            )}
          </div>
          <div className="client-total-box">
            <div><span>Subtotal</span><strong>{formatINR(doc.subtotal)}</strong></div>
            {Number(doc.discountAmount) > 0 && <div><span>Discount</span><strong>−{formatINR(doc.discountAmount)}</strong></div>}
            <div><span>Tax</span><strong>{formatINR(doc.taxAmount)}</strong></div>
            <div className="client-grand-total"><span>Total</span><strong>{formatINR(doc.grandTotal)}</strong></div>
          </div>
        </div>

        <footer className="client-doc-footer">
          <span>This document was shared securely by {org.name || org.legal_name || 'the sender'} via LedgerFlow.</span>
          <div><strong>For {org.name || org.legal_name || 'Business'}</strong><span className="client-signature-line">Authorized Signatory</span></div>
        </footer>
      </section>

      <section className="client-response-panel client-print-action">
        {isQuotation ? (
          <>
            <div>
              <span className="client-eyebrow">QUOTATION RESPONSE</span>
              <h2>{hasResponse ? 'Your response has been recorded' : 'Review and respond'}</h2>
              <p>{hasResponse
                ? 'Your ' + payload.responseStatus + ' decision is recorded. ' + (payload.ownerNotified ? 'The business contact was also notified by email.' : 'The response is available to the business in LedgerFlow.')
                : canRespond
                  ? 'Review the quotation and choose Accept or Reject. Your decision will be recorded and the sender can proceed accordingly.'
                  : 'This quotation is no longer awaiting a response or its validity date has passed. Contact the sender if you need an updated quotation.'}</p>
            </div>
            {canRespond && (
              <div className="client-response-actions">
                <button type="button" className="client-btn client-btn-primary" disabled={submitting} onClick={() => respond('accepted')}>
                  <CheckCircle2 size={16} /> {submitting ? 'Submitting…' : 'Accept quotation'}
                </button>
                <button type="button" className="client-btn client-btn-secondary" disabled={submitting} onClick={() => respond('rejected')}>
                  <XCircle size={16} /> Reject quotation
                </button>
              </div>
            )}
            {hasResponse && <div className="client-response-confirmation"><MailCheck size={18} /> Response recorded successfully</div>}
          </>
        ) : (
          <div><span className="client-eyebrow">INVOICE</span><h2>Invoice ready</h2><p>Use Download / Save PDF above to keep a copy of this invoice. Contact the sender if you have any questions.</p></div>
        )}
        {error && <p className="client-error" role="alert">{error}</p>}
        <p className="client-muted client-security-note">This link is private to its recipient. Please do not forward it to others.</p>
      </section>
    </main>
  )
}
