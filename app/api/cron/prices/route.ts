import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getMultipleStockPrices } from "@/lib/external/eulerpool"
import { getOcbcPreciousMetalPrices } from "@/lib/external/precious-metals"

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createSupabaseAdmin()

    const { data: investments, error: invError } = await supabase
      .from("investments")
      .select("symbol")

    if (invError) {
      return NextResponse.json({ error: "Failed to fetch symbols" }, { status: 500 })
    }

    const uniqueSymbols = [...new Set(investments.map((i) => i.symbol))]

    let stocksUpdated = 0
    let metalsUpdated = 0

    if (uniqueSymbols.length > 0) {
      const stockPrices = await getMultipleStockPrices(uniqueSymbols)
      stocksUpdated = stockPrices.filter((p) => p.price > 0).length
    }

    const metalPrices = await getOcbcPreciousMetalPrices()

    for (const metal of metalPrices) {
      const { error } = await supabase
        .from("precious_metals_prices")
        .upsert(
          {
            metal_type: metal.metalType,
            buy_price_sgd: metal.buyPriceSgd,
            sell_price_sgd: metal.sellPriceSgd,
            unit: metal.unit,
            last_updated: new Date().toISOString(),
          },
          { onConflict: "metal_type" },
        )

      if (!error) metalsUpdated++
    }

    return NextResponse.json({
      success: true,
      stockSymbols: uniqueSymbols.length,
      stocksUpdated,
      metalsUpdated,
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
