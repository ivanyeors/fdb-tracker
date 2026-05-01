import { NextRequest, NextResponse } from "next/server"

import { decodeIncomeConfigPii } from "@/lib/repos/income-config"
import { decodeInsurancePoliciesPii } from "@/lib/repos/insurance-policies"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { decodeTaxReliefInputsPii } from "@/lib/repos/tax-relief-inputs"
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

function nowInTimezone(timezone: string): { hour: number; day: number; month: number; year: number; monthLabel: string; previousMonthLabel: string } {
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

  const month = get("month")
  const previousMonthIndex = month === 1 ? 12 : month - 1

  return {
    hour: get("hour"),
    day: get("day"),
    month,
    year: get("year"),
    monthLabel: monthNames[month] ?? "",
    previousMonthLabel: monthNames[previousMonthIndex] ?? "",
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    })

    if (res.ok) return { ok: true }

    const data = (await res.json().catch(() => ({}))) as {
      description?: string
      parameters?: { retry_after?: number }
    }

    if (res.status === 429 && attempt === 0) {
      const retryAfter = Math.min(data.parameters?.retry_after ?? 1, 30)
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      continue
    }

    return { ok: false, error: data.description ?? `HTTP ${res.status}` }
  }

  return { ok: false, error: "rate-limited" }
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
      return endOfMonthReminder(now.previousMonthLabel, ctx)

    case "income_yearly":
      return incomeYearlyReminder(now.year, ctx)

    case "income_monthly": {
      for (const profile of ctx.profiles) {
        const { data: incomeConfig } = await supabase
          .from("income_config")
          .select("annual_salary_enc, employee_cpf_rate")
          .eq("profile_id", profile.id)
          .single()

        if (incomeConfig) {
          const cpfRate = incomeConfig.employee_cpf_rate ?? 0.2
          const annualSalary =
            decodeIncomeConfigPii(incomeConfig).annual_salary ?? 0
          const monthlyGross = annualSalary / 12
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
          .select("name, premium_amount_enc, frequency")
          .in("profile_id", profileIds)
          .eq("is_active", true)
          .eq("frequency", "monthly")

        if (policies && policies.length > 0) {
          return policies
            .map((p) =>
              insuranceMonthlyReminder(
                p.name,
                decodeInsurancePoliciesPii(p).premium_amount ?? 0,
              ),
            )
            .join("\n\n")
        }
      }
      return insuranceMonthlyReminder("policy", 0)
    }

    case "tax_yearly": {
      let calculatedTax: number | null = null
      if (ctx.profiles.length > 0) {
        const profileId = ctx.profiles[0].id
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
            .select("annual_salary_enc, bonus_estimate_enc")
            .eq("profile_id", profileId)
            .single()
          if (profile && incomeConfig) {
            const decodedIncome = decodeIncomeConfigPii(incomeConfig)
            const { data: insurancePolicies } = await supabase
              .from("insurance_policies")
              .select(
                "type, premium_amount_enc, frequency, coverage_amount_enc, is_active",
              )
              .eq("profile_id", profileId)
            const { data: manualReliefs } = await supabase
              .from("tax_relief_inputs")
              .select("relief_type, amount_enc")
              .eq("profile_id", profileId)
              .eq("year", now.year)
            const result = calculateTax({
              profile: { birth_year: profile.birth_year },
              incomeConfig: {
                annual_salary: decodedIncome.annual_salary ?? 0,
                bonus_estimate: decodedIncome.bonus_estimate ?? 0,
              },
              insurancePolicies: (insurancePolicies ?? []).map((p) => {
                const dec = decodeInsurancePoliciesPii(p)
                return {
                  type: p.type,
                  premium_amount: dec.premium_amount ?? 0,
                  frequency: p.frequency,
                  coverage_amount: dec.coverage_amount ?? 0,
                  is_active: p.is_active,
                }
              }),
              manualReliefs: (manualReliefs ?? []).map((r) => ({
                relief_type: r.relief_type,
                amount: decodeTaxReliefInputsPii(r).amount ?? 0,
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

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

type DecodedProfile = {
  id: string
  name: string
  telegram_chat_id: string | null
}

type Schedule = {
  id: string
  family_id: string
  prompt_type: string
  frequency: string
  day_of_month: number
  month_of_year: number | null
  time: string
  timezone: string
}

type NotificationPref = {
  profile_id: string
  enabled: boolean
  day_of_month: number | null
  month_of_year: number | null
  time: string | null
  timezone: string | null
}

type CustomPref = {
  profile_id: string
  notification_type: string
  day_of_month: number | null
  month_of_year: number | null
  time: string | null
  timezone: string | null
}

type Pass = { sent: number; errors: string[] }

function decodeProfileRow(p: {
  id: string
  name: string | null
  name_enc?: string | null
  telegram_chat_id: string | null
  telegram_chat_id_enc?: string | null
}): DecodedProfile {
  const decoded = decodeProfilePii(p)
  return {
    id: p.id,
    name: decoded.name ?? p.name ?? "",
    telegram_chat_id: decoded.telegram_chat_id ?? p.telegram_chat_id ?? null,
  }
}

function effectivePromptType(schedule: Schedule): string {
  if (schedule.prompt_type === "income") return `income_${schedule.frequency}`
  if (schedule.prompt_type === "insurance") return `insurance_${schedule.frequency}`
  if (schedule.prompt_type === "tax") return "tax_yearly"
  return schedule.prompt_type
}

function customPrefMatchesNow(
  pref: { day_of_month: number | null; month_of_year: number | null; time: string | null },
  now: ReturnType<typeof nowInTimezone>,
): boolean {
  if (pref.day_of_month !== null && now.day !== pref.day_of_month) return false
  if (pref.month_of_year !== null && now.month !== pref.month_of_year) return false
  if (pref.time !== null) {
    const prefHour = Number(pref.time.split(":")[0])
    if (now.hour !== prefHour) return false
  }
  return true
}

function isProfileEnabledForSchedule(
  pref: NotificationPref | undefined,
  schedule: Schedule,
): boolean {
  if (!pref) return true
  if (!pref.enabled) return false
  const hasOverride =
    pref.day_of_month !== null ||
    pref.time !== null ||
    pref.month_of_year !== null
  if (!hasOverride) return true
  const tz = pref.timezone ?? schedule.timezone
  return customPrefMatchesNow(pref, nowInTimezone(tz))
}

async function loadHouseholdConfig(
  supabase: SupabaseAdmin,
  householdId: string,
): Promise<{ chatId: string; botToken: string } | null> {
  const { data: account } = await supabase
    .from("households")
    .select("telegram_chat_id, telegram_bot_token, telegram_bot_token_enc")
    .eq("id", householdId)
    .single()
  const botToken = account ? decryptBotToken(account) : null
  if (!account?.telegram_chat_id || !botToken) return null
  return { chatId: account.telegram_chat_id, botToken }
}

async function loadFamilyProfiles(
  supabase: SupabaseAdmin,
  familyId: string,
): Promise<DecodedProfile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, name_enc, telegram_chat_id, telegram_chat_id_enc")
    .eq("family_id", familyId)
  return (data ?? []).map(decodeProfileRow)
}

async function loadProfilePrefs(
  supabase: SupabaseAdmin,
  profileIds: string[],
  notificationType: string,
): Promise<Map<string, NotificationPref>> {
  if (profileIds.length === 0) return new Map()
  const { data } = await supabase
    .from("notification_preferences")
    .select("profile_id, enabled, day_of_month, month_of_year, time, timezone")
    .in("profile_id", profileIds)
    .eq("notification_type", notificationType)
  return new Map((data ?? []).map((p) => [p.profile_id, p as NotificationPref]))
}

function pickChatTargets(
  enabledProfiles: DecodedProfile[],
  fallbackChatId: string,
): Array<{ id: string; chatId: string }> {
  const profileChats = enabledProfiles
    .filter((p) => p.telegram_chat_id)
    .map((p) => ({ id: p.id, chatId: p.telegram_chat_id as string }))
  const targets =
    profileChats.length > 0
      ? profileChats
      : enabledProfiles.map((p) => ({ id: p.id, chatId: fallbackChatId }))
  return [...new Map(targets.map((t) => [t.chatId, t])).values()]
}

async function processSchedule(
  supabase: SupabaseAdmin,
  schedule: Schedule,
  dashboardUrl: string,
  alreadySent: Set<string>,
  pass: Pass,
): Promise<void> {
  const { fire, now } = shouldFire(schedule)
  if (!fire) return

  const { data: family } = await supabase
    .from("families")
    .select("household_id")
    .eq("id", schedule.family_id)
    .single()
  if (!family) {
    pass.errors.push(`${schedule.id}: family not found`)
    return
  }

  const householdConfig = await loadHouseholdConfig(supabase, family.household_id)
  if (!householdConfig) {
    pass.errors.push(`${schedule.id}: account missing telegram config`)
    return
  }

  const profiles = await loadFamilyProfiles(supabase, schedule.family_id)
  const promptType = effectivePromptType(schedule)
  const message = await generateMessage(
    promptType,
    family.household_id,
    now,
    { profiles, dashboardUrl },
  )
  if (!message) {
    pass.errors.push(`${schedule.id}: unknown prompt_type '${schedule.prompt_type}'`)
    return
  }

  const prefByProfile = await loadProfilePrefs(
    supabase,
    profiles.map((p) => p.id),
    promptType,
  )
  const enabledProfiles = profiles.filter((p) =>
    isProfileEnabledForSchedule(prefByProfile.get(p.id), schedule),
  )
  if (enabledProfiles.length === 0) return

  const targets = pickChatTargets(enabledProfiles, householdConfig.chatId)
  for (const target of targets) {
    const result = await sendTelegramMessage(
      householdConfig.botToken,
      target.chatId,
      message,
    )
    if (result.ok) {
      pass.sent++
      console.log("[reminders] sent", {
        schedule_id: schedule.id,
        profile_id: target.id,
        prompt_type: promptType,
      })
    } else {
      pass.errors.push(`${schedule.id}: ${result.error}`)
    }
  }

  for (const p of enabledProfiles) {
    alreadySent.add(`${p.id}:${promptType}`)
  }
}

async function runScheduledRemindersPass(
  supabase: SupabaseAdmin,
  dashboardUrl: string,
  alreadySent: Set<string>,
): Promise<Pass | { error: string }> {
  const { data: schedules, error } = await supabase
    .from("prompt_schedule")
    .select(
      "id, family_id, prompt_type, frequency, day_of_month, month_of_year, time, timezone",
    )
  if (error || !schedules) return { error: "Failed to fetch schedules" }

  const pass: Pass = { sent: 0, errors: [] }
  for (const schedule of schedules) {
    await processSchedule(
      supabase,
      schedule as Schedule,
      dashboardUrl,
      alreadySent,
      pass,
    )
  }
  return pass
}

async function processCustomPref(
  supabase: SupabaseAdmin,
  cp: CustomPref,
  dashboardUrl: string,
  alreadySent: Set<string>,
  pass: Pass,
): Promise<void> {
  const key = `${cp.profile_id}:${cp.notification_type}`
  if (alreadySent.has(key)) return

  const tz = cp.timezone ?? "Asia/Singapore"
  const now = nowInTimezone(tz)
  if (!customPrefMatchesNow(cp, now)) return

  const { data: profRow } = await supabase
    .from("profiles")
    .select(
      "id, name, name_enc, telegram_chat_id, telegram_chat_id_enc, family_id",
    )
    .eq("id", cp.profile_id)
    .single()
  if (!profRow) return

  const prof = { ...decodeProfileRow(profRow), family_id: profRow.family_id }

  const { data: fam } = await supabase
    .from("families")
    .select("household_id")
    .eq("id", prof.family_id)
    .single()
  if (!fam) return

  const householdConfig = await loadHouseholdConfig(supabase, fam.household_id)
  if (!householdConfig) return

  const message = await generateMessage(
    cp.notification_type,
    fam.household_id,
    now,
    { profiles: [{ id: prof.id, name: prof.name }], dashboardUrl },
  )
  if (!message) return

  const chatTarget = prof.telegram_chat_id ?? householdConfig.chatId
  const result = await sendTelegramMessage(
    householdConfig.botToken,
    chatTarget,
    message,
  )
  if (result.ok) {
    pass.sent++
    console.log("[reminders] sent", {
      schedule_id: `custom:${cp.profile_id}`,
      profile_id: cp.profile_id,
      prompt_type: cp.notification_type,
    })
  } else {
    pass.errors.push(
      `custom:${cp.profile_id}:${cp.notification_type}: ${result.error}`,
    )
  }
  alreadySent.add(key)
}

async function runCustomPrefRemindersPass(
  supabase: SupabaseAdmin,
  dashboardUrl: string,
  alreadySent: Set<string>,
): Promise<Pass> {
  const { data: customPrefs } = await supabase
    .from("notification_preferences")
    .select(
      "profile_id, notification_type, day_of_month, month_of_year, time, timezone",
    )
    .eq("enabled", true)
    .not("day_of_month", "is", null)

  const pass: Pass = { sent: 0, errors: [] }
  for (const cp of customPrefs ?? []) {
    await processCustomPref(
      supabase,
      cp as CustomPref,
      dashboardUrl,
      alreadySent,
      pass,
    )
  }
  return pass
}

async function loadHouseholdSeasonalityProfiles(
  supabase: SupabaseAdmin,
  householdId: string,
): Promise<Array<{ id: string; telegram_chat_id: string | null }>> {
  const { data: families } = await supabase
    .from("families")
    .select("id")
    .eq("household_id", householdId)
  const familyIds = (families ?? []).map((f) => f.id)
  if (familyIds.length === 0) return []

  const { data: rawProfiles } = await supabase
    .from("profiles")
    .select("id, telegram_chat_id, telegram_chat_id_enc")
    .in("family_id", familyIds)
  return (rawProfiles ?? []).map((p) => ({
    id: p.id,
    telegram_chat_id:
      decodeProfilePii(p).telegram_chat_id ?? p.telegram_chat_id ?? null,
  }))
}

async function loadSeasonalityDisabledIds(
  supabase: SupabaseAdmin,
  profileIds: string[],
): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set()
  const { data } = await supabase
    .from("notification_preferences")
    .select("profile_id")
    .in("profile_id", profileIds)
    .eq("notification_type", "seasonality_weekly")
    .eq("enabled", false)
  return new Set((data ?? []).map((p) => p.profile_id))
}

async function sendSeasonalityToHousehold(
  supabase: SupabaseAdmin,
  hh: {
    id: string
    telegram_chat_id: string | null
    telegram_bot_token: string | null
    telegram_bot_token_enc: string | null
  },
  seasonalityMsg: string,
  pass: Pass,
): Promise<void> {
  const hhBotToken = decryptBotToken(hh)
  if (!hhBotToken) return

  const profiles = await loadHouseholdSeasonalityProfiles(supabase, hh.id)
  const disabledIds = await loadSeasonalityDisabledIds(
    supabase,
    profiles.map((p) => p.id),
  )
  const enabled = profiles.filter((p) => !disabledIds.has(p.id))
  if (enabled.length === 0) return

  const profileChats = enabled
    .filter((p) => p.telegram_chat_id)
    .map((p) => p.telegram_chat_id as string)
  const targets =
    profileChats.length > 0
      ? [...new Set(profileChats)]
      : [hh.telegram_chat_id as string]

  for (const chatTarget of targets) {
    const result = await sendTelegramMessage(hhBotToken, chatTarget, seasonalityMsg)
    if (result.ok) {
      pass.sent++
      console.log("[reminders] sent", {
        schedule_id: `seasonality:${hh.id}`,
        profile_id: null,
        prompt_type: "seasonality_weekly",
      })
    } else {
      pass.errors.push(`seasonality:${hh.id}: ${result.error}`)
    }
  }
}

async function runSeasonalityDigestPass(
  supabase: SupabaseAdmin,
  dashboardUrl: string,
  today: Date,
): Promise<Pass> {
  const pass: Pass = { sent: 0, errors: [] }
  if (today.getUTCDay() !== 1) return pass

  const seasonalityMsg = seasonalityReminder(
    getActiveEvents(today),
    getUpcomingEvents(today, 7),
    dashboardUrl,
  )
  if (!seasonalityMsg) return pass

  // Read both plaintext and encrypted columns; decrypt at use site.
  // Filter by either being non-null so newly-encrypted-only rows still match.
  const { data: households } = await supabase
    .from("households")
    .select("id, telegram_chat_id, telegram_bot_token, telegram_bot_token_enc")
    .not("telegram_chat_id", "is", null)
    .or("telegram_bot_token.not.is.null,telegram_bot_token_enc.not.is.null")

  for (const hh of households ?? []) {
    await sendSeasonalityToHousehold(supabase, hh, seasonalityMsg, pass)
  }
  return pass
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createSupabaseAdmin()
    const dashboardUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://dollar.ivanyeo.com"
    const alreadySent = new Set<string>()

    const scheduledPass = await runScheduledRemindersPass(
      supabase,
      dashboardUrl,
      alreadySent,
    )
    if ("error" in scheduledPass) {
      return NextResponse.json({ error: scheduledPass.error }, { status: 500 })
    }

    const customPass = await runCustomPrefRemindersPass(
      supabase,
      dashboardUrl,
      alreadySent,
    )
    const seasonalityPass = await runSeasonalityDigestPass(
      supabase,
      dashboardUrl,
      new Date(),
    )

    return NextResponse.json({
      sent: scheduledPass.sent + customPass.sent + seasonalityPass.sent,
      errors: [
        ...scheduledPass.errors,
        ...customPass.errors,
        ...seasonalityPass.errors,
      ],
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
