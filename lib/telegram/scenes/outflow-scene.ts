import { Scenes } from "telegraf"
import { format, startOfMonth } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { MyContext } from "@/lib/telegram/bot"

export const outflowScene = new Scenes.WizardScene<MyContext>(
  "outflow_wizard",
  async (ctx) => {
    // Step 1: Ask for profile
    const accountId = (ctx.state as any).accountId as string
    
    if (!accountId) {
      await ctx.reply("❌ Session error: No account ID found.")
      return ctx.scene.leave()
    }

    const supabase = createSupabaseAdmin()
    
    // First, lookup families for this household.
    const { data: families, error: familiesError } = await supabase
      .from("families")
      .select("id")
      .eq("household_id", accountId)
      
    if (familiesError || !families || families.length === 0) {
      await ctx.reply("❌ No family found for this account.")
      return ctx.scene.leave()
    }
    
    const familyIds = families.map(f => f.id)
    
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name")
      .in("family_id", familyIds)
      
    if (profilesError || !profiles || profiles.length === 0) {
      await ctx.reply("❌ No profiles found. Create one in the web dashboard first.")
      return ctx.scene.leave()
    }

    if (profiles.length === 1) {
      // Auto-select if only one profile
      ctx.scene.session.profileId = profiles[0].id
      ctx.scene.session.profileName = profiles[0].name
      await ctx.reply(`Selected profile: ${profiles[0].name}\n\nEnter the outflow amount:`)
      return ctx.wizard.next()
    }

    // Multiple profiles, show inline keyboard
    const buttons = profiles.map((p) => [
      { text: p.name, callback_data: `profile_${p.id}_${p.name}` }
    ])

    await ctx.reply("Select a profile:", {
      reply_markup: {
        inline_keyboard: buttons
      }
    })
    
    // We wait for callback query
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 2: Handle profile selection callback or wait for amount if auto-selected
    
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("profile_")) {
        const parts = data.replace("profile_", "").split("_")
        const profileId = parts[0]
        const profileName = parts.slice(1).join("_")
        
        ctx.scene.session.profileId = profileId
        ctx.scene.session.profileName = profileName
        
        await ctx.answerCbQuery()
        await ctx.reply(`Selected profile: ${profileName}\n\nEnter the outflow amount:`)
        return ctx.wizard.next()
      }
    }
    
    // If not a callback, it might be the amount (if profile was auto-selected in step 1)
    if (ctx.scene.session.profileId && ctx.message && "text" in ctx.message) {
       // It's the amount input
       return handleAmountInput(ctx)
    }

    return undefined // Wait for valid input
  },
  async (ctx) => {
    // Step 3: Handle amount input
    return handleAmountInput(ctx)
  }
)

async function handleAmountInput(ctx: MyContext) {
    if (!ctx.message || !("text" in ctx.message)) return undefined

    const amountStr = ctx.message.text
    const amount = parseFloat(amountStr)

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("❌ Invalid amount. Please enter a valid positive number.")
      return undefined // Stay on this step
    }

    // Save to DB
    const supabase = createSupabaseAdmin()
    const month = format(startOfMonth(new Date()), "yyyy-MM-dd")
    const monthLabel = format(new Date(), "MMMM yyyy")

    // For outflow, we just upsert with the amount
    const { error } = await supabase.from("monthly_cashflow").upsert(
      {
        profile_id: ctx.scene.session.profileId!,
        month,
        outflow: amount,
        source: "telegram",
      },
      { onConflict: "profile_id,month" },
    )

    if (error) {
       await ctx.reply(`❌ Database error: ${error.message}`)
       return ctx.scene.leave()
    }

    await ctx.reply(
      `✅ Added outflow of $${amount} for ${ctx.scene.session.profileName} (${monthLabel}).`
    )
    return ctx.scene.leave()
}
