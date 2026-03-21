import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import {
  getEffectiveOutflowForProfile,
  getSharedIlpTotalForFamily,
} from "@/lib/api/effective-outflow"
import { getEffectiveInflowWithBreakdown } from "@/lib/api/effective-inflow"
import { fetchCashflowRangeSeries } from "@/lib/api/cashflow-range"

const cashflowQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  startMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const cashflowBodySchema = z.object({
  profileId: z.string().uuid(),
  familyId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inflow: z.number().min(0).optional(),
  outflow: z.number().min(0).optional(),
  source: z.string().optional(),
  inflowMemo: z.string().max(2000).optional(),
  outflowMemo: z.string().max(2000).optional(),
})

const cashflowDeleteSchema = z.object({
  id: z.string().uuid(),
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
    const parsed = cashflowQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      startMonth: searchParams.get("startMonth") ?? undefined,
      endMonth: searchParams.get("endMonth") ?? undefined,
      month: searchParams.get("month") ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 })
    }

    const { profileId, familyId, startMonth, endMonth, month } = parsed.data

    // Waterfall mode: single month with breakdown
    if (month) {
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
      const { profileIds, familyId: resolvedFamilyId } = resolved

      let inflowTotal = 0
      const inflowBreakdown: { salary?: number; bonus?: number; income?: number } = {}
      let discretionary = 0
      let insurance = 0
      let ilp = 0
      let loans = 0
      let tax = 0

      for (const pid of profileIds) {
        const inflow = await getEffectiveInflowWithBreakdown(supabase, pid, month)
        inflowTotal += inflow.total
        if (inflow.salary != null) {
          inflowBreakdown.salary = (inflowBreakdown.salary ?? 0) + inflow.salary
        }
        if (inflow.bonus != null) {
          inflowBreakdown.bonus = (inflowBreakdown.bonus ?? 0) + inflow.bonus
        }
        if (inflow.income != null) {
          inflowBreakdown.income = (inflowBreakdown.income ?? 0) + inflow.income
        }

        const eff = await getEffectiveOutflowForProfile(supabase, pid, month)
        discretionary += eff.discretionary
        insurance += eff.insurance
        ilp += eff.ilp
        loans += eff.loans
        tax += eff.tax
      }

      // Add shared ILP products (profile_id null) once to avoid double-counting
      const sharedIlp = await getSharedIlpTotalForFamily(supabase, resolvedFamilyId)
      ilp += sharedIlp

      const outflowTotal = discretionary + insurance + ilp + loans + tax
      const netSavings = inflowTotal - outflowTotal

      const roundedInflowBreakdown =
        Object.keys(inflowBreakdown).length > 0
          ? Object.fromEntries(
              Object.entries(inflowBreakdown).map(([k, v]) => [
                k,
                Math.round((v ?? 0) * 100) / 100,
              ])
            )
          : undefined

      return NextResponse.json({
        month,
        inflowTotal: Math.round(inflowTotal * 100) / 100,
        inflowBreakdown: roundedInflowBreakdown,
        outflowTotal: Math.round(outflowTotal * 100) / 100,
        outflowBreakdown: {
          discretionary: Math.round(discretionary * 100) / 100,
          insurance: Math.round(insurance * 100) / 100,
          ilp: Math.round(ilp * 100) / 100,
          loans: Math.round(loans * 100) / 100,
          tax: Math.round(tax * 100) / 100,
        },
        netSavings: Math.round(netSavings * 100) / 100,
      })
    }

    if (!startMonth || !endMonth) {
      return NextResponse.json(
        { error: "startMonth and endMonth required when month is not provided" },
        { status: 400 }
      )
    }
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
    const { profileIds, familyId: resolvedFamilyId } = resolved

    try {
      const result = await fetchCashflowRangeSeries(supabase, {
        profileIds,
        familyId: resolvedFamilyId,
        startMonth,
        endMonth,
      })
      return NextResponse.json(result)
    } catch (e) {
      console.error("[api/cashflow] GET range:", e)
      return NextResponse.json({ error: "Failed to fetch cashflow" }, { status: 500 })
    }
  } catch (err) {
    console.error("[api/cashflow] GET Error:", err)
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
    const parsed = cashflowBodySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { profileId, familyId, month, inflow, outflow, source, inflowMemo, outflowMemo } =
      parsed.data
    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      profileId,
      familyId ?? null
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }
    if (!resolved.profileIds.includes(profileId)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const { data, error } = await supabase
      .from("monthly_cashflow")
      .upsert(
        {
          profile_id: profileId,
          month,
          ...(inflow !== undefined && { inflow }),
          ...(outflow !== undefined && { outflow }),
          ...(source !== undefined && { source }),
          ...(inflowMemo !== undefined && { inflow_memo: inflowMemo || null }),
          ...(outflowMemo !== undefined && { outflow_memo: outflowMemo || null }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "profile_id,month" },
      )
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Failed to upsert cashflow" }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error("[api/cashflow] POST Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { accountId } = session

    const body = await request.json()
    const parsed = cashflowDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { id, familyId } = parsed.data
    const supabase = createSupabaseAdmin()

    const { data: row, error: fetchErr } = await supabase
      .from("monthly_cashflow")
      .select("id, profile_id")
      .eq("id", id)
      .maybeSingle()

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const resolved = await resolveFamilyAndProfiles(
      supabase,
      accountId,
      row.profile_id,
      familyId ?? null
    )
    if (!resolved || !resolved.profileIds.includes(row.profile_id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { error: delErr } = await supabase.from("monthly_cashflow").delete().eq("id", id)

    if (delErr) {
      console.error("[api/cashflow] DELETE:", delErr)
      return NextResponse.json({ error: "Failed to delete cashflow" }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/cashflow] DELETE Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
