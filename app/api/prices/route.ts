import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { getMultipleStockPrices, type StockPrice } from "@/lib/external/eulerpool"
import {
  getOcbcPreciousMetalPrices,
  type PreciousMetalPrice,
} from "@/lib/external/precious-metals"

type PricesResponse = {
  stocks: StockPrice[]
  metals: PreciousMetalPrice[]
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const tickersParam = searchParams.get("tickers")
    const metalsParam = searchParams.get("metals")

    const response: PricesResponse = { stocks: [], metals: [] }

    const promises: Promise<void>[] = []

    if (tickersParam) {
      const tickers = tickersParam.split(",").map((t) => t.trim()).filter(Boolean)
      if (tickers.length > 0) {
        promises.push(
          getMultipleStockPrices(tickers).then((prices) => {
            response.stocks = prices
          }),
        )
      }
    }

    if (metalsParam === "true") {
      promises.push(
        getOcbcPreciousMetalPrices().then((prices) => {
          response.metals = prices
        }),
      )
    }

    await Promise.all(promises)

    return NextResponse.json(response)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
