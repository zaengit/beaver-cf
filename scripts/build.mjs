import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
import packageJson from "../package.json" with { type: "json" };

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(packageRoot, "src");
const distRoot = resolve(packageRoot, "dist");
const externalPackages = [
  ...Object.keys(packageJson.dependencies),
  ...Object.keys(packageJson.peerDependencies),
];
const external = (id) =>
  id.startsWith("node:") ||
  externalPackages.some(
    (dependency) => id === dependency || id.startsWith(`${dependency}/`),
  );

const sharedConfig = {
  configFile: false,
  root: packageRoot,
  resolve: {
    alias: {
      "@zbeaver/beaver": sourceRoot,
      "@content-type-registry": resolve(
        sourceRoot,
        "registry/content-types.json",
      ),
      "@menu-group-registry": resolve(sourceRoot, "registry/menu-groups.json"),
      "@section-registry": resolve(sourceRoot, "registry/sections.json"),
    },
  },
};

async function bundle(name, emptyOutDir) {
  const entry = resolve(sourceRoot, `${name}.ts`);
  await build({
    ...sharedConfig,
    build: {
      emptyOutDir,
      outDir: distRoot,
      ...(name === "server"
        ? { ssr: entry }
        : { lib: { entry, formats: ["es"], fileName: () => `${name}.js` } }),
      rollupOptions: {
        external,
        output: { entryFileNames: `${name}.js`, inlineDynamicImports: true },
      },
    },
  });
}

async function bundleStyleCss() {
  const cssBuildRoot = resolve(distRoot, ".style-css-build");
  await build({
    ...sharedConfig,
    plugins: [tailwindcss()],
    build: {
      outDir: cssBuildRoot,
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(sourceRoot, "ui/style.css"),
        output: { assetFileNames: "style.css" },
      },
    },
  });
  await cp(
    resolve(cssBuildRoot, "style.css"),
    resolve(distRoot, "ui/style.css"),
  );
  await rm(cssBuildRoot, { recursive: true, force: true });
}

await rm(distRoot, { recursive: true, force: true });
await bundle("server", true);
await bundle("ui", false);

await Promise.all([
  mkdir(resolve(distRoot, "ui"), { recursive: true }),
]);
await Promise.all([
  cp(resolve(sourceRoot, "registry"), resolve(distRoot, "registry"), {
    recursive: true,
  }),
]);
await bundleStyleCss();

await Promise.all(
  ["d1"].map((dialect) =>
    cp(
      resolve(packageRoot, "migrations", dialect),
      resolve(distRoot, "migrations", dialect),
      { recursive: true },
    ),
  ),
);

const serverDeclaration = [
  'export declare const apiApp: import("hono").Hono',
  "type BeaverServiceResult<T> =",
  "  | { success: true; data: T; message: string }",
  "  | { success: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } }",
  "interface BeaverPaginationMeta {",
  "  currentPage: number",
  "  perPage: number",
  "  total: number",
  "  lastPage: number",
  "  from: number",
  "  to: number",
  "}",
  "interface BeaverPaginatedResult<T> {",
  "  data: T[]",
  "  meta: BeaverPaginationMeta",
  "}",
  "interface BeaverPost {",
  "  id: string",
  "  title: string",
  "  slug: string",
  "  type: string",
  "  status: string",
  "  excerpt: string | null",
  "  description: string | null",
  "  tags: string | null",
  "  sections: string | null",
  "  customFieldValues: string | null",
  "  metaTitle: string | null",
  "  metaDescription: string | null",
  "  featuredImage: string | null",
  "  gallery: string | null",
  "  authorId: string",
  "  publishedAt: number | null",
  "  createdAt: number",
  "  updatedAt: number",
  "}",
  "interface BeaverPublicPost {",
  "  id: string",
  "  title: string",
  "  slug: string",
  "  type: string",
  "  excerpt: string | null",
  "  featuredImage: string | null",
  "  gallery: string[] | null",
  "  publishedAt: number | null",
  "  authorName: string | null",
  "}",
  "interface BeaverArchiveFilters {",
  "  search?: string",
  "  category?: string",
  "  tag?: string",
  "  customFields?: Record<string, string>",
  '  sortBy?: "title" | "created_at"',
  '  sortOrder?: "asc" | "desc"',
  "}",
  "interface BeaverArchiveFilterOptions {",
  "  categories: { name: string; slug: string }[]",
  "  tags: string[]",
  '  customFields: { name: string; label: string; type: "text" | "number" | "boolean" | "select" | "date"; options: string[] }[]',
  "}",
  "export declare const getPublishedPostByType: (type: string, slug: string) => Promise<BeaverServiceResult<BeaverPost & { authorName: string | null }>>",
  "export declare const getPublishedArchiveFilterOptions: (type: string) => Promise<BeaverServiceResult<BeaverArchiveFilterOptions>>",
  "export declare const getPublicCustomFieldFiltersFromSearchParams: (type: string, searchParams: URLSearchParams) => Record<string, string>",
  "export declare const listPublishedPostsByType: (type: string, page?: number, perPage?: number, filters?: BeaverArchiveFilters) => Promise<BeaverServiceResult<BeaverPaginatedResult<BeaverPublicPost>>>",
  "export declare const listPublishedPostsByTag: (tag: string, page?: number, perPage?: number) => Promise<BeaverServiceResult<BeaverPaginatedResult<BeaverPublicPost>>>",
  "export declare const searchPublishedPosts: (query: string, page?: number, perPage?: number) => Promise<BeaverServiceResult<BeaverPaginatedResult<BeaverPublicPost>>>",
  "export declare const getMenuTree: (type?: string) => Promise<BeaverServiceResult<MenuTree[]>>",
  "export declare const sanitizeHtml: (html: string) => string",
  "interface BeaverSocialLink { platform: string; url: string; icon?: string }",
  "interface BeaverOpenHours { day: string; open: string; close: string }",
  "interface BeaverSiteSettings {",
  "  title: string",
  "  description: string",
  "  meta_title: string",
  "  meta_description: string",
  "  maintenance_mode: boolean",
  "  timezone: string",
  "  logo: string",
  "  favicon: string",
  "  links: BeaverSocialLink[]",
  "  open_hours: BeaverOpenHours[]",
  "  custom_css: string",
  "  custom_javascript: string",
  "  translate_countries: string[]",
  "}",
  "export declare const getSiteSettings: () => Promise<BeaverSiteSettings>",
  "export interface CloudflareEnv {",
  '  DB: import("@cloudflare/workers-types").D1Database',
  '  MEDIA: import("@cloudflare/workers-types").R2Bucket',
  '  CACHE?: import("@cloudflare/workers-types").KVNamespace',
  '  RATE_LIMITER?: import("@cloudflare/workers-types").RateLimit',
  '  AUTH_RATE_LIMITER?: import("@cloudflare/workers-types").RateLimit',
  '  MEDIA_RATE_LIMITER?: import("@cloudflare/workers-types").RateLimit',
  '  CONTACT_RATE_LIMITER?: import("@cloudflare/workers-types").RateLimit',
  '  ASSETS?: import("@cloudflare/workers-types").Fetcher',
  "  [key: string]: unknown",
  "}",
  "export type BeaverDatabase = import(\"drizzle-orm/d1\").DrizzleD1Database",
  "export interface BeaverRuntime { env: CloudflareEnv; db: BeaverDatabase }",
  "export declare const createBeaverRuntime: (env: CloudflareEnv) => BeaverRuntime",
  "export declare const getBeaverRuntime: () => BeaverRuntime",
  "export declare const getOptionalBeaverRuntime: () => BeaverRuntime | undefined",
  "export declare const getRuntimeEnvValue: (name: string) => string | undefined",
  "export declare const isProductionRuntime: () => boolean",
  "export declare const withBeaverRuntime: <T>(value: CloudflareEnv | BeaverRuntime, callback: () => T) => T",
  "export declare const getStorageDir: () => \"r2://MEDIA\"",
  "export declare const getStorageType: () => \"r2\"",
  "export declare const getStorageObject: (filePath: string) => Promise<import(\"@cloudflare/workers-types\").R2ObjectBody | null>",
  "export declare const writeStorageFile: (filePath: string, data: Uint8Array | ArrayBuffer | string, options?: { contentType?: string; cacheControl?: string }) => Promise<void>",
  "export declare const readStorageFile: (filePath: string) => Promise<Uint8Array | null>",
  "export declare const deleteStorageFile: (filePath: string) => Promise<boolean>",
  "export type StorageType = \"r2\"",
  "export declare const getContentTypeRegistry: () => unknown",
  "export declare const setContentTypeRegistry: (registry: unknown) => void",
  "export declare const generateSuperAdminTwoFactorSetup: (force?: boolean) => { enabled: true; secret: string; otpauthUrl: string }",
  "export interface MenuTree {",
  "  id: string",
  "  title: string",
  "  url: string",
  "  position: number",
  "  cssClass: string | null",
  "  target: string | null",
  "  image: string | null",
  "  parentId: string | null",
  "  children: MenuTree[]",
  "}",
].join(String.fromCharCode(10));
await writeFile(
  resolve(distRoot, "server.d.ts"),
  `${serverDeclaration}\nexport declare const purgeExpiredActivityLogs: () => Promise<number>\nexport declare const runSchedulingWorkerCycle: (now?: number, batchSize?: number) => Promise<{ normalized: number; published: number; activityLogs: number; activityLogFailures: number; purged: number }>\n`,
);
await writeFile(
  resolve(distRoot, "ui.d.ts"),
  `import type { ReactElement } from "react"\nexport declare function AdminApp(): ReactElement\n`,
);
