import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { getAge, calculateCpfContribution } from "@/lib/calculations/cpf"
import {
  getRetirementSums,
  projectCpfGrowth,
  calculateRetirementGap,
  findBenchmarkAge,
} from "@/lib/calculations/cpf-retirement"

const retirementQuerySchema = z.object({
  profileId: z.string().uuid(),
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
      profileId: searchParams.get("profileId"),
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, birth_year")
      .eq("id", profileId)
      .eq("household_id", accountId)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const currentYear = new Date().getFullYear()
    const currentAge = getAge(profile.birth_year, currentYear)

    const { data: incomeConfig } = await supabase
      .from("income_config")
      .select("annual_salary, bonus_estimate")
      .eq("profile_id", profileId)
      .single()

    const { data: latestBalance } = await supabase
      .from("cpf_balances")
      .select("oa, sa, ma")
      .eq("profile_id", profileId)
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

    const cohortYear = profile.birth_year + 55
    const retirementSums = getRetirementSums(cohortYear)

    const projection = projectCpfGrowth({
      currentOa,
      currentSa,
      currentMa,
      monthlyContribution,
      currentAge,
      targetAge: 55,
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
    })

    const brsAge = findBenchmarkAge(extendedProjection, retirementSums.brs)
    const frsAge = findBenchmarkAge(extendedProjection, retirementSums.frs)
    const ersAge = findBenchmarkAge(extendedProjection, retirementSums.ers)

    return NextResponse.json({
      profileId,
      birthYear: profile.birth_year,
      currentAge,
      cohortYear,
      retirementSums,
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
