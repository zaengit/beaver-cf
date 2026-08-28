import type { AdminRoute } from "@zbeaver/beaver/router/route"

import { handleBulkDeleteContactSubmissions } from "@zbeaver/beaver/app/handlers"

export const POST: AdminRoute = async ({ request, locals }) => {
  const body = await request.json() as unknown
  const ids = body !== null && typeof body === "object" && !Array.isArray(body)
    ? Reflect.get(body, "ids")
    : undefined

  return handleBulkDeleteContactSubmissions(
    locals.session as { user: { id: string } } | null,
    ids,
  )
}
