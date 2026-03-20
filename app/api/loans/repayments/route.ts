import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { verifyLoanInHousehold } from "@/lib/api/verify-loan-in-household"
import {
  estimateOutstandingPrincipal,
  splitPayment,
} from "@/lib/calculations/loans"

const querySchema = z.object({
  profileId: z.string().uuid().optional(),
  familyId: z.string().uuid().optional(),
  loanId: z.string().uuid().optional(),
})

const postSchema = z.object({
  loanId: z.string().uuid(),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cpfOaAmount: z.number().min(0).optional().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const session = await validateSession(token)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = request.nextUrl
    const parsed = querySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
      familyId: searchParams.get("familyId") ?? undefined,
      loanId: searchParams.get("loanId") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      parsed.data.profileId ?? null,
      parsed.data.familyId ?? null,
    )
    if (!resolved) {
      return NextResponse.json({ error: "Family or profile not found" }, { status: 404 })
    }

    let loanQuery = supabase.from("loans").select("id").in("profile_id", resolved.profileIds)
    if (parsed.data.loanId) {
      loanQuery = loanQuery.eq("id", parsed.data.loanId)
    }
    const { data: loans } = await loanQuery
    const loanIds = (loans ?? []).map((l) => l.id)
    if (loanIds.length === 0) {
      return NextResponse.json([])
    }

    const { data: rows, error } = await supabase
      .from("loan_repayments")
      .select("*")
      .in("loan_id", loanIds)
      .order("date", { ascending: false })
      .limit(500)

    if (error) {
      console.error("[api/loans/repayments] GET", error)
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
    }

    const { data: earlyRows, error: earlyErr } = await supabase
      .from("loan_early_repayments")
      .select("*")
      .in("loan_id", loanIds)
      .order("date", { ascending: false })
      .limit(500)

    if (earlyErr) {
      console.error("[api/loans/repayments] GET early", earlyErr)
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
    }

    return NextResponse.json({
      repayments: rows ?? [],
      earlyRepayments: earlyRows ?? [],
    })
  } catch (e) {
    console.error("[api/loans/repayments] GET", e)
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

    const body = await request.json()
    const parsed = postSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
    }

    const { loanId, amount, date, cpfOaAmount } = parsed.data
    const cpf = cpfOaAmount ?? null
    if (cpf != null && cpf > amount) {
      return NextResponse.json({ error: "CPF OA amount cannot exceed repayment" }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const loanOk = await verifyLoanInHousehold(supabase, session.accountId, loanId)
    if (!loanOk) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    }

    const { data: loan } = await supabase
      .from("loans")
      .select("id, principal, rate_pct, use_cpf_oa, start_date")
      .eq("id", loanId)
      .single()

    if (!loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    }

    const { data: priorRepays } = await supabase
      .from("loan_repayments")
      .select("amount, date")
      .eq("loan_id", loanId)
      .lt("date", date)
      .order("date", { ascending: true })

    const { data: priorEarly } = await supabase
      .from("loan_early_repayments")
      .select("amount, date")
      .eq("loan_id", loanId)
      .lte("date", date)
      .order("date", { ascending: true })

    const balanceBefore = estimateOutstandingPrincipal(
      Number(loan.principal),
      Number(loan.rate_pct),
      priorRepays ?? [],
      priorEarly ?? [],
    )

    const { interest, principal } = splitPayment(
      balanceBefore,
      Number(loan.rate_pct),
      amount,
    )

    const { data: inserted, error: insErr } = await supabase
      .from("loan_repayments")
      .insert({
        loan_id: loanId,
        amount,
        date,
        principal_portion: principal,
        interest_portion: interest,
        cpf_oa_amount: cpf,
      })
      .select()
      .single()

    if (insErr) {
      console.error("[api/loans/repayments] insert", insErr)
      return NextResponse.json({ error: "Failed to log repayment" }, { status: 500 })
    }

    if (cpf != null && cpf > 0 && loan.use_cpf_oa) {
      const { error: cpfErr } = await supabase.from("cpf_housing_usage").insert({
        loan_id: loanId,
        principal_withdrawn: cpf,
        accrued_interest: 0,
        withdrawal_date: date,
        usage_type: "monthly",
        loan_repayment_id: inserted.id,
      })
      if (cpfErr) {
        console.error("[api/loans/repayments] cpf_housing_usage", cpfErr)
      }
    }

    return NextResponse.json(inserted, { status: 201 })
  } catch (e) {
    console.error("[api/loans/repayments] POST", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
