import { createClient } from '@supabase/supabase-js'

// Use build-time configuration only. Arbitrary browser storage must not be
// able to redirect business data to a different Supabase project.
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

export const supabase = isSupabaseConfigured
  ? createClient(activeUrl, activeKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export function getSupabaseConfigStatus() {
  if (isSupabaseConfigured) {
    return {
      configured: true,
      source: 'environment',
      url: activeUrl ? `${activeUrl.slice(0, 24)}...` : '',
      message: 'Supabase Cloud Connected',
    }
  }
  return {
    configured: false,
    source: 'none',
    message: 'Supabase configuration is required',
  }
}
