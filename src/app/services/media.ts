import { generateId, getCurrentTimestamp } from "@zbeaver/beaver/pkg/utils/index"
import type { UpdateMediaInput, UploadMediaInput } from "@zbeaver/beaver/app/validations/media"
import {
  findMediaByIdRecord,
  listMediaRecords,
  createMediaRecord as repoCreateMedia,
  updateMediaRecord,
  deleteMediaRecord,
  type MediaRow,
} from "@zbeaver/beaver/app/repositories/media"
import type { ServiceResult } from "@zbeaver/beaver/pkg/types"
import { serviceSuccess, serviceNotFound } from "@zbeaver/beaver/app/services/utils"
import {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  generateMediaPath,
  getExtensionFromMimeType,
} from "@zbeaver/beaver/pkg/media/media"
import { writeStorageFile } from "@zbeaver/beaver/pkg/storage/storage"

// ─── Helpers ───────────────────────────────────────────────────────────────────

function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024}KB` }
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { valid: false, error: `File type "${file.type}" is not allowed` }
  }
  return { valid: true }
}

function hasBytes(buffer: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => buffer[offset + index] === value)
}

function hasAscii(buffer: Uint8Array, offset: number, expected: string) {
  return [...expected].every((value, index) => buffer[offset + index] === value.charCodeAt(0))
}

function validateFileContents(buffer: Uint8Array, mimeType: string): { valid: boolean; error?: string } {
  const hasSignature =
    mimeType === "image/jpeg" && hasBytes(buffer, 0, [0xff, 0xd8, 0xff])
    || mimeType === "image/png" && hasBytes(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    || mimeType === "image/gif" && hasAscii(buffer, 0, "GIF8")
    || mimeType === "image/webp" && hasAscii(buffer, 0, "RIFF") && hasAscii(buffer, 8, "WEBP")
    || mimeType === "application/pdf" && hasAscii(buffer, 0, "%PDF-")
    || mimeType === "video/mp4" && hasAscii(buffer, 4, "ftyp")
    || mimeType === "audio/mpeg" && (hasAscii(buffer, 0, "ID3") || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))

  if (!hasSignature) return { valid: false, error: "The uploaded file content does not match its type." }

  return { valid: true }
}

// ─── List Media ─────────────────────────────────────────────────────────────

export async function listMediaService(filters: {
  page?: number
  perPage?: number
  search?: string
  folder?: string | null
  mimeType?: string
} = {}): Promise<ServiceResult<unknown>> {
  const result = await listMediaRecords(filters)
  return serviceSuccess(result, "OK")
}

// ─── Get Media ──────────────────────────────────────────────────────────────

export async function getMedia(id: string): Promise<ServiceResult<MediaRow>> {
  const item = await findMediaByIdRecord(id)
  if (!item) return serviceNotFound("Media")
  return serviceSuccess(item, "OK")
}

export async function uploadMediaForUser(
  formData: FormData,
  userId: string,
  metadata: UploadMediaInput,
): Promise<
  | { success: true; data: MediaRow; message: string }
  | { success: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } }
> {
  const file = formData.get("file") as File | null
  if (!file || file.size === 0) {
    return { success: false, error: { code: "validation", message: "No file provided." } }
  }

  const fileCheck = validateFile(file)
  if (!fileCheck.valid) {
    return {
      success: false,
      error: { code: "validation", message: fileCheck.error ?? "Invalid file." },
    }
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const contentCheck = validateFileContents(buffer, file.type)
  if (!contentCheck.valid) {
    return { success: false, error: { code: "validation", message: contentCheck.error ?? "Invalid file." } }
  }

  const fileResult = await processUploadedFile(
    buffer,
    file.type,
  )

  return await createMediaRecord({
    id: fileResult.id,
    userId,
    name: metadata.name ?? file.name,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    url: fileResult.url,
    thumbnailUrl: fileResult.thumbnailUrl,
    alt: metadata.alt ?? null,
    caption: metadata.caption ?? null,
    width: fileResult.width,
    height: fileResult.height,
    folder: metadata.folder ?? null,
  })
}

// ─── Create Media Record (after the file is saved to R2) ────────────────────

async function createMediaRecord(params: {
  userId: string
  name: string
  fileName: string
  mimeType: string
  size: number
  url: string
  thumbnailUrl?: string | null
  alt?: string | null
  caption?: string | null
  width?: number | null
  height?: number | null
  folder?: string | null
  id?: string
}): Promise<ServiceResult<MediaRow>> {
  const id = params.id ?? generateId()
  const now = getCurrentTimestamp()

  const record = await repoCreateMedia({
    id,
    userId: params.userId,
    name: params.name || params.fileName,
    fileName: params.fileName,
    mimeType: params.mimeType,
    size: params.size,
    url: params.url,
    thumbnailUrl: params.thumbnailUrl,
    alt: params.alt,
    caption: params.caption,
    width: params.width,
    height: params.height,
    folder: params.folder,
    createdAt: now,
    updatedAt: now,
  })

  return serviceSuccess(record, "Media uploaded.")
}

// ─── Update Media ───────────────────────────────────────────────────────────

export async function updateMedia(id: string, data: UpdateMediaInput): Promise<ServiceResult<MediaRow>> {
  const existing = await findMediaByIdRecord(id)
  if (!existing) return serviceNotFound("Media")
  const now = getCurrentTimestamp()

  const updateData: {
    name?: string
    alt?: string | null
    caption?: string | null
    folder?: string | null
    updatedAt: number
  } = { updatedAt: now }

  if (data.name !== undefined) updateData.name = data.name
  if (data.alt !== undefined) updateData.alt = data.alt
  if (data.caption !== undefined) updateData.caption = data.caption
  if (data.folder !== undefined) updateData.folder = data.folder

  const updated = await updateMediaRecord(id, updateData)
  if (!updated) return serviceNotFound("Media")

  return serviceSuccess(updated, "Media updated.")
}

// ─── Delete Media ───────────────────────────────────────────────────────────

export async function deleteMedia(id: string): Promise<ServiceResult<null>> {
  const existing = await findMediaByIdRecord(id)
  if (!existing) return serviceNotFound("Media")

  await deleteMediaRecord(id)
  return serviceSuccess(null, "Media deleted.")
}

// ─── Process Uploaded File ─────────────────────────────────────────────────

interface ProcessedFile {
  url: string
  thumbnailUrl: string | null
  width: number | null
  height: number | null
}

/**
 * Writes the browser-optimized file to R2. Image processing intentionally
 * happens before upload so the Worker never needs a native image library.
 */
async function processUploadedFile(
  buffer: Uint8Array,
  mimeType: string,
  id?: string,
): Promise<ProcessedFile & { id: string }> {
  const fileId = id ?? generateId()
  const extension = getExtensionFromMimeType(mimeType)
  const relativePath = generateMediaPath(fileId, extension)
  await writeStorageFile(relativePath, buffer, {
    contentType: mimeType,
    cacheControl: "public, max-age=31536000, immutable",
  })

  return {
    id: fileId,
    url: `/${relativePath}`,
    thumbnailUrl: null,
    width: null,
    height: null,
  }
}
