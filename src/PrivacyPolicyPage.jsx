import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ShieldCheck } from 'lucide-react'

const sections = [
  ['data', 'Information handled by LedgerFlow'],
  ['purpose', 'How the information is used'],
  ['sharing', 'Service providers and email delivery'],
  ['payments', 'Payment and tax information'],
  ['security', 'Security and access controls'],
  ['retention', 'Retention and account closure'],
  ['rights', 'Your choices and requests'],
  ['changes', 'Changes to this policy'],
  ['contact', 'Contact and service operator'],
]

function PolicySection({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 16, fontWeight: 750, color: 'var(--lf-brand)', margin: '0 0 8px' }}>{title}</h2>
      <div style={{ fontSize: 13, color: 'var(--lf-text)', lineHeight: 1.75 }}>{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--lf-bg)', padding: '32px 18px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 11, background: '#1F2937', color: '#FFFFFF' }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--lf-text)' }}>LedgerFlow</div>
              <div style={{ fontSize: 11, color: 'var(--lf-text-muted)' }}>Privacy & data handling</div>
            </div>
          </div>
          <button type="button" className="lf-btn lf-btn-secondary" onClick={() => navigate('/')}>
            <ChevronLeft size={16} /> Back to LedgerFlow
          </button>
        </header>

        <main className="lf-card" style={{ padding: 'clamp(18px, 4vw, 36px)', lineHeight: 1.7 }}>
          <div style={{ borderBottom: '1px solid var(--lf-border)', paddingBottom: 18, marginBottom: 22 }}>
            <h1 style={{ fontSize: 25, fontWeight: 850, color: 'var(--lf-text)', margin: '0 0 7px' }}>Privacy Policy</h1>
            <p style={{ fontSize: 12, color: 'var(--lf-text-muted)', margin: 0 }}>Effective date: October 25, 2026 · Version 1.0</p>
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--lf-text-secondary)' }}>
              This policy explains how LedgerFlow handles workspace account details and business documents. It is written for the current application architecture and should be reviewed by the service operator against the actual hosting, email-provider, retention and legal requirements before a public commercial launch.
            </p>
          </div>

          <nav aria-label="Privacy policy contents" style={{ padding: 16, background: 'var(--lf-bg)', borderRadius: 9, marginBottom: 28 }}>
            <strong style={{ display: 'block', fontSize: 13, marginBottom: 10, color: 'var(--lf-brand)' }}>On this page</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, fontSize: 12 }}>
              {sections.map(([id, title]) => <a key={id} href={'#' + id} style={{ color: 'var(--lf-text-secondary)' }}>{title}</a>)}
            </div>
          </nav>

          <PolicySection id="data" title="1. Information handled by LedgerFlow">
            <p>Depending on the features you use, LedgerFlow may process account identifiers such as your email address and name; organization profile and tax details; client names, addresses, email addresses, phone numbers and GSTINs; product descriptions, SKUs, quantities and prices; invoices, quotations, sales orders and their line items; due dates, recorded payments and references; document signatures; and secure document-sharing tokens.</p>
            <p>Do not enter passwords, full payment-card numbers, or information that is not needed to create and manage business documents.</p>
          </PolicySection>

          <PolicySection id="purpose" title="2. How the information is used">
            <p>The application uses this information to authenticate users, isolate organization workspaces, calculate and display document totals from the rates and values supplied by the business, save document history, track balances and payment status, share invoices or quotations, send requested business emails and reminders, prevent misuse, and diagnose service issues.</p>
            <p>LedgerFlow records payment details and payment status. It does not itself collect or settle a customer's bank transfer or UPI payment through a payment processor.</p>
          </PolicySection>

          <PolicySection id="sharing" title="3. Service providers and email delivery">
            <p>Data may be processed by infrastructure providers required to operate the application, including Supabase for authentication and database services, Vercel for hosting, and the email service configured for the deployment. The current email workflow can use Google Apps Script/Gmail; when the operator configures a verified Resend sender, email delivery can use Resend instead.</p>
            <p>When a user sends a document or enables reminders, the relevant recipient's email address, message content and document details are passed to the configured email service. Secure client links include access tokens; treat them like private document-access credentials and do not forward them to unintended recipients.</p>
          </PolicySection>

          <PolicySection id="payments" title="4. Payment and tax information">
            <p>Bank account details, UPI IDs, GSTINs, tax rates, discounts, invoice totals and recorded payment references may appear in the workspace or be included in documents and emails when a business chooses to share them. Keep organization and client details accurate and disclose only information needed for the transaction.</p>
            <p>Businesses are responsible for determining their legal tax obligations and checking generated documents before filing or sending them.</p>
          </PolicySection>

          <PolicySection id="security" title="5. Security and access controls">
            <p>LedgerFlow is designed to use authenticated access, organization membership checks, tenant-scoped database operations and Supabase Row Level Security for supported data paths. No internet service can guarantee absolute security. Workspace owners should use strong unique passwords, restrict account access, keep contact details current and promptly revoke access that is no longer required.</p>
            <p>Never publish service-role keys, webhook secrets, email-provider keys or private sharing tokens in browser code, public repositories or client emails.</p>
          </PolicySection>

          <PolicySection id="retention" title="6. Retention and account closure">
            <p>Business records remain available according to the active workspace configuration and database retention policies. Invoices, payment entries and audit records may need to be retained by the business for accounting or legal reasons. Deleting an account or closing a workspace does not automatically mean every backup, security log or legally required record is immediately erased.</p>
            <p>The service operator should define and publish the actual retention and deletion periods for the deployed service.</p>
          </PolicySection>

          <PolicySection id="rights" title="7. Your choices and requests">
            <p>Review and correct business and client details through the workspace where available. Ask your workspace owner to correct information, disable automated reminders, or help with access and deletion requests. Requests may need to be balanced against recordkeeping obligations, fraud prevention, and the rights of other workspace users.</p>
          </PolicySection>

          <PolicySection id="changes" title="8. Changes to this policy">
            <p>This policy may be updated when the product, service providers or applicable requirements change. The revised effective date will be shown on this page. Material changes should also be communicated through an appropriate service channel.</p>
          </PolicySection>

          <PolicySection id="contact" title="9. Contact and service operator">
            <p>For requests about records held in a business workspace, start with that workspace's owner or administrator. The service operator must publish a monitored privacy contact and identify the responsible legal entity before using LedgerFlow as a public commercial service; those operator details are not currently configured in this application.</p>
          </PolicySection>

          <footer style={{ borderTop: '1px solid var(--lf-border)', paddingTop: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', fontSize: 12 }}>
              <Link to="/terms" style={{ color: 'var(--lf-brand)' }}>Terms of Service</Link>
              <Link to="/login" style={{ color: 'var(--lf-text-secondary)' }}>Sign in</Link>
            </div>
            <span style={{ fontSize: 11, color: 'var(--lf-text-muted)' }}>LedgerFlow · Privacy Policy</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
