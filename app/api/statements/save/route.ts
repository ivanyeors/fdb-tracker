import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import {
  decodeBankTransactionPii,
  encodeBankTransactionPiiPatch,
} from "@/lib/repos/bank-transactions"
import { drainSummaryRefreshQueue } from "@/lib/repos/summary-refresh-queue"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { resolveFamilyAndProfiles } from "@/lib/api/resolve-family"

const transactionSchema = z.object({
  date: z.string(),
  valueDate: z.string().optional(),
  description: z.string(),
  amount: z.number(),
  balance: z.number().nullable(),
  txnType: z.enum(["debit", "credit"]),
  categoryId: z.string().uuid().nullable(),
  foreignCurrency: z.string().nullable().optional(),
  excludeFromSpending: z.boolean(),
  rawText: z.string().optional(),
})

const bodySchema = z.object({
  profileId: z.string().uuid(),
  familyId: z.string().uuid(),
  accountId: z.string().uuid().nullable().optional(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statementType: z.enum(["bank", "cc"]),
  transactions: z.array(transactionSchema),
  categoryChanges: z
    .array(
      z.object({
        pattern: z.string(),
        categoryId: z.string().uuid(),
      }),
    )
    .optional(),
  // Balance snapshot data (bank statements only)
  openingBalance: z.number().optional(),
  closingBalance: z.number().optional(),
})

export async function POST(request: Request) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  const session = token ? await validateSession(token) : null
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = bodySchema.parse(await request.json())
    const supabase = createSupabaseAdmin()

    // Verify profileId/familyId belong to the authenticated user's household
    const resolved = await resolveFamilyAndProfiles(
      supabase,
      session.accountId,
      body.profileId,
      body.familyId
    )
    if (!resolved || !resolved.profileIds.includes(body.profileId)) {
      return NextResponse.json(
        { error: "Profile not found or unauthorized" },
        { status: 403 }
      )
    }

    // Save balance snapshot for bank statements
    if (
      body.statementType === "bank" &&
      body.accountId &&
      (body.openingBalance !== undefined || body.closingBalance !== undefined)
    ) {
      await supabase.from("bank_balance_snapshots").upsert(
        {
          account_id: body.accountId,
          month: body.month,
          opening_balance: body.openingBalance ?? 0,
          closing_balance: body.closingBalance ?? 0,
        },
        { onConflict: "account_id,month" },
      )
    }

    // Check for existing transactions to report accurate new vs. duplicate counts
    let newCount = body.transactions.length
    let skippedCount = 0

    if (body.transactions.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from("bank_transactions")
        .select("txn_date, description, amount_enc")
        .eq("profile_id", body.profileId)
        .eq("month", body.month)
        .eq("statement_type", body.statementType)

      if (existing && existing.length > 0) {
        const existingSet = new Set(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          existing.map((t: any) => {
            const amt = decodeBankTransactionPii({
              amount_enc: t.amount_enc,
            }).amount
            return `${t.txn_date}|${t.description}|${amt}`
          })
        )
        skippedCount = body.transactions.filter((txn) =>
          existingSet.has(`${txn.date}|${txn.description}|${txn.amount}`)
        ).length
        newCount = body.transactions.length - skippedCount
      }

      // Save transactions (upsert handles duplicates gracefully)
      const txnRows = body.transactions.map((txn) => ({
        profile_id: body.profileId,
        family_id: body.familyId,
        account_id: body.accountId ?? null,
        month: body.month,
        txn_date: txn.date,
        value_date: txn.valueDate ?? null,
        description: txn.description,
        ...encodeBankTransactionPiiPatch({
          amount: txn.amount,
          balance: txn.balance,
        }),
        txn_type: txn.txnType,
        statement_type: body.statementType,
        category_id: txn.categoryId,
        foreign_currency: txn.foreignCurrency ?? null,
        exclude_from_spending: txn.excludeFromSpending,
        source: "pdf_import" as const,
        raw_text: txn.rawText ?? null,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("bank_transactions")
        .upsert(txnRows, {
          onConflict:
            "profile_id,month,txn_date,description,amount_hash,statement_type",
        })

      if (error) {
        return NextResponse.json(
          { error: `Failed to save transactions: ${error.message}` },
          { status: 500 },
        )
      }

      // Trigger on bank_transactions enqueued the scope atomically. Drain
      // it now so the response reflects fresh totals; cron sweeps anything
      // we miss.
      await drainSummaryRefreshQueue(supabase, {
        scopes: [
          {
            profile_id: body.profileId,
            family_id: body.familyId,
            month: body.month,
            statement_type: body.statementType,
          },
        ],
      })
    }

    // Save category rule changes (user-learned mappings)
    if (body.categoryChanges && body.categoryChanges.length > 0) {
      const { data: household } = await supabase
        .from("families")
        .select("household_id")
        .eq("id", body.familyId)
        .single()

      if (household) {
        const ruleRows = body.categoryChanges.map((change) => ({
          household_id: household.household_id,
          match_pattern: change.pattern,
          category_id: change.categoryId,
          source: "user" as const,
          priority: 10,
        }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("category_rules")
          .upsert(ruleRows, { onConflict: "household_id,match_pattern" })
      }
    }

    return NextResponse.json({
      saved: newCount,
      skipped: skippedCount,
      month: body.month,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 },
      )
    }
    console.error("[statements/save] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    )
  }
}
