import type { contactSubmissions } from "@zbeaver/beaver/app/db/schema"

export type ContactSubmissionRecord = typeof contactSubmissions.$inferSelect

export type ContactSubmissionListItem = Pick<
  ContactSubmissionRecord,
  "id" | "name" | "email" | "subject" | "createdAt"
>

export interface ContactSubmissionFilters {
  page?: number
  perPage?: number
  search?: string
}
