"use client"

import { useRef, useState, useCallback } from "react"
import { Upload, Loader2, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ParsedResult } from "@/components/dashboard/cashflow/import-preview-dialog"

interface StatementUploadZoneProps {
  readonly onBatchParsed: (results: ParsedResult[]) => void
}

interface QueueItem {
  file: File
  status: "pending" | "parsing" | "parsed" | "error"
  result?: ParsedResult
  error?: string
}

async function parseFile(file: File): Promise<ParsedResult> {
  const formData = new FormData()
  formData.append("file", file)

  const res = await fetch("/api/statements/parse", {
    method: "POST",
    body: formData,
  })

  if (!res.ok) {
    const json = await res.json()
    throw new Error(json.error || "Failed to parse PDF")
  }

  const result = await res.json()
  result._fileName = file.name
  return result
}

function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return `${file.name}: Only PDF files are supported`
  }
  if (file.size > 10 * 1024 * 1024) {
    return `${file.name}: File too large (max 10MB)`
  }
  return null
}

export function StatementUploadZone({
  onBatchParsed,
}: StatementUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const dragCounterRef = useRef(0)

  const processFiles = useCallback(
    async (files: File[]) => {
      // Validate all files first
      const validFiles: File[] = []
      for (const file of files) {
        const error = validateFile(file)
        if (error) {
          toast.error(error)
        } else {
          validFiles.push(file)
        }
      }

      if (validFiles.length === 0) return

      const items: QueueItem[] = validFiles.map((file) => ({
        file,
        status: "pending",
      }))
      setQueue(items)
      setIsProcessing(true)

      const results: ParsedResult[] = []

      for (let i = 0; i < items.length; i++) {
        setQueue((prev) =>
          prev.map((item, j) =>
            j === i ? { ...item, status: "parsing" } : item
          )
        )

        try {
          const result = await parseFile(items[i].file)
          results.push(result)
          setQueue((prev) =>
            prev.map((item, j) =>
              j === i ? { ...item, status: "parsed", result } : item
            )
          )
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to parse file"
          toast.error(`${items[i].file.name}: ${msg}`)
          setQueue((prev) =>
            prev.map((item, j) =>
              j === i ? { ...item, status: "error", error: msg } : item
            )
          )
        }
      }

      setIsProcessing(false)
      setQueue([])

      if (results.length > 0) {
        onBatchParsed(results)
      }
    },
    [onBatchParsed]
  )

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.items?.length) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      processFiles(files)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) {
      processFiles(files)
    }
    if (inputRef.current) inputRef.current.value = ""
  }

  const parsedCount = queue.filter((i) => i.status === "parsed").length
  const progress =
    queue.length > 0 ? Math.round((parsedCount / queue.length) * 100) : 0

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={isProcessing ? -1 : 0}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          isProcessing && "pointer-events-none opacity-60"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (isProcessing) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Parsing {parsedCount + 1} of {queue.length}...
            </p>
            <Progress value={progress} className="h-1.5 w-48" />
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drop PDF statements here or click to upload
            </p>
            <p className="text-xs text-muted-foreground">
              Supports multiple files. PDF only, max 10MB each.
            </p>
          </>
        )}
      </div>

      {/* Processing queue */}
      {queue.length > 0 && (
        <div className="space-y-1">
          {queue.map((item) => (
            <div
              key={`queue-${item.file?.name ?? item.status}`}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
            >
              {item.status === "parsing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : item.status === "parsed" ? (
                <FileText className="h-3.5 w-3.5 text-green-600" />
              ) : item.status === "error" ? (
                <X className="h-3.5 w-3.5 text-red-600" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{item.file.name}</span>
              <span className="text-xs text-muted-foreground">
                {item.status === "parsing"
                  ? "Parsing..."
                  : item.status === "parsed"
                    ? `${item.result?.extracted?.transactions?.length ?? 0} txns`
                    : item.status === "error"
                      ? item.error
                      : "Waiting..."}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Compact upload button for inline toolbar use */
export function StatementUploadButton({
  onBatchParsed,
}: StatementUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  async function handleFiles(files: File[]) {
    const validFiles = files.filter((f) => {
      const error = validateFile(f)
      if (error) {
        toast.error(error)
        return false
      }
      return true
    })
    if (validFiles.length === 0) return

    setIsUploading(true)
    const results: ParsedResult[] = []

    for (const file of validFiles) {
      try {
        results.push(await parseFile(file))
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to parse"
        toast.error(`${file.name}: ${msg}`)
      }
    }

    setIsUploading(false)
    if (results.length > 0) onBatchParsed(results)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) handleFiles(files)
          if (inputRef.current) inputRef.current.value = ""
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        Upload Statement
      </Button>
    </>
  )
}
