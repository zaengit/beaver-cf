import { count, desc, eq, inArray, like, or, type SQL } from "drizzle-orm"

import { db } from "@zbeaver/beaver/app/db"
import { contactSubmissions } from "@zbeaver/beaver/app/db/schema"
import { affectedRows } from "@zbeaver/beaver/app/db/query"
import type {
  ContactSubmissionFilters,
  ContactSubmissionListItem,
  ContactSubmissionRecord,
} from "@zbeaver/beaver/app/models/contact-submission"
import { clampPagination } from "@zbeaver/beaver/pkg/utils/pagination"

const MAX_FILTER_TEXT_LENGTH = 100

export async function createContactSubmissionRecord(input: ContactSubmissionRecord) {
  await db.insert(contactSubmissions).values(input).execute()
  return input
}

export async function deleteContactSubmissionRecords(ids: string[]) {
  if (ids.length === 0) return 0
  const result = await db
    .delete(contactSubmissions)
    .where(inArray(contactSubmissions.id, ids))
    .execute()
  return affectedRows(result)
}

export async function findContactSubmissionByIdRecord(id: string) {
  const rows = await db
    .select()
    .from(contactSubmissions)
    .where(eq(contactSubmissions.id, id))
    .limit(1)
    .execute()
  return rows[0] as ContactSubmissionRecord | undefined
}

export async function listContactSubmissionRecords(filters: ContactSubmissionFilters = {}) {
  const { page, perPage, offset } = clampPagination(filters)
  const search = filters.search?.trim().slice(0, MAX_FILTER_TEXT_LENGTH)
  const whereClause: SQL<unknown> | undefined = search
    ? or(
      like(contactSubmissions.name, `%${search}%`),
      like(contactSubmissions.email, `%${search}%`),
      like(contactSubmissions.subject, `%${search}%`),
      like(contactSubmissions.message, `%${search}%`),
    )
    : undefined

  const totalQuery = db.select({ value: count() }).from(contactSubmissions)
  const totalRows = whereClause
    ? await totalQuery.where(whereClause).execute()
    : await totalQuery.execute()
  const total = Number(totalRows[0]?.value ?? 0)
  const lastPage = Math.max(1, Math.ceil(total / perPage))

  const dataQuery = db.select({
    id: contactSubmissions.id,
    name: contactSubmissions.name,
    email: contactSubmissions.email,
    subject: contactSubmissions.subject,
    createdAt: contactSubmissions.createdAt,
  }).from(contactSubmissions)
  const rows = await (whereClause ? dataQuery.where(whereClause) : dataQuery)
    .orderBy(desc(contactSubmissions.createdAt), desc(contactSubmissions.id))
    .limit(perPage)
    .offset(offset)
    .execute() as ContactSubmissionListItem[]

  return {
    data: rows,
    meta: {
      currentPage: page,
      perPage,
      total,
      lastPage,
      from: total > 0 ? offset + 1 : 0,
      to: Math.min(offset + perPage, total),
    },
  }
}
