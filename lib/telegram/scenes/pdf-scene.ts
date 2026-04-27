import { Scenes } from "telegraf"

import { encodeBankTransactionPiiPatch } from "@/lib/repos/bank-transactions"
import { encodeCpfBalancesPiiPatch } from "@/lib/repos/cpf-balances"
import { encodeInsurancePoliciesPiiPatch } from "@/lib/repos/insurance-policies"
import { encodeLoanPiiPatch } from "@/lib/repos/loans"
import { drainSummaryRefreshQueue } from "@/lib/repos/summary-refresh-queue"
import { createSupabaseAdmin } from "@/lib/supabase/server"
import { calculateWeightedAverageCost } from "@/lib/calculations/investments"
import { botState, MyContext } from "@/lib/telegram/bot"
import {
  progressHeader,
  buildConfirmationMessage,
  buildConfirmationKeyboard,
  errorMsg,
} from "@/lib/telegram/scene-helpers"

import { classifyDocument } from "@/lib/pdf-import/classify"
import { extractDocument } from "@/lib/pdf-import/extract"
import { formatExtractionSummary } from "@/lib/pdf-import/format-summary"
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type ExtractionResult,
} from "@/lib/pdf-import/types"

const TOTAL_STEPS = 4 // user-visible: upload → type → profile → confirm
const STEP_PROFILE_CB = 3
const STEP_CONFIRM = 4

async function sendConfirmation(ctx: MyContext) {
  const extracted = ctx.scene.session.pdfExtracted as ExtractionResult | undefined
  if (!extracted) {
    await ctx.reply("❌ No extracted data found. Please try again.")
    return ctx.scene.leave()
  }

  const fields = [
    { label: "Profile", value: ctx.scene.session.profileName ?? "—" },
    ...formatExtractionSummary(extracted),
  ]

  const msg = buildConfirmationMessage("Confirm PDF Import", fields)
  const keyboard = buildConfirmationKeyboard([])
  await ctx.reply(msg, { reply_markup: keyboard })
}

export const pdfScene = new Scenes.WizardScene<MyContext>(
  "pdf_upload_wizard",

  // STEP 0: Receive PDF, download, parse, classify
  async (ctx) => {
    const msg = ctx.message

    // Check if message has a document
    const doc = msg && "document" in msg ? msg.document : undefined
    if (!doc) {
      await ctx.reply(
        "📄 Send me a PDF document and I'll extract the data from it.\n\nSupported: CPF statements, insurance policies, bank statements, tax NOA, loan letters, ILP statements, investment statements."
      )
      return
    }

    // Validate it's a PDF
    if (doc.mime_type !== "application/pdf") {
      await ctx.reply(errorMsg("Please send a PDF file.", "Upload a .pdf document"))
      return
    }

    // Check file size (reject >10MB)
    if (doc.file_size && doc.file_size > 10 * 1024 * 1024) {
      await ctx.reply(errorMsg("File too large. Maximum size is 10MB."))
      return ctx.scene.leave()
    }

    await ctx.reply("📄 Processing PDF...")

    try {
      // Download file from Telegram
      const bot = ctx.telegram
      const fileLink = await bot.getFileLink(doc.file_id)
      const response = await fetch(fileLink.href)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Parse PDF (dynamic import to avoid loading pdfjs-dist at module level)
      const { parsePdf } = await import("@/lib/pdf-import/parse-pdf")
      const { text, pageCount, pages } = await parsePdf(buffer)

      if (!text || text.trim().length < 50) {
        await ctx.reply(
          "❌ Could not extract text from this PDF. It may be a scanned document.\n\nPlease upload a digital/text-based PDF (not a photo or scan)."
        )
        return ctx.scene.leave()
      }

      // Store text preview in session (truncated)
      ctx.scene.session.pdfRawTextPreview = text.slice(0, 200)

      // Classify
      const classification = classifyDocument(text)
      ctx.scene.session.pdfDocType = classification.type
      ctx.scene.session.pdfConfidence = classification.confidence

      // Run extraction immediately (pass pages for transaction-level parsing)
      const extracted = extractDocument(text, classification.type, pages)
      ctx.scene.session.pdfExtracted = extracted as unknown as Record<string, unknown>

      // Show classification result
      const typeLabel = DOCUMENT_TYPE_LABELS[classification.type]
      const confidenceEmoji =
        classification.confidence === "high"
          ? "🟢"
          : classification.confidence === "medium"
            ? "🟡"
            : "🔴"

      const header = progressHeader(1, TOTAL_STEPS, "PDF Upload")
      let msg = `${header}\n\n`
      msg += `${confidenceEmoji} Detected: ${typeLabel}\n`
      msg += `Keywords: ${classification.matchedKeywords.slice(0, 5).join(", ")}\n`
      msg += `Pages: ${pageCount}\n\n`

      if (classification.confidence === "low") {
        msg += "Low confidence. Please select the correct document type:"
      } else {
        msg += "Is this correct?"
      }

      // Build type selection / confirmation buttons
      const confirmRow = [
        { text: `✅ Yes, ${typeLabel}`, callback_data: `pdt_${classification.type}` },
      ]
      const typeRows: Array<Array<{ text: string; callback_data: string }>> = []
      const otherTypes = DOCUMENT_TYPES.filter((t) => t !== classification.type)
      for (let i = 0; i < otherTypes.length; i += 2) {
        const row = [
          {
            text: DOCUMENT_TYPE_LABELS[otherTypes[i]],
            callback_data: `pdt_${otherTypes[i]}`,
          },
        ]
        if (otherTypes[i + 1]) {
          row.push({
            text: DOCUMENT_TYPE_LABELS[otherTypes[i + 1]],
            callback_data: `pdt_${otherTypes[i + 1]}`,
          })
        }
        typeRows.push(row)
      }

      const cancelRow = [{ text: "❌ Cancel", callback_data: "cn" }]

      await ctx.reply(msg, {
        reply_markup: {
          inline_keyboard: [confirmRow, ...typeRows, cancelRow],
        },
      })
      // Persist bot state into session for subsequent steps (new webhook requests)
      ctx.scene.session.householdId = botState(ctx).accountId
      ctx.scene.session.familyId = botState(ctx).familyId
      ctx.scene.session.profileId = botState(ctx).profileId

      return ctx.wizard.next()
    } catch (err) {
      console.error("[pdf-scene] PDF processing error:", err)
      await ctx.reply("❌ Failed to process PDF. The file may be corrupted or password-protected.")
      return ctx.scene.leave()
    }
  },

  // STEP 1: Type confirmation callback
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return

    const data = ctx.callbackQuery.data
    await ctx.answerCbQuery()

    if (data === "cn") {
      await ctx.reply("Cancelled.")
      return ctx.scene.leave()
    }

    if (data.startsWith("pdt_")) {
      const selectedType = data.slice(4) as DocumentType
      if (!DOCUMENT_TYPES.includes(selectedType)) return

      // We don't keep the full PDF text in session (size + PII). Field
      // extraction is bound to the type that ran at upload time, so a type
      // switch here would map to the wrong fields. Ask for re-upload instead.
      if (selectedType !== ctx.scene.session.pdfDocType) {
        await ctx.reply(
          `🔁 Re-upload the PDF to reclassify it as ${selectedType.replaceAll(/_/g, " ")}.`,
        )
        return ctx.scene.leave()
      }

      // Move to profile selection
      const accountId = ctx.scene.session.householdId as string
      const preFamilyId = ctx.scene.session.familyId
      const preProfileId = ctx.scene.session.profileId

      if (!accountId) {
        await ctx.reply("❌ Session error: No account ID found.")
        return ctx.scene.leave()
      }

      const supabase = createSupabaseAdmin()

      const familyIds: string[] = []
      if (preFamilyId) {
        familyIds.push(preFamilyId)
      } else {
        const { data: families } = await supabase
          .from("families")
          .select("id")
          .eq("household_id", accountId)
        if (!families || families.length === 0) {
          await ctx.reply("❌ No family found for this account.")
          return ctx.scene.leave()
        }
        familyIds.push(...families.map((f) => f.id))
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("family_id", familyIds)

      if (!profiles || profiles.length === 0) {
        await ctx.reply("❌ No profiles found. Create one in the web dashboard first.")
        return ctx.scene.leave()
      }

      // Auto-select if pre-resolved or single profile
      if (preProfileId) {
        const matched = profiles.find((p) => p.id === preProfileId)
        if (matched) {
          ctx.scene.session.profileId = matched.id
          ctx.scene.session.profileName = matched.name
          ctx.wizard.selectStep(STEP_CONFIRM)
          await sendConfirmation(ctx)
          return
        }
      }

      if (profiles.length === 1) {
        ctx.scene.session.profileId = profiles[0].id
        ctx.scene.session.profileName = profiles[0].name
        ctx.wizard.selectStep(STEP_CONFIRM)
        await sendConfirmation(ctx)
        return
      }

      // Multiple profiles — show picker
      const buttons = profiles.map((p) => [
        { text: p.name, callback_data: `prf_${p.id}_${p.name}` },
      ])
      const header = progressHeader(2, TOTAL_STEPS, "PDF Upload")
      await ctx.reply(`${header}\n\nSelect a profile:`, {
        reply_markup: { inline_keyboard: buttons },
      })
      ctx.wizard.selectStep(STEP_PROFILE_CB)
      return
    }
  },

  // STEP 2: (unused — placeholder for profile prompt if needed)
  async (_ctx) => {},

  // STEP 3: Profile callback handler
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return

    const data = ctx.callbackQuery.data
    await ctx.answerCbQuery()

    if (data === "cn") {
      await ctx.reply("Cancelled.")
      return ctx.scene.leave()
    }

    if (data.startsWith("prf_")) {
      const parts = data.slice(4).split("_")
      ctx.scene.session.profileId = parts[0]
      ctx.scene.session.profileName = parts.slice(1).join("_")

      ctx.wizard.selectStep(STEP_CONFIRM)
      await sendConfirmation(ctx)
      return
    }
  },

  // STEP 4: Confirmation handler
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return

    const data = ctx.callbackQuery.data
    await ctx.answerCbQuery()

    if (data === "cn") {
      await ctx.reply("Cancelled.")
      return ctx.scene.leave()
    }

    if (data === "cf") {
      const extracted = ctx.scene.session.pdfExtracted as unknown as ExtractionResult
      const profileId = ctx.scene.session.profileId
      const familyId = ctx.scene.session.familyId

      if (!extracted || !profileId) {
        await ctx.reply("❌ Missing data. Please try again.")
        return ctx.scene.leave()
      }

      const supabase = createSupabaseAdmin()

      try {
        await saveExtractedData(supabase, extracted, profileId, familyId)
        const typeLabel = DOCUMENT_TYPE_LABELS[extracted.docType]
        await ctx.reply(
          `✅ ${typeLabel} data saved for ${ctx.scene.session.profileName}!\n\nThe data is now visible in your dashboard.`
        )
      } catch (err) {
        console.error("[pdf-scene] Save error:", err)
        const message = err instanceof Error ? err.message : "Unknown error"
        await ctx.reply(`❌ Failed to save: ${message}`)
      }

      return ctx.scene.leave()
    }
  },
)

type SupabaseClient = ReturnType<typeof createSupabaseAdmin>

async function saveExtractedData(
  supabase: SupabaseClient,
  extracted: ExtractionResult,
  profileId: string,
  familyId: string | undefined,
): Promise<void> {
  switch (extracted.docType) {
    case "cpf_statement": {
      if (!extracted.month) throw new Error("Month is required for CPF statement")
      const cpfOa = extracted.oa ?? 0
      const cpfSa = extracted.sa ?? 0
      const cpfMa = extracted.ma ?? 0
      const { error } = await supabase.from("cpf_balances").upsert(
        {
          profile_id: profileId,
          month: extracted.month,
          ...encodeCpfBalancesPiiPatch({ oa: cpfOa, sa: cpfSa, ma: cpfMa }),
          is_manual_override: true,
        },
        { onConflict: "profile_id,month" },
      )
      if (error) throw new Error(error.message)
      break
    }

    case "insurance_policy": {
      if (!extracted.name && !extracted.policyNumber) {
        throw new Error("Policy name or number is required")
      }

      // Compute coverage_till_age from end date + profile birth_year
      let computedCoverageTillAge: number | null = null
      if (!extracted.coverageTillAge && extracted.endDate) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("birth_year")
          .eq("id", profileId)
          .single()
        if (prof?.birth_year) {
          const endYear = Number.parseInt(extracted.endDate.slice(0, 4))
          if (endYear > 0) computedCoverageTillAge = endYear - prof.birth_year
        }
      }

      const insurancePremium = extracted.premiumAmount ?? 0
      const insuranceCoverage = extracted.coverageAmount ?? null
      const { data: policy, error } = await supabase
        .from("insurance_policies")
        .insert({
          profile_id: profileId,
          name: extracted.name ?? `${extracted.insurer ?? "Unknown"} Policy`,
          type: extracted.type ?? "term_life",
          frequency: extracted.frequency ?? "yearly",
          insurer: extracted.insurer,
          policy_number: extracted.policyNumber,
          coverage_type: extracted.coverageType,
          ...encodeInsurancePoliciesPiiPatch({
            premium_amount: insurancePremium,
            coverage_amount: insuranceCoverage,
          }),
          inception_date: extracted.inceptionDate,
          end_date: extracted.endDate,
          rider_name: extracted.riderName,
          rider_premium: extracted.riderPremium,
          cpf_premium: extracted.cpfPremium,
          premium_waiver: extracted.premiumWaiver,
          coverage_till_age:
            extracted.coverageTillAge ?? computedCoverageTillAge,
          sub_type: extracted.subType,
          cash_value: extracted.cashValue,
          maturity_value: extracted.maturityValue,
          is_active: true,
          deduct_from_outflow: true,
        })
        .select("id")
        .single()
      if (error) throw new Error(error.message)

      // Insert benefit breakdowns into insurance_policy_coverages
      if (policy && extracted.benefits.length > 0) {
        const { error: covError } = await supabase
          .from("insurance_policy_coverages")
          .insert(
            extracted.benefits.map((b, i) => ({
              policy_id: policy.id,
              coverage_type: b.coverageType,
              coverage_amount: b.coverageAmount,
              benefit_name: b.benefitName,
              benefit_premium: b.benefitPremium,
              renewal_bonus: b.renewalBonus,
              benefit_expiry_date: b.benefitExpiryDate,
              sort_order: i,
            })),
          )
        if (covError) {
          console.error("[pdf-scene] Failed to insert coverages:", covError)
        }
      }
      break
    }

    case "bank_statement": {
      if (!extracted.month) throw new Error("Month is required for bank statement")
      if (!familyId) throw new Error("Family ID is required")

      // Try to match bank account: account number first, then bank name
      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_type, account_number_last4")
        .eq("family_id", familyId)

      let accountId: string | null = null
      if (accounts) {
        // 1. Try account number match (last 4 digits)
        if (extracted.accountNumber) {
          const last4 = extracted.accountNumber.replaceAll(/[-\s]/g, "").slice(-4)
          const numMatch = accounts.find(
            (a) => a.account_number_last4 === last4,
          )
          if (numMatch) accountId = numMatch.id
        }

        // 2. Fallback: bank name + account type
        if (!accountId && extracted.bankName) {
          const bankAccounts = accounts.filter(
            (a) => a.bank_name.toLowerCase() === extracted.bankName!.toLowerCase(),
          )
          const match =
            bankAccounts.find((a) => a.account_type === "savings") ??
            bankAccounts.find((a) => a.account_type === "basic") ??
            bankAccounts.find((a) => a.account_type === "ocbc_360") ??
            bankAccounts[0]
          if (match) accountId = match.id
        }
      }

      if (!accountId) {
        const acctNum = extracted.accountNumber ? ` (${extracted.accountNumber})` : ""
        throw new Error(
          `No matching bank account found for "${extracted.bankName ?? "unknown"}"${acctNum}. ` +
            "Please create the bank account in the dashboard first.",
        )
      }

      const { error } = await supabase.from("bank_balance_snapshots").upsert(
        {
          account_id: accountId,
          month: extracted.month,
          opening_balance: extracted.openingBalance ?? 0,
          closing_balance: extracted.closingBalance ?? 0,
        },
        { onConflict: "account_id,month" },
      )
      if (error) throw new Error(error.message)

      // Save parsed transactions if available
      if (extracted.transactions && extracted.transactions.length > 0) {
        const txnRows = extracted.transactions.map((txn) => ({
          profile_id: profileId,
          family_id: familyId,
          account_id: accountId,
          month: extracted.month!,
          txn_date: txn.date,
          value_date: txn.valueDate ?? null,
          description: txn.description,
          ...encodeBankTransactionPiiPatch({
            amount: txn.amount,
            balance: txn.balance,
          }),
          txn_type: txn.txnType,
          statement_type: "bank" as const,
          foreign_currency: txn.foreignCurrency ?? null,
          exclude_from_spending: txn.excludeFromSpending,
          source: "telegram" as const,
          raw_text: txn.rawText,
        }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: txnError } = await (supabase as any)
          .from("bank_transactions")
          .upsert(txnRows, {
            onConflict: "profile_id,month,txn_date,description,amount_hash,statement_type",
          })
        if (txnError) {
          console.error("[pdf-scene] Failed to save transactions:", txnError.message)
        } else {
          await drainSummaryRefreshQueue(supabase, {
            scopes: [
              {
                profile_id: profileId,
                family_id: familyId,
                month: extracted.month!,
                statement_type: "bank",
              },
            ],
          })
        }
      }
      break
    }

    case "cc_statement": {
      if (!extracted.month) throw new Error("Month is required for CC statement")
      if (!familyId) throw new Error("Family ID is required")

      // Try to match bank account: card number first, then bank name
      const { data: ccAccounts } = await supabase
        .from("bank_accounts")
        .select("id, bank_name, account_number_last4")
        .eq("family_id", familyId)

      let ccAccountId: string | null = null
      if (ccAccounts) {
        // 1. Try card number match (last 4 digits)
        if (extracted.cardNumber) {
          const last4 = extracted.cardNumber.replaceAll(/[-\s]/g, "").slice(-4)
          const numMatch = ccAccounts.find(
            (a) => a.account_number_last4 === last4,
          )
          if (numMatch) ccAccountId = numMatch.id
        }

        // 2. Fallback: bank name
        if (!ccAccountId && extracted.bankName) {
          const match = ccAccounts.find(
            (a) => a.bank_name.toLowerCase() === extracted.bankName!.toLowerCase(),
          )
          if (match) ccAccountId = match.id
        }
      }

      // Save transactions
      if (extracted.transactions && extracted.transactions.length > 0) {
        const txnRows = extracted.transactions.map((txn) => ({
          profile_id: profileId,
          family_id: familyId,
          account_id: ccAccountId,
          month: extracted.month!,
          txn_date: txn.date,
          description: txn.description,
          ...encodeBankTransactionPiiPatch({
            amount: txn.amount,
            balance: txn.balance,
          }),
          txn_type: txn.txnType,
          statement_type: "cc" as const,
          foreign_currency: txn.foreignCurrency ?? null,
          exclude_from_spending: txn.excludeFromSpending,
          source: "telegram" as const,
          raw_text: txn.rawText,
        }))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: ccTxnError } = await (supabase as any)
          .from("bank_transactions")
          .upsert(txnRows, {
            onConflict: "profile_id,month,txn_date,description,amount_hash,statement_type",
          })
        if (ccTxnError) throw new Error(ccTxnError.message)
        await drainSummaryRefreshQueue(supabase, {
          scopes: [
            {
              profile_id: profileId,
              family_id: familyId,
              month: extracted.month!,
              statement_type: "cc",
            },
          ],
        })
      }
      break
    }

    case "tax_noa": {
      if (!extracted.year) throw new Error("Year of Assessment is required")
      const { error } = await supabase.from("tax_entries").upsert(
        {
          profile_id: profileId,
          year: extracted.year,
          calculated_amount: extracted.taxPayable ?? 0,
          actual_amount: extracted.taxPayable,
        },
        { onConflict: "profile_id,year" },
      )
      if (error) throw new Error(error.message)
      break
    }

    case "loan_letter": {
      if (!extracted.principal) throw new Error("Loan principal is required")
      const { error } = await supabase.from("loans").insert({
        profile_id: profileId,
        name: extracted.name ?? `${extracted.lender ?? "Unknown"} Loan`,
        type: extracted.type ?? "personal",
        principal: extracted.principal,
        rate_pct: extracted.ratePct ?? 0,
        tenure_months: extracted.tenureMonths ?? 0,
        start_date: extracted.startDate ?? new Date().toISOString().split("T")[0],
        lender: extracted.lender,
        ...encodeLoanPiiPatch({
          lender: extracted.lender ?? null,
          principal: extracted.principal,
        }),
        property_type: extracted.propertyType,
      })
      if (error) throw new Error(error.message)
      break
    }

    case "ilp_statement": {
      if (!extracted.month || extracted.fundValue === null) {
        throw new Error("Month and fund value are required for ILP statement")
      }
      if (!familyId) throw new Error("Family ID is required")

      // Try to match ILP product by name
      const { data: products } = await supabase
        .from("ilp_products")
        .select("id, name")
        .eq("family_id", familyId)

      let productId: string | null = null
      if (products && extracted.productName) {
        const match = products.find((p) =>
          p.name.toLowerCase().includes(extracted.productName!.toLowerCase()) ||
          extracted.productName!.toLowerCase().includes(p.name.toLowerCase()),
        )
        if (match) productId = match.id
      }

      if (!productId) {
        throw new Error(
          `No matching ILP product found for "${extracted.productName ?? "unknown"}". ` +
            "Please create the ILP product in the dashboard first.",
        )
      }

      const { error } = await supabase.from("ilp_entries").upsert(
        {
          product_id: productId,
          month: extracted.month,
          fund_value: extracted.fundValue,
          premiums_paid: extracted.premiumsPaid,
        },
        { onConflict: "product_id,month" },
      )
      if (error) throw new Error(error.message)
      break
    }

    case "investment_statement": {
      if (extracted.holdings.length === 0) {
        throw new Error("No holdings found in investment statement")
      }
      if (!familyId) throw new Error("Family ID is required")

      for (const holding of extracted.holdings) {
        const { data: existingRows } = await supabase
          .from("investments")
          .select("id, units, cost_basis")
          .eq("family_id", familyId)
          .eq("profile_id", profileId)
          .eq("symbol", holding.symbol)
          .eq("type", "stock")
          .order("created_at", { ascending: true })
          .limit(1)
        const existing = existingRows?.[0] ?? null

        const newCost = holding.costBasis ?? 0
        if (existing) {
          const mergedCost = calculateWeightedAverageCost(
            existing.units,
            existing.cost_basis,
            holding.units,
            newCost,
          )
          const { error } = await supabase
            .from("investments")
            .update({
              units: existing.units + holding.units,
              cost_basis: mergedCost,
            })
            .eq("id", existing.id)
          if (error) {
            console.error(`[pdf-scene] Failed to update holding ${holding.symbol}:`, error.message)
          }
        } else {
          const { error } = await supabase.from("investments").insert({
            family_id: familyId,
            profile_id: profileId,
            symbol: holding.symbol,
            type: "stock",
            units: holding.units,
            cost_basis: newCost,
          })
          if (error) {
            console.error(`[pdf-scene] Failed to insert holding ${holding.symbol}:`, error.message)
          }
        }
      }
      break
    }
  }
}
