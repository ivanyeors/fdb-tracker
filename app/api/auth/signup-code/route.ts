import { NextResponse } from "next/server"
import { z } from "zod"
import { generateSignupCode } from "@/lib/auth/signup-codes"

const signupCodeSchema = z.object({
  telegramUsername: z
    .string()
    .min(3)
    .max(32)
    .regex(
      /^@?\w+$/,
      "Invalid Telegram username. Only letters, numbers, and underscores allowed."
    ),
})

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? ""

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = signupCodeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      )
    }

    const result = await generateSignupCode(parsed.data.telegramUsername)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 429 })
    }

    const botUrl = BOT_USERNAME
      ? `https://t.me/${BOT_USERNAME}?start=signup_${result.code}`
      : null

    return NextResponse.json({ code: result.code, botUrl })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
