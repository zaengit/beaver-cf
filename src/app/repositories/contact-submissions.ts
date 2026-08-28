import { db } from "@zbeaver/beaver/app/db"
import { contactSubmissions } from "@zbeaver/beaver/app/db/schema"
import type { ContactSubmissionRecord } from "@zbeaver/beaver/app/models/contact-submission"

export async function createContactSubmissionRecord(input: ContactSubmissionRecord) {
  await db.insert(contactSubmissions).values(input).execute()
  return input
}
