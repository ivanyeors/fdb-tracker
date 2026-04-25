import { NextRequest, NextResponse } from "next/server"

import { decodeProfilePii } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { decryptBotToken } from "@/lib/telegram/credentials"
import {
  endOfMonthReminder,
  incomeYearlyReminder,
  incomeMonthlyReminder,
  insuranceYearlyReminder,
  insuranceMonthlyReminder,
  taxYearlyReminder,
  seasonalityReminder,
} from "@/lib/reminders/templates"
import {
  getActiveEvents,
  getUpcomingEvents,
} from "@/lib/investments/seasonality"

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
  profiles: Array<{ id: string; name: string }>
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
        const { data: incomeConfig } = await supabase
          .from("income_config")
          .select("annual_salary, employee_cpf_rate")
          .eq("profile_id", profile.id)
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
      if (ctx.profiles.length > 0) {
        const profileIds = ctx.profiles.map((p) => p.id)
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
      let calculatedTax: number | null = null
      if (ctx.profiles.length > 0) {
        const profileId = ctx.profiles[0]!.id
        const { data: taxEntry } = await supabase
          .from("tax_entries")
          .select("calculated_amount")
          .eq("profile_id", profileId)
          .eq("year", now.year)
          .single()

        if (taxEntry) {
          calculatedTax = taxEntry.calculated_amount
        } else {
          const { calculateTax } = await import("@/lib/calculations/tax")
          const { data: profileRow } = await supabase
            .from("profiles")
            .select("birth_year, birth_year_enc")
            .eq("id", profileId)
            .single()
          const profile = profileRow
            ? { birth_year: decodeProfilePii(profileRow).birth_year ?? profileRow.birth_year }
            : null
          const { data: incomeConfig } = await supabase
            .from("income_config")
            .select("annual_salary, bonus_estimate")
            .eq("profile_id", profileId)
            .single()
          if (profile && incomeConfig) {
            const { data: insurancePolicies } = await supabase
              .from("insurance_policies")
              .select("type, premium_amount, frequency, coverage_amount, is_active")
              .eq("profile_id", profileId)
            const { data: manualReliefs } = await supabase
              .from("tax_relief_inputs")
              .select("relief_type, amount")
              .eq("profile_id", profileId)
              .eq("year", now.year)
            const result = calculateTax({
              profile: { birth_year: profile.birth_year },
              incomeConfig: {
                annual_salary: incomeConfig.annual_salary,
                bonus_estimate: incomeConfig.bonus_estimate ?? 0,
              },
              insurancePolicies: (insurancePolicies ?? []).map((p) => ({
                type: p.type,
                premium_amount: p.premium_amount,
                frequency: p.frequency,
                coverage_amount: p.coverage_amount ?? 0,
                is_active: p.is_active,
              })),
              manualReliefs: (manualReliefs ?? []).map((r) => ({
                relief_type: r.relief_type,
                amount: r.amount,
              })),
              year: now.year,
            })
            calculatedTax = result.taxPayable
          }
        }
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
    const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dollar.ivanyeo.com"

    const { data: schedules, error: schedError } = await supabase
      .from("prompt_schedule")
      .select("id, family_id, prompt_type, frequency, day_of_month, month_of_year, time, timezone")

    if (schedError || !schedules) {
      return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 })
    }

    let sent = 0
    const errors: string[] = []
    // Track profiles already notified (profile_id:notification_type) to avoid duplicates
    const alreadySent = new Set<string>()

    for (const schedule of schedules) {
      const { fire, now } = shouldFire(schedule)
      if (!fire) continue

      const { data: family } = await supabase
        .from("families")
        .select("household_id")
        .eq("id", schedule.family_id)
        .single()

      if (!family) {
        errors.push(`${schedule.id}: family not found`)
        continue
      }

      const { data: account } = await supabase
        .from("households")
        .select("telegram_chat_id, telegram_bot_token, telegram_bot_token_enc")
        .eq("id", family.household_id)
        .single()

      const accountBotToken = account ? decryptBotToken(account) : null
      if (!account?.telegram_chat_id || !accountBotToken) {
        errors.push(`${schedule.id}: account missing telegram config`)
        continue
      }

      const { data: rawProfiles } = await supabase
        .from("profiles")
        .select(
          "id, name, name_enc, telegram_chat_id, telegram_chat_id_enc",
        )
        .eq("family_id", schedule.family_id)

      const profiles = (rawProfiles ?? []).map((p) => {
        const decoded = decodeProfilePii(p)
        return {
          id: p.id,
          name: decoded.name ?? p.name ?? "",
          telegram_chat_id: decoded.telegram_chat_id ?? p.telegram_chat_id ?? null,
        }
      })

      const ctx: ReminderContext = {
        profiles,
        dashboardUrl,
      }

      const effectivePromptType =
        schedule.prompt_type === "income"
          ? `income_${schedule.frequency}`
          : schedule.prompt_type === "insurance"
            ? `insurance_${schedule.frequency}`
            : schedule.prompt_type === "tax"
              ? "tax_yearly"
              : schedule.prompt_type

      const message = await generateMessage(
        effectivePromptType,
        family.household_id,
        now,
        ctx,
      )

      if (!message) {
        errors.push(`${schedule.id}: unknown prompt_type '${schedule.prompt_type}'`)
        continue
      }

      // Check per-profile notification preferences (no row = enabled, no schedule = use family default)
      const profileIds = (profiles ?? []).map((p) => p.id)
      const { data: prefRows } =
        profileIds.length > 0
          ? await supabase
              .from("notification_preferences")
              .select("profile_id, enabled, day_of_month, month_of_year, time, timezone")
              .in("profile_id", profileIds)
              .eq("notification_type", effectivePromptType)
          : { data: [] }

      const prefByProfile = new Map(
        (prefRows ?? []).map((p) => [p.profile_id, p]),
      )

      // Filter profiles: check enabled flag + per-profile schedule override
      const enabledProfiles = (profiles ?? []).filter((p) => {
        const pref = prefByProfile.get(p.id)
        // No row = enabled, use family schedule (already passed shouldFire)
        if (!pref) return true
        // Explicitly disabled
        if (!pref.enabled) return false
        // Has custom schedule? Check if it fires now instead of family schedule
        if (pref.day_of_month !== null || pref.time !== null || pref.month_of_year !== null) {
          const tz = pref.timezone ?? schedule.timezone
          const profileNow = nowInTimezone(tz)
          if (pref.day_of_month !== null && profileNow.day !== pref.day_of_month) return false
          if (pref.month_of_year !== null && profileNow.month !== pref.month_of_year) return false
          // time check: only compare hour (cron runs once per hour window)
          if (pref.time !== null) {
            const prefHour = Number(pref.time.split(":")[0])
            if (profileNow.hour !== prefHour) return false
          }
        }
        return true
      })

      // If all profiles opted out or not scheduled now, skip entirely
      if (enabledProfiles.length === 0) {
        continue
      }

      const profileChats = enabledProfiles
        .filter((p) => p.telegram_chat_id)
        .map((p) => ({ id: p.id, chatId: p.telegram_chat_id as string }))

      const chatTargets =
        profileChats.length > 0
          ? profileChats
          : enabledProfiles.map((p) => ({ id: p.id, chatId: account.telegram_chat_id! }))

      const uniqueChats = [...new Map(chatTargets.map((t) => [t.chatId, t])).values()]

      for (const target of uniqueChats) {
        const result = await sendTelegramMessage(
          accountBotToken,
          target.chatId,
          message,
        )

        if (result.ok) {
          sent++
        } else {
          errors.push(`${schedule.id}: ${result.error}`)
        }
      }

      // Mark these profiles as sent for this notification type
      for (const p of enabledProfiles) {
        alreadySent.add(`${p.id}:${effectivePromptType}`)
      }
    }

    // --- Second pass: profiles with custom schedules that fire NOW ---
    // These are profiles whose family schedule did NOT fire today, but their
    // custom day/time/month matches today.
    const { data: customPrefs } = await supabase
      .from("notification_preferences")
      .select("profile_id, notification_type, day_of_month, month_of_year, time, timezone")
      .eq("enabled", true)
      .not("day_of_month", "is", null)

    for (const cp of customPrefs ?? []) {
      const key = `${cp.profile_id}:${cp.notification_type}`
      if (alreadySent.has(key)) continue

      const tz = cp.timezone ?? "Asia/Singapore"
      const now = nowInTimezone(tz)
      if (cp.day_of_month !== null && now.day !== cp.day_of_month) continue
      if (cp.month_of_year !== null && now.month !== cp.month_of_year) continue
      if (cp.time !== null) {
        const h = Number(cp.time.split(":")[0])
        if (now.hour !== h) continue
      }

      // Fetch profile + household info
      const { data: profRow } = await supabase
        .from("profiles")
        .select(
          "id, name, name_enc, telegram_chat_id, telegram_chat_id_enc, family_id",
        )
        .eq("id", cp.profile_id)
        .single()
      if (!profRow) continue
      const profDecoded = decodeProfilePii(profRow)
      const prof = {
        id: profRow.id,
        name: profDecoded.name ?? profRow.name ?? "",
        telegram_chat_id: profDecoded.telegram_chat_id ?? profRow.telegram_chat_id ?? null,
        family_id: profRow.family_id,
      }

      const { data: fam } = await supabase
        .from("families")
        .select("household_id")
        .eq("id", prof.family_id)
        .single()
      if (!fam) continue

      const { data: hh } = await supabase
        .from("households")
        .select("telegram_chat_id, telegram_bot_token, telegram_bot_token_enc")
        .eq("id", fam.household_id)
        .single()
      const hhBotToken = hh ? decryptBotToken(hh) : null
      if (!hhBotToken || !hh?.telegram_chat_id) continue

      const ctx: ReminderContext = {
        profiles: [{ id: prof.id, name: prof.name }],
        dashboardUrl,
      }

      const message = await generateMessage(
        cp.notification_type,
        fam.household_id,
        now,
        ctx,
      )
      if (!message) continue

      const chatTarget = prof.telegram_chat_id ?? hh.telegram_chat_id
      const result = await sendTelegramMessage(
        hhBotToken,
        chatTarget,
        message,
      )

      if (result.ok) {
        sent++
      } else {
        errors.push(`custom:${cp.profile_id}:${cp.notification_type}: ${result.error}`)
      }

      alreadySent.add(key)
    }

    // --- Weekly Monday seasonality digest ---
    const today = new Date()
    if (today.getUTCDay() === 1) {
      const active = getActiveEvents(today)
      const upcoming = getUpcomingEvents(today, 7)
      const seasonalityMsg = seasonalityReminder(
        active,
        upcoming,
        dashboardUrl,
      )

      if (seasonalityMsg) {
        // Read both plaintext and encrypted columns; decrypt at use site.
        // Filter by either being non-null so newly-encrypted-only rows still match.
        const { data: households } = await supabase
          .from("households")
          .select(
            "id, telegram_chat_id, telegram_bot_token, telegram_bot_token_enc",
          )
          .not("telegram_chat_id", "is", null)
          .or("telegram_bot_token.not.is.null,telegram_bot_token_enc.not.is.null")

        for (const hh of households ?? []) {
          const hhBotToken = decryptBotToken(hh)
          if (!hhBotToken) continue
          const { data: families } = await supabase
            .from("families")
            .select("id")
            .eq("household_id", hh.id)

          const familyIds = (families ?? []).map((f) => f.id)
          const { data: rawHhProfiles } = familyIds.length > 0
            ? await supabase
                .from("profiles")
                .select("id, telegram_chat_id, telegram_chat_id_enc")
                .in("family_id", familyIds)
            : { data: [] as { id: string; telegram_chat_id: string | null; telegram_chat_id_enc: string | null }[] }
          const hhProfiles = (rawHhProfiles ?? []).map((p) => ({
            id: p.id,
            telegram_chat_id:
              decodeProfilePii(p).telegram_chat_id ?? p.telegram_chat_id ?? null,
          }))

          // Check per-profile opt-outs for seasonality
          const hhProfileIds = (hhProfiles ?? []).map((p) => p.id)
          const { data: seasonDisabled } =
            hhProfileIds.length > 0
              ? await supabase
                  .from("notification_preferences")
                  .select("profile_id")
                  .in("profile_id", hhProfileIds)
                  .eq("notification_type", "seasonality_weekly")
                  .eq("enabled", false)
              : { data: [] }

          const disabledSeasonIds = new Set(
            (seasonDisabled ?? []).map((p) => p.profile_id),
          )

          const enabledHhProfiles = (hhProfiles ?? []).filter(
            (p) => !disabledSeasonIds.has(p.id),
          )

          // If all profiles opted out, skip this household
          if (enabledHhProfiles.length === 0) continue

          const profileChats = enabledHhProfiles
            .filter((p) => p.telegram_chat_id)
            .map((p) => p.telegram_chat_id as string)

          const targets =
            profileChats.length > 0
              ? [...new Set(profileChats)]
              : [hh.telegram_chat_id as string]

          for (const chatTarget of targets) {
            const result = await sendTelegramMessage(
              hhBotToken,
              chatTarget,
              seasonalityMsg,
            )
            if (result.ok) {
              sent++
            } else {
              errors.push(`seasonality:${hh.id}: ${result.error}`)
            }
          }
        }
      }
    }

    return NextResponse.json({ sent, errors })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
