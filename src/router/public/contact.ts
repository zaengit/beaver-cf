import { z } from "zod"

import { getRuntimeEnvValue, isProductionRuntime } from "@zbeaver/beaver/app/runtime"
import { createContactSubmissionRecord } from "@zbeaver/beaver/app/repositories/contact-submissions"
import type { AdminRoute } from "@zbeaver/beaver/router/route"
import { clientAddress, isWithinRateLimit } from "@zbeaver/beaver/router/security"
import { generateId, getCurrentTimestamp } from "@zbeaver/beaver/pkg/utils/index"

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().max(200).refine((value) => !/[\r\n]/.test(value), "Subject contains invalid line breaks").optional().or(z.literal("")),
  message: z.string().trim().min(1).max(5000),
  turnstileToken: z.string().trim().min(1).max(2048).optional(),
})

async function verifyTurnstile(token: string | undefined, request: Request) {
  const secret = getRuntimeEnvValue("TURNSTILE_SECRET_KEY")
  const required = getRuntimeEnvValue("CONTACT_TURNSTILE_REQUIRED") === "true" || isProductionRuntime()
  if (!secret) return required ? "Turnstile is not configured." : null
  if (!token) return "Turnstile verification is required."

  try {
    const body = new URLSearchParams({ secret, response: token })
    const remoteIp = clientAddress(request)
    if (remoteIp !== "unknown") body.set("remoteip", remoteIp)
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    })
    const result = await response.json() as { success?: boolean }
    return result.success === true ? null : "Turnstile verification failed."
  } catch {
    return "Turnstile verification is unavailable."
  }
}

/** Store contact inquiries in D1; delivery is intentionally external to this package. */
export const POST: AdminRoute = async ({ request }) => {
  const client = clientAddress(request)
  if (!await isWithinRateLimit(`contact:${client}`, 5, 15 * 60 * 1000)) {
    return Response.json({ success: false, message: "Too many requests. Please try again later." }, { status: 429 })
  }

  const parsed = contactSchema.safeParse(await request.json())
  if (!parsed.success) return Response.json({ success: false, message: "Please complete all required fields." }, { status: 422 })

  const email = parsed.data.email.toLowerCase()
  if (!await isWithinRateLimit(`contact:email:${email}`, 3, 15 * 60 * 1000)) {
    return Response.json({ success: false, message: "Too many requests. Please try again later." }, { status: 429 })
  }

  const turnstileError = await verifyTurnstile(parsed.data.turnstileToken, request)
  if (turnstileError) {
    return Response.json(
      { success: false, message: turnstileError },
      { status: getRuntimeEnvValue("TURNSTILE_SECRET_KEY") ? 403 : 503 },
    )
  }

  const now = getCurrentTimestamp()
  await createContactSubmissionRecord({
    id: generateId(),
    name: parsed.data.name,
    email,
    subject: parsed.data.subject || null,
    message: parsed.data.message,
    ipAddress: client === "unknown" ? null : client,
    userAgent: request.headers.get("user-agent"),
    createdAt: now,
  })

  return Response.json({ success: true, message: "Message received." }, { status: 201 })
}
