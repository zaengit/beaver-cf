import { AsyncLocalStorage } from "node:async_hooks"
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"
import type {
  D1Database,
  Fetcher,
  KVNamespace,
  R2Bucket,
  RateLimit,
} from "@cloudflare/workers-types"

import { schema } from "./db/schema"

export interface CloudflareEnv {
  DB: D1Database
  MEDIA: R2Bucket
  CACHE?: KVNamespace
  RATE_LIMITER?: RateLimit
  AUTH_RATE_LIMITER?: RateLimit
  MEDIA_RATE_LIMITER?: RateLimit
  CONTACT_RATE_LIMITER?: RateLimit
  ASSETS?: Fetcher
  [key: string]: unknown
}

export type BeaverDatabase = DrizzleD1Database<typeof schema>

export interface BeaverRuntime {
  env: CloudflareEnv
  db: BeaverDatabase
}

const runtimeStorage = new AsyncLocalStorage<BeaverRuntime>()
const runtimeCache = new WeakMap<object, BeaverRuntime>()

type ProcessLike = { env?: Record<string, string | undefined> }

function processEnvironment() {
  return (globalThis as typeof globalThis & { process?: ProcessLike }).process?.env
}

function isRuntime(value: CloudflareEnv | BeaverRuntime): value is BeaverRuntime {
  return "db" in value && "env" in value
}

/** Create the request runtime from Cloudflare Worker bindings. */
export function createBeaverRuntime(env: CloudflareEnv): BeaverRuntime {
  if (!env || !env.DB) throw new Error("Cloudflare D1 binding DB is required.")
  if (!env.MEDIA) throw new Error("Cloudflare R2 binding MEDIA is required.")

  const cached = runtimeCache.get(env)
  if (cached) return cached

  const runtime = {
    env,
    db: drizzle(env.DB, { schema }),
  } satisfies BeaverRuntime
  runtimeCache.set(env, runtime)
  return runtime
}

/** Run application code with the current request's Cloudflare bindings. */
export function withBeaverRuntime<T>(
  value: CloudflareEnv | BeaverRuntime,
  callback: () => T,
): T {
  return runtimeStorage.run(isRuntime(value) ? value : createBeaverRuntime(value), callback)
}

export function getBeaverRuntime(): BeaverRuntime {
  const runtime = runtimeStorage.getStore()
  if (!runtime) {
    throw new Error("Beaver runtime is not initialized. Wrap the request with withBeaverRuntime().")
  }
  return runtime
}

export function getOptionalBeaverRuntime() {
  return runtimeStorage.getStore()
}

/** Read a Worker var/secret, with a process fallback for local tooling/tests. */
export function getRuntimeEnvValue(name: string): string | undefined {
  const runtimeValue = getOptionalBeaverRuntime()?.env[name]
  if (typeof runtimeValue === "string") return runtimeValue.trim() || undefined
  const processValue = processEnvironment()?.[name]
  return processValue?.trim() || undefined
}

export function isProductionRuntime() {
  return getRuntimeEnvValue("ENVIRONMENT") === "production"
    || getRuntimeEnvValue("NODE_ENV") === "production"
}
