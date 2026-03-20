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
    const getMonthlyOaDeduction = (_age: number, calendarYear: number) =>
      getDpsMonthlyOaDeduction(birthYear, calendarYear, includeDps)

    const cohortYear = profile.birth_year + 55
    const retirementSums = getRetirementSums(cohortYear)

    const projection = projectCpfGrowth({
      currentOa,
      currentSa,
      currentMa,
      monthlyContribution,
      currentAge,
      targetAge: 55,
      getMonthlyOaDeduction,
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
      getMonthlyOaDeduction,
    })

    const brsAge = findBenchmarkAge(extendedProjection, retirementSums.brs)
    const frsAge = findBenchmarkAge(extendedProjection, retirementSums.frs)
    const ersAge = findBenchmarkAge(extendedProjection, retirementSums.ers)

    const dpsAnnual = getDpsAnnualPremium(currentAge, currentYear)

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
      currentCpf: { oa: currentOa, sa: currentSa, ma: currentMa, total: cpfTotal },
      projectionToAge55: projection,
      extendedProjection,
      projectedTotalAt55: projectedAt55,
      gaps: { brs: brsGap, frs: frsGap, ers: ersGap },
      benchmarkAges: { brs: brsAge, frs: frsAge, ers: ersAge },
    })
  } catch (err) {
    console.error("[api/cpf/retirement] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
