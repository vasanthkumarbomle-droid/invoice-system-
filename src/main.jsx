import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

export function OfflineExperience({ children }) {
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [checking, setChecking] = useState(false)

  // Connectivity is a separate concern from Supabase auth, session and RLS.
  // A failed database request must never be used as an offline signal.
  const checkConnection = useCallback(async () => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 2500)
    let assetReachable = false

    try {
      const response = await fetch('/favicon.svg?lf-connectivity=' + Date.now(), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      assetReachable = response.ok
    } catch {
      // A failed probe is only one signal; it must never block the app.
    } finally {
      window.clearTimeout(timeoutId)
    }

    const shouldShowBanner = !assetReachable && navigator.onLine === false
    setOffline(shouldShowBanner)
    if (!shouldShowBanner) setDismissed(false)
    return !shouldShowBanner
  }, [])

  useEffect(() => {
    void checkConnection()
    const onNetworkChange = () => { void checkConnection() }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkConnection()
    }
    const registerServiceWorker = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }
    }

    window.addEventListener('online', onNetworkChange)
    window.addEventListener('offline', onNetworkChange)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('load', registerServiceWorker, { once: true })
    return () => {
      window.removeEventListener('online', onNetworkChange)
      window.removeEventListener('offline', onNetworkChange)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('load', registerServiceWorker)
    }
  }, [checkConnection])

  const retry = async () => {
    if (checking) return
    setChecking(true)
    try {
      await checkConnection()
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      {offline && !dismissed && (
        <div className="lf-offline-banner" role="status" aria-live="polite">
          <span className="lf-offline-banner-icon" aria-hidden="true">↯</span>
          <span><strong>You may be offline.</strong> Cached pages remain available; changes may not sync until connection returns.</span>
          <button type="button" className="lf-offline-banner-retry" onClick={retry} disabled={checking}>
            {checking ? 'Checking…' : 'Retry connection'}
          </button>
          <button type="button" className="lf-offline-banner-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss offline notice">×</button>
        </div>
      )}
      {children}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <OfflineExperience>
        <ErrorBoundary>
          <AuthGate>
            <App />
          </AuthGate>
        </ErrorBoundary>
      </OfflineExperience>
    </BrowserRouter>
  </StrictMode>
)
