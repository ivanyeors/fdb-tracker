"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function JournalForm() {
  const [type, setType] = useState<"buy" | "sell">("buy")
  const [symbol, setSymbol] = useState("")
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState("")
  const [journalText, setJournalText] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = {
      type,
      symbol,
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      journalText: journalText || undefined,
    }
    console.log("Journal entry:", data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Tabs
        value={type}
        onValueChange={(v) => setType(v as "buy" | "sell")}
      >
        <TabsList>
          <TabsTrigger value="buy">Buy</TabsTrigger>
          <TabsTrigger value="sell">Sell</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="journal-symbol">Symbol</Label>
          <Input
            id="journal-symbol"
            placeholder="e.g. DBS"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="journal-qty">Quantity</Label>
          <Input
            id="journal-qty"
            type="number"
            step="any"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="journal-price">Price ($)</Label>
          <Input
            id="journal-price"
            type="number"
            step="any"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="journal-text">Journal (optional)</Label>
        <Textarea
          id="journal-text"
          placeholder="Trading notes, thesis, or observations…"
          value={journalText}
          onChange={(e) => setJournalText(e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="journal-image">Screenshot (optional)</Label>
        <Input id="journal-image" type="file" accept="image/*" />
      </div>

      <Button type="submit">Add Entry</Button>
    </form>
  )
}
