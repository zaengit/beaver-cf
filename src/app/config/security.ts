import { getRuntimeEnvValue } from "@zbeaver/beaver/app/runtime"

const SECRET_NAMES = ["SESSION_SECRET", "ADMIN_JWT_ACCESS_SECRET", "ADMIN_JWT_REFRESH_SECRET"] as const
const PLACEHOLDER_VALUES = new Set([
  "change-me",
  "change-this-password",
  "admin@example.com",
  "password123",
])
const BASE32_TOTP_SECRET_PATTERN = /^[A-Z2-7]+=*$/
const MIN_TOTP_SECRET_LENGTH = 26

export type SuperAdminTwoFactorConfig = {
  enabled: boolean
  secret: string | null
}

export function isTestEnvironment() {
  return getRuntimeEnvValue("NODE_ENV") === "test"
    || getRuntimeEnvValue("BEAVER_TEST_MODE") === "true"
}

export function assertSecureSecrets() {
  if (isTestEnvironment()) return

  for (const name of SECRET_NAMES) {
    const value = getRuntimeEnvValue(name)
    if (!value || value.length < 32 || value.length > 4096 || PLACEHOLDER_VALUES.has(value)) {
      throw new Error(`${name} must be set to a random value of at least 32 characters.`)
    }
  }
}

export function assertSecureAdminEnvironment() {
  if (isTestEnvironment()) return

  assertSecureSecrets()

  const email = getRuntimeEnvValue("ADMIN_EMAIL")
  const password = getRuntimeEnvValue("ADMIN_PASSWORD")
  const name = getRuntimeEnvValue("ADMIN_NAME")
  if (!email || email.length > 254 || !/^.+@.+\..+$/.test(email) || !password || password.length < 12 || password.length > 128 || !name || name.length > 100) {
    throw new Error("Super Admin requires ADMIN_EMAIL, ADMIN_NAME, and an ADMIN_PASSWORD of at least 12 characters.")
  }
  if (PLACEHOLDER_VALUES.has(email) || PLACEHOLDER_VALUES.has(password)) {
    throw new Error("Super Admin does not allow placeholder administrator credentials.")
  }

  getSuperAdminTwoFactorConfig()
}

export function getAdminCredentials() {
  if (isTestEnvironment()) {
    return {
      email: getRuntimeEnvValue("ADMIN_EMAIL") || "admin@example.com",
      password: getRuntimeEnvValue("ADMIN_PASSWORD") || "password123",
      name: getRuntimeEnvValue("ADMIN_NAME") || "Super Admin",
    }
  }

  assertSecureAdminEnvironment()
  return {
    email: getRuntimeEnvValue("ADMIN_EMAIL")!,
    password: getRuntimeEnvValue("ADMIN_PASSWORD")!,
    name: getRuntimeEnvValue("ADMIN_NAME")!,
  }
}

/**
 * Super Admin TOTP is environment-managed because the identity is not a D1
 * user record. Presence alone does not enable 2FA.
 */
export function getSuperAdminTwoFactorConfig(): SuperAdminTwoFactorConfig {
  const rawEnabled = getRuntimeEnvValue("ADMIN_2FA_ENABLED")?.toLowerCase()
  if (rawEnabled && rawEnabled !== "true" && rawEnabled !== "false") {
    throw new Error("ADMIN_2FA_ENABLED must be either true or false.")
  }

  const enabled = rawEnabled === "true"
  if (!enabled) return { enabled: false, secret: null }

  const secret = getRuntimeEnvValue("ADMIN_2FA_SECRET")
    ?.replace(/\s+/g, "")
    .toUpperCase()

  if (!secret || secret.length < MIN_TOTP_SECRET_LENGTH || !BASE32_TOTP_SECRET_PATTERN.test(secret)) {
    throw new Error("ADMIN_2FA_SECRET must be a valid Base32 TOTP secret of at least 26 characters when ADMIN_2FA_ENABLED=true.")
  }

  return { enabled: true, secret }
}
