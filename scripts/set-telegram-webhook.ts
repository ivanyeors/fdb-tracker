#!/usr/bin/env npx tsx
/**
 * Registers the Telegram bot webhook URL with Telegram's API.
 * Loads .env.local automatically. Run from project root:
 *
 *   npx tsx scripts/set-telegram-webhook.ts
 *
 * Or override: NEXT_PUBLIC_APP_URL=https://... npx tsx scripts/set-telegram-webhook.ts
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "")
    }
  }
}
loadEnvLocal()

const token = process.env.TELEGRAM_BOT_TOKEN
const baseUrl = process.env.NEXT_PUBLIC_APP_URL

if (!token) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set")
  process.exit(1)
}

if (!baseUrl) {
  console.error("Error: NEXT_PUBLIC_APP_URL is not set (add to .env.local or pass as env var)")
  process.exit(1)
}

if (baseUrl.includes("localhost")) {
  console.error("Error: NEXT_PUBLIC_APP_URL must be your production URL (e.g. https://fd-tracker-mu.vercel.app)")
  console.error("       Telegram cannot reach localhost. Override: NEXT_PUBLIC_APP_URL=https://your-app.vercel.app npx tsx scripts/set-telegram-webhook.ts")
  process.exit(1)
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`
const apiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`

console.log(`Setting webhook to: ${webhookUrl}`)

const res = await fetch(apiUrl)
const data = (await res.json()) as { ok?: boolean; description?: string }

if (!data.ok) {
  console.error("❌ Failed to register webhook:", data.description ?? res.statusText)
  process.exit(1)
}

console.log("✅ Webhook registered successfully")

const { setBotCommands } = await import("../lib/telegram/commands")
const cmdResult = await setBotCommands(token)
if (cmdResult.ok) {
  console.log("✅ Bot command menu registered")
} else {
  console.error("⚠️ Failed to register command menu:", cmdResult.error)
}

export {}
