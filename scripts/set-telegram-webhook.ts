#!/usr/bin/env npx tsx
/**
 * Registers the Telegram bot webhook URL with Telegram's API.
 * Loads .env.local for TELEGRAM_BOT_TOKEN. Run from project root:
 *
 *   npx tsx scripts/set-telegram-webhook.ts https://dollar.ivanyeo.com
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

// Strip control characters from externally-sourced strings before logging
// to prevent log forging via injected newlines/CRs.
function safe(value: unknown): string {
  return String(value ?? "").replaceAll(/[\r\n\u0000-\u001F\u007F]/g, "")
}

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = /^([^#=]+)=(.*)$/.exec(line)
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replaceAll(/^["']|["']$/g, "")
    }
  }
}
loadEnvLocal()

const token = process.env.TELEGRAM_BOT_TOKEN
const baseUrl =
  process.argv[2]?.startsWith("http") ? process.argv[2] : process.env.NEXT_PUBLIC_APP_URL

if (!token) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set")
  process.exit(1)
}

if (!baseUrl) {
  console.error("Error: Pass production URL as argument or set NEXT_PUBLIC_APP_URL")
  console.error("   npx tsx scripts/set-telegram-webhook.ts https://dollar.ivanyeo.com")
  process.exit(1)
}

if (baseUrl.includes("localhost")) {
  console.error("Error: Use your production URL (Telegram cannot reach localhost)")
  console.error("   npx tsx scripts/set-telegram-webhook.ts https://dollar.ivanyeo.com")
  process.exit(1)
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`
const apiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`

console.log(`Setting webhook to: ${webhookUrl}`)

const res = await fetch(apiUrl)
const data = (await res.json()) as { ok?: boolean; description?: string }

if (!data.ok) {
  console.error("❌ Failed to register webhook:", safe(data.description ?? res.statusText))
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
