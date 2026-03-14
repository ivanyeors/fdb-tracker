"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type SearchResult = { ticker: string; name?: string; exchange?: string }

interface SymbolComboboxProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
}

export function SymbolCombobox({
  value,
  onChange,
  placeholder = "e.g. DBS, AAPL",
  id,
  className,
  disabled,
}: SymbolComboboxProps) {
  const [inputValue, setInputValue] = useState(value)
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(
        `/api/stocks/search?q=${encodeURIComponent(query.trim())}`,
      )
      if (res.ok) {
        const data = await res.json()
        setResults(data)
        setIsOpen(true)
      } else {
        setResults([])
      }
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (inputValue.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      search(inputValue)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [inputValue, search])

  const handleSelect = (ticker: string) => {
    onChange(ticker)
    setInputValue(ticker)
    setResults([])
    setIsOpen(false)
  }

  const handleBlur = () => {
    setTimeout(() => setIsOpen(false), 150)
  }

  return (
    <Popover
      open={isOpen && results.length > 0}
      onOpenChange={(open) => !open && setIsOpen(false)}
    >
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            id={id}
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => {
              const v = e.target.value
              setInputValue(v)
              onChange(v)
            }}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            onBlur={handleBlur}
            disabled={disabled}
            className={cn(className)}
            autoComplete="off"
          />
          {isSearching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              Searching...
            </span>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="max-h-60 overflow-auto">
          {results.map((r) => (
            <button
              key={r.ticker}
              type="button"
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(r.ticker)
              }}
            >
              <span className="font-medium">{r.ticker}</span>
              {r.name && (
                <span className="text-xs text-muted-foreground truncate w-full">
                  {r.name}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
