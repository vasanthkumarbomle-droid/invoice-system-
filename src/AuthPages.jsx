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
import BrandMark from './BrandMark.jsx'

const PRODUCTION_APP_ORIGIN = 'https://ledgerflowhq.vercel.app'

function getAuthRedirectUrl(path) {
  const isLocalDevelopment = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const origin = isLocalDevelopment ? window.location.origin : PRODUCTION_APP_ORIGIN
  return new URL(path, origin).toString()
}

const googleEnabled = import.meta.env.VITE_SUPABASE_GOOGLE_ENABLED === 'true'

function AuthBrandLockup({ compact = false }) {
  return (
    <div className={'auth-brand-lockup' + (compact ? ' is-compact' : '')}>
      <BrandMark className="auth-logo-mark" />
      <span className="auth-brand-name">LedgerFlow</span>
      {!compact && <span className="auth-brand-label">INVOICE WORKSPACE</span>}
    </div>
  )
}

function AuthInvoiceDemo() {
  const samples = useMemo(() => [
    { client: 'Sample Traders', item1: 'Wireless keyboard', item2: 'USB-C hub', qty1: 2, qty2: 1, item1Amount: 7000, item2Amount: 3000, subtotal: 10000 },
    { client: 'Northstar Supply', item1: 'Desk monitor', item2: 'Docking station', qty1: 1, qty2: 2, item1Amount: 14000, item2Amount: 6000, subtotal: 20000 },
  ], [])
  const [cycle, setCycle] = useState(0)
  const [visible, setVisible] = useState(typeof document === 'undefined' || document.visibilityState === 'visible')
  const [reduced, setReduced] = useState(false)
  const sample = samples[cycle % samples.length]
  const cgst = Math.round(sample.subtotal * 0.09)
  const sgst = Math.round(sample.subtotal * 0.09)
  const total = sample.subtotal + cgst + sgst

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
    if (reduced || !visible) return undefined
    const timer = window.setInterval(() => {
      setCycle((current) => (current + 1) % samples.length)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [visible, reduced, samples.length])

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
          <div className="auth-invoice-row row-one"><span>{sample.item1}</span><span>{sample.qty1}</span><strong>₹{sample.item1Amount.toLocaleString('en-IN')}</strong></div>
          <div className="auth-invoice-row row-two"><span>{sample.item2}</span><span>{sample.qty2}</span><strong>₹{sample.item2Amount.toLocaleString('en-IN')}</strong></div>
        </div>
        <div className="auth-invoice-bottom">
          <div className="auth-invoice-tax-lines">
            <span>CGST (9%) <b>₹{cgst.toLocaleString('en-IN')}</b></span><span>SGST (9%) <b>₹{sgst.toLocaleString('en-IN')}</b></span>
          </div>
          <div className="auth-invoice-total">
            <span>TOTAL DUE</span><strong>₹{total.toLocaleString('en-IN')}</strong>
          </div>
        </div>
        <div className="auth-invoice-footer"><span><ShieldCheck size={12} /> GST calculated automatically</span><span>PREVIEW ONLY</span></div>
        <div className="auth-paid-stamp">PAID <Check size={12} strokeWidth={3} /></div>
        <div className="auth-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      </div>
    </div>
  )
}

export function AuthLayout({ title, subtitle, eyebrow = 'YOUR BUSINESS, IN SYNC', children, compact = false, showCardTopline = true, showLegal = false, brandHeadline }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <AuthBrandLockup />
        <div className="auth-brand-story">
          {eyebrow && <span className="auth-eyebrow">{eyebrow}</span>}
          <h2>{brandHeadline || <>Billing that<br /><em>runs itself.</em></>}</h2>
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
        <div className="auth-mobile-brand"><AuthBrandLockup compact /></div>
        <section className="auth-card" aria-labelledby="auth-heading">
          {showCardTopline && <div className="auth-card-topline"><span className="auth-card-eyebrow">LEDGERFLOW ACCOUNT</span><span className="auth-security"><LockKeyhole size={13} /> Secure access</span></div>}
          <h1 id="auth-heading">{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          {showLegal && <p className="auth-legal">By continuing, you agree to LedgerFlow’s <a href="/terms">Terms of Service</a> and acknowledge the <a href="/privacy">Privacy Policy</a>.</p>}
        </section>
        <div className="auth-panel-foot"><span>© 2026 LedgerFlow</span><a className="auth-help-link" href="/forgot-password" aria-label="Need help? Open password recovery">Need help?</a></div>
      </main>
    </div>
  )
}

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" transform="translate(0 4)" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 38.05 46.98 31.96 46.98 24.55z" /><path fill="#34A853" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z" transform="translate(0 4)" /><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.18 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" transform="translate(0 -2)" /></svg>
}

function PasswordField({ id, label, value, onChange, autoComplete, required = true, onCapsLockChange, hint, error }) {
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
          aria-invalid={Boolean(error)}
          aria-describedby={error ? id + '-error' : hint ? id + '-hint' : undefined}
        />
        <button type="button" className="auth-password-toggle" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} onClick={() => setShown((state) => !state)}>
          {shown ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {error ? <span id={id + '-error'} className="auth-field-error" role="alert">{error}</span> : hint && <span id={id + '-hint'} className="auth-field-hint">{hint}</span>}
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

function getAuthEmailDeliveryMessage(error, fallback) {
  const message = String(error?.message || '')
  const normalized = message.toLowerCase()

  if (/over_email_send_rate_limit|email rate limit|rate limit exceeded|only request this after/.test(normalized)) {
    return 'Supabase is temporarily rate-limiting verification emails. Wait before retrying. For reliable delivery to all users, configure a custom SMTP sender in Supabase Authentication → SMTP Settings.'
  }
  if (/email address not authorized|email_not_authorized/.test(normalized)) {
    return 'Supabase’s built-in email sender only delivers to project team addresses. Configure custom SMTP in Supabase Authentication → SMTP Settings to send verification emails to other users.'
  }
  if (/smtp|mail provider|email provider|error sending confirmation email/.test(normalized)) {
    return 'Supabase could not send the verification email. Check the SMTP settings in Supabase Authentication → SMTP Settings, then try again.'
  }

  return message || fallback
}

export function AuthLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const emailRef = useRef(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showCapsLock, setShowCapsLock] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [phoneMode, setPhoneMode] = useState(false)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpRequested, setOtpRequested] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [otpError, setOtpError] = useState('')
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
    try {
      const count = (Number(sessionStorage.getItem(attemptsKey + ':count')) || 0) + 1
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
    const nextFieldErrors = {}
    if (!email.trim()) nextFieldErrors.email = 'Enter your work email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextFieldErrors.email = 'Enter a valid email address.'
    if (!password) nextFieldErrors.password = 'Enter your password.'
    setFieldErrors(nextFieldErrors)
    if (Object.keys(nextFieldErrors).length > 0) {
      setError('')
      setNotice('')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    setRememberMe(remember)
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (loginError) {
        recordFailedAttempt()
        setError(navigator.onLine ? 'Incorrect email or password. Please check your details and try again.' : 'You appear to be offline. Check your connection and try again.')
        return
      }
      try {
        sessionStorage.removeItem(attemptsKey + ':count')
        sessionStorage.removeItem(attemptsKey + ':until')
      } catch { /* Session storage may be disabled by browser policy. */ }
      navigate(redirect, { replace: true })
    } catch {
      recordFailedAttempt()
      setError(navigator.onLine ? 'Incorrect email or password. Please check your details and try again.' : 'You appear to be offline. Check your connection and try again.')
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address before requesting a magic link.')
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
        options: { emailRedirectTo: getAuthRedirectUrl('/login?redirect=' + encodeURIComponent(redirect)), shouldCreateUser: false },
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
    if (busy) return
    setError('')
    setNotice('')
    if (!googleEnabled) {
      setError('Google sign-in is not enabled yet. Configure Google OAuth in Supabase Authentication → Providers to activate it.')
      return
    }
    if (!supabase) {
      setError('Authentication is not configured for this deployment.')
      return
    }
    setBusy(true)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: getAuthRedirectUrl('/login?redirect=' + encodeURIComponent(redirect)) },
      })
      if (oauthError) throw oauthError
    } catch {
      setError('Google sign-in could not start. Check the provider settings and try again.')
      setBusy(false)
    }
  }

  const requestPhoneOtp = (event) => {
    event.preventDefault()
    const normalizedPhone = phone.replace(/[^\d+]/g, '')
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      setPhoneError('Enter a valid phone number with country code, such as +91 98765 43210.')
      setOtpRequested(false)
      return
    }
    setPhoneError('')
    setOtpError('')
    setOtp('')
    setOtpRequested(true)
    setError('')
    setNotice('UI preview only: no SMS was sent. Enable Phone Auth in Supabase and configure an SMS provider to use OTP sign-in.')
  }

  const verifyPhoneOtp = (event) => {
    event.preventDefault()
    if (!/^\d{6}$/.test(otp.trim())) {
      setOtpError('Enter the 6-digit code.')
      return
    }
    setOtpError('OTP verification is not connected yet. Configure Supabase Phone Auth and an SMS provider to activate it.')
  }

  return (
    <AuthLayout title="Welcome back." subtitle="Pick up right where your business left off." eyebrow="" showCardTopline={false} brandHeadline={<>Invoices, GST and<br /><em>payments, sorted.</em></>}>
      {sessionExpired && <div className="auth-notice auth-notice-info" role="status">Your session ended. Sign in again to continue.</div>}
      {!supabase && <div className="auth-message auth-message-error" role="alert">Authentication is not configured. Add the Supabase URL and publishable key to the deployment environment.</div>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="auth-field">
          <label htmlFor="login-email">Work email</label>
          <input ref={emailRef} autoFocus id="login-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); setFieldErrors((current) => ({ ...current, email: '' })) }} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'login-email-error' : undefined} required />
          {fieldErrors.email && <span id="login-email-error" className="auth-field-error" role="alert">{fieldErrors.email}</span>}
        </div>
        <PasswordField id="login-password" label="Password" value={password} error={fieldErrors.password} onChange={(event) => { setPassword(event.target.value); setError(''); setFieldErrors((current) => ({ ...current, password: '' })) }} autoComplete="current-password" onCapsLockChange={handleCaps} />
        {showCapsLock && <p className="auth-caps-warning" role="status">Caps Lock is on.</p>}
        <div className="auth-form-options">
          <label className="auth-checkbox"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> <span>Remember me</span></label>
          <button type="button" className="auth-inline-link" onClick={() => navigate('/forgot-password')}>Forgot password?</button>
        </div>
        {lockRemaining > 0 && <p className="auth-lockout-note" role="status">Too many failed attempts. Try again in {lockRemaining}s.</p>}
        <button className="auth-btn" type="submit" disabled={busy || lockRemaining > 0 || !supabase}>
          {busy ? <><LoaderCircle className="auth-spinner" size={17} /> Signing you in…</> : <>Sign in <ArrowRight size={16} /></>}
        </button>
      </form>
      {error && <div className="auth-message auth-message-error" role="alert" aria-live="polite">{error}</div>}
      {notice && <div className="auth-message auth-message-success" role="status" aria-live="polite">{notice}</div>}
      <div className="auth-divider" role="separator" aria-label="or"><span>or</span></div>
      <button type="button" className="auth-btn auth-btn-secondary" onClick={googleLogin} disabled={busy}><GoogleMark /> Continue with Google</button>
      <button type="button" className="auth-inline-link auth-method-toggle" onClick={() => { setPhoneMode((current) => !current); setPhoneError(''); setOtpError(''); setError(''); setNotice('') }}>{phoneMode ? 'Use email and password' : 'Use phone number instead'}</button>
      {phoneMode && (
        <section className="auth-phone-panel" aria-label="Phone number sign-in">
          <p className="auth-provider-note">Phone OTP preview — no SMS will be sent until phone authentication is configured.</p>
          <form className="auth-phone-form" onSubmit={otpRequested ? verifyPhoneOtp : requestPhoneOtp} noValidate>
            <div className="auth-field">
              <label htmlFor="login-phone">Phone number</label>
              <input id="login-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91 98765 43210" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError(''); setNotice('') }} aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? 'login-phone-error' : undefined} required />
              {phoneError && <span id="login-phone-error" className="auth-field-error" role="alert">{phoneError}</span>}
            </div>
            {otpRequested && (
              <div className="auth-field">
                <label htmlFor="login-otp">6-digit OTP</label>
                <input id="login-otp" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" placeholder="123456" value={otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError('') }} aria-invalid={Boolean(otpError)} aria-describedby={otpError ? 'login-otp-error' : undefined} required />
                {otpError && <span id="login-otp-error" className="auth-field-error" role="alert">{otpError}</span>}
              </div>
            )}
            <button className="auth-btn auth-btn-secondary" type="submit">{otpRequested ? 'Verify code' : 'Send OTP'}</button>
          </form>
        </section>
      )}
      <button type="button" className="auth-magic-link" onClick={sendMagicLink} disabled={busy}><Mail size={16} /> Email a magic link</button>
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
          emailRedirectTo: getAuthRedirectUrl('/login?redirect=' + encodeURIComponent(redirect)),
        },
      })
      if (signupError) throw signupError
      if (data?.session) {
        navigate(redirect, { replace: true })
      } else {
        setConfirmEmail(true)
        setResendCooldown(60)
      }
    } catch (signupError) {
      const message = String(signupError?.message || '')
      if (/already registered|already exists|user already/i.test(message)) {
        setError('We could not create an account with those details. Try signing in or resetting your password.')
      } else {
        setError(getAuthEmailDeliveryMessage(signupError, 'Could not create your account. Please try again.'))
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
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: getAuthRedirectUrl('/login?redirect=' + encodeURIComponent(redirect)) } })
      if (resendError) throw resendError
      setResendCooldown(60)
    } catch (resendError) {
      setError(getAuthEmailDeliveryMessage(resendError, 'Could not resend the confirmation email just now. Please try again later.'))
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
    <AuthLayout title="Make room for better." subtitle="Your business deserves less admin and more momentum." eyebrow="A BETTER WAY TO BILL" showLegal>
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
        <label className="auth-checkbox auth-terms-checkbox"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required /> <span>I agree to the <a href="/terms">Terms of Service</a> and acknowledge the <a href="/privacy">Privacy Policy</a>.</span></label>
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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: getAuthRedirectUrl('/reset-password') })
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
