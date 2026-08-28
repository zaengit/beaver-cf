import { getRuntimeEnvValue } from "@zbeaver/beaver/app/runtime"

const HASH_VERSION = "v1"
const HASH_ALGORITHM = "pbkdf2-sha256"
const HASH_BITS = 256
const SALT_BYTES = 16
const DEFAULT_ITERATIONS = 120_000
const MIN_ITERATIONS = 10_000
const MAX_ITERATIONS = 1_000_000
const encoder = new TextEncoder()

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function configuredIterations() {
  const raw = getRuntimeEnvValue("PASSWORD_HASH_ITERATIONS")
  const value = raw ? Number(raw) : DEFAULT_ITERATIONS
  return Number.isSafeInteger(value) && value >= MIN_ITERATIONS && value <= MAX_ITERATIONS
    ? value
    : DEFAULT_ITERATIONS
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations, hash: "SHA-256" }, key, HASH_BITS)
  return new Uint8Array(bits)
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

/** Hash a new password with Web Crypto so it runs natively in Workers. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iterations = configuredIterations()
  const hash = await derive(password, salt, iterations)
  return [HASH_VERSION, HASH_ALGORITHM, iterations, base64UrlEncode(salt), base64UrlEncode(hash)].join("$")
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, algorithm, rawIterations, rawSalt, rawHash] = encoded.split("$")
  const iterations = Number(rawIterations)
  if (version !== HASH_VERSION || algorithm !== HASH_ALGORITHM || !Number.isSafeInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS || !rawSalt || !rawHash) {
    return false
  }

  try {
    const salt = base64UrlDecode(rawSalt)
    const expected = base64UrlDecode(rawHash)
    if (salt.length !== SALT_BYTES || expected.length !== HASH_BITS / 8) return false
    return equalBytes(await derive(password, salt, iterations), expected)
  } catch {
    return false
  }
}
