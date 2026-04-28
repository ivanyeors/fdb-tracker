import type { SeasonalityEvent } from "@/lib/investments/seasonality"

type ReminderContext = {
  profiles: Array<{ name: string }>
  dashboardUrl: string
}

export function endOfMonthReminder(
  month: string,
  ctx: ReminderContext,
): string {
  const names = ctx.profiles.map((p) => p.name)
  const nameExamples = names[0] ?? "name"

  return [
    `📊 Time to update ${month} finances!`,
    "",
    `/in ${nameExamples} [amount]`,
    `/out ${nameExamples} [amount]`,
    `/ilp ${nameExamples} [product] [value]`,
    `/goaladd ${nameExamples} [goal] [amount]`,
    "",
    "Or send your PDF bank statement.",
    "",
    `Dashboard: ${ctx.dashboardUrl}`,
  ].join("\n")
}

export function incomeYearlyReminder(
  year: number,
  ctx: ReminderContext,
): string {
  return [
    `💰 Time to update income for ${year}!`,
    "",
    "Go to Dashboard → Settings → Income.",
    "This affects CPF projection and take-home pay calculation.",
    "",
    `Dashboard: ${ctx.dashboardUrl}`,
  ].join("\n")
}

export function incomeMonthlyReminder(
  month: string,
  name: string,
  expectedTakeHome: number,
): string {
  return [
    `💰 Confirm ${month} income for ${name}.`,
    "",
    `/in ${name} [amount]`,
    "",
    `Expected take-home: $${expectedTakeHome} (based on your salary config)`,
  ].join("\n")
}

export function insuranceYearlyReminder(
  year: number,
  ctx: ReminderContext,
): string {
  return [
    `🛡️ Update insurance premiums for ${year}!`,
    "",
    "Age-based premiums may have changed.",
    "Dashboard → Settings → Insurance",
    "",
    `Dashboard: ${ctx.dashboardUrl}`,
  ].join("\n")
}

export function insuranceMonthlyReminder(
  policyName: string,
  amount: number,
): string {
  return `🔔 Insurance premium of $${amount} for ${policyName} is due this month.`
}

function formatSeasonalityDateRange(e: SeasonalityEvent): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  const start = `${months[e.startMonth - 1]} ${e.startDay}`
  if (e.startMonth === e.endMonth && e.startDay === e.endDay) return start
  return `${start} – ${months[e.endMonth - 1]} ${e.endDay}`
}

export function seasonalityReminder(
  activeEvents: SeasonalityEvent[],
  upcomingEvents: SeasonalityEvent[],
  dashboardUrl: string,
): string | null {
  if (activeEvents.length === 0 && upcomingEvents.length === 0) return null

  const lines: string[] = ["📊 Weekly Market Seasonality Digest", ""]

  const risks = activeEvents.filter((e) => e.type === "risk")
  const opps = activeEvents.filter((e) => e.type === "opportunity")

  if (risks.length > 0) {
    lines.push("⚠️ RISK / CAUTION:")
    for (const e of risks) {
      lines.push(
        `• ${e.title} (${formatSeasonalityDateRange(e)})`,
        `  ${e.description}`,
      )
    }
    lines.push("")
  }

  if (opps.length > 0) {
    lines.push("📈 OPPORTUNITY:")
    for (const e of opps) {
      lines.push(
        `• ${e.title} (${formatSeasonalityDateRange(e)})`,
        `  ${e.description}`,
      )
    }
    lines.push("")
  }

  if (upcomingEvents.length > 0) {
    lines.push("🔜 UPCOMING (next 7 days):")
    for (const e of upcomingEvents) {
      const icon = e.type === "risk" ? "⚠️" : "📈"
      lines.push(`${icon} ${e.title} — ${formatSeasonalityDateRange(e)}`)
    }
    lines.push("")
  }

  lines.push(`Dashboard: ${dashboardUrl}/dashboard/investments`)

  return lines.join("\n")
}

export function taxYearlyReminder(
  year: number,
  calculatedTax: number | null,
  ctx: ReminderContext,
): string {
  const taxLine =
    calculatedTax !== null
      ? `Your calculated tax: $${calculatedTax.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "Your calculated tax: not yet computed"

  return [
    `📋 Tax review for YA ${year}.`,
    "",
    taxLine,
    "",
    "💡 Got your IRAS NOA? Upload the PDF on the dashboard or use /tax to record your assessment.",
    "Your GIRO schedule, relief comparison, and due date will be auto-calculated.",
    "",
    `Dashboard: ${ctx.dashboardUrl}/dashboard/tax`,
  ].join("\n")
}
