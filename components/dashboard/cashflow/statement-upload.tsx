"use client"

import { useRef, useState } from "react"
import { Upload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface StatementUploadProps {
  readonly onParsed: (result: {
    classification: {
      type: string
      confidence: string
      matchedKeywords: string[]
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extracted: any
    pageCount: number
  }) => void
}

export function StatementUpload({ onParsed }: StatementUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  async function handleFile(file: File) {
    if (!file.name.endsWith(".pdf")) {
      toast.error("Please upload a PDF file")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 10MB")
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/statements/parse", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const json = await res.json()
        toast.error(json.error || "Failed to parse PDF")
        return
      }

      const result = await res.json()
      onParsed(result)
    } catch {
      toast.error("Failed to upload statement")
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
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
