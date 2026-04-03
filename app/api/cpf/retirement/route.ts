import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import {
  getRetirementSums,
  projectCpfGrowth,
  calculateRetirementGap,
  findBenchmarkAge,
} from "@/lib/calculations/cpf-retirement"
import { getDpsAnnualPremium, getDpsMonthlyOaDeduction } from "@/lib/calculations/cpf-dps"
import { loanMonthlyPayment } from "@/lib/calculations/loans"
import {
  getAnnualHealthcareMaDeduction,
  getMonthlyHealthcareMaDeduction,
  type CpfHealthcareConfig,
} from "@/lib/calculations/cpf-healthcare"
import { estimateAnnualInterest } from "@/lib/calculations/cpf-interest"

const retirementQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
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
    const parsed = retirementQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, familyId } = parsed.data
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
    if (resolved.profileIds.length === 0) {
      return NextResponse.json({ error: "No profiles in family" }, { status: 404 })
    }
    const singleProfileId = resolved.profileIds[0]!

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, birth_year, name, dps_include_in_projection")
      .eq("id", singleProfileId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const currentYear = new Date().getFullYear()
    const currentAge = getAge(profile.birth_year, currentYear)

    const { data: incomeConfig } = await supabase
      .from("income_config")
      .select("annual_salary, bonus_estimate")
      .eq("profile_id", singleProfileId)
      .maybeSingle()

    const { data: latestBalance } = await supabase
      .from("cpf_balances")
      .select("oa, sa, ma")
      .eq("profile_id", singleProfileId)
      .order("month", { ascending: false })
      .limit(1)
      .single()

    const currentOa = latestBalance?.oa ?? 0
    const currentSa = latestBalance?.sa ?? 0
    const currentMa = latestBalance?.ma ?? 0
    const cpfTotal = currentOa + currentSa + currentMa

    const annualSalary = incomeConfig?.annual_salary ?? 0
    const monthlyGross = annualSalary / 12
    const monthlyContribution = calculateCpfContribution(monthlyGross, currentAge, currentYear)

    const includeDps = profile.dps_include_in_projection !== false
    const birthYear = profile.birth_year

    // Fetch CPF OA loans and healthcare config in parallel
    const [{ data: cpfLoans }, { data: healthcareRow }] = await Promise.all([
      supabase
        .from("loans")
        .select("id, name, principal, rate_pct, tenure_months, start_date")
        .eq("profile_id", singleProfileId)
        .eq("use_cpf_oa", true),
      supabase
        .from("cpf_healthcare_config")
        .select("*")
        .eq("profile_id", singleProfileId)
        .maybeSingle(),
    ])

    const healthcareConfig: CpfHealthcareConfig | null = healthcareRow
      ? {
          id: healthcareRow.id,
          profileId: healthcareRow.profile_id,
          mslAnnualOverride:
            healthcareRow.msl_annual_override != null
              ? Number(healthcareRow.msl_annual_override)
              : null,
          cslAnnual: Number(healthcareRow.csl_annual),
          cslSupplementAnnual: Number(healthcareRow.csl_supplement_annual),
          ispAnnual: Number(healthcareRow.isp_annual),
        }
      : null

    const now = new Date()
    const currentMonth = now.getFullYear() * 12 + now.getMonth()
    const activeLoans = (cpfLoans ?? []).map((loan) => {
      const startDate = new Date(loan.start_date)
      const startMonth = startDate.getFullYear() * 12 + startDate.getMonth()
      const monthsElapsed = Math.max(0, currentMonth - startMonth)
      const remainingMonths = Math.max(0, loan.tenure_months - monthsElapsed)
      const endMonth = startMonth + loan.tenure_months
      const endYear = Math.floor(endMonth / 12)
      const monthly = loanMonthlyPayment(loan.principal, loan.rate_pct, loan.tenure_months)
      return {
        name: loan.name,
        monthly: Math.round(monthly * 100) / 100,
        remainingMonths,
        endYear,
      }
    }).filter((l) => l.remainingMonths > 0)

    const totalMonthlyHousing = activeLoans.reduce((sum, l) => sum + l.monthly, 0)

    const getDpsOnly = (_age: number, calendarYear: number) =>
      getDpsMonthlyOaDeduction(birthYear, calendarYear, includeDps)

    const getFullOaDeduction = (_age: number, calendarYear: number) => {
      const dps = getDpsMonthlyOaDeduction(birthYear, calendarYear, includeDps)
      let housing = 0
      for (const loan of activeLoans) {
        if (calendarYear <= loan.endYear) {
          housing += loan.monthly
        }
      }
      return dps + housing
    }

    // Healthcare MA deduction callback
    const getMaDeduction = (_age: number, calendarYear: number) =>
      getMonthlyHealthcareMaDeduction(birthYear, calendarYear, healthcareConfig)

    const healthcareBreakdown = getAnnualHealthcareMaDeduction(currentAge, healthcareConfig)

    const cohortYear = profile.birth_year + 55
    const retirementSums = getRetirementSums(cohortYear)

    const projection = projectCpfGrowth({
      currentOa,
      currentSa,
      currentMa,
      monthlyContribution,
      currentAge,
      targetAge: 55,
      getMonthlyOaDeduction: getFullOaDeduction,
      getMonthlyMaDeduction: getMaDeduction,
    })

    const projectedAt55 = projection.length > 0
      ? projection[projection.length - 1]!.total
      : cpfTotal

    const brsGap = calculateRetirementGap(projectedAt55, retirementSums.brs)
    const frsGap = calculateRetirementGap(projectedAt55, retirementSums.frs)
    const ersGap = calculateRetirementGap(projectedAt55, retirementSums.ers)

    const extendedProjection = projectCpfGrowth({
      currentOa,
      currentSa,
      currentMa,
      monthlyContribution,
      currentAge,
      targetAge: 70,
      getMonthlyOaDeduction: getFullOaDeduction,
      getMonthlyMaDeduction: getMaDeduction,
    })

    // Compute comparison projection without housing (DPS only) when loans exist
    const projectionWithoutHousing = activeLoans.length > 0
      ? projectCpfGrowth({
          currentOa,
          currentSa,
          currentMa,
          monthlyContribution,
          currentAge,
          targetAge: 70,
          getMonthlyOaDeduction: getDpsOnly,
          getMonthlyMaDeduction: getMaDeduction,
        })
      : null

    const brsAge = findBenchmarkAge(extendedProjection, retirementSums.brs)
    const frsAge = findBenchmarkAge(extendedProjection, retirementSums.frs)
    const ersAge = findBenchmarkAge(extendedProjection, retirementSums.ers)

    const dpsAnnual = getDpsAnnualPremium(currentAge, currentYear)

    // Phase 2: Interest breakdown (Government inflow)
    const interestBreakdown = estimateAnnualInterest(currentOa, currentSa, currentMa, currentAge)

    return NextResponse.json({
      profileId: singleProfileId,
      profileName: profile.name ?? null,
      birthYear: profile.birth_year,
      currentAge,
      cohortYear,
      retirementSums,
      dps: {
        included: includeDps,
        estimatedAnnualPremium: dpsAnnual,
        note:
          "DPS premiums are deducted from CPF OA (estimate from age band). Turn off in User Settings if you opted out.",
      },
      healthcare: {
        breakdown: healthcareBreakdown,
        monthlyMaDeduction: Math.round((healthcareBreakdown.total / 12) * 100) / 100,
        note: "Healthcare premiums (MSL, CSL, ISP) are deducted from MediSave. Configure in CPF Healthcare settings.",
      },
      interest: {
        breakdown: interestBreakdown,
        note: "Estimated annual interest on current balances. CPF credits interest as a lump sum on 31 Dec.",
      },
      currentCpf: { oa: currentOa, sa: currentSa, ma: currentMa, total: cpfTotal },
      projectionToAge55: projection,
      extendedProjection,
      projectionWithoutHousing,
      projectedTotalAt55: projectedAt55,
      gaps: { brs: brsGap, frs: frsGap, ers: ersGap },
      benchmarkAges: { brs: brsAge, frs: frsAge, ers: ersAge },
      housingOaDeduction: activeLoans.length > 0
        ? activeLoans.map((l) => ({
            monthly: l.monthly,
            loanName: l.name,
            remainingMonths: l.remainingMonths,
          }))
        : null,
      totalMonthlyHousingDeduction: totalMonthlyHousing > 0 ? totalMonthlyHousing : null,
      // Simulator seed data
      annualSalary: annualSalary,
      incomeGrowthRate: 0.03,
      loans: (cpfLoans ?? []).map((loan) => {
        const startDate = new Date(loan.start_date)
        const startMonth = startDate.getFullYear() * 12 + startDate.getMonth()
        const monthsElapsed = Math.max(0, currentMonth - startMonth)
        const remainingMonths = Math.max(0, loan.tenure_months - monthsElapsed)
        return {
          name: loan.name,
          principal: loan.principal,
          ratePct: loan.rate_pct,
          tenureMonths: loan.tenure_months,
          monthlyPayment: Math.round(loanMonthlyPayment(loan.principal, loan.rate_pct, loan.tenure_months) * 100) / 100,
          remainingMonths,
          useCpfOa: true,
        }
      }),
    })
  } catch (err) {
    console.error("[api/cpf/retirement] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
