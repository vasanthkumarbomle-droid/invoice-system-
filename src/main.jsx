import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

export function OfflineExperience({ children }) {
  // navigator.onLine can be false even while the site is reachable.
  // Only show the offline screen after a real same-origin request fails.
  const [offline, setOffline] = useState(false)
  const [checking, setChecking] = useState(false)

  const checkConnection = async () => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 4500)
    try {
      const response = await fetch('/?ledgerflow-connectivity-check=' + Date.now(), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      })
      const reachable = response.ok
      setOffline(!reachable)
      return reachable
    } catch {
      setOffline(true)
      return false
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  useEffect(() => {
    void checkConnection()
    const onNetworkChange = () => { void checkConnection() }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkConnection()
    }
    window.addEventListener('online', onNetworkChange)
    window.addEventListener('offline', onNetworkChange)
    document.addEventListener('visibilitychange', onVisible)
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }, { once: true })
    }
    return () => {
      window.removeEventListener('online', onNetworkChange)
      window.removeEventListener('offline', onNetworkChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const retry = async () => {
    setChecking(true)
    await checkConnection()
    setChecking(false)
  }

  return <>{children}{offline && <div className="lf-offline-screen" role="alert" aria-live="assertive">
    <header className="lf-offline-header"><div className="lf-offline-brand"><span className="lf-brand-mark">L</span><span>LedgerFlow</span></div><span className="lf-offline-pill"><i/> Offline mode</span></header>
    <main className="lf-offline-main">
      <section className="lf-offline-copy"><span className="lf-offline-kicker">WIFI: PLAYING HIDE & SEEK</span><h1>Well, this is <em>awkward.</em></h1><p>The internet went out for coffee. It didn’t leave us a receipt.</p><button className="lf-offline-retry" onClick={retry} disabled={checking}><span className={checking ? 'lf-spin' : ''}>↻</span>{checking ? 'Checking connection…' : 'Try again'}</button><small>No signal. No drama. We’ll be here.</small></section>
      <section className="lf-offline-art" aria-label="A sleepy cat napping on a pile of invoices"><div className="lf-sun"/><div className="lf-wifi">⌁<b>×</b></div><div className="lf-plant"><i/><i/><i/><i/><span/></div><div className="lf-doodle-note">even the cloud<br/>needs a nap ↘</div><div className="lf-paper-stack"><div>INVOICE <span>•••</span></div><div>QUOTATION <span>•••</span></div><div>PAYMENT <span>•••</span></div></div><div className="lf-cat-shadow"/><div className="lf-cat"><div className="lf-cat-ear left"/><div className="lf-cat-ear right"/><div className="lf-cat-face"><span className="lf-eye left"/><span className="lf-eye right"/><span className="lf-nose"/><span className="lf-whisker left"/><span className="lf-whisker right"/></div><div className="lf-cat-paw one"/><div className="lf-cat-paw two"/></div><div className="lf-mug"><span>☕</span><small>BRB</small></div><div className="lf-art-caption">currently unavailable<br/><b>emotionally? also unavailable.</b></div></section>
    </main><footer className="lf-offline-footer"><span>✳</span> YOUR BUSINESS CAN WAIT 3 SECONDS. <span className="lf-footer-right">THE CAT HAS ALREADY WAITED 14 HOURS.</span></footer>
  </div>}</>
}
createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><OfflineExperience><ErrorBoundary><AuthGate><App/></AuthGate></ErrorBoundary></OfflineExperience></BrowserRouter></StrictMode>)
