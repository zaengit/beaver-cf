# @zaengit/beaver-cf

Cloudflare Workers-native CMS runtime: admin panel, Hono API, public-content
queries, and reusable React UI for Astro sites.

This package is edge-only. It uses Cloudflare bindings and Web APIs at runtime;
it does not support Node servers, local filesystem storage, MySQL/PostgreSQL,
S3, SMTP, or email delivery.

[![GitHub package](https://img.shields.io/badge/package-GitHub%20Packages-181717?logo=github)](https://github.com/zaengit/beaver-cf/packages)
[![license](https://img.shields.io/github/license/zaengit/beaver-cf)](./LICENSE)

## Runtime contract

- Database: D1 through `drizzle-orm/d1`.
- Media: R2 through the `MEDIA` binding.
- Public-data cache: KV through the optional `CACHE` binding, with D1 fallback.
- Rate limiting: Cloudflare Rate Limiting bindings (`RATE_LIMITER`, plus the
  auth, media, and contact-specific bindings).
- Authentication and crypto: Web Crypto PBKDF2, AES-GCM, SHA-256, and secure
  random values.
- Images: optimized in the browser before upload; the server accepts at most
  500 KiB per media upload.
- Contact form: validated inquiries are stored in D1. No email is sent.

The request must be wrapped in `withBeaverRuntime()` before calling the API or
server-side public helpers. The generated Worker and Astro middleware already
do this.

## Cloudflare project setup

Configure the host application with Cloudflare's Workers adapter, bindings, and
local environment values described below. Use
[wrangler.jsonc](./templates/config/wrangler.jsonc) and [the D1 migration](./migrations/d1/0000_initial.sql)
as reference configuration.

## Manual Astro integration

Install the package and Cloudflare adapter in the host application:

```bash
npm install @zaengit/beaver-cf @astrojs/cloudflare @astrojs/react wrangler
```

Use the Workers adapter in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config"
import cloudflare from "@astrojs/cloudflare"
import react from "@astrojs/react"

export default defineConfig({
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [react()],
})
```

Forward the API from an Astro route. The generated middleware wraps the request
with the Cloudflare runtime before this route executes:

```ts
import { apiApp } from "@zaengit/beaver-cf/server"

export const ALL = ({ request }: { request: Request }) => apiApp.fetch(request)
```

For a custom Worker entrypoint, pass bindings directly:

```ts
import type { ExecutionContext } from "@cloudflare/workers-types"
import { apiApp, withBeaverRuntime, type CloudflareEnv } from "@zaengit/beaver-cf/server"

export default {
  fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    return withBeaverRuntime(env, () => apiApp.fetch(request, env, ctx))
  },
}
```

The package keeps request-scoped bindings with Workers' AsyncLocalStorage
compatibility API. Add `"nodejs_als"` to `compatibility_flags`; the generated
Wrangler configuration already includes it.

Register the host's compiled content-type registry once at Worker startup:

```ts
import registry from "./components/content-type-templates/registry.json"
import { setContentTypeRegistry } from "@zaengit/beaver-cf/server"

setContentTypeRegistry(registry)
```

## Cloudflare bindings

The required bindings are:

| Binding | Cloudflare resource | Purpose |
| --- | --- | --- |
| `DB` | D1 | CMS data and contact inquiries |
| `MEDIA` | R2 bucket | Uploaded media |
| `CACHE` | KV namespace | Public-data cache generations and entries |
| `RATE_LIMITER` | Rate Limiting namespace | General API protection |
| `AUTH_RATE_LIMITER` | Rate Limiting namespace | Login and auth protection |
| `MEDIA_RATE_LIMITER` | Rate Limiting namespace | Upload protection |
| `CONTACT_RATE_LIMITER` | Rate Limiting namespace | Inquiry-form protection |

`CACHE` and the rate-limit bindings have safe local fallbacks for tests and
local tooling, but production deployments should configure all bindings.

Resource names in the generated Wrangler file are based on the project name.
Rate-limit namespace IDs must be unique positive IDs in the target Cloudflare
account. Wrangler can provision resources when the account and configuration
permit it; otherwise replace the placeholders with your account resource IDs.

Apply migrations with Wrangler:

```bash
wrangler d1 migrations apply DB --local
wrangler d1 migrations apply DB --remote
```

## Secrets and environment variables

Use `.dev.vars` locally and Wrangler secrets in deployed environments. Never
commit either file with real values.

```dotenv
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=use-a-long-password
ADMIN_NAME=Super Admin
SESSION_SECRET=at-least-32-random-characters
ADMIN_JWT_ACCESS_SECRET=at-least-32-random-characters
ADMIN_JWT_REFRESH_SECRET=at-least-32-random-characters
ADMIN_2FA_ENABLED=false
# ADMIN_2FA_SECRET=base32-secret-when-2fa-is-enabled
PASSWORD_HASH_ITERATIONS=120000
PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
CONTACT_TURNSTILE_REQUIRED=false
```

Optional runtime variables include `TRUST_PROXY`,
`PUBLIC_CACHE_TTL_SECONDS`, `BEAVER_WORKER_BATCH_SIZE`, and
`BEAVER_ACTIVITY_LOG_RETENTION_DAYS`. The generated project stores non-secret
runtime values in `wrangler.jsonc` and local secrets in `.dev.vars`.

## Public server APIs

All server APIs must run inside a request runtime:

```ts
import {
  getPublishedPostByType,
  getSiteSettings,
  withBeaverRuntime,
} from "@zaengit/beaver-cf/server"

const result = await withBeaverRuntime(env, async () => {
  const post = await getPublishedPostByType("page", "home")
  const settings = await getSiteSettings()
  return { post, settings }
})
```

Available helpers include:

- `getPublishedPostByType`
- `listPublishedPostsByType`
- `listPublishedPostsByTag`
- `searchPublishedPosts`
- `getPublishedArchiveFilterOptions`
- `getPublicCustomFieldFiltersFromSearchParams`
- `getMenuTree`
- `getSiteSettings`
- `sanitizeHtml`

The result APIs return only published public content. The admin API is exposed
through `apiApp` and the generated `/api/[...path]` route.

## Storage API

Media objects are always written to R2:

```ts
import {
  deleteStorageFile,
  getStorageObject,
  writeStorageFile,
} from "@zaengit/beaver-cf/server"

await writeStorageFile("images/hero.webp", bytes, {
  contentType: "image/webp",
  cacheControl: "public, max-age=31536000, immutable",
})

const object = await getStorageObject("images/hero.webp")
if (object) return new Response(object.body)

await deleteStorageFile("images/hero.webp")
```

The UI upload zone performs client-side image resizing and encoding before
uploading. Non-image files must already be no larger than 500 KiB.

## Scheduling

The Worker exposes a scheduled handler that runs
`runSchedulingWorkerCycle()` from the configured cron trigger. It publishes due
posts, records activity, invalidates the KV-backed public cache, and purges
expired activity logs. No separate Node worker process is required.

## Development checks

From this package repository:

```bash
npm run build
npx tsc --noEmit
```

The package is published to GitHub Packages as `@zaengit/beaver-cf`.

For local installation, configure the GitHub Packages registry for the scope:

```ini
@zaengit:registry=https://npm.pkg.github.com
```
