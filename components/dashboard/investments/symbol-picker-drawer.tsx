"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  ResponsiveSheet as Sheet,
  ResponsiveSheetContent as SheetContent,
  ResponsiveSheetHeader as SheetHeader,
  ResponsiveSheetTitle as SheetTitle,
  ResponsiveSheetDescription as SheetDescription,
} from "@/components/ui/responsive-sheet"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Check, Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export type StockSearchResult = {
  ticker: string
  name?: string
  exchange?: string
}

interface SymbolPickerDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (symbol: string) => void
  multiSelect?: boolean
  onMultiSelect?: (symbols: string[]) => void
}

export function SymbolPickerDrawer({
  open,
  onOpenChange,
  onSelect,
  multiSelect = false,
  onMultiSelect,
}: SymbolPickerDrawerProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearchError(null)
      return
    }
    setIsSearching(true)
    setSearchError(null)
    try {
      const res = await fetch(
        `/api/stocks/search?q=${encodeURIComponent(trimmed)}`,
        { credentials: "include" },
      )
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : []
        setResults(items)
        setSearchError(null)
      } else {
        setResults([])
        if (res.status === 401) {
          setSearchError("Please log in to search symbols.")
        } else if (res.status === 503) {
          setSearchError("Stock search is not configured.")
        } else if (res.status >= 500) {
          setSearchError("Search temporarily unavailable. Try again later.")
        } else {
          setSearchError("Search failed. Please try again.")
        }
      }
    } catch {
      setResults([])
      setSearchError("Search failed. Please check your connection.")
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  useEffect(() => {
    if (open) {
      setQuery("")
      setResults([])
      setSearchError(null)
      setSelected(new Set())
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleSingleSelect = (ticker: string) => {
    onSelect(ticker)
    onOpenChange(false)
  }

  const handleMultiToggle = (ticker: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(ticker)) {
        next.delete(ticker)
      } else {
        next.add(ticker)
      }
      return next
    })
  }

  const handleMultiConfirm = () => {
    const symbols = Array.from(selected)
    if (symbols.length > 0 && onMultiSelect) {
      onMultiSelect(symbols)
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-[50vw] data-[side=right]:max-w-[50vw] flex flex-col gap-4"
      >
        <SheetHeader>
          <SheetTitle>Add symbol</SheetTitle>
          <SheetDescription>
            Search for stocks and ETFs by ticker or company name.
          </SheetDescription>
        </SheetHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="e.g. TSLA, AAPL, DBS"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoComplete="off"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        <ScrollArea className="flex-1 -mx-4 px-4 min-h-0">
          {query.trim().length < 2 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Type 2+ characters to search
            </p>
          ) : searchError ? (
            <p className="text-sm text-destructive py-8 text-center">
              {searchError}
            </p>
          ) : results.length === 0 && !isSearching ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No results found for &quot;{query.trim()}&quot;
            </p>
          ) : (
            <div className="space-y-0.5 pr-2">
              {results.map((r) => {
                const handleSelect = () =>
                  multiSelect
                    ? handleMultiToggle(r.ticker)
                    : handleSingleSelect(r.ticker)
                return (
                <div
                  key={r.ticker}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
                    multiSelect
                      ? "hover:bg-accent"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                  onClick={handleSelect}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleSelect()
                    }
                  }}
                >
                  {multiSelect && (
                    <div
                      aria-hidden="true"
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded border",
                        selected.has(r.ticker)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {selected.has(r.ticker) ? (
                        <Check className="size-3" />
                      ) : null}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-medium">{r.ticker}</span>
                    {r.name && (
                      <span className="text-xs text-muted-foreground truncate">
                        {r.name}
                      </span>
                    )}
                    {r.exchange && (
                      <span className="text-xs text-muted-foreground">
                        {r.exchange}
                      </span>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {multiSelect && selected.size > 0 && (
          <div className="border-t pt-4 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
            </span>
            <Button onClick={handleMultiConfirm}>
              Add {selected.size} symbol{selected.size > 1 ? "s" : ""}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
