import { createClient } from '@supabase/supabase-js'

// Build-time configuration only: browser storage cannot redirect app data to another project.
const activeUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const activeKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim()

const isAllowedUrl = activeUrl.startsWith('https://') ||
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(activeUrl)

export const isSupabaseConfigured = Boolean(
  activeUrl &&
  activeKey &&
  isAllowedUrl &&
  !activeUrl.includes('your-project-id')
)

const SESSION_ONLY_MARKER = 'lf-auth-session-only'
const knownStorageKeys = new Set()
let sessionOnlyOverride = false

function shouldUseSessionStorage() {
  if (sessionOnlyOverride) return true
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(SESSION_ONLY_MARKER) === 'true'
  } catch {
    return false
  }
}

// Supabase reads/writes this adapter for its standard auth-token key. The
// remember-me choice changes only where the current browser session is stored.
const authStorage = {
  getItem(key) {
    if (typeof window === 'undefined') return null
    knownStorageKeys.add(key)
    try {
      if (shouldUseSessionStorage()) return window.sessionStorage.getItem(key)
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key, value) {
    if (typeof window === 'undefined') return
    knownStorageKeys.add(key)
    try {
      if (shouldUseSessionStorage()) {
        window.localStorage.removeItem(key)
        window.sessionStorage.setItem(key, value)
      } else {
        window.sessionStorage.removeItem(key)
        window.localStorage.setItem(key, value)
      }
    } catch {
      // If browser storage is blocked, the SDK will report its own auth error.
    }
  },
  removeItem(key) {
    if (typeof window === 'undefined') return
    knownStorageKeys.add(key)
    try {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    } catch {
      // Ignore storage restrictions during sign-out.
    }
  },
}

export function setRememberMe(remember) {
  sessionOnlyOverride = !remember
  if (typeof window === 'undefined') return
  try {
    if (remember) {
      window.sessionStorage.removeItem(SESSION_ONLY_MARKER)
      // The next SDK session write will move the token into localStorage.
    } else {
      window.sessionStorage.setItem(SESSION_ONLY_MARKER, 'true')
      // A prior persistent token must not keep this sign-in persistent.
      for (const key of knownStorageKeys) window.localStorage.removeItem(key)
    }
  } catch {
    // Persistence preference is best-effort when storage is disabled.
  }
}

export const supabase = isSupabaseConfigured
  ? createClient(activeUrl, activeKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: authStorage,
      },
    })
  : null

export function getSupabaseConfigStatus() {
  if (isSupabaseConfigured) {
    return {
      configured: true,
      source: 'environment',
      url: activeUrl ? activeUrl.slice(0, 24) + '...' : '',
      message: 'Supabase Cloud Connected',
    }
  }
  return {
    configured: false,
    source: 'none',
    message: 'Supabase configuration is required',
  }
}
