import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getEffectiveInflowForProfile } from "@/lib/api/effective-inflow"
import { getEffectiveOutflowForProfile } from "@/lib/api/effective-outflow"
import { loanMonthlyPayment, splitPayment, estimateOutstandingPrincipal } from "@/lib/calculations/loans"

function getPreviousMonth(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const dayOfMonth = now.getDate()
  const results: Record<string, unknown> = { ok: true }

  // Run monthly tasks on the 1st of each month
  if (dayOfMonth === 1) {
    const supabase = createSupabaseAdmin()
    const prevMonth = getPreviousMonth()

    try {
      // --- 1. Auto-create cashflow snapshots for previous month ---
      const { data: households } = await supabase
        .from("households")
        .select("id")
        .not("onboarding_completed_at", "is", null)

      let cashflowCreated = 0
      let insuranceExpired = 0
      let loanPaymentsLogged = 0

      for (const household of households ?? []) {
        const { data: families } = await supabase
          .from("families")
          .select("id")
          .eq("household_id", household.id)

        for (const family of families ?? []) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id")
            .eq("family_id", family.id)

          for (const profile of profiles ?? []) {
            // Check if cashflow row already exists for prev month
            const { data: existing } = await supabase
              .from("monthly_cashflow")
              .select("id")
              .eq("profile_id", profile.id)
              .eq("month", prevMonth)
              .maybeSingle()

            if (!existing) {
              const inflow = await getEffectiveInflowForProfile(supabase, profile.id, prevMonth)
              const outflow = await getEffectiveOutflowForProfile(supabase, profile.id, prevMonth)

              await supabase.from("monthly_cashflow").insert({
                profile_id: profile.id,
                month: prevMonth,
                inflow: Math.round(inflow * 100) / 100,
                outflow: Math.round(outflow.total * 100) / 100,
                is_auto_generated: true,
              })
              cashflowCreated++
            }

            // --- 2. Auto-log scheduled loan payments ---
            const { data: loans } = await supabase
              .from("loans")
              .select("id, principal, rate_pct, tenure_months, start_date")
              .eq("profile_id", profile.id)

            for (const loan of loans ?? []) {
              // Check if loan is still active (within tenure)
              const start = new Date(loan.start_date)
              const endDate = new Date(start)
              endDate.setMonth(endDate.getMonth() + loan.tenure_months)
              if (new Date(prevMonth) >= endDate) continue

              // Check if repayment already logged for this month
              const { data: existingRepayment } = await supabase
                .from("loan_repayments")
                .select("id")
                .eq("loan_id", loan.id)
                .eq("date", prevMonth)
                .maybeSingle()

              if (!existingRepayment) {
                // Get current outstanding to calculate interest split
                const { data: prevRepayments } = await supabase
                  .from("loan_repayments")
                  .select("amount, date")
                  .eq("loan_id", loan.id)
                  .lt("date", prevMonth)
                  .order("date", { ascending: true })

                const { data: prevEarlyRepayments } = await supabase
                  .from("loan_early_repayments")
                  .select("amount, date")
                  .eq("loan_id", loan.id)
                  .lt("date", prevMonth)
                  .order("date", { ascending: true })

                const outstanding = estimateOutstandingPrincipal(
                  loan.principal,
                  loan.rate_pct,
                  prevRepayments ?? [],
                  prevEarlyRepayments ?? [],
                )

                if (outstanding > 0) {
                  const monthly = loanMonthlyPayment(loan.principal, loan.rate_pct, loan.tenure_months)
                  const payment = Math.min(monthly, outstanding + (outstanding * loan.rate_pct / 100 / 12))

                  await supabase.from("loan_repayments").insert({
                    loan_id: loan.id,
                    amount: Math.round(payment * 100) / 100,
                    date: prevMonth,
                    is_auto_generated: true,
                  })
                  loanPaymentsLogged++
                }
              }
            }
          }
        }
      }

      // --- 3. Auto-expire insurance policies ---
      const today = now.toISOString().slice(0, 10)
      const { data: expiredPolicies } = await supabase
        .from("insurance_policies")
        .update({ is_active: false })
        .eq("is_active", true)
        .lt("end_date", today)
        .select("id")

      insuranceExpired = expiredPolicies?.length ?? 0

      results.monthly = {
        cashflowCreated,
        insuranceExpired,
        loanPaymentsLogged,
      }
    } catch (err) {
      console.error("[cron] Monthly automation error:", err)
      results.monthlyError = String(err)
    }
  }

  return NextResponse.json(results)
}
