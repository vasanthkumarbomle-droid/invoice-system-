import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LoaderCircle, UploadCloud, ArrowRight } from 'lucide-react'
import { supabase, getMyOrg, createOrg, updateOrg, signOut } from './lib/db'
import { OrgContext } from './OrgContext'
import { AuthLayout } from './AuthPages'
import './auth.css'

const AUTH_PATHS = new Set(['/login', '/signup', '/forgot-password'])
const PUBLIC_PATHS = new Set(['/client-document', '/terms', '/reset-password'])
const STATES = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'],
  ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'],
  ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'],
  ['28', 'Andhra Pradesh (old code)'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'],
  ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'],
  ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
]

function safeDestination(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (AUTH_PATHS.has(value.split('?')[0]) || PUBLIC_PATHS.has(value.split('?')[0])) return '/'
  return value
}

function requestedDestination(search) {
  return safeDestination(new URLSearchParams(search).get('redirect'))
}

function getOnboardingSkipKey(orgId) {
  return 'lf-onboarding-skipped:' + orgId
}

function LoadingScreen({ label = 'Loading your workspace…' }) {
  return <div className="auth-loading" role="status"><LoaderCircle className="auth-spinner" size={20} /><span>{label}</span></div>
}

function CompanyOnboarding({ session, existingOrg, onCompleted, onSkip }) {
  const metadata = session?.user?.user_metadata || {}
  const [companyName, setCompanyName] = useState(existingOrg?.legal_name || existingOrg?.name || metadata.company_name || '')
  const [gstin, setGstin] = useState(existingOrg?.gstin || '')
  const [stateCode, setStateCode] = useState(existingOrg?.state_code || String(existingOrg?.gstin || '').slice(0, 2))
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(existingOrg?.logo_url || '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!logoFile) return undefined
    const objectUrl = URL.createObjectURL(logoFile)
    setLogoPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [logoFile])

  const handleLogoChange = (event) => {
    setError('')
    const file = event.target.files?.[0]
    if (!file) { setLogoFile(null); return }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPG, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Choose a logo smaller than 2 MB.')
      event.target.value = ''
      return
    }
    setLogoFile(file)
  }

  const submit = async (event, skipOptional = false) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const name = companyName.trim()
    if (!name) { setError('Enter your company name to continue.'); return }
    if (!skipOptional && gstin.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase())) {
      setError('Enter a 15-character GSTIN in the correct format, or leave it blank for now.')
      return
    }
    setBusy(true)
    let logoUrl = existingOrg?.logo_url || null
    let logoWarning = ''
    try {
      if (logoFile && !skipOptional) {
        try {
          const fileName = logoFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
          const uploadPath = String(session.user.id) + '/' + Date.now() + '-' + fileName
          const { data: uploaded, error: uploadError } = await supabase.storage.from('company-logos').upload(uploadPath, logoFile, {
            upsert: true,
            cacheControl: '3600',
            contentType: logoFile.type,
          })
          if (uploadError) throw uploadError
          logoUrl = supabase.storage.from('company-logos').getPublicUrl(uploaded.path).data.publicUrl
        } catch {
          logoWarning = 'Company details were saved, but the logo upload was skipped. Create a public Storage bucket named company-logos in Supabase to enable uploads.'
        }
      }
      const patch = {
        name,
        legal_name: name,
        gstin: skipOptional ? null : (gstin.trim().toUpperCase() || null),
        state_code: skipOptional ? null : (stateCode || null),
        ...(logoFile && logoUrl ? { logo_url: logoUrl } : {}),
      }
      const saved = existingOrg
        ? await updateOrg(existingOrg.id, patch)
        : await createOrg(patch)
      const complete = { ...saved, role: existingOrg?.role || 'owner' }
      try { window.localStorage.setItem(getOnboardingSkipKey(complete.id), '1') } catch { /* Storage can be disabled. */ }
      if (logoWarning) setNotice(logoWarning)
      onCompleted(complete)
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the company details. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title={existingOrg ? 'Finish setting up.' : 'Let’s set up your business.'} subtitle="A few details make your invoices feel like they came from you." eyebrow="YOUR WORKSPACE, YOUR BRAND" compact>
      <form className="auth-form auth-onboarding-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="onboarding-company">Company name</label>
          <input id="onboarding-company" name="organization" autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required maxLength={150} placeholder="Your registered business name" />
        </div>
        <div className="auth-field">
          <label htmlFor="onboarding-gstin">GSTIN <span className="auth-optional">optional</span></label>
          <input id="onboarding-gstin" name="gstin" autoComplete="off" value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} maxLength={15} placeholder="15-character GSTIN" />
        </div>
        <div className="auth-field">
          <label htmlFor="onboarding-state">Business state <span className="auth-optional">optional</span></label>
          <select id="onboarding-state" name="state" value={stateCode} onChange={(event) => setStateCode(event.target.value)}>
            <option value="">Choose state</option>
            {STATES.map(([code, state]) => <option key={code} value={code}>{state}</option>)}
          </select>
        </div>
        <div className="auth-field">
          <label htmlFor="onboarding-logo">Company logo <span className="auth-optional">optional · max 2 MB</span></label>
          <label className="auth-logo-upload" htmlFor="onboarding-logo">
            {logoPreview ? <img src={logoPreview} alt="Selected company logo preview" /> : <span className="auth-logo-upload-icon"><UploadCloud size={19} /></span>}
            <span><strong>{logoFile ? logoFile.name : logoPreview ? 'Logo selected' : 'Upload your logo'}</strong><small>PNG, JPG, or WebP</small></span>
            <input id="onboarding-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoChange} />
          </label>
        </div>
        {error && <div className="auth-message auth-message-error" role="alert" aria-live="polite">{error}</div>}
        {notice && <div className="auth-message auth-message-success" role="status">{notice}</div>}
        <button className="auth-btn" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="auth-spinner" /> Saving workspace…</> : <>Save and continue <ArrowRight size={16} /></>}</button>
        <button className="auth-magic-link" type="button" disabled={busy} onClick={() => {
          if (existingOrg) onSkip()
          else void submit({ preventDefault() {} }, true)
        }}>{existingOrg ? 'I’ll finish this later' : 'Skip optional details'}</button>
        {!existingOrg && <p className="auth-field-hint">We’ll use your company name to create the workspace. GSTIN, state, and logo can be added later in Settings.</p>}
      </form>
    </AuthLayout>
  )
}

export default function AuthGate({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [session, setSession] = useState(undefined)
  const [org, setOrg] = useState(undefined)
  const [orgLoadError, setOrgLoadError] = useState('')
  const hadSession = useRef(false)
  const explicitSignOut = useRef(false)

  const signOutExplicitly = async () => {
    explicitSignOut.current = true
    try {
      await signOut()
    } finally {
      explicitSignOut.current = false
      navigate('/login', { replace: true })
    }
  }

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return undefined
    }
    let active = true
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        hadSession.current = Boolean(data.session)
      })
      .catch(() => { if (active) setSession(null) })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (nextSession) hadSession.current = true
      if (event === 'SIGNED_OUT' && hadSession.current) {
        hadSession.current = false
        if (!explicitSignOut.current) {
          const currentPath = window.location.pathname + window.location.search
          const next = safeDestination(currentPath)
          const suffix = next !== '/' ? '&redirect=' + encodeURIComponent(next) : ''
          navigate('/login?sessionExpired=1' + suffix, { replace: true })
        }
      }
      setSession(nextSession)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [navigate])

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
      .then(async (value) => {
        if (!active) return
        if (value) {
          setOrg(value)
          return
        }

        // A workspace is needed for tenant-scoped invoices and quotations,
        // but a full business profile is not. Create a minimal workspace so
        // the user can start working and fill these details in Settings later.
        const metadataName = String(session?.user?.user_metadata?.company_name || '').trim()
        const workspaceName = metadataName || 'My Workspace'
        const created = await createOrg({
          name: workspaceName,
          legal_name: workspaceName,
          gstin: null,
          state_code: null,
          logo_url: null,
        })
        if (active) setOrg({ ...created, role: created?.role || 'owner' })
      })
      .catch((error) => {
        if (active) {
          setOrg(undefined)
          setOrgLoadError(error?.message || 'Could not prepare your workspace. Please try again.')
        }
      })
    return () => { active = false }
  }, [session])

  const path = location.pathname
  if (PUBLIC_PATHS.has(path)) return children

  if (!supabase) {
    if (AUTH_PATHS.has(path)) return children
    return <Navigate to={'/login?redirect=' + encodeURIComponent(path + location.search)} replace />
  }

  if (session === undefined) return <LoadingScreen label="Checking your session…" />

  if (!session) {
    if (AUTH_PATHS.has(path)) return children
    return <Navigate to={'/login?redirect=' + encodeURIComponent(path + location.search)} replace />
  }

  if (orgLoadError) {
    return (
      <AuthLayout title="Your workspace is taking a moment." subtitle="Your saved business record has not been changed. Check your connection and try again." eyebrow="A QUICK CHECK">
        <div className="auth-message auth-message-error" role="alert">{orgLoadError}</div>
        <button className="auth-btn" type="button" onClick={async () => {
          setOrgLoadError('')
          setOrg(undefined)
          try { setOrg(await getMyOrg()) } catch (error) { setOrgLoadError(error?.message || 'Could not load your business details.') }
        }}>Try again</button>
        <button className="auth-magic-link" type="button" onClick={signOutExplicitly}>Sign out</button>
      </AuthLayout>
    )
  }

  if (org === undefined) return <LoadingScreen label="Preparing your workspace…" />

  if (!org) {
    const destination = requestedDestination(location.search)
    const completeOnboarding = (nextOrg) => {
      setOrg(nextOrg)
      if (AUTH_PATHS.has(path)) navigate(destination, { replace: true })
    }
    const skipOnboarding = () => {
      try { window.localStorage.setItem(getOnboardingSkipKey(org.id), '1') } catch { /* Ignore disabled local storage. */ }
      if (AUTH_PATHS.has(path)) navigate(destination, { replace: true })
    }
    return <CompanyOnboarding session={session} existingOrg={org || null} onCompleted={completeOnboarding} onSkip={skipOnboarding} />
  }

  if (AUTH_PATHS.has(path)) return <Navigate to={requestedDestination(location.search)} replace />

  return <OrgContext.Provider value={{ ...org, signOut: signOutExplicitly }}>{children}</OrgContext.Provider>
}
