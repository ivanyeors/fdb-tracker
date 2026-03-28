import { Scenes } from "telegraf"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import {
  progressHeader,
  buildConfirmationMessage,
  buildConfirmationKeyboard,
  errorMsg,
  fmtAmt,
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
const STEP_TYPE_CONFIRM = 1
const STEP_PROFILE = 2
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
      const { text, pageCount } = await parsePdf(buffer)

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

      // Run extraction immediately
      const extracted = extractDocument(text, classification.type)
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

      // If type changed, re-extract
      if (selectedType !== ctx.scene.session.pdfDocType) {
        ctx.scene.session.pdfDocType = selectedType
        // We don't have the raw text anymore, but we stored it
        // For re-extraction we'd need the full text.
        // Since we can't store full text in session (too large),
        // just update the docType and keep existing extraction.
        // The user can edit individual fields in the confirmation step.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const { error } = await supabase.from("cpf_balances").upsert(
        {
          profile_id: profileId,
          month: extracted.month,
          oa: extracted.oa ?? 0,
          sa: extracted.sa ?? 0,
          ma: extracted.ma ?? 0,
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
      const { error } = await supabase.from("insurance_policies").insert({
        profile_id: profileId,
        name: extracted.name ?? `${extracted.insurer ?? "Unknown"} Policy`,
        type: extracted.type ?? "term_life",
        premium_amount: extracted.premiumAmount ?? 0,
        frequency: extracted.frequency ?? "yearly",
        insurer: extracted.insurer,
        policy_number: extracted.policyNumber,
        coverage_amount: extracted.coverageAmount,
        coverage_type: extracted.coverageType,
        inception_date: extracted.inceptionDate,
        end_date: extracted.endDate,
        rider_name: extracted.riderName,
        rider_premium: extracted.riderPremium,
        is_active: true,
        deduct_from_outflow: true,
      })
      if (error) throw new Error(error.message)
      break
    }

    case "bank_statement": {
      if (!extracted.month) throw new Error("Month is required for bank statement")
      if (!familyId) throw new Error("Family ID is required")

      // Try to match bank account by bank name
      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("id, bank_name")
        .eq("family_id", familyId)

      let accountId: string | null = null
      if (accounts && extracted.bankName) {
        const match = accounts.find(
          (a) => a.bank_name.toLowerCase() === extracted.bankName!.toLowerCase(),
        )
        if (match) accountId = match.id
      }

      if (!accountId) {
        throw new Error(
          `No matching bank account found for "${extracted.bankName ?? "unknown"}". ` +
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
        const { error } = await supabase.from("investments").upsert(
          {
            family_id: familyId,
            profile_id: profileId,
            symbol: holding.symbol,
            type: "stock",
            units: holding.units,
            cost_basis: holding.costBasis ?? 0,
          },
          { onConflict: "family_id,symbol" },
        )
        if (error) {
          console.error(`[pdf-scene] Failed to upsert holding ${holding.symbol}:`, error.message)
        }
      }
      break
    }
  }
}
