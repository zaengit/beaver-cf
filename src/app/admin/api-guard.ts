import type { AstroLikeCookies } from "@zbeaver/beaver/app/http/request-context"
import { findSafeUserByIdRecord } from "@zbeaver/beaver/app/repositories/users"
import { getUserPermissions } from "@zbeaver/beaver/app/admin/permissions"
import {
  buildAdminAccessCookieOptions,
  buildAdminRefreshCookieOptions,
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  readAdminAccessToken,
  readAdminRefreshToken,
} from "@zbeaver/beaver/app/admin/auth-cookies"
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "@zbeaver/beaver/app/admin/jwt"
import { consumeRefreshSession, findActiveRefreshSession, getRefreshSessionExpiry, saveRefreshSession } from "@zbeaver/beaver/app/admin/session-store"
import { generateId } from "@zbeaver/beaver/pkg/utils/id"
import { getSafeSuperAdminUser, isSuperAdminUserId } from "@zbeaver/beaver/app/admin/super-admin"
import { isTwoFactorEnabled } from "@zbeaver/beaver/app/services/two-factor"

async function resolveAdminUser(userId: string) {
  if (isSuperAdminUserId(userId)) return getSafeSuperAdminUser()
  return await findSafeUserByIdRecord(userId)
}

export async function getAdminSession(cookies: AstroLikeCookies) {
  const access = readAdminAccessToken(cookies)
  if (!access) return null

  try {
    const payload = await verifyAccessToken(access)
    if (typeof payload.sessionId !== "string") return null

    const stored = await findActiveRefreshSession(payload.sessionId)
    if (!stored || stored.userId !== payload.sub) return null

    const user = await resolveAdminUser(payload.sub)
    if (!user) return null
    if (payload.email !== user.email || payload.role !== user.role) return null

    const twoFactorEnabled = await isTwoFactorEnabled(user.id)
    if (twoFactorEnabled && payload.twoFactorVerified !== true) return null
    return {
      user,
      permissions: await getUserPermissions(user.id),
      twoFactorEnabled,
    }
  } catch {
    return null
  }
}

export async function refreshAdminSession(cookies: AstroLikeCookies) {
  const refresh = readAdminRefreshToken(cookies)
  if (!refresh) return null

  try {
    const payload = await verifyRefreshToken(refresh)
    const stored = await consumeRefreshSession(payload.sessionId)
    if (!stored || stored.userId !== payload.sub) return null

    const user = await resolveAdminUser(payload.sub)
    if (!user) return null
    if (payload.email !== undefined && payload.email !== user.email) return null

    const twoFactorEnabled = await isTwoFactorEnabled(user.id)
    if (twoFactorEnabled && payload.twoFactorVerified !== true) return null
    const permissions = await getUserPermissions(user.id)
    const nextSessionId = generateId()
    const nextAccess = await signAccessToken({
      sub: user.id,
      sessionId: nextSessionId,
      email: user.email,
      role: user.role,
      permissions,
      twoFactorVerified: payload.twoFactorVerified === true,
    })
    const nextRefresh = await signRefreshToken({
      sub: user.id,
      sessionId: nextSessionId,
      email: user.email,
      twoFactorVerified: payload.twoFactorVerified === true,
    })

    await saveRefreshSession(nextSessionId, user.id, getRefreshSessionExpiry())
    cookies.set(ADMIN_ACCESS_COOKIE, nextAccess, buildAdminAccessCookieOptions())
    cookies.set(ADMIN_REFRESH_COOKIE, nextRefresh, buildAdminRefreshCookieOptions())

    return { user, permissions, twoFactorEnabled }
  } catch {
    return null
  }
}
