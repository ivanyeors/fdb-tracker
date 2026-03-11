import { NextRequest, NextResponse } from "next/server"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import {
  endOfMonthReminder,
  incomeYearlyReminder,
  incomeMonthlyReminder,
  insuranceYearlyReminder,
  insuranceMonthlyReminder,
  taxYearlyReminder,
} from "@/lib/reminders/templates"

function nowInTimezone(timezone: string): { hour: number; day: number; month: number; year: number; monthLabel: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)

  const monthNames = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ]

  return {
    hour: get("hour"),
    day: get("day"),
    month: get("month"),
    year: get("year"),
    monthLabel: monthNames[get("month")] ?? "",
  }
}

function shouldFire(
  schedule: { frequency: string; day_of_month: number; month_of_year: number | null; time: string; timezone: string },
): { fire: boolean; now: ReturnType<typeof nowInTimezone> } {
  const now = nowInTimezone(schedule.timezone)

  if (now.day !== schedule.day_of_month) return { fire: false, now }

  if (schedule.frequency === "yearly" && schedule.month_of_year !== null) {
    if (now.month !== schedule.month_of_year) return { fire: false, now }
  }

  return { fire: true, now }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  })

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { description?: string }
    return { ok: false, error: data.description ?? `HTTP ${res.status}` }
  }

  return { ok: true }
}

type ReminderContext = {
  profiles: Array<{ name: string }>
  dashboardUrl: string
}

async function generateMessage(
  promptType: string,
  accountId: string,
  now: ReturnType<typeof nowInTimezone>,
  ctx: ReminderContext,
): Promise<string | null> {
  const supabase = createSupabaseAdmin()

  switch (promptType) {
    case "end_of_month":
      return endOfMonthReminder(now.monthLabel, ctx)

    case "income_yearly":
      return incomeYearlyReminder(now.year, ctx)

    case "income_monthly": {
      for (const profile of ctx.profiles) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("id")
          .eq("household_id", accountId)
          .eq("name", profile.name)
          .single()

        if (!profileRow) continue

        const { data: incomeConfig } = await supabase
          .from("income_config")
          .select("annual_salary, employee_cpf_rate")
          .eq("profile_id", profileRow.id)
          .single()

        if (incomeConfig) {
          const cpfRate = incomeConfig.employee_cpf_rate ?? 0.2
          const monthlyGross = incomeConfig.annual_salary / 12
          const takeHome = Math.round(monthlyGross * (1 - cpfRate))
          return incomeMonthlyReminder(now.monthLabel, profile.name, takeHome)
        }
      }
      return incomeMonthlyReminder(now.monthLabel, ctx.profiles[0]?.name ?? "user", 0)
    }

    case "insurance_yearly":
      return insuranceYearlyReminder(now.year, ctx)

    case "insurance_monthly": {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("household_id", accountId)

      if (profiles) {
        const profileIds = profiles.map((p) => p.id)
        const { data: policies } = await supabase
          .from("insurance_policies")
          .select("name, premium_amount, frequency")
          .in("profile_id", profileIds)
          .eq("is_active", true)
          .eq("frequency", "monthly")

        if (policies && policies.length > 0) {
          return policies
            .map((p) => insuranceMonthlyReminder(p.name, p.premium_amount))
            .join("\n\n")
        }
      }
      return insuranceMonthlyReminder("policy", 0)
    }

    case "tax_yearly": {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("household_id", accountId)

      let calculatedTax: number | null = null
      if (profiles && profiles.length > 0) {
        const { data: taxEntry } = await supabase
          .from("tax_entries")
          .select("calculated_amount")
          .eq("profile_id", profiles[0].id)
          .eq("year", now.year)
          .single()

        if (taxEntry) calculatedTax = taxEntry.calculated_amount
      }
      return taxYearlyReminder(now.year, calculatedTax, ctx)
    }

    default:
      return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createSupabaseAdmin()
    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com"

    const { data: schedules, error: schedError } = await supabase
      .from("prompt_schedule")
      .select("id, household_id, prompt_type, frequency, day_of_month, month_of_year, time, timezone")

    if (schedError || !schedules) {
      return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 })
    }

    let sent = 0
    const errors: string[] = []

    for (const schedule of schedules) {
      const { fire, now } = shouldFire(schedule)
      if (!fire) continue

      const { data: account } = await supabase
        .from("households")
        .select("telegram_chat_id, telegram_bot_token")
        .eq("id", schedule.household_id)
        .single()

      if (!account?.telegram_chat_id || !account.telegram_bot_token) {
        errors.push(`${schedule.id}: account missing telegram config`)
        continue
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("name")
        .eq("household_id", schedule.household_id)

      const ctx: ReminderContext = {
        profiles: profiles ?? [],
        dashboardUrl,
      }

      const message = await generateMessage(
        schedule.prompt_type,
        schedule.household_id,
        now,
        ctx,
      )

      if (!message) {
        errors.push(`${schedule.id}: unknown prompt_type '${schedule.prompt_type}'`)
        continue
      }

      const result = await sendTelegramMessage(
        account.telegram_bot_token,
        account.telegram_chat_id,
        message,
      )

      if (result.ok) {
        sent++
      } else {
        errors.push(`${schedule.id}: ${result.error}`)
      }
    }

    return NextResponse.json({ sent, errors })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
