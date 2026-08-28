import { getOptionalBeaverRuntime } from "@zbeaver/beaver/app/runtime"

const LOCAL_RATE_LIMITS = new Map<string, { count: number; resetAt: number }>()
const MAX_LOCAL_RATE_LIMIT_KEYS = 10_000

function bindingForKey(key: string) {
  const env = getOptionalBeaverRuntime()?.env
  if (!env) return undefined
  if (key.startsWith("login:") || key.startsWith("/api/admin/auth")) {
    return env.AUTH_RATE_LIMITER || env.RATE_LIMITER
  }
  if (key.startsWith("media-upload:")) return env.MEDIA_RATE_LIMITER || env.RATE_LIMITER
  if (key.startsWith("contact:")) return env.CONTACT_RATE_LIMITER || env.RATE_LIMITER
  return env.RATE_LIMITER
}

function localState(key: string, now: number) {
  const current = LOCAL_RATE_LIMITS.get(key)
  if (!current || current.resetAt <= now) {
    LOCAL_RATE_LIMITS.set(key, { count: 0, resetAt: now })
    return LOCAL_RATE_LIMITS.get(key)!
  }
  return current
}

/**
 * Check a limit without consuming a slot. Cloudflare's binding intentionally
 * has no read-only operation, so the edge path returns true here and consumes
 * the configured binding slot in isWithinRateLimit when the event occurs.
 */
export async function isRateLimitAvailable(key: string, limit: number) {
  if (bindingForKey(key)) return true
  const current = LOCAL_RATE_LIMITS.get(key)
  if (!current || current.resetAt <= Date.now()) return true
  return current.count < limit
}

/** Local-only reset; Cloudflare Rate Limiting windows expire by configuration. */
export async function resetRateLimit(key: string) {
  LOCAL_RATE_LIMITS.delete(key)
}

export async function isWithinRateLimit(key: string, limit: number, windowMs: number) {
  const binding = bindingForKey(key)
  if (binding) {
    // The binding's limit and period are configured in wrangler.jsonc. The
    // local window argument is retained only for the local fallback.
    const result = await binding.limit({ key })
    return result.success
  }

  const now = Date.now()
  if (LOCAL_RATE_LIMITS.size >= MAX_LOCAL_RATE_LIMIT_KEYS) {
    for (const [storedKey, value] of LOCAL_RATE_LIMITS) {
      if (value.resetAt <= now) LOCAL_RATE_LIMITS.delete(storedKey)
    }
    if (LOCAL_RATE_LIMITS.size >= MAX_LOCAL_RATE_LIMIT_KEYS && !LOCAL_RATE_LIMITS.has(key)) {
      const oldestKey = LOCAL_RATE_LIMITS.keys().next().value
      if (oldestKey) LOCAL_RATE_LIMITS.delete(oldestKey)
    }
  }

  const current = localState(key, now)
  if (current.resetAt === now || current.resetAt <= now) {
    current.resetAt = now + windowMs
    current.count = 1
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}
