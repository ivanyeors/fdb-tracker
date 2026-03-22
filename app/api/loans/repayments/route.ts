import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"
import { verifyLoanInHousehold } from "@/lib/api/verify-loan-in-household"
import {
  calculateEarlyRepaymentPenalty,
  checkAnnualPrepaymentLimit,
  estimateOutstandingPrincipal,
  splitPayment,
} from "@/lib/calculations/loans"
import { vlHeadroom120 } from "@/lib/calculations/cpf-housing"

/**
 * Build cpf_housing_usage insert rows, splitting between profiles
 * when the loan is a split HDB loan.
 */
function buildCpfUsageRows(
  loan: {
    id: string
    profile_id: string
    split_profile_id: string | null
    split_pct: number | null
    property_type: string | null
  },
  cpfTotal: number,
  date: string,
  usageType: string,
  loanRepaymentId: string | null,
) {
  const splitPct = loan.split_pct ?? 100
  const isSplit =
    loan.split_profile_id != null &&
    splitPct < 100 &&
    loan.property_type === "hdb"

  if (!isSplit) {
    return [
      {
        loan_id: loan.id,
        profile_id: loan.profile_id,
        principal_withdrawn: cpfTotal,
        accrued_interest: 0,
        withdrawal_date: date,
        usage_type: usageType,
        loan_repayment_id: loanRepaymentId,
      },
    ]
  }

  const primaryShare =
    Math.round(cpfTotal * (splitPct / 100) * 100) / 100
  const partnerShare =
    Math.round((cpfTotal - primaryShare) * 100) / 100

  const rows = [
    {
      loan_id: loan.id,
      profile_id: loan.profile_id,
      principal_withdrawn: primaryShare,
      accrued_interest: 0,
      withdrawal_date: date,
      usage_type: usageType,
      loan_repayment_id: loanRepaymentId,
    },
  ]

  if (partnerShare > 0) {
    rows.push({
      loan_id: loan.id,
      profile_id: loan.split_profile_id!,
      principal_withdrawn: partnerShare,
      accrued_interest: 0,
      withdrawal_date: date,
      usage_type: usageType,
      loan_repayment_id: loanRepaymentId,
    })
  }

  return rows
}

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
  isEarly: z.boolean().optional(),
  source: z.enum(["cash", "cpf_oa"]).optional(),
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

    const [repayResult, earlyResult] = await Promise.all([
      supabase
        .from("loan_repayments")
        .select("*")
        .in("loan_id", loanIds)
        .order("date", { ascending: false })
        .limit(500),
      supabase
        .from("loan_early_repayments")
        .select("*")
        .in("loan_id", loanIds)
        .order("date", { ascending: false })
        .limit(500),
    ])

    if (repayResult.error) {
      console.error("[api/loans/repayments] GET", repayResult.error)
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
    }

    if (earlyResult.error) {
      console.error("[api/loans/repayments] GET early", earlyResult.error)
      return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
    }

    const rows = repayResult.data
    const earlyRows = earlyResult.data

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

    const { loanId, amount, date, cpfOaAmount, isEarly, source } = parsed.data
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
      .select("id, profile_id, principal, rate_pct, use_cpf_oa, start_date, valuation_limit, property_type, lock_in_end_date, early_repayment_penalty_pct, max_annual_prepayment_pct, split_profile_id, split_pct")
      .eq("id", loanId)
      .single()

    if (!loan) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 })
    }

    // Validate CPF OA withdrawal against 120% valuation limit
    if (cpf != null && cpf > 0 && loan.use_cpf_oa && loan.valuation_limit != null) {
      const { data: existingUsage } = await supabase
        .from("cpf_housing_usage")
        .select("principal_withdrawn")
        .eq("loan_id", loanId)
      const totalUsed = (existingUsage ?? []).reduce(
        (sum, u) => sum + Number(u.principal_withdrawn),
        0,
      )
      const headroom = vlHeadroom120(loan.valuation_limit, totalUsed)
      if (headroom != null && cpf > headroom) {
        return NextResponse.json(
          {
            error: `CPF withdrawal of $${cpf} exceeds 120% VL headroom ($${headroom} remaining)`,
          },
          { status: 400 },
        )
      }
    }

    // Early repayment: goes entirely to principal reduction
    if (isEarly) {
      // Check annual prepayment limit (private property loans)
      if (loan.max_annual_prepayment_pct != null) {
        const yearStart = date.slice(0, 4) + "-01-01"
        const yearEnd = date.slice(0, 4) + "-12-31"
        const { data: existingThisYear } = await supabase
          .from("loan_early_repayments")
          .select("amount")
          .eq("loan_id", loanId)
          .gte("date", yearStart)
          .lte("date", yearEnd)
        const existingSum = (existingThisYear ?? []).reduce(
          (sum, r) => sum + Number(r.amount),
          0,
        )

        // Need balance for limit check
        const { data: priorRepaysForLimit } = await supabase
          .from("loan_repayments")
          .select("amount, date")
          .eq("loan_id", loanId)
          .lt("date", date)
          .order("date", { ascending: true })
        const { data: priorEarlyForLimit } = await supabase
          .from("loan_early_repayments")
          .select("amount, date")
          .eq("loan_id", loanId)
          .lte("date", date)
          .order("date", { ascending: true })
        const currentBalance = estimateOutstandingPrincipal(
          Number(loan.principal),
          Number(loan.rate_pct),
          priorRepaysForLimit ?? [],
          priorEarlyForLimit ?? [],
        )

        const { allowed, maxRemaining } = checkAnnualPrepaymentLimit(
          currentBalance,
          existingSum,
          amount,
          loan.max_annual_prepayment_pct,
        )
        if (!allowed) {
          return NextResponse.json(
            {
              error: `Exceeds annual prepayment limit. Max remaining: $${maxRemaining?.toFixed(2)}`,
              maxRemaining,
            },
            { status: 400 },
          )
        }
      }

      // Calculate early repayment penalty
      const penaltyAmount = calculateEarlyRepaymentPenalty(
        amount,
        {
          property_type: loan.property_type,
          lock_in_end_date: loan.lock_in_end_date,
          early_repayment_penalty_pct: loan.early_repayment_penalty_pct != null
            ? Number(loan.early_repayment_penalty_pct)
            : null,
        },
        date,
      )

      const { data: inserted, error: insErr } = await supabase
        .from("loan_early_repayments")
        .insert({
          loan_id: loanId,
          amount,
          date,
          penalty_amount: penaltyAmount,
          source: source ?? "cash",
        })
        .select()
        .single()

      if (insErr) {
        console.error("[api/loans/repayments] early insert", insErr)
        return NextResponse.json({ error: "Failed to log early repayment" }, { status: 500 })
      }

      // If CPF OA was used for the early repayment, record housing usage
      if (cpf != null && cpf > 0 && loan.use_cpf_oa) {
        const cpfRows = buildCpfUsageRows(loan, cpf, date, "other", null)
        const { error: cpfErr } = await supabase
          .from("cpf_housing_usage")
          .insert(cpfRows)
        if (cpfErr) {
          console.error("[api/loans/repayments] early cpf_housing_usage", cpfErr)
        }
      }

      return NextResponse.json({ ...inserted, penaltyAmount }, { status: 201 })
    }

    // Regular repayment: split into interest and principal
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
      const cpfRows = buildCpfUsageRows(loan, cpf, date, "monthly", inserted.id)
      const { error: cpfErr } = await supabase
        .from("cpf_housing_usage")
        .insert(cpfRows)
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
