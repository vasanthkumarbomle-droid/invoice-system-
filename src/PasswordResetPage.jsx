import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase.js'
import './auth.css'

export default function PasswordResetPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return undefined
    }

    let active = true
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setHasSession(Boolean(nextSession))
      setReady(true)
    })

    supabase.auth.getSession()
      .then(({ data: sessionData, error: sessionError }) => {
        if (!active) return
        if (sessionError) setError('The reset link could not be verified. Request a new password-reset email.')
        setHasSession(Boolean(sessionData?.session))
        setReady(true)
      })
      .catch(() => {
        if (active) {
          setError('The reset link could not be verified. Request a new password-reset email.')
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
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }
    if (!supabase || !hasSession) {
      setError('This reset link is invalid or has expired. Request a new password-reset email.')
      return
    }

    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setPassword('')
      setConfirmPassword('')
      setNotice('Your password has been updated. You can continue to LedgerFlow.')
    } catch (updateError) {
      setError(updateError?.message || 'Could not update your password. Request a new reset link and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-brand">
        <div className="auth-logo">LF</div>
        <h1>Secure your account.</h1>
        <p>Choose a new password to regain access to your LedgerFlow workspace.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h2>Set a new password</h2>
          <p className="auth-sub">Use at least 8 characters and keep it private.</p>

          {!supabase ? (
            <div className="auth-error" role="alert">Supabase is not configured for this deployment.</div>
          ) : !ready ? (
            <div className="auth-loading" role="status">Verifying reset link...</div>
          ) : !hasSession ? (
            <>
              <div className="auth-error" role="alert">
                {error || 'This reset link is invalid or has expired. Request a new password-reset email.'}
              </div>
              <button type="button" className="auth-btn" onClick={() => navigate('/')}>Back to sign in</button>
            </>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <div className="auth-field">
                <label htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="auth-field">
                <label htmlFor="confirm-password">Confirm new password</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
              {error && <div className="auth-error" role="alert">{error}</div>}
              {notice && <div className="auth-success" role="status">{notice}</div>}
              {notice ? (
                <button type="button" className="auth-btn" onClick={() => navigate('/')}>Continue to LedgerFlow</button>
              ) : (
                <button className="auth-btn" disabled={busy}>
                  {busy ? 'Updating password...' : 'Update password'}
                </button>
              )}
            </form>
          )}

          {!notice && (
            <button type="button" className="auth-toggle" onClick={() => navigate('/')}>
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
