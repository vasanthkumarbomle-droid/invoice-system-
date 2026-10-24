import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, LoaderCircle, MailCheck, XCircle } from 'lucide-react'
import { supabase, isSupabaseConfigured } from './supabase'
import './client-document.css'

// Supabase's invoke() can expose only a generic non-2xx message unless we
// explicitly read the Response carried by FunctionsHttpError.context.
async function getFunctionErrorMessage(invokeError, data, fallback) {
  const bodyMessage = (body) => {
    const message = String(body?.error || body?.message || body?.msg || '').trim()
    const details = String(body?.details || '').trim()
    return [message, details].filter(Boolean).join(' — ')
  }
  if (data?.error) return bodyMessage(data) || String(data.error)

  const context = invokeError?.context
  if (context && typeof context.clone === 'function') {
    const response = context.clone()
    const status = Number(response.status) || null
    const rawText = typeof response.text === 'function'
      ? await response.text().catch(() => '')
      : ''
    if (rawText) {
      try {
        const message = bodyMessage(JSON.parse(rawText))
        if (message) return message
      } catch {
        // Non-JSON responses are handled by status below without exposing HTML.
      }
    }
    if (status === 400 || status === 404) {
      return 'This secure quotation link is invalid, expired, or was replaced by a newer email. Open the newest quotation email or ask the sender to resend it.'
    }
    if (status === 409) {
      return 'This quotation has already been answered or is no longer awaiting a response. Refresh the page to see its latest status.'
    }
    if (status) return `${fallback} (HTTP ${status}). Please try again or ask the sender to resend the quotation.`
  }
  return invokeError?.message || fallback
}

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
    try {
      if (!token) {
        setError('This document link is missing its secure token.')
        return
      }
      if (!isSupabaseConfigured || !supabase) {
        setError('The secure document portal is not configured. Please contact the sender.')
        return
      }
      const { data, error: invokeError } = await supabase.functions.invoke('quotation-workflow', {
        body: { action: 'view', token },
      })
      if (invokeError || data?.error) {
        setError(await getFunctionErrorMessage(invokeError, data, 'Could not open this document.'))
        return
      }
      if (!data?.document || !data?.organization) {
        setError('The server did not return the quotation details. Ask the sender to resend the quotation.')
        return
      }
      setPayload(data)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not open this document. Please ask the sender to resend it.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadDocument() }, [loadDocument])

  const respond = async (decision) => {
    if (!supabase || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('quotation-workflow', {
        body: { action: 'respond', token, decision },
      })
      if (invokeError || data?.error) {
        setError(await getFunctionErrorMessage(invokeError, data, 'Could not record your response.'))
      } else {
        setPayload((current) => current ? {
          ...current,
          responseStatus: decision,
          ownerNotified: Boolean(data?.ownerNotified),
          invoiceGenerated: Boolean(data?.invoiceGenerated),
          invoiceId: data?.invoiceId || current.invoiceId || null,
          document: {
            ...current.document,
            status: decision === 'accepted' && data?.invoiceGenerated ? 'Converted' : decision,
          },
        } : current)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not record your response. Please refresh and try again.')
    } finally {
      setSubmitting(false)
    }
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
  const sellerStateCode = String(org.state_code || org.gstin?.slice(0, 2) || '')
  const buyerStateCode = String(doc.client?.stateCode || doc.client?.gstin?.slice(0, 2) || '')
  const hasPlaceOfSupply = /^\d{2}$/.test(sellerStateCode) && /^\d{2}$/.test(buyerStateCode)
  const isInterState = Number(doc.igstAmount) > 0 || (hasPlaceOfSupply && sellerStateCode !== buyerStateCode)
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
            <span>Place of supply (state code): {buyerStateCode || 'Not specified'}</span>
            <span>Supply type: {hasPlaceOfSupply ? (isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)') : 'Verify state codes'}</span>
          </div>
        </div>

        <div className="client-table-wrap">
          <table className="client-doc-items">
            <thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th>GST</th><th className="client-num">Total</th></tr></thead>
            <tbody>
              {(doc.items || []).map((item, index) => (
                <tr key={item.id || index}>
                  <td>{index + 1}</td>
                  <td><strong>{item.description || 'Item'}</strong>{item.sku && <small>{item.sku}</small>}</td>
                  <td>{item.hsnSac || '—'}</td>
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
                {org.bank_account_holder && <span>A/C Name: {org.bank_account_holder}</span>}
                {org.bank_account_no && <span>A/C: {org.bank_account_no}</span>}
                {org.bank_ifsc && <span>IFSC: {org.bank_ifsc}</span>}
                {org.upi_id && <span>UPI: {org.upi_id}</span>}
              </div>
            )}
          </div>
          <div className="client-total-box">
            <div><span>Subtotal</span><strong>{formatINR(doc.subtotal)}</strong></div>
            {Number(doc.discountAmount) > 0 && <div><span>Discount</span><strong>−{formatINR(doc.discountAmount)}</strong></div>}
            {isInterState ? (
              <div><span>IGST</span><strong>{formatINR(doc.igstAmount)}</strong></div>
            ) : (
              <>
                <div><span>CGST</span><strong>{formatINR(doc.cgstAmount)}</strong></div>
                <div><span>SGST</span><strong>{formatINR(doc.sgstAmount)}</strong></div>
              </>
            )}
            <div className="client-grand-total"><span>Total</span><strong>{formatINR(doc.grandTotal)}</strong></div>
          </div>
        </div>

        <footer className="client-doc-footer">
          <span>This document was shared securely by {org.name || org.legal_name || 'the sender'} via LedgerFlow.</span>
          <div>
            <strong>For {org.name || org.legal_name || 'Business'}</strong>
            {doc.signatureData && <img className="client-signature-image" src={doc.signatureData} alt="Authorized signatory signature" />}
            <span className="client-signature-line">Authorized Signatory</span>
          </div>
        </footer>
      </section>

      <section className="client-response-panel client-print-action">
        {isQuotation ? (
          <>
            <div>
              <span className="client-eyebrow">QUOTATION RESPONSE</span>
              <h2>{hasResponse ? 'Your response has been recorded' : 'Review and respond'}</h2>
              <p>{hasResponse
                ? (payload.responseStatus === 'accepted' && payload.invoiceGenerated
                  ? 'Your acceptance is recorded and an invoice has been generated automatically. The business can now manage it in LedgerFlow.'
                  : 'Your ' + payload.responseStatus + ' decision is recorded. ' + (payload.ownerNotified ? 'The business contact was also notified by email.' : 'The response is available to the business in LedgerFlow.'))
                : canRespond
                  ? 'Review the quotation and choose Accept or Reject. Accepting it automatically generates an invoice for the business.'
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
