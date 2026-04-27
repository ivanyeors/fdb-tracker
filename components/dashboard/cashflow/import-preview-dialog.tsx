"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Category {
  id: string
  name: string
  icon: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParsedResult = any

export interface ParsedFile {
  fileName: string
  result: ParsedResult
  categoryOverrides: Map<number, string | null>
}

interface ImportPreviewDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly parsedFiles: ParsedFile[]
  readonly categories: Category[]
  readonly onCategoryOverride: (
    fileIndex: number,
    txnIndex: number,
    categoryId: string | null
  ) => void
  readonly onConfirm: () => void
  readonly onRemoveFile: (fileIndex: number) => void
  readonly targetProfileName?: string | null
}

function FilePreview({
  file,
  fileIndex,
  categories,
  onCategoryOverride,
  onRemove,
  showHeader,
}: {
  readonly file: ParsedFile
  readonly fileIndex: number
  readonly categories: Category[]
  readonly onCategoryOverride: (
    fileIndex: number,
    txnIndex: number,
    categoryId: string | null
  ) => void
  readonly onRemove: (fileIndex: number) => void
  readonly showHeader: boolean
}) {
  const txnCount = file.result?.extracted?.transactions?.length ?? 0
  const type =
    file.result?.classification?.type === "cc_statement"
      ? "Credit Card"
      : "Bank"
  const bank = file.result?.extracted?.bankName ?? "Unknown"

  const content = (
    <div className="space-y-2 text-sm">
      <p>
        Found <strong>{txnCount}</strong> transactions
      </p>
      {file.result?.extracted?.month && (
        <p>Month: {file.result.extracted.month}</p>
      )}
      {file.result?.extracted?.totalAmountDue !== undefined &&
        file.result?.extracted?.totalAmountDue !== null && (
          <p>Amount Due: ${file.result.extracted.totalAmountDue.toFixed(2)}</p>
        )}
      {file.result?.extracted?.openingBalance !== undefined &&
        file.result?.extracted?.openingBalance !== null && (
          <p>
            Opening: ${file.result.extracted.openingBalance.toLocaleString()}
            {" → "}
            Closing: $
            {file.result.extracted.closingBalance?.toLocaleString() ?? "---"}
          </p>
        )}
      <div className="max-h-[300px] overflow-y-auto rounded border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-left">Category</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {file.result?.extracted?.transactions?.map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (txn: any, i: number) => (
                <tr key={`txn-${txn.date ?? ""}-${txn.description ?? ""}-${i}`} className="border-t">
                  <td className="p-2 whitespace-nowrap">{txn.date}</td>
                  <td className="p-2">{txn.description}</td>
                  <td className="p-2">
                    {categories.length > 0 ? (
                      <select
                        className="h-7 w-full rounded border bg-background px-1 text-xs"
                        value={
                          file.categoryOverrides.get(i) ??
                          categories.find((c) => c.name === txn.categoryName)
                            ?.id ??
                          ""
                        }
                        onChange={(e) => {
                          onCategoryOverride(
                            fileIndex,
                            i,
                            e.target.value || null
                          )
                        }}
                      >
                        <option value="">
                          {txn.categoryName || "Uncategorized"}
                        </option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-muted-foreground">
                        {txn.categoryName || "Others"}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "p-2 text-right font-mono",
                      txn.txnType === "credit"
                        ? "text-green-600"
                        : "text-red-600"
                    )}
                  >
                    {txn.txnType === "credit" ? "+" : ""}
                    {txn.amount?.toFixed(2)}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  if (!showHeader) return content

  return (
    <Collapsible defaultOpen>
      <div className="flex items-center gap-2 rounded-md border p-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-sm font-medium hover:underline">
          {file.fileName} — {bank} {type} ({txnCount} txns)
          <ChevronDown className="h-3.5 w-3.5" />
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onRemove(fileIndex)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <CollapsibleContent className="pt-2">{content}</CollapsibleContent>
    </Collapsible>
  )
}

export function ImportPreviewDialog({
  open,
  onOpenChange,
  parsedFiles,
  categories,
  onCategoryOverride,
  onConfirm,
  onRemoveFile,
  targetProfileName,
}: ImportPreviewDialogProps) {
  const totalTxnCount = parsedFiles.reduce(
    (sum, f) => sum + (f.result?.extracted?.transactions?.length ?? 0),
    0
  )
  const isSingleFile = parsedFiles.length === 1
  const singleFile = parsedFiles[0]
  const singleType =
    singleFile?.result?.classification?.type === "cc_statement"
      ? "Credit Card"
      : "Bank"
  const singleBank = singleFile?.result?.extracted?.bankName ?? "Unknown"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isSingleFile
              ? `Import ${singleBank} ${singleType} Statement`
              : `Import ${parsedFiles.length} Statements`}
          </DialogTitle>
          {targetProfileName ? (
            <p className="text-sm text-muted-foreground">
              Importing for <strong>{targetProfileName}</strong>
            </p>
          ) : (
            <p className="text-sm text-destructive">
              No profile selected — please select a profile first.
            </p>
          )}
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {parsedFiles.map((file, i) => (
            <FilePreview
              key={`file-${file.fileName}`}
              file={file}
              fileIndex={i}
              categories={categories}
              onCategoryOverride={onCategoryOverride}
              onRemove={onRemoveFile}
              showHeader={!isSingleFile}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={parsedFiles.length === 0 || !targetProfileName}
          >
            Import {totalTxnCount} Transactions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
