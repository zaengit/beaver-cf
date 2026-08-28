import { getOptionalBeaverRuntime, getRuntimeEnvValue } from "@zbeaver/beaver/app/runtime"

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const GENERATION_KEY = "beaver:public-cache:generation"
const CACHE_KEY_PREFIX = "beaver:public-cache"
const MAX_CACHE_ENTRY_BYTES = 1 * 1024 * 1024
const encoder = new TextEncoder()

function configuredTtlMs() {
  const configured = getRuntimeEnvValue("PUBLIC_CACHE_TTL_SECONDS")
  const seconds = configured === undefined ? 300 : Number(configured)
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 7 * 24 * 60 * 60
    ? seconds * 1_000
    : 300_000
}

async function hashKey(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function cacheNamespace() {
  return getRuntimeEnvValue("PUBLIC_CACHE_NAMESPACE") || CACHE_KEY_PREFIX
}

/**
 * Read public data from KV and fall back to the supplied loader. Cache
 * failures are deliberately non-fatal so D1 remains the source of truth.
 */
export async function getCachedPublicData<T>(
  key: string,
  loader: () => T | Promise<T>,
  ttlMs = configuredTtlMs(),
): Promise<T> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return await loader()

  const cache = getOptionalBeaverRuntime()?.env.CACHE
  if (!cache) return await loader()

  const hash = await hashKey(key)
  const namespace = cacheNamespace()
  let cacheKey: string | undefined
  const now = Date.now()

  try {
    const generation = await cache.get(`${namespace}:generation`) || "0"
    cacheKey = `${namespace}:${generation}:${hash}`
    const cached = await cache.get<CacheEntry<T>>(cacheKey, "json")
    if (cached && Number.isFinite(cached.expiresAt) && cached.expiresAt > now) return cached.value
  } catch {
    // A cache failure must never prevent the public site from rendering.
  }

  const value = await loader()
  if (value === null || value === undefined) return value

  try {
    if (!cacheKey) return value
    const serialized = JSON.stringify({ expiresAt: now + ttlMs, value })
    if (typeof serialized !== "string" || encoder.encode(serialized).byteLength > MAX_CACHE_ENTRY_BYTES) return value
    await cache.put(cacheKey, serialized, { expirationTtl: Math.max(1, Math.ceil(ttlMs / 1_000)) })
  } catch {
    // The result remains valid even when KV is unavailable or the value is not
    // serializable.
  }

  return value
}

/** Invalidate all public entries by moving the generation namespace. */
export async function invalidatePublicDataCache(): Promise<void> {
  const cache = getOptionalBeaverRuntime()?.env.CACHE
  if (!cache) return

  try {
    const generation = crypto.randomUUID()
    await cache.put(`${cacheNamespace()}:generation`, generation, { expirationTtl: 7 * 24 * 60 * 60 })
  } catch {
    // Expiration still provides a bounded fallback when invalidation fails.
  }
}
