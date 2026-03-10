#!/usr/bin/env npx tsx
/**
 * Registers the Telegram bot webhook URL with Telegram's API.
 * Run after deploying to production:
 *
 *   NEXT_PUBLIC_APP_URL=https://fd-tracker-mu.vercel.app TELEGRAM_BOT_TOKEN=your_token npx tsx scripts/set-telegram-webhook.ts
 */

const token = process.env.TELEGRAM_BOT_TOKEN
const baseUrl = process.env.NEXT_PUBLIC_APP_URL

if (!token) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set")
  process.exit(1)
}

if (!baseUrl) {
  console.error("Error: NEXT_PUBLIC_APP_URL is not set")
  process.exit(1)
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`
const apiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`

console.log(`Setting webhook to: ${webhookUrl}`)

const res = await fetch(apiUrl)
const data = (await res.json()) as { ok?: boolean; description?: string }

if (data.ok) {
  console.log("✅ Webhook registered successfully")
} else {
  console.error("❌ Failed to register webhook:", data.description ?? res.statusText)
  process.exit(1)
}

export {}
