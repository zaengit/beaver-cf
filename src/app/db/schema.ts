import * as d1Schema from "./schema/sqlite"

// Beaver CF deliberately exposes one SQL dialect: SQLite through Cloudflare
// D1. Keeping the schema direct prevents unused MySQL/PostgreSQL modules from
// entering the Worker dependency graph.
export const {
  users,
  adminTwoFactor,
  adminRefreshSessions,
  passwordResetTokens,
  posts,
  menus,
  categories,
  postCategories,
  media,
  settings,
  contactSubmissions,
  activityLogs,
  usersRelations,
  postsRelations,
  categoriesRelations,
  postCategoriesRelations,
  mediaRelations,
  menusRelations,
} = d1Schema

export const schema = d1Schema
