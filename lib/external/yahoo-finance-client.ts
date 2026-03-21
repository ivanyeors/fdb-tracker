import type YahooFinance from "yahoo-finance2"

let instance: InstanceType<typeof YahooFinance> | null = null

/** Singleton Yahoo Finance v3 client (`new YahooFinance()` per package API). */
export async function getYahooFinance(): Promise<InstanceType<typeof YahooFinance>> {
  if (!instance) {
    const mod = await import("yahoo-finance2")
    const YahooFinanceClass = mod.default
    instance = new YahooFinanceClass()
  }
  return instance
}
