import {
  deleteContactSubmissionRecords,
  findContactSubmissionByIdRecord,
  listContactSubmissionRecords,
} from "@zbeaver/beaver/app/repositories/contact-submissions"
import type {
  ContactSubmissionFilters,
  ContactSubmissionRecord,
} from "@zbeaver/beaver/app/models/contact-submission"
import type { ServiceResult } from "@zbeaver/beaver/pkg/types"
import { serviceNotFound, serviceSuccess } from "@zbeaver/beaver/app/services/utils"

export async function listContactSubmissions(filters: ContactSubmissionFilters = {}) {
  return serviceSuccess(await listContactSubmissionRecords(filters), "OK")
}

export async function getContactSubmission(id: string): Promise<ServiceResult<ContactSubmissionRecord>> {
  const submission = await findContactSubmissionByIdRecord(id)
  if (!submission) return serviceNotFound("Contact submission")
  return serviceSuccess(submission, "OK")
}

export async function deleteContactSubmissions(ids: string[]) {
  const deletedCount = await deleteContactSubmissionRecords(ids)
  return serviceSuccess({ deletedCount }, "Contact submissions deleted.")
}
