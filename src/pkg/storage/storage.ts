import type { R2ObjectBody } from "@cloudflare/workers-types"

import { getBeaverRuntime } from "@zbeaver/beaver/app/runtime"

export type StorageType = "r2"

export interface StorageWriteOptions {
  contentType?: string
  cacheControl?: string
}

function normalizeStorageKey(filePath: string): string {
  const value = filePath.trim().replace(/^\/+/, "")
  const key = value === "storage"
    ? ""
    : value.startsWith("storage/")
      ? value.slice("storage/".length)
      : value

  if (
    !key
    || key.includes("\0")
    || key.includes("\\")
    || key.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid storage file path.")
  }

  return key
}

function bucket() {
  return getBeaverRuntime().env.MEDIA
}

/** Returns a stable display value for hosts that expose storage metadata. */
export function getStorageDir() {
  return "r2://MEDIA"
}

export function getStorageType(): StorageType {
  return "r2"
}

export async function writeStorageFile(
  filePath: string,
  data: Uint8Array | ArrayBuffer | string,
  options: StorageWriteOptions = {},
): Promise<void> {
  const httpMetadata = options.contentType || options.cacheControl
    ? {
        ...(options.contentType ? { contentType: options.contentType } : {}),
        ...(options.cacheControl ? { cacheControl: options.cacheControl } : {}),
      }
    : undefined

  await bucket().put(normalizeStorageKey(filePath), data, httpMetadata ? { httpMetadata } : undefined)
}

/** Return the R2 object so HTTP callers can stream it without buffering. */
export async function getStorageObject(filePath: string): Promise<R2ObjectBody | null> {
  return await bucket().get(normalizeStorageKey(filePath))
}

export async function readStorageFile(filePath: string): Promise<Uint8Array | null> {
  const object = await getStorageObject(filePath)
  return object ? new Uint8Array(await object.arrayBuffer()) : null
}

export async function deleteStorageFile(filePath: string): Promise<boolean> {
  await bucket().delete(normalizeStorageKey(filePath))
  return true
}
