import type { AdminRoute } from "@zbeaver/beaver/router/route"

import { handleListContactSubmissions } from "@zbeaver/beaver/app/handlers"

function positiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

export const GET: AdminRoute = async ({ request, locals }) => {
  const url = new URL(request.url)
  return handleListContactSubmissions(
    locals.session as { user: { id: string } } | null,
    {
      page: positiveInteger(url.searchParams.get("page")),
      perPage: positiveInteger(url.searchParams.get("perPage")),
      search: url.searchParams.get("search")?.slice(0, 100) || undefined,
    },
  )
}
