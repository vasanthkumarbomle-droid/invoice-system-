import { useEffect, useState } from 'react'
import { supabase, getMyOrg, createOrg, signIn, signUp, signOut } from './lib/db'
import { OrgContext } from './OrgContext'
import './auth.css'

function Layout({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-logo">LF</div>
        <h1>Billing that runs itself.</h1>
        <p>Create GST-ready invoices and quotations, track payments, and send reminders automatically.</p>
        <ul className="auth-features">
          <li><span>✓</span>Auto-calculated GST, totals and discounts</li>
          <li><span>✓</span>One-click quotation to invoice</li>
          <li><span>✓</span>Payment tracking and overdue alerts</li>
          <li><span>✓</span>Barcode scanning for fast billing</li>
        </ul>
      </div>
      <div className="auth-panel">
        <div className="auth-card">
          <h2>{title}</h2>
          <p className="auth-sub">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

function Field({ label, ...props }) {
  return (
    <div className="auth-field">
      <label>{label}</label>
      <input {...props} />
    </div>
  )
}

function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        const result = await signUp(email, password)
        if (result?.user && !result?.session) {
          setNotice('Account created. Check your email for the confirmation link before signing in.')
        } else {
          setNotice('Account created successfully.')
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout
      title={mode === 'signin' ? 'Welcome back' : 'Create your account'}
      subtitle={mode === 'signin' ? 'Sign in to manage your invoices.' : 'Start billing in under a minute.'}
    >
      <form className="auth-form" onSubmit={submit}>
        <Field label="Email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Password" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-success" role="status">{notice}</div>}
        <button className="auth-btn" disabled={busy}>
          {busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button className="auth-toggle" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}>
        {mode === 'signin' ? "New here? Create an account" : 'Already have an account? Sign in'}
      </button>
    </Layout>
  )
}

function CreateOrg({ onCreated }) {
  const [form, setForm] = useState({ name: '', gstin: '', state_code: '', phone: '', address: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const org = await createOrg(form)
      onCreated({ ...org, role: 'owner' })
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <Layout title="Set up your business" subtitle="These details appear on your invoices and quotations.">
      <form className="auth-form" onSubmit={submit}>
        <Field label="Business name" placeholder="Apex Enterprise Pvt Ltd" value={form.name} onChange={set('name')} required />
        <Field label="GSTIN (optional)" placeholder="36AABCA1234F1Z5" value={form.gstin} onChange={set('gstin')} />
        <Field label="State code" placeholder="36 for Telangana" value={form.state_code} onChange={set('state_code')} />
        <Field label="Phone" placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} />
        <Field label="Address" placeholder="Street, city, PIN" value={form.address} onChange={set('address')} />
        {error && <div className="auth-error">{error}</div>}
        <button className="auth-btn" disabled={busy}>{busy ? 'Creating...' : 'Create business'}</button>
      </form>
    </Layout>
  )
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined)
  const [org, setOrg] = useState(undefined)
  const [orgLoadError, setOrgLoadError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return undefined
    }
    let active = true
    supabase.auth.getSession()
      .then(({ data }) => { if (active) setSession(data.session) })
      .catch(() => { if (active) setSession(null) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setOrg(undefined)
      setOrgLoadError('')
      return undefined
    }
    let active = true
    setOrg(undefined)
    setOrgLoadError('')
    getMyOrg()
      .then((value) => {
        if (active) setOrg(value)
      })
      .catch((error) => {
        if (active) {
          setOrg(undefined)
          setOrgLoadError(error?.message || 'Could not load your business details.')
        }
      })
    return () => { active = false }
  }, [session])

  // The emailed client portal is public by design; the edge function validates its one-time/expiring token.
  const isPublicDocumentRoute = typeof window !== 'undefined' && ['/client-document', '/terms'].includes(window.location.pathname)
  if (isPublicDocumentRoute) return children

  if (!supabase) {
    return (
      <Layout title="Connect LedgerFlow" subtitle="Supabase configuration is required before sign-in or cloud data can be used.">
        <div className="auth-error" role="status">
          Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) to your local .env file, then restart the development server.
        </div>
      </Layout>
    )
  }

  if (session === undefined) return <div className="auth-loading">Loading...</div>
  if (!session) return <Login />
  if (orgLoadError) {
    return (
      <Layout title="Could not load your business" subtitle="Your existing business record was not changed. Check your connection and retry.">
        <div className="auth-error" role="alert">{orgLoadError}</div>
        <button className="auth-btn" type="button" onClick={async () => {
          setOrgLoadError('')
          setOrg(undefined)
          try {
            setOrg(await getMyOrg())
          } catch (error) {
            setOrgLoadError(error?.message || 'Could not load your business details.')
          }
        }}>Retry loading business</button>
      </Layout>
    )
  }
  if (org === undefined) return <div className="auth-loading">Loading your business...</div>
  if (org === null) return <CreateOrg onCreated={setOrg} />

  return (
    <OrgContext.Provider value={org}>
      {children}
      <button className="signout" onClick={signOut}>Sign out</button>
    </OrgContext.Provider>
  )
}