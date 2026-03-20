import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getMultipleStockPrices } from "@/lib/external/fmp"
import { getOcbcPreciousMetalPrices } from "@/lib/external/precious-metals"
import { computeTotalInvestmentsValue } from "@/lib/api/net-liquid"

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createSupabaseAdmin()
    const today = new Date().toISOString().slice(0, 10)

    const { data: families } = await supabase
      .from("families")
      .select("id")

    if (!families || families.length === 0) {
      return NextResponse.json({
        success: true,
        snapshotsCreated: 0,
        familiesProcessed: 0,
        timestamp: new Date().toISOString(),
      })
    }

    const { data: allInvestments } = await supabase
      .from("investments")
      .select("symbol, type, family_id")
      .in("family_id", families.map((f) => f.id))

    const stockSymbols = [
      ...new Set(
        (allInvestments ?? [])
          .filter((inv) => inv.type === "stock" || inv.type === "etf")
          .map((inv) => inv.symbol),
      ),
    ]
    const metalTypes = (allInvestments ?? []).filter(
      (inv) => inv.type === "gold" || inv.type === "silver",
    )

    const stockPrices =
      stockSymbols.length > 0 ? await getMultipleStockPrices(stockSymbols) : []
    const metalsPrices =
      metalTypes.length > 0 ? await getOcbcPreciousMetalPrices() : []

    const sharedPrices = {
      stockPrices,
      metalsPrices,
    }

    let snapshotsCreated = 0

    for (const family of families) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("family_id", family.id)

      const targets: { profileId: string | null }[] = [
        { profileId: null },
        ...(profiles ?? []).map((p) => ({ profileId: p.id })),
      ]

      for (const { profileId } of targets) {
        const { investmentTotal: totalValue } =
          await computeTotalInvestmentsValue(
            supabase,
            family.id,
            profileId,
            null,
            sharedPrices,
          )

        const { error } = await supabase
          .from("investment_snapshots")
          .upsert(
            {
              family_id: family.id,
              profile_id: profileId,
              date: today,
              total_value: Math.round(totalValue * 100) / 100,
            },
            {
              onConflict: "family_id,profile_id,date",
            },
          )

        if (!error) snapshotsCreated++
      }
    }

    return NextResponse.json({
      success: true,
      snapshotsCreated,
      familiesProcessed: families.length,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("[cron/investment-snapshots] Error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
