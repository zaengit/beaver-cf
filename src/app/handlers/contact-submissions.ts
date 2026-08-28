import { adminError, adminSuccess } from "@zbeaver/beaver/app/admin/api-response"
import { requirePermission } from "@zbeaver/beaver/app/handlers/guard"
import type { Session } from "@zbeaver/beaver/app/handlers/types"
import { parseBulkIds } from "@zbeaver/beaver/app/handlers/utils"
import type { ContactSubmissionFilters } from "@zbeaver/beaver/app/models/contact-submission"
import {
  deleteContactSubmissions,
  getContactSubmission,
  listContactSubmissions,
} from "@zbeaver/beaver/app/services/contact-submissions"

const CONTACT_SUBMISSIONS_PERMISSION = "contact-submissions.view"

export async function handleListContactSubmissions(session: Session, filters: ContactSubmissionFilters = {}) {
  const permission = await requirePermission(session, CONTACT_SUBMISSIONS_PERMISSION)
  if (permission) return permission

  try {
    const result = await listContactSubmissions(filters)
    return result.success
      ? adminSuccess(result.data, result.message)
      : adminError(result.error.message, 500)
  } catch (error) {
    console.error("Contact submission list failed", error)
    return adminError("Contact submissions could not be loaded.", 500)
  }
}

export async function handleGetContactSubmission(session: Session, id: string) {
  const permission = await requirePermission(session, CONTACT_SUBMISSIONS_PERMISSION)
  if (permission) return permission
  if (!id) return adminError("Contact submission id is required.", 400)

  try {
    const result = await getContactSubmission(id)
    return result.success
      ? adminSuccess(result.data, result.message)
      : adminError(result.error.message, 404)
  } catch (error) {
    console.error("Contact submission detail failed", error)
    return adminError("Contact submission could not be loaded.", 500)
  }
}

export async function handleBulkDeleteContactSubmissions(session: Session, input: unknown) {
  const permission = await requirePermission(session, "contact-submissions.delete")
  if (permission) return permission

  const parsedIds = parseBulkIds(input)
  if (!parsedIds.success) return adminError(parsedIds.message, 400)

  try {
    const result = await deleteContactSubmissions(parsedIds.ids)
    return result.success
      ? adminSuccess(result.data, result.message)
      : adminError(result.error.message, 500)
  } catch (error) {
    console.error("Contact submission bulk delete failed", error)
    return adminError("Contact submissions could not be deleted.", 500)
  }
}
