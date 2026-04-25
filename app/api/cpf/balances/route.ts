import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { decodeProfilePii } from "@/lib/repos/profiles"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import {
  getAge,
  getCpfRates,
  getCpfAllocation,
  calculateCpfContribution,
  getActiveEmployersForMonth,
  type EmploymentPeriod,
} from "@/lib/calculations/cpf"
import {
  getMonthlyHealthcareMaDeduction,
  type CpfHealthcareConfig,
} from "@/lib/calculations/cpf-healthcare"

const balancesQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  months: z.string().regex(/^\d+$/).optional(),
})

const manualOverrideSchema = z.object({
  profileId: z.string().uuid(),
  familyId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  oa: z.number().min(0),
  sa: z.number().min(0),
  ma: z.number().min(0),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const { searchParams } = request.nextUrl
    const parsed = balancesQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      months: searchParams.get("months") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, familyId } = parsed.data
    const monthCount = parsed.data.months ? parseInt(parsed.data.months, 10) : 12
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId ?? null,
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    const { profileIds } = resolved

    const { data: balances } = await supabase
      .from("cpf_balances")
      .select("*")
      .in("profile_id", profileIds)
      .order("month", { ascending: false })
      .limit(monthCount * profileIds.length)

    if (balances && balances.length > 0) {
      // Aggregate by month (sum OA, SA, MA across profiles) for consistent dashboard display
      const byMonth = new Map<
        string,
        { month: string; oa: number; sa: number; ma: number }
      >()
      for (const row of balances) {
        const month =
          typeof row.month === "string"
            ? row.month.slice(0, 10)
            : new Date(row.month).toISOString().slice(0, 10)
        const oa = Number(row.oa) || 0
        const sa = Number(row.sa) || 0
        const ma = Number(row.ma) || 0
        const existing = byMonth.get(month)
        if (existing) {
          existing.oa += oa
          existing.sa += sa
          existing.ma += ma
        } else {
          byMonth.set(month, { month, oa, sa, ma })
        }
      }
      const aggregated = Array.from(byMonth.values()).sort(
        (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime(),
      )
      return NextResponse.json(aggregated)
    }

    // Project from income when no manual data - support single or multi-profile
    const [{ data: profiles }, { data: incomeConfigs }, { data: healthcareConfigs }, { data: incomeHistoryRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, birth_year, birth_year_enc")
        .in("id", profileIds),
      supabase
        .from("income_config")
        .select("profile_id, annual_salary, bonus_estimate")
        .in("profile_id", profileIds),
      supabase
        .from("cpf_healthcare_config")
        .select("*")
        .in("profile_id", profileIds),
      supabase
        .from("income_history")
        .select("*")
        .in("profile_id", profileIds)
        .order("start_date", { ascending: true }),
    ])

    const incomeByProfile = new Map(
      incomeConfigs?.map((ic) => [ic.profile_id, ic]) ?? [],
    )
    const profileById = new Map(
      profiles?.map((p) => [
        p.id,
        { ...p, birth_year: decodeProfilePii(p).birth_year ?? p.birth_year },
      ]) ?? [],
    )
    // Group income history by profile for multi-employer support
    const incomeHistoryByProfile = new Map<string, EmploymentPeriod[]>()
    for (const row of incomeHistoryRows ?? []) {
      const periods = incomeHistoryByProfile.get(row.profile_id) ?? []
      periods.push({
        employerName: row.employer_name,
        monthlySalary: Number(row.monthly_salary),
        startDate: row.start_date,
        endDate: row.end_date,
      })
      incomeHistoryByProfile.set(row.profile_id, periods)
    }

    const healthcareByProfile = new Map<string, CpfHealthcareConfig | null>(
      (healthcareConfigs ?? []).map((hc) => [
        hc.profile_id,
        {
          profileId: hc.profile_id,
          mslAnnualOverride:
            hc.msl_annual_override != null
              ? Number(hc.msl_annual_override)
              : null,
          cslAnnual: Number(hc.csl_annual),
          cslSupplementAnnual: Number(hc.csl_supplement_annual),
          ispAnnual: Number(hc.isp_annual),
        },
      ]),
    )

    const now = new Date()
    const currentYear = now.getFullYear()
    const allProjected: Array<{
      profile_id: string
      month: string
      oa: number
      sa: number
      ma: number
      is_manual_override: boolean
    }> = []

    // Fetch use_cpf_oa loans for OA deduction in projections
    const { data: cpfLoans } = await supabase
      .from("loans")
      .select("id, profile_id, principal, rate_pct, tenure_months, split_profile_id, split_pct")
      .in("profile_id", profileIds)
      .eq("use_cpf_oa", true)

    // Calculate monthly CPF OA deduction per profile from housing loans
    const cpfOaDeductionByProfile = new Map<string, number>()
    for (const loan of cpfLoans ?? []) {
      const monthlyRate = loan.rate_pct / 100 / 12
      let monthlyPayment = 0
      if (monthlyRate > 0 && loan.tenure_months > 0) {
        monthlyPayment =
          (loan.principal * monthlyRate) /
          (1 - Math.pow(1 + monthlyRate, -loan.tenure_months))
      } else if (loan.tenure_months > 0) {
        monthlyPayment = loan.principal / loan.tenure_months
      }

      // Apply spouse split if applicable
      const primaryPct = (loan.split_pct ?? 100) / 100
      const primaryPid = loan.profile_id as string
      const splitPid = loan.split_profile_id as string | null

      cpfOaDeductionByProfile.set(
        primaryPid,
        (cpfOaDeductionByProfile.get(primaryPid) ?? 0) + monthlyPayment * primaryPct,
      )
      if (splitPid && profileIds.includes(splitPid)) {
        cpfOaDeductionByProfile.set(
          splitPid,
          (cpfOaDeductionByProfile.get(splitPid) ?? 0) + monthlyPayment * (1 - primaryPct),
        )
      }
    }

    for (const pid of profileIds) {
      const profile = profileById.get(pid)
      const incomeConfig = incomeByProfile.get(pid)
      const employmentPeriods = incomeHistoryByProfile.get(pid)
      const hasHistory = employmentPeriods && employmentPeriods.length > 0

      // Need either income_config or income_history to project
      if (!profile) continue
      if (!hasHistory && (!incomeConfig || incomeConfig.annual_salary <= 0)) continue

      const age = getAge(profile.birth_year, currentYear)
      const rates = getCpfRates(age, currentYear)
      const allocation = getCpfAllocation(age, currentYear)

      // Fallback single-employer contribution (from income_config)
      const fallbackContribution = incomeConfig && incomeConfig.annual_salary > 0
        ? calculateCpfContribution(incomeConfig.annual_salary / 12, age, currentYear)
        : null

      // Monthly CPF OA deduction for housing loan
      const monthlyOaDeduction = cpfOaDeductionByProfile.get(pid) ?? 0

      // Monthly MA deduction for healthcare (MSL, CSL, ISP)
      const hcConfig = healthcareByProfile.get(pid) ?? null
      const monthlyMaDeduction = getMonthlyHealthcareMaDeduction(
        profile.birth_year,
        currentYear,
        hcConfig,
      )

      let runningOa = 0
      let runningSa = 0
      let runningMa = 0

      for (let i = 0; i < monthCount; i++) {
        const d = new Date(
          now.getFullYear(),
          now.getMonth() - (monthCount - 1 - i),
          1,
        )
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, "0")
        const monthStr = `${yyyy}-${mm}-01`
        const monthIdx = d.getMonth()

        let monthOa: number
        let monthSa: number
        let monthMa: number

        if (hasHistory) {
          // Multi-employer: sum contributions from all active employers this month
          const active = getActiveEmployersForMonth(employmentPeriods, yyyy, monthIdx)
          let totalContrib = 0
          for (const emp of active) {
            const cpfableWage = Math.min(emp.monthlySalary, rates.owCeiling)
            const employee = Math.round(cpfableWage * rates.employeeRate * 100) / 100
            const employer = Math.round(cpfableWage * rates.employerRate * 100) / 100
            totalContrib += employee + employer
          }
          monthOa = Math.round(totalContrib * allocation.oa * 100) / 100
          monthSa = Math.round(totalContrib * allocation.sa * 100) / 100
          monthMa = Math.round((totalContrib - monthOa - monthSa) * 100) / 100
        } else if (fallbackContribution) {
          monthOa = fallbackContribution.oa
          monthSa = fallbackContribution.sa
          monthMa = fallbackContribution.ma
        } else {
          continue
        }

        runningOa += monthOa - monthlyOaDeduction
        runningSa += monthSa
        runningMa += monthMa - monthlyMaDeduction

        allProjected.push({
          profile_id: pid,
          month: monthStr,
          oa: Math.round(Math.max(0, runningOa) * 100) / 100,
          sa: Math.round(runningSa * 100) / 100,
          ma: Math.round(Math.max(0, runningMa) * 100) / 100,
          is_manual_override: false,
        })
      }
    }

    // Aggregate by month when multiple profiles (for CPF page charts)
    const byMonth = new Map<
      string,
      { month: string; oa: number; sa: number; ma: number }
    >()
    for (const p of allProjected) {
      const existing = byMonth.get(p.month)
      if (existing) {
        existing.oa += p.oa
        existing.sa += p.sa
        existing.ma += p.ma
      } else {
        byMonth.set(p.month, { month: p.month, oa: p.oa, sa: p.sa, ma: p.ma })
      }
    }
    const aggregated = Array.from(byMonth.values()).sort(
      (a, b) => new Date(a.month).getTime() - new Date(b.month).getTime(),
    )

    return NextResponse.json(aggregated)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = manualOverrideSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { profileId, familyId, month, oa, sa, ma } = parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId,
      familyId ?? null
    )
    if (!resolved || !resolved.profileIds.includes(profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("cpf_balances")
      .upsert(
        {
          profile_id: profileId,
          month,
          oa,
          sa,
          ma,
          is_manual_override: true,
        },
        { onConflict: "profile_id,month" },
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to save CPF balance" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
