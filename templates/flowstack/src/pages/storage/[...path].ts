import { getStorageObject } from "@zbeaver/beaver-cf/server"
import type { R2ObjectBody } from "@cloudflare/workers-types"

export const prerender = false

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
}

function contentType(filePath: string) {
  const extension = filePath.split(".").at(-1)?.toLowerCase() ?? ""
  return CONTENT_TYPES[extension] ?? "application/octet-stream"
}

function streamR2Body(body: R2ObjectBody["body"]): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  return new globalThis.ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await reader.read()
      if (result.done) {
        controller.close()
        return
      }
      controller.enqueue(result.value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

async function serveStorageFile(path: string | undefined, method: "GET" | "HEAD") {
  if (!path) return new Response("Not Found", { status: 404 })

  try {
    const object = await getStorageObject(path)
    if (!object) return new Response("Not Found", { status: 404 })

    const headers = new Headers({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(object.size),
      "Content-Type": object.httpMetadata?.contentType ?? contentType(path),
      "Cross-Origin-Resource-Policy": "same-site",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ETag: object.httpEtag,
    })
    if (object.httpMetadata?.cacheControl) headers.set("Cache-Control", object.httpMetadata.cacheControl)
    if (headers.get("Content-Type") === "application/pdf") {
      headers.set("Content-Security-Policy", "default-src 'none'; sandbox")
    }
    return new Response(method === "HEAD" ? null : streamR2Body(object.body), { headers })
  } catch {
    return new Response("Not Found", { status: 404 })
  }
}

export const GET = ({ params }: { params: { path?: string } }) => serveStorageFile(params.path, "GET")
export const HEAD = ({ params }: { params: { path?: string } }) => serveStorageFile(params.path, "HEAD")
