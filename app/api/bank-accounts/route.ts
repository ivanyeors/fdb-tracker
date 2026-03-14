import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const createAccountSchema = z.object({
  bankName: z.string().min(1),
  accountType: z.string().min(1),
  profileId: z.string().uuid().optional(),
  interestRatePct: z.number().min(0).optional(),
  openingBalance: z.number().min(0).optional(),
})

const listQuerySchema = z.object({
  profileId: z.string().uuid().optional(),
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
    const parsed = listQuerySchema.safeParse({
      profileId: searchParams.get("profileId") ?? undefined,
    })
    const profileId = parsed.success ? parsed.data.profileId : undefined

    const supabase = createSupabaseAdmin()

    let query = supabase
      .from("bank_accounts")
      .select("*")
      .eq("household_id", accountId)
      .order("created_at", { ascending: true })

    if (profileId) {
      query = query.or(`profile_id.eq.${profileId},profile_id.is.null`)
    }

    const { data: accounts, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch bank accounts" }, { status: 500 })
    }

    const ocbcAccountIds = accounts
      .filter((a) => a.account_type === "ocbc_360")
      .map((a) => a.id)

    const ocbcConfigs: Record<string, Record<string, unknown>> = {}

    if (ocbcAccountIds.length > 0) {
      const { data: ocbcConfigRows } = await supabase
        .from("bank_account_ocbc360_config")
        .select("*")
        .in("account_id", ocbcAccountIds)

      if (ocbcConfigRows) {
        for (const config of ocbcConfigRows) {
          ocbcConfigs[config.account_id] = config
        }
      }
    }

    const accountIds = accounts.map((a) => a.id)
    const latestBalances: Record<string, number> = {}

    if (accountIds.length > 0) {
      const { data: snapshots } = await supabase
        .from("bank_balance_snapshots")
        .select("account_id, month, closing_balance")
        .in("account_id", accountIds)
        .order("month", { ascending: false })

      if (snapshots) {
        for (const s of snapshots) {
          if (!(s.account_id in latestBalances)) {
            latestBalances[s.account_id] = s.closing_balance
          }
        }
      }
    }

    const result = accounts.map((account) => ({
      ...account,
      latest_balance:
        account.id in latestBalances
          ? latestBalances[account.id]
          : account.opening_balance,
      ...(account.account_type === "ocbc_360" && {
        ocbc360Config: ocbcConfigs[account.id] ?? null,
      }),
    }))

    return NextResponse.json(result)
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
    const parsed = createAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { bankName, accountType, profileId, interestRatePct, openingBalance } = parsed.data
    const supabase = createSupabaseAdmin()

    if (profileId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", profileId)
        .eq("household_id", accountId)
        .single()

      if (!profile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 })
      }
    }

    const { data: account, error: accountError } = await supabase
      .from("bank_accounts")
      .insert({
        household_id: accountId,
        bank_name: bankName,
        account_type: accountType,
        ...(profileId && { profile_id: profileId }),
        ...(interestRatePct !== undefined && { interest_rate_pct: interestRatePct }),
        ...(openingBalance !== undefined && { opening_balance: openingBalance }),
      })
      .select()
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: "Failed to create bank account" }, { status: 500 })
    }

    if (accountType === "ocbc_360") {
      const { error: configError } = await supabase
        .from("bank_account_ocbc360_config")
        .insert({
          account_id: account.id,
          salary_met: false,
          save_met: false,
          spend_met: false,
          insure_met: false,
          invest_met: false,
          grow_met: false,
        })

      if (configError) {
        return NextResponse.json(
          { error: "Account created but failed to create OCBC 360 config" },
          { status: 500 },
        )
      }
    }

    return NextResponse.json(account, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
