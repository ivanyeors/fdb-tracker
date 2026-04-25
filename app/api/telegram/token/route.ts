import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { cookies } from "next/headers"
import { validateSession, COOKIE_NAME } from "@/lib/auth/session"
import { encryptString } from "@/lib/crypto/cipher"
import { deterministicHash } from "@/lib/crypto/hash"
import { createSupabaseAdmin } from "@/lib/supabase/server"

const tokenBodySchema = z.object({
  profileId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(COOKIE_NAME)?.value
    if (!sessionToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    
    const session = await validateSession(sessionToken)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    
    const body = await request.json()
    const parsed = tokenBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }

    const { profileId } = parsed.data
    const supabase = createSupabaseAdmin()
    
    // First ensure the profile belongs to the user's family
    const { data: profile } = await supabase
      .from("profiles")
      .select("family_id")
      .eq("id", profileId)
      .single()
      
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

    const { data: family } = await supabase
      .from("families")
      .select("id")
      .eq("id", profile.family_id)
      .eq("household_id", session.accountId)
      .single()
      
    if (!family) return NextResponse.json({ error: "Not authorized for this profile" }, { status: 403 })

    const token = crypto.randomUUID()
    const tokenEnc = encryptString(token, {
      table: "profiles",
      column: "telegram_link_token_enc",
    })
    const tokenHash = deterministicHash(token, {
      table: "profiles",
      column: "telegram_link_token_hash",
    })

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        telegram_link_token: token,
        telegram_link_token_enc: tokenEnc,
        telegram_link_token_hash: tokenHash,
      })
      .eq("id", profileId)

    if (updateError) {
      console.error("[telegram/token] Update error:", updateError)
      return NextResponse.json({ error: "Failed to generate token" }, { status: 500 })
    }

    return NextResponse.json({ token }, { status: 200 })
  } catch (err) {
    console.error("[telegram/token] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
