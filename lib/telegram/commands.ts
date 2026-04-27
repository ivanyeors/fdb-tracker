/**
 * Bot command menu for Telegram. Used with setMyCommands API.
 * Descriptions appear when users tap "/" in the chat.
 */

export const BOT_COMMANDS = [
  { command: "signup", description: "Sign up with a code from the website" },
  { command: "join", description: "Join a household with an invite code" },
  { command: "otp", description: "Get OTP for login" },
  {
    command: "link",
    description: "Link profile or account with token/API key",
  },
  { command: "auth", description: "Link account with API key from platform" },
  {
    command: "in",
    description:
      "Monthly inflow; optional note (/in 5000 or /in Name 5000 memo)",
  },
  {
    command: "out",
    description:
      "Monthly outflow; optional note (/out 3200 or /out Name 3200 memo)",
  },
  { command: "buy", description: "Record stock buy" },
  { command: "sell", description: "Record stock sell" },
  { command: "stockimg", description: "Attach screenshot to transaction" },
  { command: "ilp", description: "Set ILP fund value" },
  { command: "goaladd", description: "Add to savings goal" },
  { command: "repay", description: "Log loan repayment" },
  { command: "earlyrepay", description: "Log early loan repayment" },
  { command: "pdf", description: "Upload a PDF to extract financial data" },
  { command: "tax", description: "Record IRAS tax assessment (/tax 1694.50)" },
  { command: "cancel", description: "Abort the current command" },
] as const

const SCOPES = [
  { type: "default" as const },
  { type: "all_group_chats" as const },
]

/**
 * Registers the bot command menu with Telegram via setMyCommands.
 * Sets commands for both default (private chats) and all_group_chats.
 * Call after deploy or when updating commands.
 */
export async function setBotCommands(
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const apiUrl = `https://api.telegram.org/bot${token}/setMyCommands`

  for (const scope of SCOPES) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: BOT_COMMANDS, scope }),
    })
    const data = (await res.json()) as { ok?: boolean; description?: string }

    if (!data.ok) {
      return { ok: false, error: data.description ?? res.statusText }
    }
  }

  return { ok: true }
}
