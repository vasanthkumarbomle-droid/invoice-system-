import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, LoaderCircle, CheckCircle2, MailWarning } from 'lucide-react'
import { supabase } from './supabase.js'
import { AuthLayout } from './AuthPages.jsx'
import './auth.css'

export default function PasswordResetPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return undefined
    }

    let active = true
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setHasRecoverySession(true)
      else if (session) setHasRecoverySession(true)
      setReady(true)
    })

    supabase.auth.getSession()
      .then(({ data: sessionData, error: sessionError }) => {
        if (!active) return
        if (sessionError) setError('This reset link could not be verified. Request a new one.')
        setHasRecoverySession(Boolean(sessionData?.session))
        setReady(true)
      })
      .catch(() => {
        if (active) {
          setError('This reset link could not be verified. Request a new one.')
          setReady(true)
        }
      })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')

    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setError('Include an uppercase letter, a lowercase letter, and a number.')
      return
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    if (!supabase || !hasRecoverySession) {
      setError('This reset link is invalid or expired. Request a new password-reset email.')
      return
    }

    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setPassword('')
      setConfirmPassword('')
      setNotice('Your password has been updated. You can sign in with your new password.')
    } catch (updateError) {
      setError(updateError?.message || 'Could not update your password. Request a new reset link and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return <AuthLayout title="Checking your reset link…" subtitle="Making sure this link belongs to your account." eyebrow="ACCOUNT RECOVERY" compact>
      <div className="auth-loading-inline" role="status"><LoaderCircle size={18} className="auth-spinner" /> Verifying securely…</div>
    </AuthLayout>
  }

  if (!supabase) {
    return <AuthLayout title="Password recovery unavailable." subtitle="This deployment needs its Supabase settings before password recovery can run." eyebrow="ACCOUNT RECOVERY" compact>
      <div className="auth-message auth-message-error" role="alert">Authentication is not configured for this deployment.</div>
      <button type="button" className="auth-btn" onClick={() => navigate('/login')}>Back to sign in</button>
    </AuthLayout>
  }

  if (!hasRecoverySession && !notice) {
    return <AuthLayout title="That link has expired." subtitle="Reset links are single-use and time-limited. It’s easy to get another." eyebrow="ACCOUNT RECOVERY" compact>
      <div className="auth-confirmation-art"><MailWarning size={28} /></div>
      <div className="auth-message auth-message-error" role="alert">{error || 'This reset link is invalid or expired. Request a new password-reset email.'}</div>
      <button type="button" className="auth-btn" onClick={() => navigate('/forgot-password')}>Request a new link <ArrowRight size={16} /></button>
      <button type="button" className="auth-magic-link" onClick={() => navigate('/login')}>Back to sign in</button>
    </AuthLayout>
  }

  if (notice) {
    return <AuthLayout title="You’re all set." subtitle="Your new password is ready to use." eyebrow="PASSWORD UPDATED" compact>
      <div className="auth-confirmation-art"><CheckCircle2 size={28} /><span className="auth-confirmation-check"><CheckCircle2 size={18} /></span></div>
      <div className="auth-message auth-message-success" role="status" aria-live="polite">{notice}</div>
      <button type="button" className="auth-btn" onClick={() => navigate('/login', { replace: true })}>Continue to LedgerFlow <ArrowRight size={16} /></button>
    </AuthLayout>
  }

  return (
    <AuthLayout title="Choose a new password." subtitle="A fresh password helps keep your business workspace secure." eyebrow="ACCOUNT RECOVERY" compact>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="reset-password">New password</label>
          <div className="auth-password-wrap">
            <input id="reset-password" name="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} required autoFocus />
            <button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <span className="auth-field-hint">At least 8 characters, with uppercase, lowercase, and a number.</span>
        </div>
        <div className="auth-field">
          <label htmlFor="reset-confirm-password">Confirm new password</label>
          <div className="auth-password-wrap">
            <input id="reset-confirm-password" name="confirm-new-password" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError('') }} required />
            <button type="button" className="auth-password-toggle" aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'} onClick={() => setShowConfirm((shown) => !shown)}>{showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
        </div>
        {error && <div className="auth-message auth-message-error" role="alert" aria-live="polite">{error}</div>}
        <button type="submit" className="auth-btn" disabled={busy || !hasRecoverySession}>
          {busy ? <><LoaderCircle size={17} className="auth-spinner" /> Updating password…</> : <>Update password <ArrowRight size={16} /></>}
        </button>
        <button type="button" className="auth-magic-link" onClick={() => navigate('/login')}>Back to sign in</button>
      </form>
    </AuthLayout>
  )
}
