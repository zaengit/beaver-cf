import type { AdminRoute } from "@zbeaver/beaver/router/route"

import { handleGetContactSubmission } from "@zbeaver/beaver/app/handlers"

export const GET: AdminRoute = async ({ params, locals }) => {
  return handleGetContactSubmission(
    locals.session as { user: { id: string } } | null,
    params.id ?? "",
  )
}
