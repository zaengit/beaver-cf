import { getServerContentTypeRegistry } from "@zbeaver/beaver/app/registry/server-content-types"

const BUILT_IN_CONTENT_TYPES = [
  { slug: "post", name: "post" },
  { slug: "page", name: "page" },
] as const

interface SeedContentType {
  slug: string
  name: string
}

export interface PermissionDefinition {
  slug: string
  name: string
  group: string
}

function loadRegistryContentTypes(): SeedContentType[] {
  return getServerContentTypeRegistry().contentTypes.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : ""
    if (!slug) return []
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : slug
    return [{ slug, name }]
  })
}

function getContentTypes(): SeedContentType[] {
  const seen = new Set<string>()
  return [...BUILT_IN_CONTENT_TYPES, ...loadRegistryContentTypes()].filter((contentType) => {
    if (seen.has(contentType.slug)) return false
    seen.add(contentType.slug)
    return true
  })
}

function contentTypePermissions(contentType: SeedContentType): PermissionDefinition[] {
  const { name, slug } = contentType
  return [
    { slug: `content.${slug}.view`, name: `View ${name} content`, group: slug },
    { slug: `content.${slug}.create`, name: `Create ${name} content`, group: slug },
    { slug: `content.${slug}.edit`, name: `Edit any ${name} content`, group: slug },
    { slug: `content.${slug}.edit-own`, name: `Edit own ${name} content`, group: slug },
    { slug: `content.${slug}.delete`, name: `Delete ${name} content`, group: slug },
    { slug: `content.${slug}.delete-own`, name: `Delete own ${name} content`, group: slug },
    { slug: `content.${slug}.publish`, name: `Publish ${name} content`, group: slug },
    { slug: `content.${slug}.publish-own`, name: `Publish own ${name} content`, group: slug },
    { slug: `content.${slug}.unpublish`, name: `Unpublish ${name} content`, group: slug },
    { slug: `content.${slug}.unpublish-own`, name: `Unpublish own ${name} content`, group: slug },
    { slug: `category.${slug}.view`, name: `View ${name} categories`, group: slug },
    { slug: `category.${slug}.manage`, name: `Manage ${name} categories`, group: slug },
    { slug: `category.${slug}.publish`, name: `Publish ${name} categories`, group: slug },
    { slug: `category.${slug}.unpublish`, name: `Unpublish ${name} categories`, group: slug },
  ]
}

export function getPermissionDefinitions(): PermissionDefinition[] {
  return [
    ...getContentTypes().flatMap(contentTypePermissions),
    { slug: "dashboard.view", name: "View dashboard statistics", group: "dashboard" },
    { slug: "media.view", name: "View media library", group: "media" },
    { slug: "media.upload", name: "Upload new media", group: "media" },
    { slug: "media.edit", name: "Edit media metadata", group: "media" },
    { slug: "media.delete", name: "Delete media files", group: "media" },
    { slug: "menus.view", name: "View menus", group: "menus" },
    { slug: "menus.create", name: "Create menus", group: "menus" },
    { slug: "menus.edit", name: "Edit menus", group: "menus" },
    { slug: "menus.manage", name: "Manage menus", group: "menus" },
    { slug: "menus.delete", name: "Delete menus", group: "menus" },
    { slug: "menus.publish", name: "Publish menus", group: "menus" },
    { slug: "menus.unpublish", name: "Unpublish menus", group: "menus" },
    { slug: "users.view", name: "View users list", group: "users" },
    { slug: "users.create", name: "Create new users", group: "users" },
    { slug: "users.edit", name: "Edit user profiles", group: "users" },
    { slug: "users.delete", name: "Delete users", group: "users" },
    { slug: "users.manage", name: "Manage users and credentials", group: "users" },
    { slug: "contact-submissions.view", name: "View contact submissions", group: "contact-submissions" },
    { slug: "contact-submissions.delete", name: "Delete contact submissions", group: "contact-submissions" },
    { slug: "activity-log.view", name: "View activity log", group: "activity-log" },
    { slug: "settings.manage", name: "Manage system settings", group: "settings" },
  ]
}

export function isContentPermissionSlug(slug: string) {
  return slug.startsWith("content.") || slug.startsWith("category.")
}
