#!/usr/bin/env npx tsx
/**
 * Verifies Telegram webhook is correctly configured.
 * Run: NEXT_PUBLIC_APP_URL=https://your-app.vercel.app TELEGRAM_BOT_TOKEN=xxx CRON_SECRET=xxx npx tsx scripts/verify-telegram-webhook.ts
 */

const token = process.env.TELEGRAM_BOT_TOKEN
const baseUrl = process.env.NEXT_PUBLIC_APP_URL
const cronSecret = process.env.CRON_SECRET

if (!token) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set")
  process.exit(1)
}

const expectedWebhook = baseUrl
  ? `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`
  : null

console.log("\n📡 Checking Telegram webhook status...\n")

const res = await fetch(
  `https://api.telegram.org/bot${token}/getWebhookInfo`,
)
const data = (await res.json()) as {
  ok?: boolean
  result?: { url?: string }
  description?: string
}

if (!data.ok) {
  console.error("❌ Failed to fetch webhook info:", data.description)
  process.exit(1)
}

const currentUrl = data.result?.url ?? null

if (!currentUrl) {
  console.log("⚠️  Webhook is NOT set. Telegram will not deliver /otp updates.")
  console.log("\nFix: Run set-webhook after deploy:")
  if (baseUrl) {
    console.log(`   npx tsx scripts/set-telegram-webhook.ts`)
    console.log(`   (with NEXT_PUBLIC_APP_URL=${baseUrl})`)
  } else {
    console.log("   Set NEXT_PUBLIC_APP_URL to your production URL, then run:")
    console.log("   npx tsx scripts/set-telegram-webhook.ts")
  }
  if (cronSecret) {
    console.log("\nOr call the API:")
    console.log(`   curl -H "Authorization: Bearer $CRON_SECRET" "${baseUrl ?? "https://YOUR_APP_URL"}/api/telegram/set-webhook"`)
  }
  process.exit(1)
}

if (currentUrl.includes("localhost")) {
  console.log("❌ Webhook points to localhost. Telegram cannot reach it.")
  console.log(`   Current: ${currentUrl}`)
  console.log("\nFix: Deploy to Vercel, set NEXT_PUBLIC_APP_URL to your production URL,")
  console.log("   then run: npx tsx scripts/set-telegram-webhook.ts")
  process.exit(1)
}

if (expectedWebhook && currentUrl !== expectedWebhook) {
  console.log("⚠️  Webhook URL mismatch:")
  console.log(`   Expected: ${expectedWebhook}`)
  console.log(`   Current:  ${currentUrl}`)
  console.log("\nTo fix: npx tsx scripts/set-telegram-webhook.ts")
  process.exit(1)
}

console.log("✅ Webhook is correctly configured")
console.log(`   ${currentUrl}`)
console.log("\nSend /otp in a private chat with your bot to get the code.\n")
