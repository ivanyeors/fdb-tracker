import { Scenes } from "telegraf"
import { format, startOfMonth } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { botState, MyContext } from "@/lib/telegram/bot"
import { resolveOrProvisionPublicUser } from "@/lib/telegram/resolve-household"
import {
  progressHeader,
  buildMonthPicker,
  parseMonthCallback,
  errorMsg,
  fmtAmt,
  advanceOrReturn,
  handleStrayCallback,
} from "@/lib/telegram/scene-helpers"

// Wizard step indices.
const STEP_PROFILE = 0
const STEP_PROFILE_CB = 1
const STEP_KIND_CB = 2
const STEP_TARGET_CB = 3
const STEP_MONTH_CB = 4
const STEP_VALUE = 5
const STEP_CONFIRM = 6
const TOTAL_STEPS = 5 // profile, kind, target, month, value (confirm shown after)

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>

async function loadProductValueSnapshot(
  supabase: SupabaseAdmin,
  productId: string,
  month: string,
): Promise<{ currentMonth: number | null; latest: number | null; latestMonth: string | null }> {
  const { data: entries } = await supabase
    .from("ilp_entries")
    .select("month, fund_value")
    .eq("product_id", productId)
    .order("month", { ascending: false })

  const list = entries ?? []
  const latest = list[0] ?? null
  const sameMonth = list.find((e) => e.month === month) ?? null
  return {
    currentMonth: sameMonth ? Number(sameMonth.fund_value) : null,
    latest: latest ? Number(latest.fund_value) : null,
    latestMonth: latest ? latest.month : null,
  }
}

async function loadGroupValueSnapshot(
  supabase: SupabaseAdmin,
  groupId: string,
  month: string,
): Promise<{
  currentMonth: number | null
  latest: number | null
  latestMonth: string | null
  allocations: Array<{ productId: string; allocationPct: number }>
}> {
  const { data: members } = await supabase
    .from("ilp_fund_group_members")
    .select("product_id, allocation_pct")
    .eq("fund_group_id", groupId)

  const allocations = (members ?? []).map((m) => ({
    productId: m.product_id,
    allocationPct: Number(m.allocation_pct ?? 0),
  }))

  if (allocations.length === 0) {
    return { currentMonth: null, latest: null, latestMonth: null, allocations: [] }
  }

  const productIds = allocations.map((a) => a.productId)
  const { data: entries } = await supabase
    .from("ilp_entries")
    .select("product_id, month, fund_value")
    .in("product_id", productIds)
    .order("month", { ascending: false })

  const list = entries ?? []
  const monthSum = list
    .filter((e) => e.month === month)
    .reduce((acc, e) => acc + Number(e.fund_value), 0)

  // Latest = sum of each product's most recent entry, regardless of month.
  const latestPerProduct = new Map<string, { month: string; value: number }>()
  for (const e of list) {
    if (!latestPerProduct.has(e.product_id)) {
      latestPerProduct.set(e.product_id, {
        month: e.month,
        value: Number(e.fund_value),
      })
    }
  }
  const latestSum = Array.from(latestPerProduct.values()).reduce(
    (acc, x) => acc + x.value,
    0,
  )
  const latestMonth = Array.from(latestPerProduct.values())
    .map((x) => x.month)
    .sort((a, b) => b.localeCompare(a))[0] ?? null

  const hasMonth = list.some((e) => e.month === month)
  const hasLatest = latestPerProduct.size > 0

  return {
    currentMonth: hasMonth ? monthSum : null,
    latest: hasLatest ? latestSum : null,
    latestMonth,
    allocations,
  }
}

async function sendConfirmation(ctx: MyContext) {
  const s = ctx.scene.session
  const kindLabel = s.ilpKind === "grouped" ? "ILP Group" : "ILP Product"
  const newValue = s.amount ?? 0
  const currentLine =
    s.ilpCurrentMonthValue != null
      ? `${fmtAmt(s.ilpCurrentMonthValue)} (will be overwritten)`
      : "— (no entry yet)"
  const latestLine =
    s.ilpLatestValue != null && s.ilpLatestMonth
      ? `${fmtAmt(s.ilpLatestValue)} (${format(new Date(s.ilpLatestMonth + "T00:00:00"), "MMM yyyy")})`
      : "—"

  const lines = [
    "*Confirm ILP Update*",
    "",
    `${kindLabel}: ${s.productName ?? "—"}`,
    `Profile: ${s.profileName ?? "—"}`,
    `Month: ${s.monthLabel ?? "—"}`,
    "",
    `Current (${s.monthLabel}): ${currentLine}`,
    `Latest known: ${latestLine}`,
    `New value: ${fmtAmt(newValue)}`,
  ]

  if (s.ilpKind === "grouped" && s.ilpGroupAllocations?.length) {
    lines.push(
      "",
      `Will be split across ${s.ilpGroupAllocations.length} fund(s) by allocation %.`,
    )
  }

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✅ Confirm", callback_data: "cf" },
        { text: "❌ Cancel", callback_data: "cn" },
      ],
      [
        { text: "Edit month", callback_data: "ed_month" },
        { text: "Edit value", callback_data: "ed_val" },
      ],
    ],
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  })
}

async function promptKindStep(ctx: MyContext) {
  const header = progressHeader(
    2,
    TOTAL_STEPS,
    `Updating ILP for ${ctx.scene.session.profileName}`,
  )
  await ctx.reply(`${header}\n\nIs this an individual or grouped ILP?`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "👤 Individual", callback_data: "kind_individual" },
          { text: "👥 Grouped", callback_data: "kind_grouped" },
        ],
      ],
    },
  })
}

async function promptTargetStep(
  ctx: MyContext,
  supabase: SupabaseAdmin,
  familyId: string,
): Promise<boolean> {
  const s = ctx.scene.session
  const profileId = s.profileId!

  if (s.ilpKind === "individual") {
    // Products owned by this profile that are NOT in any fund group.
    const { data: products } = await supabase
      .from("ilp_products")
      .select("id, name, fund_group_memberships:ilp_fund_group_members(fund_group_id)")
      .eq("family_id", familyId)
      .eq("profile_id", profileId)

    const ungrouped = (products ?? []).filter(
      (p) => (p.fund_group_memberships?.length ?? 0) === 0,
    )

    if (ungrouped.length === 0) {
      await ctx.reply(
        "❌ No individual ILP products found for this profile. Try the grouped option, or create one in the web dashboard.",
      )
      return true // signal: leave scene
    }

    if (ungrouped.length === 1) {
      s.ilpTargetId = ungrouped[0].id
      s.productId = ungrouped[0].id
      s.productName = ungrouped[0].name
      return false // caller should advance to month
    }

    const buttons = ungrouped.map((p) => [
      { text: p.name, callback_data: `ilp_${p.id}` },
    ])
    const header = progressHeader(
      3,
      TOTAL_STEPS,
      `Updating individual ILP for ${s.profileName}`,
    )
    await ctx.reply(`${header}\n\nSelect an ILP product:`, {
      reply_markup: { inline_keyboard: buttons },
    })
    return false
  }

  // Grouped: fund groups owned by this profile.
  const { data: groups } = await supabase
    .from("ilp_fund_groups")
    .select("id, name")
    .eq("family_id", familyId)
    .eq("profile_id", profileId)

  const list = groups ?? []
  if (list.length === 0) {
    await ctx.reply(
      "❌ No ILP fund groups found for this profile. Try the individual option, or create a group in the web dashboard.",
    )
    return true
  }

  if (list.length === 1) {
    s.ilpTargetId = list[0].id
    s.productId = list[0].id
    s.productName = list[0].name
    return false
  }

  const buttons = list.map((g) => [
    { text: g.name, callback_data: `ilp_${g.id}` },
  ])
  const header = progressHeader(
    3,
    TOTAL_STEPS,
    `Updating grouped ILP for ${s.profileName}`,
  )
  await ctx.reply(`${header}\n\nSelect an ILP fund group:`, {
    reply_markup: { inline_keyboard: buttons },
  })
  return false
}

async function promptMonthStep(ctx: MyContext) {
  const s = ctx.scene.session
  const header = progressHeader(
    4,
    TOTAL_STEPS,
    `Updating ${s.productName} for ${s.profileName}`,
  )
  await ctx.reply(`${header}\n\nSelect the month:`, {
    reply_markup: buildMonthPicker(),
  })
}

async function loadValueSnapshot(ctx: MyContext, supabase: SupabaseAdmin) {
  const s = ctx.scene.session
  if (!s.ilpTargetId || !s.month) return

  if (s.ilpKind === "grouped") {
    const snap = await loadGroupValueSnapshot(supabase, s.ilpTargetId, s.month)
    s.ilpCurrentMonthValue = snap.currentMonth
    s.ilpLatestValue = snap.latest
    s.ilpLatestMonth = snap.latestMonth
    s.ilpGroupAllocations = snap.allocations
    return
  }

  const snap = await loadProductValueSnapshot(supabase, s.ilpTargetId, s.month)
  s.ilpCurrentMonthValue = snap.currentMonth
  s.ilpLatestValue = snap.latest
  s.ilpLatestMonth = snap.latestMonth
  s.ilpGroupAllocations = undefined
}

export const ilpScene = new Scenes.WizardScene<MyContext>(
  "ilp_wizard",

  // STEP 0: Resolve account, fetch profiles, render profile picker.
  async (ctx) => {
    const state = botState(ctx)
    let accountId = state.accountId
    let preFamilyId = state.familyId
    const preProfileId = state.profileId

    if (!accountId && ctx.chat?.id != null) {
      const resolved = await resolveOrProvisionPublicUser(
        String(ctx.chat.id),
        ctx.from?.id != null ? String(ctx.from.id) : null,
        ctx.from?.username ?? null,
        ctx.from?.first_name ?? null,
      )
      if (resolved) {
        accountId = resolved.householdId
        preFamilyId = preFamilyId ?? resolved.familyId
        state.accountId = accountId
        state.familyId = preFamilyId
        state.profileId = state.profileId ?? resolved.profileId
        state.accountType = state.accountType ?? resolved.accountType
      }
    }

    if (!accountId) {
      await ctx.reply(
        "❌ Could not resolve your account. Please send /start and try /ilp again.",
      )
      return ctx.scene.leave()
    }

    const supabase = createSupabaseAdmin()

    // Resolve family scope.
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

    // Default month = current month.
    const now = new Date()
    ctx.scene.session.month = format(startOfMonth(now), "yyyy-MM-dd")
    ctx.scene.session.monthLabel = format(now, "MMMM yyyy")
    ctx.scene.session.familyId = familyIds[0]

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("family_id", familyIds)
      .order("name")

    const list = profiles ?? []
    if (list.length === 0) {
      await ctx.reply("❌ No profiles found in this family.")
      return ctx.scene.leave()
    }

    // Auto-select pre-resolved profile if it exists in the fetched list.
    const matched = preProfileId
      ? list.find((p) => p.id === preProfileId)
      : null
    if (matched) {
      ctx.scene.session.profileId = matched.id
      ctx.scene.session.profileName = matched.name
      await promptKindStep(ctx)
      ctx.wizard.selectStep(STEP_KIND_CB)
      return
    }

    if (list.length === 1) {
      ctx.scene.session.profileId = list[0].id
      ctx.scene.session.profileName = list[0].name
      await promptKindStep(ctx)
      ctx.wizard.selectStep(STEP_KIND_CB)
      return
    }

    const buttons = list.map((p) => [
      { text: p.name, callback_data: `profile_${p.id}` },
    ])
    const header = progressHeader(1, TOTAL_STEPS, "Updating ILP fund value")
    await ctx.reply(`${header}\n\nSelect a profile:`, {
      reply_markup: { inline_keyboard: buttons },
    })
    return ctx.wizard.next()
  },

  // STEP 1: Profile callback.
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("profile_")) {
        const profileId = data.replace("profile_", "")
        const supabase = createSupabaseAdmin()
        const { data: profile } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", profileId)
          .single()
        ctx.scene.session.profileId = profileId
        ctx.scene.session.profileName = profile?.name ?? ""
        await ctx.answerCbQuery()
        await promptKindStep(ctx)
        return ctx.wizard.next()
      }
    }
    if (ctx.message && "text" in ctx.message) {
      await ctx.reply("Please tap one of the profile buttons above.")
    }
    return undefined
  },

  // STEP 2: Kind callback (individual / grouped).
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data === "kind_individual" || data === "kind_grouped") {
        ctx.scene.session.ilpKind =
          data === "kind_grouped" ? "grouped" : "individual"
        await ctx.answerCbQuery()

        const supabase = createSupabaseAdmin()
        const familyId = ctx.scene.session.familyId!
        const autoSelected = await promptTargetStep(ctx, supabase, familyId)

        if (autoSelected) {
          // Empty list — leave scene.
          return ctx.scene.leave()
        }

        if (ctx.scene.session.ilpTargetId) {
          // Auto-selected single target — load snapshot, jump to month picker.
          await loadValueSnapshot(ctx, supabase)
          await promptMonthStep(ctx)
          ctx.wizard.selectStep(STEP_MONTH_CB)
          return
        }

        // Multi-target picker rendered; advance to TARGET_CB.
        ctx.wizard.selectStep(STEP_TARGET_CB)
        return
      }
      await handleStrayCallback(ctx, "individual or grouped")
      return undefined
    }
    if (ctx.message && "text" in ctx.message) {
      await ctx.reply("Please tap Individual or Grouped above.")
    }
    return undefined
  },

  // STEP 3: Target (product or group) callback.
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("ilp_")) {
        const targetId = data.replace("ilp_", "")
        const supabase = createSupabaseAdmin()

        const table =
          ctx.scene.session.ilpKind === "grouped"
            ? "ilp_fund_groups"
            : "ilp_products"
        const { data: target } = await supabase
          .from(table)
          .select("name")
          .eq("id", targetId)
          .single()

        ctx.scene.session.ilpTargetId = targetId
        ctx.scene.session.productId = targetId
        ctx.scene.session.productName = target?.name ?? "ILP"
        await ctx.answerCbQuery()

        await loadValueSnapshot(ctx, supabase)
        await promptMonthStep(ctx)
        return ctx.wizard.next()
      }
      await handleStrayCallback(ctx, "an ILP")
      return undefined
    }
    if (ctx.message && "text" in ctx.message) {
      await ctx.reply("Please tap one of the ILP buttons above.")
    }
    return undefined
  },

  // STEP 4: Month callback.
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const parsed = parseMonthCallback(ctx.callbackQuery.data)
      if (parsed) {
        ctx.scene.session.month = parsed.month
        ctx.scene.session.monthLabel = parsed.monthLabel
        await ctx.answerCbQuery()

        // Reload snapshot for the new month so confirmation shows accurate "current".
        const supabase = createSupabaseAdmin()
        await loadValueSnapshot(ctx, supabase)

        const returned = await advanceOrReturn(
          ctx,
          STEP_CONFIRM,
          sendConfirmation,
        )
        if (returned) return

        const header = progressHeader(
          5,
          TOTAL_STEPS,
          `Updating ${ctx.scene.session.productName} — ${parsed.monthLabel}`,
        )
        await ctx.reply(`${header}\n\nEnter the new fund value:`)
        return ctx.wizard.next()
      }
      await handleStrayCallback(ctx, "a month")
      return undefined
    }
    if (ctx.message && "text" in ctx.message) {
      await ctx.reply("Please select a month from the buttons above.")
    }
    return undefined
  },

  // STEP 5: Fund value text input.
  async (ctx) => {
    if (await handleStrayCallback(ctx, "the new fund value")) return
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const value = Number.parseFloat(ctx.message.text)
    if (Number.isNaN(value) || value < 0) {
      await ctx.reply(
        errorMsg("Invalid value. Enter a positive number.", "12500"),
      )
      return undefined
    }

    ctx.scene.session.amount = value
    ctx.wizard.selectStep(STEP_CONFIRM)
    await sendConfirmation(ctx)
  },

  // STEP 6: Confirmation handler.
  async (ctx) => {
    if (!ctx.callbackQuery || !("data" in ctx.callbackQuery)) return undefined
    const data = ctx.callbackQuery.data
    await ctx.answerCbQuery()

    if (data === "cn") {
      await ctx.reply("Cancelled.")
      return ctx.scene.leave()
    }

    if (data === "ed_month") {
      ctx.scene.session.editingField = "month"
      ctx.wizard.selectStep(STEP_MONTH_CB)
      await ctx.reply("Select a new month:", {
        reply_markup: buildMonthPicker(),
      })
      return
    }

    if (data === "ed_val") {
      ctx.scene.session.editingField = "value"
      ctx.wizard.selectStep(STEP_VALUE)
      await ctx.reply("Enter the new fund value:")
      return
    }

    if (data === "cf") {
      const s = ctx.scene.session
      const supabase = createSupabaseAdmin()
      const newTotal = s.amount!

      if (s.ilpKind === "grouped" && s.ilpGroupAllocations?.length) {
        const allocations = s.ilpGroupAllocations
        const sumPct = allocations.reduce((a, x) => a + x.allocationPct, 0)
        if (sumPct <= 0) {
          await ctx.reply(
            "❌ Group allocations sum to 0%. Set allocations in the web dashboard before updating.",
          )
          return ctx.scene.leave()
        }

        const rows = allocations.map((a) => ({
          product_id: a.productId,
          month: s.month!,
          fund_value: Number(((newTotal * a.allocationPct) / sumPct).toFixed(2)),
        }))

        const { error } = await supabase
          .from("ilp_entries")
          .upsert(rows, { onConflict: "product_id,month" })

        if (error) {
          console.error("[ilp-scene] grouped upsert failed", {
            groupId: s.ilpTargetId,
            month: s.month,
            code: error.code,
            details: error.details,
            message: error.message,
          })
          const codePart = error.code ? ` (${error.code})` : ""
          await ctx.reply(`❌ Save failed${codePart}: ${error.message}`)
          return ctx.scene.leave()
        }

        await ctx.reply(
          `✅ ${s.productName} group total set to ${fmtAmt(newTotal)} for ${s.monthLabel}, split across ${rows.length} fund(s).`,
        )
        return ctx.scene.leave()
      }

      // Individual product save.
      const { error } = await supabase.from("ilp_entries").upsert(
        {
          product_id: s.ilpTargetId!,
          month: s.month!,
          fund_value: newTotal,
        },
        { onConflict: "product_id,month" },
      )

      if (error) {
        console.error("[ilp-scene] upsert failed", {
          productId: s.ilpTargetId,
          month: s.month,
          code: error.code,
          details: error.details,
          message: error.message,
        })
        await ctx.reply(
          `❌ Save failed${error.code ? ` (${error.code})` : ""}: ${error.message}`,
        )
        return ctx.scene.leave()
      }

      await ctx.reply(
        `✅ ${s.productName} fund value set to ${fmtAmt(newTotal)} for ${s.monthLabel}.`,
      )
      return ctx.scene.leave()
    }

    return undefined
  },
)
