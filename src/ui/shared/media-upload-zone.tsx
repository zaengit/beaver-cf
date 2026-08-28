
import { useState, useRef, useCallback } from "react"
import { Upload, FileIcon, X, Loader2 } from "lucide-react"
import { Button } from "@zbeaver/beaver/ui/components/ui/button"
import { Input } from "@zbeaver/beaver/ui/components/ui/input"
import { adminToast } from "@zbeaver/beaver/ui/shared/toast"
import { cn } from "@zbeaver/beaver/pkg/utils/ui"

export const MAX_UPLOAD_BYTES = 500 * 1024
const MAX_IMAGE_DIMENSION = 2_560
const OPTIMIZABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

interface UploadedMedia {
  id: string
  name: string
  fileName: string
  mimeType: string
  size: number
  url: string
  thumbnailUrl: string | null
  alt: string | null
  caption: string | null
  width: number | null
  height: number | null
  folder: string | null
  createdAt: number
  updatedAt: number
}

interface MediaUploadZoneProps {
  onUploadComplete?: (media: UploadedMedia) => void
  onUploadError?: (error: string) => void
  accept?: string
  className?: string
  compact?: boolean
}

interface UploadingFile {
  id: string
  file: File
  progress: number
  error?: string
}

export function MediaUploadZone({
  onUploadComplete,
  onUploadError,
  accept,
  className,
  compact = false,
}: MediaUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState<UploadingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const uploadFile = useCallback(
    async (file: File) => {
      const uploadId = crypto.randomUUID()
      setUploading((prev) => [...prev, { id: uploadId, file, progress: 0 }])

      try {
        const preparedFile = await prepareFileForUpload(file)
        setUploading((prev) => prev.map((item) => item.id === uploadId ? { ...item, file: preparedFile } : item))
        const formData = new FormData()
        formData.append("file", preparedFile)

        const response = await fetch("/api/admin/media/upload", {
          method: "POST",
          body: formData,
        })

        const result = await response.json()

        if (!result.success) {
          const errorMsg = result.message || "Upload failed"
          setUploading((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, error: errorMsg } : u
            )
          )
          onUploadError?.(errorMsg)
          adminToast.error(errorMsg)
          return null
        }

        setUploading((prev) => prev.filter((u) => u.id !== uploadId))
        onUploadComplete?.(result.data)
        adminToast.uploaded(preparedFile.name)
        return result.data as UploadedMedia
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Upload failed. Please try again."
        setUploading((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, error: errorMsg } : u
          )
        )
        onUploadError?.(errorMsg)
        adminToast.error(errorMsg)
        return null
      }
    },
    [onUploadComplete, onUploadError]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return

      for (const file of files) {
        if (accept && !matchesMimeFilter(file.type, accept)) continue
        await uploadFile(file)
      }
    },
    [accept, uploadFile]
  )

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (files.length === 0) return

      for (const file of files) {
        if (accept && !matchesMimeFilter(file.type, accept)) continue
        await uploadFile(file)
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    },
    [uploadFile]
  )

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const removeUploadError = useCallback((id: string) => {
    setUploading((prev) => prev.filter((u) => u.id !== id))
  }, [])

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        variant="outline"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        aria-label="Upload media files"
        className={cn(
          "relative h-auto w-full cursor-pointer rounded-sm border-2 border-dashed transition-colors whitespace-normal",
          "hover:border-primary/50 hover:bg-muted/50",
          isDragOver && "border-primary bg-primary/5",
          compact ? "p-4" : "p-8",
          "flex flex-col items-center justify-center gap-2 text-center"
        )}
      >
        <Upload
          className={cn(
            "text-muted-foreground",
            compact ? "h-5 w-5" : "h-8 w-8"
          )}
        />
        {!compact && (
          <>
            <p className="text-sm font-medium">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Max 500 KB per file. Images are optimized in your browser.
            </p>
          </>
        )}
        {compact && (
          <p className="text-xs text-muted-foreground">
            Drop files or click to upload
          </p>
        )}
      </Button>

      <Input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Upload progress / errors */}
      {uploading.length > 0 && (
        <div className="space-y-1">
          {uploading.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm",
                item.error
                  ? "border-destructive/50 bg-destructive/10"
                  : "border-border"
              )}
            >
              {item.error ? (
                <FileIcon className="h-4 w-4 text-destructive" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <span className="flex-1 truncate">
                {item.file.name}
                {item.error && (
                  <span className="ml-2 text-destructive">{item.error}</span>
                )}
              </span>
              {item.error && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeUploadError(item.id)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchesMimeFilter(mimeType: string, filter: string): boolean {
  if (!filter) return true
  const filters = filter.split(",").map((f) => f.trim())
  return filters.some((f) => {
    if (f.endsWith("/*")) {
      const prefix = f.replace("/*", "/")
      return mimeType.startsWith(prefix)
    }
    return mimeType === f
  })
}

function fileWithExtension(file: File, mimeType: string, blob: Blob) {
  const baseName = file.name.replace(/\.[A-Za-z0-9]+$/, "") || "image"
  const extension = mimeType === "image/webp" ? "webp" : "jpg"
  return new File([blob], `${baseName}.${extension}`, { type: mimeType, lastModified: file.lastModified })
}

async function imageSource(file: File) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap as CanvasImageSource,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error("The image could not be decoded in the browser."))
      element.src = url
    })
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => undefined,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode the image.")), type, quality)
  })
}

async function optimizeImage(file: File): Promise<File> {
  const decoded = await imageSource(file)
  try {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(decoded.width, decoded.height))
    let width = Math.max(1, Math.round(decoded.width * scale))
    let height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d", { alpha: true })
    if (!context) throw new Error("Canvas image processing is unavailable in this browser.")

    let quality = 0.84
    let outputType = "image/webp"
    for (let attempt = 0; attempt < 10; attempt += 1) {
      canvas.width = width
      canvas.height = height
      context.clearRect(0, 0, width, height)
      if (outputType === "image/jpeg") {
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, width, height)
      }
      context.drawImage(decoded.source, 0, 0, width, height)

      let blob: Blob
      try {
        blob = await canvasBlob(canvas, outputType, quality)
      } catch {
        outputType = "image/jpeg"
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, width, height)
        context.drawImage(decoded.source, 0, 0, width, height)
        blob = await canvasBlob(canvas, outputType, quality)
      }

      if (blob.size <= MAX_UPLOAD_BYTES) return fileWithExtension(file, outputType, blob)
      if (quality > 0.5) quality -= 0.08
      else {
        width = Math.max(320, Math.round(width * 0.8))
        height = Math.max(320, Math.round(height * 0.8))
      }
    }
  } finally {
    decoded.close()
  }

  throw new Error("This image could not be reduced below the 500 KB upload limit.")
}

async function prepareFileForUpload(file: File) {
  if (file.size <= MAX_UPLOAD_BYTES) return file
  if (!OPTIMIZABLE_IMAGE_TYPES.has(file.type)) {
    throw new Error("Files must be 500 KB or smaller. Only JPEG, PNG, and WebP images can be optimized in the browser.")
  }
  return optimizeImage(file)
}
