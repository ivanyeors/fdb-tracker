type ReminderContext = {
  householdProfiles: Array<{ name: string }>
  dashboardUrl: string
}

export function endOfMonthReminder(
  month: string,
  ctx: ReminderContext,
): string {
  const names = ctx.householdProfiles.map((p) => p.name)
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

export function taxYearlyReminder(
  year: number,
  calculatedTax: number | null,
  ctx: ReminderContext,
): string {
  const taxLine =
    calculatedTax !== null
      ? `Your calculated tax: $${calculatedTax}`
      : "Your calculated tax: not yet computed"

  return [
    `📋 Year-end tax review for YA ${year}.`,
    "",
    taxLine,
    "Review relief inputs on the dashboard.",
    "",
    `Dashboard: ${ctx.dashboardUrl}`,
  ].join("\n")
}
