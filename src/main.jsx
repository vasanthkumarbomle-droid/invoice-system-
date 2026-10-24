import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './AuthGate.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

export function OfflineExperience({ children }) {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    const down = () => setOffline(true)
    const up = () => setOffline(false)
    window.addEventListener('offline', down)
    window.addEventListener('online', up)
    if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}), { once: true })
    return () => { window.removeEventListener('offline', down); window.removeEventListener('online', up) }
  }, [])
  const retry = async () => {
    setChecking(true)
    try { const res = await fetch('/?connection-check=' + Date.now(), { cache: 'no-store' }); setOffline(!res.ok || !navigator.onLine) }
    catch { setOffline(true) } finally { setChecking(false) }
  }
  return <>{children}{offline && <div className="lf-offline-screen" role="alert" aria-live="assertive">
    <header className="lf-offline-header"><div className="lf-offline-brand"><span className="lf-brand-mark">L</span><span>LedgerFlow</span></div><span className="lf-offline-pill"><i/> Offline mode</span></header>
    <main className="lf-offline-main">
      <section className="lf-offline-copy"><span className="lf-offline-kicker">WIFI: PLAYING HIDE & SEEK</span><h1>Well, this is <em>awkward.</em></h1><p>The internet went out for coffee. It didn’t leave us a receipt.</p><button className="lf-offline-retry" onClick={retry} disabled={checking}><span className={checking ? 'lf-spin' : ''}>↻</span>{checking ? 'Checking connection…' : 'Try again'}</button><small>No signal. No drama. We’ll be here.</small></section>
      <section className="lf-offline-art" aria-label="A sleepy cat napping on a pile of invoices"><div className="lf-sun"/><div className="lf-wifi">⌁<b>×</b></div><div className="lf-plant"><i/><i/><i/><i/><span/></div><div className="lf-doodle-note">even the cloud<br/>needs a nap ↘</div><div className="lf-paper-stack"><div>INVOICE <span>•••</span></div><div>QUOTATION <span>•••</span></div><div>PAYMENT <span>•••</span></div></div><div className="lf-cat-shadow"/><div className="lf-cat"><div className="lf-cat-ear left"/><div className="lf-cat-ear right"/><div className="lf-cat-face"><span className="lf-eye left"/><span className="lf-eye right"/><span className="lf-nose"/><span className="lf-whisker left"/><span className="lf-whisker right"/></div><div className="lf-cat-paw one"/><div className="lf-cat-paw two"/></div><div className="lf-mug"><span>☕</span><small>BRB</small></div><div className="lf-art-caption">currently unavailable<br/><b>emotionally? also unavailable.</b></div></section>
    </main><footer className="lf-offline-footer"><span>✳</span> YOUR BUSINESS CAN WAIT 3 SECONDS. <span className="lf-footer-right">THE CAT HAS ALREADY WAITED 14 HOURS.</span></footer>
  </div>}</>
}
createRoot(document.getElementById('root')).render(<StrictMode><OfflineExperience><ErrorBoundary><AuthGate><App/></AuthGate></ErrorBoundary></OfflineExperience></StrictMode>)
