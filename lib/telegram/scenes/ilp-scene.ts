import { Scenes } from "telegraf"
import { format, startOfMonth } from "date-fns"

import { createSupabaseAdmin } from "@/lib/supabase/server"
import { MyContext } from "@/lib/telegram/bot"

export const ilpScene = new Scenes.WizardScene<MyContext>(
  "ilp_wizard",
  async (ctx) => {
    // Step 1: Request account and check existing ILP products
    const accountId = (ctx.state as any).accountId as string
    
    if (!accountId) {
      await ctx.reply("❌ Session error: No account ID found.")
      return ctx.scene.leave()
    }
    
    const supabase = createSupabaseAdmin()
    
    // Fetch all ILP products for the household
    // Since ILP products use family_id, we fetch families first
    const { data: families, error: familiesError } = await supabase
      .from("families")
      .select("id")
      .eq("household_id", accountId)
      
    if (familiesError || !families || families.length === 0) {
      await ctx.reply("❌ No family found for this account.")
      return ctx.scene.leave()
    }
    
    const familyIds = families.map(f => f.id)
    
    // Fetch ILPs linked to these families
    const { data: products, error: productsError } = await supabase
      .from("ilp_products")
      .select("id, name")
      .in("family_id", familyIds)
      
    if (productsError || !products || products.length === 0) {
      await ctx.reply("❌ No ILP products found. Create one in the web dashboard first.")
      return ctx.scene.leave()
    }
    
    if (products.length === 1) {
      // Auto-select if only one ILP
      ctx.scene.session.productId = products[0].id
      await ctx.reply(`Selected ILP Product: ${products[0].name}\n\nEnter the new fund value:`)
      return ctx.wizard.next()
    }

    // Multiple products, show inline keyboard
    const buttons = products.map((p) => [
      { text: p.name, callback_data: `ilp_${p.id}` }
    ])

    await ctx.reply("Select an ILP Product to update:", {
      reply_markup: {
        inline_keyboard: buttons
      }
    })
    
    return ctx.wizard.next()
  },
  async (ctx) => {
    // Step 2: Handle ILP selection -> Ask for Fund Value
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith("ilp_")) {
        const productId = data.replace("ilp_", "")
        ctx.scene.session.productId = productId
        
        await ctx.answerCbQuery()
        await ctx.reply("Enter the new fund value:")
        return ctx.wizard.next()
      }
    }
    
    // Handle text input if it was auto-selected
    if (ctx.scene.session.productId && ctx.message && "text" in ctx.message) {
      return handleValueInput(ctx)
    }

    return undefined 
  },
  async (ctx) => {
    // Step 3: Handle Fund Value input
    return handleValueInput(ctx)
  }
)

async function handleValueInput(ctx: MyContext) {
  if (!ctx.message || !("text" in ctx.message)) return undefined
  
  const value = parseFloat(ctx.message.text)
  if (isNaN(value) || value < 0) {
    await ctx.reply("❌ Invalid value. Please enter a valid positive number.")
    return undefined // Stay on this step
  }
  
  const productId = ctx.scene.session.productId!
  const supabase = createSupabaseAdmin()
  
  // Need to fetch the product name for the success message
  const { data: product } = await supabase
    .from("ilp_products")
    .select("name")
    .eq("id", productId)
    .single()
    
  if (!product) {
    await ctx.reply("❌ Product lookup failed.")
    return ctx.scene.leave()
  }

  const month = format(startOfMonth(new Date()), "yyyy-MM-dd")
  const monthLabel = format(new Date(), "MMMM yyyy")

  const { error } = await supabase.from("ilp_entries").upsert(
    {
      product_id: productId,
      month,
      fund_value: value,
    },
    { onConflict: "product_id,month" },
  )

  if (error) {
     await ctx.reply(`❌ Database error: ${error.message}`)
     return ctx.scene.leave()
  }

  await ctx.reply(`✅ ${product.name} fund value set to $${value} for ${monthLabel}.`)
  return ctx.scene.leave()
}
