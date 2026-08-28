import type { contactSubmissions } from "@zbeaver/beaver/app/db/schema"

export type ContactSubmissionRecord = typeof contactSubmissions.$inferSelect
