import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    { error: "Use /otp in Telegram to get your code." },
    { status: 400 },
  )
}
