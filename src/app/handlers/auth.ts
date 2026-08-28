import { verifyPassword } from "@zbeaver/beaver/app/auth"
import { getUserByEmail } from "@zbeaver/beaver/app/services/users"
import { loginSchema } from "@zbeaver/beaver/app/validations/auth"
import {
  isRateLimitAvailable,
  isWithinRateLimit,
  resetRateLimit,
} from "@zbeaver/beaver/app/security/rate-limit"
import {
  authenticateSuperAdmin,
  isConfiguredSuperAdminEmail,
} from "@zbeaver/beaver/app/admin/super-admin"
import { isTwoFactorEnabled } from "@zbeaver/beaver/app/services/two-factor"

const DUMMY_PASSWORD_HASH = "v1$pbkdf2-sha256$120000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const LOGIN_GLOBAL_LIMIT = 100
const LOGIN_EMAIL_LIMIT = 5
const LOGIN_IP_LIMIT = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

type LoginRateLimit = { key: string; limit: number }

function loginRateLimits(email: string, clientKey: string): LoginRateLimit[] {
  return [
    { key: "login:failed:global", limit: LOGIN_GLOBAL_LIMIT },
    { key: `login:failed:email:${email}`, limit: LOGIN_EMAIL_LIMIT },
    { key: `login:failed:ip:${clientKey}`, limit: LOGIN_IP_LIMIT },
  ]
}

async function failedLogin(rateLimits: LoginRateLimit[]) {
  const available = await Promise.all(rateLimits.map(({ key, limit }) => isRateLimitAvailable(key, limit)))
  if (available.some((result) => !result)) {
    return {
      success: false as const,
      status: 429,
      message: "Too many requests. Please try again later.",
    }
  }

  for (const { key, limit } of rateLimits) {
    if (!await isWithinRateLimit(key, limit, LOGIN_WINDOW_MS)) {
      return {
        success: false as const,
        status: 429,
        message: "Too many requests. Please try again later.",
      }
    }
  }

  return {
    success: false as const,
    status: 401,
    message: "Invalid credentials.",
  }
}

async function clearLoginFailures(rateLimits: LoginRateLimit[]) {
  await Promise.all(rateLimits.map(({ key }) => resetRateLimit(key)))
}

export async function handlePasswordLogin(body: unknown, clientKey = "unknown") {
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return {
      success: false as const,
      status: 422,
      message: "Validation error.",
    }
  }

  const { email, password } = parsed.data
  const normalizedEmail = email.trim().toLowerCase()
  const rateLimits = loginRateLimits(normalizedEmail, clientKey)

  if (isConfiguredSuperAdminEmail(normalizedEmail)) {
    const superAdmin = await authenticateSuperAdmin(normalizedEmail, password)
    if (!superAdmin) {
      return failedLogin(rateLimits)
    }

    await clearLoginFailures(rateLimits)
    return {
      success: true as const,
      status: 200,
      message: "Login successful.",
      user: superAdmin,
      requiresTwoFactor: await isTwoFactorEnabled(superAdmin.id),
    }
  }

  const userResult = await getUserByEmail(email)
  const isValid = await verifyPassword(password, userResult.success ? userResult.data.password : DUMMY_PASSWORD_HASH)
  if (!userResult.success || !isValid) {
    return failedLogin(rateLimits)
  }

  const safeUser = { ...userResult.data }
  Reflect.deleteProperty(safeUser, "password")
  await clearLoginFailures(rateLimits)
  return {
    success: true as const,
    status: 200,
    message: "Login successful.",
    user: safeUser,
    requiresTwoFactor: await isTwoFactorEnabled(safeUser.id),
  }
}
