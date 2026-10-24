import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react'
import { supabase, setRememberMe } from './supabase.js'
import './auth.css'

const googleEnabled = import.meta.env.VITE_SUPABASE_GOOGLE_ENABLED === 'true'

function BrandMark({ compact = false }) {
  return (
    <div className={'auth-brand-lockup' + (compact ? ' is-compact' : '')}>
      <svg className="auth-logo-mark" viewBox="0 0 40 40" role="img" aria-label="LedgerFlow logo" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ledgerflow-auth-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#344054" />
            <stop offset="100%" stopColor="#1F2937" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="11" fill="url(#ledgerflow-auth-mark)" />
        <path d="M11 13.5h18M11 20h11M11 26.5h7" fill="none" stroke="#F8F5F0" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="27.5" cy="26.5" r="5.5" fill="#D79A62" />
        <path d="M27.5 23.5v6M29.2 24.7c-.5-.5-1-.7-1.7-.7-1 0-1.7.5-1.7 1.3 0 2 3.4.8 3.4 2.5 0 .8-.7 1.3-1.7 1.3-.7 0-1.4-.3-1.9-.8" fill="none" stroke="#263445" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      <span className="auth-brand-name">LedgerFlow</span>
      {!compact && <span className="auth-brand-label">INVOICE WORKSPACE</span>}
    </div>
  )
}

function AuthInvoiceDemo() {
  const samples = useMemo(() => [
    { client: 'Sample Traders', item1: 'Wireless keyboard', item2: 'USB-C hub', qty1: 2, qty2: 1, amount: 11800, tax: 1800, subtotal: 10000 },
    { client: 'Northstar Supply', item1: 'Desk monitor', item2: 'Docking station', qty1: 1, qty2: 2, amount: 23600, tax: 3600, subtotal: 20000 },
  ], [])
  const [cycle, setCycle] = useState(0)
  const [amount, setAmount] = useState(samples[0].amount)
  const [visible, setVisible] = useState(typeof document === 'undefined' || document.visibilityState === 'visible')
  const [reduced, setReduced] = useState(false)
  const elapsed = useRef(0)
  const lastTick = useRef(0)
  const sample = samples[cycle % samples.length]

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMotion = () => setReduced(media.matches)
    const syncVisibility = () => setVisible(document.visibilityState === 'visible')
    syncMotion()
    syncVisibility()
    media.addEventListener?.('change', syncMotion)
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      media.removeEventListener?.('change', syncMotion)
      document.removeEventListener('visibilitychange', syncVisibility)
    }
  }, [])

  useEffect(() => {
    if (reduced) {
      elapsed.current = 0
      setAmount(sample.amount)
      return undefined
    }
    if (!visible) return undefined
    let lastTick = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      elapsed.current += Math.max(0, now - lastTick)
      lastTick = now
      if (elapsed.current >= 8000) {
        elapsed.current %= 8000
        setCycle((current) => current + 1)
      }
      const progress = Math.min(1, Math.max(0, (elapsed.current - 650) / 4000))
      const eased = 1 - Math.pow(1 - progress, 3)
      const target = samples[cycle % samples.length]
      setAmount(Math.round(target.amount * eased))
    }, 100)
    return () => window.clearInterval(timer)
  }, [visible, reduced, cycle, samples, sample.amount])

  useEffect(() => {
    if (reduced) setAmount(samples[cycle % samples.length].amount)
  }, [reduced, cycle, samples])

  return (
    <div className={'auth-demo-wrap' + (reduced ? ' is-static' : '') + (!visible ? ' is-paused' : '')} aria-label="Animated invoice preview. Sample data only." role="img">
      <div className="auth-demo-caption"><span className="auth-demo-live-dot" /> LIVE PREVIEW <span>· SAMPLE DATA</span></div>
      <div className="auth-invoice-paper" key={cycle}>
        <div className="auth-invoice-top">
          <div className="auth-invoice-mini-brand"><span className="auth-invoice-mini-mark">L</span><span>LedgerFlow</span></div>
          <span className="auth-invoice-tag">TAX INVOICE</span>
        </div>
        <div className="auth-invoice-meta">
          <div><span>BILL TO</span><strong>{sample.client}</strong><small>Hyderabad, Telangana</small></div>
          <div className="auth-invoice-number"><span>INVOICE NO.</span><strong>INV-2026-014</strong><small>24 Oct 2026</small></div>
        </div>
        <div className="auth-invoice-table">
          <div className="auth-invoice-table-head"><span>DESCRIPTION</span><span>QTY</span><span>AMOUNT</span></div>
          <div className="auth-invoice-row row-one"><span>{sample.item1}</span><span>{sample.qty1}</span><strong>₹{(sample.subtotal * 0.7).toLocaleString('en-IN')}</strong></div>
          <div className="auth-invoice-row row-two"><span>{sample.item2}</span><span>{sample.qty2}</span><strong>₹{(sample.subtotal * 0.3).toLocaleString('en-IN')}</strong></div>
        </div>
        <div className="auth-invoice-bottom">
          <div className="auth-invoice-tax-lines">
            <span>CGST <b>9%</b></span><span>SGST <b>9%</b></span>
          </div>
          <div className="auth-invoice-total">
            <span>TOTAL DUE</span><strong>₹{amount.toLocaleString('en-IN')}</strong>
          </div>
        </div>
        <div className="auth-invoice-footer"><span><ShieldCheck size={12} /> GST calculated automatically</span><span>PREVIEW ONLY</span></div>
        <div className="auth-paid-stamp">PAID <Check size={12} strokeWidth={3} /></div>
        <div className="auth-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      </div>
      <p className="auth-demo-disclaimer">A tiny preview. Not a real invoice.</p>
    </div>
  )
}

export function AuthLayout({ title, subtitle, eyebrow = 'YOUR BUSINESS, IN SYNC', children, compact = false }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <BrandMark />
        <div className="auth-brand-story">
          <span className="auth-eyebrow">{eyebrow}</span>
          <h2>Billing that<br /><em>runs itself.</em></h2>
          <p>Less spreadsheet theatre. More time for the work that pays.</p>
        </div>
        {!compact && <AuthInvoiceDemo />}
        <ul className="auth-benefits">
          <li><span><ReceiptText size={16} /></span>Auto GST invoices</li>
          <li><span><RefreshCcw size={16} /></span>Quotation to invoice in one click</li>
          <li><span><BellRing size={16} /></span>Payment tracking and reminders</li>
        </ul>
        <div className="auth-brand-foot"><ShieldCheck size={14} /> Your workflow, neatly handled.</div>
      </aside>
      <main className="auth-panel">
        <div className="auth-mobile-brand"><BrandMark compact /></div>
        <section className="auth-card" aria-labelledby="auth-heading">
          <div className="auth-card-topline"><span className="auth-card-eyebrow">LEDGERFLOW ACCOUNT</span><span className="auth-security"><LockKeyhole size={13} /> Secure access</span></div>
          <h1 id="auth-heading">{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          <p className="auth-legal">By continuing, you agree to LedgerFlow’s <a href="/terms">Terms of Service</a>.</p>
        </section>
        <div className="auth-panel-foot"><span>© 2026 LedgerFlow</span><span>Built for better business days.</span></div>
      </main>
    </div>
  )
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" transform="translate(0 4)" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.05 46.98 31.96 46.98 24.55z" /><path fill="#34A853" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z" transform="translate(0 4)" /><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" transform="translate(0 -2)" /></svg>
}

function PasswordField({ id, label, value, onChange, autoComplete, required = true, onCapsLockChange, hint }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-wrap">
        <input
          id={id}
          name={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          onKeyUp={onCapsLockChange}
          onKeyDown={onCapsLockChange}
          required={required}
          minLength={autoComplete === 'current-password' ? undefined : 8}
          aria-describedby={hint ? id + '-hint' : undefined}
        />
        <button type="button" className="auth-password-toggle" aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((state) => !state)}>
          {shown ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {hint && <span id={id + '-hint'} className="auth-field-hint">{hint}</span>}
    </div>
  )
}

function getSafeRedirect(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/login') || value.startsWith('/signup') || value.startsWith('/forgot-password') || value.startsWith('/reset-password')) return '/'
  return value
}

function getLoginAttemptKey(email) {
  return 'lf-login-attempts:' + String(email || '').trim().toLowerCase().slice(0, 180)
}

export function AuthLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const emailRef = useRef(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showCapsLock, setShowCapsLock] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [lockRemaining, setLockRemaining] = useState(0)
  const redirect = getSafeRedirect(new URLSearchParams(location.search).get('redirect'))
  const sessionExpired = new URLSearchParams(location.search).get('sessionExpired') === '1'
  const attemptsKey = getLoginAttemptKey(email)

  useEffect(() => { emailRef.current?.focus() }, [])
  useEffect(() => {
    try {
      const until = Number(sessionStorage.getItem(attemptsKey + ':until')) || 0
      setLockedUntil(until)
      setLockRemaining(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    } catch { setLockedUntil(0); setLockRemaining(0) }
  }, [attemptsKey])
  useEffect(() => {
    if (!lockedUntil) return undefined
    const update = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
      setLockRemaining(remaining)
      if (!remaining) {
        setLockedUntil(0)
        try {
          sessionStorage.removeItem(attemptsKey + ':count')
          sessionStorage.removeItem(attemptsKey + ':until')
        } catch { /* Cooldown reset is best-effort when storage is disabled. */ }
      }
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [lockedUntil, attemptsKey])

  const handleCaps = (event) => setShowCapsLock(Boolean(event.getModifierState?.('CapsLock')))

  const recordFailedAttempt = () => {
    let count = 1
    try {
      count = (Number(sessionStorage.getItem(attemptsKey + ':count')) || 0) + 1
      sessionStorage.setItem(attemptsKey + ':count', String(count))
      if (count >= 5) {
        const until = Date.now() + 30000
        sessionStorage.setItem(attemptsKey + ':until', String(until))
        setLockedUntil(until)
        setLockRemaining(30)
      }
    } catch { /* The server-side Supabase limit remains the authoritative control. */ }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!supabase || busy || lockRemaining > 0) return
    setBusy(true)
    setError('')
    setNotice('')
    setRememberMe(remember)
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginError) {
        recordFailedAttempt()
        setError(navigator.onLine ? 'Incorrect email or password.' : 'You appear to be offline. Check your connection and try again.')
        return
      }
      try {
        sessionStorage.removeItem(attemptsKey + ':count')
        sessionStorage.removeItem(attemptsKey + ':until')
      } catch { /* Session storage may be disabled by browser policy. */ }
      navigate(redirect, { replace: true })
    } catch {
      recordFailedAttempt()
      setError(navigator.onLine ? 'Incorrect email or password.' : 'You appear to be offline. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const sendMagicLink = async () => {
    setError('')
    setNotice('')
    if (!email.trim()) {
      setError('Enter your email address first.')
      emailRef.current?.focus()
      return
    }
    if (!supabase) {
      setError('Sign-in is not configured for this deployment.')
      return
    }
    setBusy(true)
    try {
      const { error: magicError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + '/login?redirect=' + encodeURIComponent(redirect), shouldCreateUser: false },
      })
      if (magicError) throw magicError
      setNotice('If this email is registered, a sign-in link will arrive shortly.')
    } catch {
      setError('Could not send the sign-in link. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const googleLogin = async () => {
    if (!supabase || busy) return
    setError('')
    setBusy(true)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/login?redirect=' + encodeURIComponent(redirect) },
      })
      if (oauthError) throw oauthError
    } catch {
      setError('Google sign-in could not start. Check the provider settings and try again.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome back." subtitle="Pick up right where your business left off." eyebrow="GOOD TO HAVE YOU BACK">
      {sessionExpired && <div className="auth-notice auth-notice-info" role="status">Your session ended. Sign in again to continue.</div>}
      {!supabase && <div className="auth-message auth-message-error" role="alert">Authentication is not configured. Add the Supabase URL and publishable key to the deployment environment.</div>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="auth-field">
          <label htmlFor="login-email">Work email</label>
          <input ref={emailRef} id="login-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} required />
        </div>
        <PasswordField id="login-password" label="Password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} autoComplete="current-password" onCapsLockChange={handleCaps} />
        {showCapsLock && <p className="auth-caps-warning" role="status">Caps Lock is on.</p>}
        <div className="auth-form-options">
          <label className="auth-checkbox"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> <span>Remember me</span></label>
          <button type="button" className="auth-inline-link" onClick={() => navigate('/forgot-password')}>Forgot password?</button>
        </div>
        {error && <div className="auth-message auth-message-error" role="alert" aria-live="polite">{error}</div>}
        {notice && <div className="auth-message auth-message-success" role="status" aria-live="polite">{notice}</div>}
        {lockRemaining > 0 && <p className="auth-lockout-note" role="status">Too many failed attempts. Try again in {lockRemaining}s.</p>}
        <button className="auth-btn" type="submit" disabled={busy || lockRemaining > 0 || !supabase}>
          {busy ? <><LoaderCircle className="auth-spinner" size={17} /> Signing you in…</> : <>Sign in <ArrowRight size={16} /></>}
        </button>
      </form>
      <div className="auth-divider"><span>or continue with</span></div>
      {googleEnabled ? (
        <button type="button" className="auth-btn auth-btn-secondary" onClick={googleLogin} disabled={busy}><GoogleMark /> Continue with Google</button>
      ) : (
        <p className="auth-provider-note">Google sign-in is hidden until the Supabase Google provider is enabled and VITE_SUPABASE_GOOGLE_ENABLED is set to true.</p>
      )}
      <button type="button" className="auth-magic-link" onClick={sendMagicLink} disabled={busy}><Mail size={16} /> Email me a magic link</button>
      <p className="auth-switch-prompt">New to LedgerFlow? <button type="button" className="auth-inline-link" onClick={() => navigate('/signup' + (redirect !== '/' ? '?redirect=' + encodeURIComponent(redirect) : ''))}>Create an account</button></p>
    </AuthLayout>
  )
}

function passwordRules(password) {
  return [
    { label: 'At least 8 characters', valid: password.length >= 8 },
    { label: 'One uppercase letter', valid: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', valid: /[a-z]/.test(password) },
    { label: 'One number', valid: /\d/.test(password) },
    { label: 'One symbol', valid: /[^A-Za-z0-9]/.test(password) },
  ]
}

export function AuthSignupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const redirect = getSafeRedirect(new URLSearchParams(location.search).get('redirect'))
  const rules = passwordRules(password)
  const strength = rules.filter((rule) => rule.valid).length
  const passwordReady = rules.every((rule) => rule.valid)

  useEffect(() => {
    if (resendCooldown <= 0) return undefined
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [resendCooldown])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!supabase) { setError('Authentication is not configured for this deployment.'); return }
    if (!termsAccepted) { setError('Please accept the Terms of Service to continue.'); return }
    if (!passwordReady) { setError('Meet all password requirements before creating your account.'); return }
    setBusy(true)
    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim(), company_name: company.trim() },
          emailRedirectTo: window.location.origin + '/login?redirect=' + encodeURIComponent(redirect),
        },
      })
      if (signupError) throw signupError
      if (data?.session) {
        navigate(redirect, { replace: true })
      } else {
        setConfirmEmail(true)
        setResendCooldown(30)
      }
    } catch (signupError) {
      const message = String(signupError?.message || '')
      if (/already registered|already exists|user already/i.test(message)) {
        setError('We could not create an account with those details. Try signing in or resetting your password.')
      } else {
        setError(message || 'Could not create your account. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (!supabase || resendCooldown > 0 || !email.trim()) return
    setError('')
    setBusy(true)
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: window.location.origin + '/login?redirect=' + encodeURIComponent(redirect) } })
      if (resendError) throw resendError
      setResendCooldown(30)
    } catch {
      setError('Could not resend the confirmation email just now. Please try again later.')
    } finally {
      setBusy(false)
    }
  }

  if (confirmEmail) {
    return (
      <AuthLayout title="Check your inbox." subtitle="One quick confirmation, then you’re in." eyebrow="ONE LAST LITTLE THING">
        <div className="auth-confirmation-art"><div><Mail size={28} /></div><span className="auth-confirmation-check"><CheckCircle2 size={19} /></span></div>
        <div className="auth-confirmation-copy"><strong>Check your email to confirm</strong><p>We’ve sent a confirmation link if the address can receive it. Open it in this browser to finish creating your account.</p><span className="auth-email-chip">{email}</span></div>
        {error && <div className="auth-message auth-message-error" role="alert" aria-live="polite">{error}</div>}
        <button type="button" className="auth-btn" onClick={resend} disabled={busy || resendCooldown > 0}>{busy ? <><LoaderCircle className="auth-spinner" size={17} /> Sending…</> : resendCooldown > 0 ? 'Resend available in ' + resendCooldown + 's' : 'Resend confirmation email'}</button>
        <button type="button" className="auth-magic-link" onClick={() => { setConfirmEmail(false); setError('') }}>Use a different email address</button>
        <p className="auth-switch-prompt">Already confirmed? <button type="button" className="auth-inline-link" onClick={() => navigate('/login')}>Sign in</button></p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Make room for better." subtitle="Your business deserves less admin and more momentum." eyebrow="A BETTER WAY TO BILL">
      {!supabase && <div className="auth-message auth-message-error" role="alert">Authentication is not configured for this deployment.</div>}
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="signup-name">Your name</label>
          <input id="signup-name" name="name" type="text" autoComplete="name" placeholder="Vasanth Kumar" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
        </div>
        <div className="auth-field">
          <label htmlFor="signup-company">Company name</label>
          <input id="signup-company" name="organization" type="text" autoComplete="organization" placeholder="Apex Enterprises" value={company} onChange={(event) => setCompany(event.target.value)} required maxLength={150} />
        </div>
        <div className="auth-field">
          <label htmlFor="signup-email">Work email</label>
          <input id="signup-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <PasswordField id="signup-password" label="Create password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} autoComplete="new-password" />
        <div className="auth-strength-wrap" aria-live="polite">
          <div className="auth-strength-track"><span className={'strength-' + strength} style={{ width: (strength / rules.length * 100) + '%' }} /></div>
          <span className="auth-strength-label">{password ? (passwordReady ? 'Strong password' : strength >= 3 ? 'Getting stronger' : 'A little more security') : 'Password strength'}</span>
        </div>
        <ul className="auth-password-rules">
          {rules.map((rule) => <li key={rule.label} className={rule.valid ? 'is-valid' : ''}>{rule.valid ? <Check size={13} /> : <span className="auth-rule-dot" />} {rule.label}</li>)}
        </ul>
        <label className="auth-checkbox auth-terms-checkbox"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required /> <span>I agree to the <a href="/terms">Terms of Service</a>.</span></label>
        {error && <div className="auth-message auth-message-error" role="alert" aria-live="polite">{error}</div>}
        <button className="auth-btn" type="submit" disabled={busy || !supabase}>{busy ? <><LoaderCircle className="auth-spinner" size={17} /> Creating account…</> : <>Create account <ArrowRight size={16} /></>}</button>
      </form>
      <p className="auth-switch-prompt">Already have an account? <button type="button" className="auth-inline-link" onClick={() => navigate('/login' + (redirect !== '/' ? '?redirect=' + encodeURIComponent(redirect) : ''))}>Sign in</button></p>
    </AuthLayout>
  )
}

export function AuthForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!supabase) { setError('Password recovery is not configured for this deployment.'); return }
    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/reset-password' })
      if (resetError) throw resetError
      setSent(true)
    } catch {
      // Never reveal whether an email address exists in this project.
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={sent ? 'Check your inbox.' : 'Let’s get you back in.'} subtitle={sent ? 'If an account matches that address, a reset link is on its way.' : 'We’ll email you a secure link to choose a new password.'} eyebrow="ACCOUNT RECOVERY">
      {sent ? (
        <div className="auth-sent-state">
          <div className="auth-confirmation-art"><div><Mail size={28} /></div><span className="auth-confirmation-check"><CheckCircle2 size={19} /></span></div>
          <p className="auth-sent-note">For privacy, we always show this confirmation. Check your inbox and spam folder.</p>
          <button type="button" className="auth-btn" onClick={() => navigate('/login')}>Back to sign in</button>
          <button type="button" className="auth-magic-link" onClick={() => { setSent(false); setError('') }}>Try another email</button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-field">
            <label htmlFor="forgot-email">Work email</label>
            <input id="forgot-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
          </div>
          {error && <div className="auth-message auth-message-error" role="alert" aria-live="polite">{error}</div>}
          <button className="auth-btn" type="submit" disabled={busy || !supabase}>{busy ? <><LoaderCircle className="auth-spinner" size={17} /> Sending link…</> : <>Email reset link <ArrowRight size={16} /></>}</button>
          <button type="button" className="auth-magic-link" onClick={() => navigate('/login')}>Back to sign in</button>
        </form>
      )}
    </AuthLayout>
  )
}
