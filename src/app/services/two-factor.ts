import { generateSecret, generateURI, verify } from "otplib"

import {
  assertSecureSecrets,
  getAdminCredentials,
  getSuperAdminTwoFactorConfig,
  isTestEnvironment,
} from "@zbeaver/beaver/app/config/security"
import { getRuntimeEnvValue } from "@zbeaver/beaver/app/runtime"
import { verifyPassword } from "@zbeaver/beaver/app/auth"
import { authenticateSuperAdmin, isSuperAdminUserId } from "@zbeaver/beaver/app/admin/super-admin"
import { deleteRefreshSessionsForUser } from "@zbeaver/beaver/app/admin/session-store"
import { findUserByIdRecord, findSafeUserByIdRecord } from "@zbeaver/beaver/app/repositories/users"
import {
  deleteTwoFactorRecord,
  enableTwoFactor,
  findTwoFactorRecord,
  saveTwoFactorSetup,
} from "@zbeaver/beaver/app/repositories/two-factor"
import type { ServiceResult } from "@zbeaver/beaver/pkg/types"
import { serviceConflict, serviceNotFound, serviceSuccess, serviceValidation } from "@zbeaver/beaver/app/services/utils"
import { getCurrentTimestamp } from "@zbeaver/beaver/pkg/utils/index"

const TWO_FACTOR_ISSUER = "Beaver"
const ENCRYPTION_PREFIX = "v1"
const TOTP_EPOCH_TOLERANCE_SECONDS = 30
const AUTH_TAG_BYTES = 16
const encoder = new TextEncoder()
const decoder = new TextDecoder()

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

async function encryptionKey() {
  const sessionSecret = getRuntimeEnvValue("SESSION_SECRET")
  if (!sessionSecret) {
    if (isTestEnvironment()) {
      const digest = await crypto.subtle.digest("SHA-256", encoder.encode("beaver-test-two-factor"))
      return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
    }
    throw new Error("SESSION_SECRET must be configured before using two-factor authentication.")
  }

  if (!isTestEnvironment()) assertSecureSecrets()
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode("beaver-two-factor:" + sessionSecret))
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

async function encryptSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedWithTag = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: AUTH_TAG_BYTES * 8 },
    await encryptionKey(),
    encoder.encode(secret),
  ))
  const encrypted = encryptedWithTag.slice(0, -AUTH_TAG_BYTES)
  const tag = encryptedWithTag.slice(-AUTH_TAG_BYTES)
  return [ENCRYPTION_PREFIX, base64UrlEncode(iv), base64UrlEncode(tag), base64UrlEncode(encrypted)].join(".")
}

async function decryptSecret(value: string) {
  const [prefix, ivValue, tagValue, encryptedValue] = value.split(".")
  if (prefix !== ENCRYPTION_PREFIX || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid two-factor secret format.")
  }

  const iv = base64UrlDecode(ivValue)
  const tag = base64UrlDecode(tagValue)
  const encrypted = base64UrlDecode(encryptedValue)
  if (iv.length !== 12 || tag.length !== AUTH_TAG_BYTES) throw new Error("Invalid two-factor secret format.")

  const combined = new Uint8Array(encrypted.length + tag.length)
  combined.set(encrypted)
  combined.set(tag, encrypted.length)
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: AUTH_TAG_BYTES * 8 },
    await encryptionKey(),
    combined,
  )
  return decoder.decode(decrypted)
}

function normalizeCode(code: string) {
  return code.trim()
}

async function verifyStoredCode(userId: string, code: string, requireEnabled = true) {
  const record = await findTwoFactorRecord(userId)
  if (!record || (requireEnabled && record.enabled !== 1)) return false

  try {
    const result = await verify({
      secret: await decryptSecret(record.secret),
      token: normalizeCode(code),
      epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
    })
    return result.valid
  } catch {
    return false
  }
}

async function verifySuperAdminCode(code: string) {
  const config = getSuperAdminTwoFactorConfig()
  if (!config.enabled || !config.secret) return false

  try {
    const result = await verify({
      secret: config.secret,
      token: normalizeCode(code),
      epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
    })
    return result.valid
  } catch {
    return false
  }
}

export async function isTwoFactorEnabled(userId: string) {
  if (isSuperAdminUserId(userId)) return getSuperAdminTwoFactorConfig().enabled
  const record = await findTwoFactorRecord(userId)
  return record?.enabled === 1
}

export async function getTwoFactorStatus(userId: string) {
  return { enabled: await isTwoFactorEnabled(userId) }
}

export async function beginTwoFactorSetup(userId: string): Promise<ServiceResult<{ secret: string; otpauthUrl: string }>> {
  if (isSuperAdminUserId(userId)) {
    const config = getSuperAdminTwoFactorConfig()
    if (config.enabled) return serviceConflict("twoFactor", "Super Admin two-factor authentication is already enabled.")
    return serviceValidation("Configure ADMIN_2FA_ENABLED=true and ADMIN_2FA_SECRET, then update the Worker secret.")
  }

  const user = await findSafeUserByIdRecord(userId)
  if (!user) return serviceNotFound("User")

  const existing = await findTwoFactorRecord(userId)
  if (existing?.enabled === 1) return serviceConflict("twoFactor", "Two-factor authentication is already enabled.")

  const secret = generateSecret()
  await saveTwoFactorSetup(userId, await encryptSecret(secret), getCurrentTimestamp())

  return serviceSuccess({
    secret,
    otpauthUrl: generateURI({ issuer: TWO_FACTOR_ISSUER, label: user.email, secret }),
  }, "Two-factor setup started.")
}

export async function confirmTwoFactorSetup(
  userId: string,
  code: string,
): Promise<ServiceResult<{ enabled: true }>> {
  if (isSuperAdminUserId(userId)) {
    return serviceValidation("Super Admin two-factor authentication is managed by ADMIN_2FA_ENABLED and ADMIN_2FA_SECRET.")
  }

  const record = await findTwoFactorRecord(userId)
  if (!record) return serviceValidation("Start two-factor setup before enabling it.")
  if (record.enabled === 1) return serviceConflict("twoFactor", "Two-factor authentication is already enabled.")
  if (!(await verifyStoredCode(userId, code, false))) return serviceValidation("Invalid authenticator code.")

  await enableTwoFactor(userId, getCurrentTimestamp())
  await deleteRefreshSessionsForUser(userId)
  return serviceSuccess({ enabled: true }, "Two-factor authentication enabled.")
}

async function verifyCurrentPassword(userId: string, password: string) {
  if (isSuperAdminUserId(userId)) {
    const credentials = getAdminCredentials()
    return Boolean(await authenticateSuperAdmin(credentials.email, password))
  }

  const user = await findUserByIdRecord(userId)
  return user ? verifyPassword(password, user.password) : false
}

export async function disableTwoFactor(
  userId: string,
  password: string,
  code: string,
): Promise<ServiceResult<{ enabled: false }>> {
  if (isSuperAdminUserId(userId)) {
    return serviceValidation("Super Admin two-factor authentication is managed by ADMIN_2FA_ENABLED and ADMIN_2FA_SECRET.")
  }

  const record = await findTwoFactorRecord(userId)
  if (!record || record.enabled !== 1) return serviceValidation("Two-factor authentication is not enabled.")
  if (!(await verifyCurrentPassword(userId, password))) return serviceValidation("Current password is invalid.")
  if (!(await verifyStoredCode(userId, code))) return serviceValidation("Invalid authenticator code.")

  await deleteTwoFactorRecord(userId)
  await deleteRefreshSessionsForUser(userId)
  return serviceSuccess({ enabled: false }, "Two-factor authentication disabled.")
}

export async function verifyTwoFactorCode(userId: string, code: string) {
  if (isSuperAdminUserId(userId)) return verifySuperAdminCode(code)
  return verifyStoredCode(userId, code)
}
