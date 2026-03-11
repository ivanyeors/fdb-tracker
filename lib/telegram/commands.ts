/**
 * Bot command menu for Telegram. Used with setMyCommands API.
 * Descriptions appear when users tap "/" in the chat.
 */

const DEFAULT_COMMANDS = [
  { command: "otp", description: "Get OTP for login" },
] as const

const GROUP_COMMANDS = [
  { command: "in", description: "Set monthly inflow" },
  { command: "out", description: "Set monthly outflow" },
  { command: "buy", description: "Record stock buy" },
  { command: "sell", description: "Record stock sell" },
  { command: "stockimg", description: "Attach screenshot to transaction" },
  { command: "ilp", description: "Set ILP fund value" },
  { command: "goaladd", description: "Add to savings goal" },
  { command: "repay", description: "Log loan repayment" },
  { command: "earlyrepay", description: "Log early loan repayment" },
] as const

const COMMAND_SCOPES = [
  {
    commands: DEFAULT_COMMANDS,
    scope: { type: "default" as const },
  },
  {
    commands: GROUP_COMMANDS,
    scope: { type: "all_group_chats" as const },
  },
]

/**
 * Registers the bot command menu with Telegram via setMyCommands.
 * Private chats only expose `/otp`; finance commands stay scoped to household groups.
 * Call after deploy or when updating commands.
 */
export async function setBotCommands(token: string): Promise<{ ok: boolean; error?: string }> {
  const apiUrl = `https://api.telegram.org/bot${token}/setMyCommands`

  for (const { commands, scope } of COMMAND_SCOPES) {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands, scope }),
    })
    const data = (await res.json()) as { ok?: boolean; description?: string }

    if (!data.ok) {
      return { ok: false, error: data.description ?? res.statusText }
    }
  }

  return { ok: true }
}
