export function parseArgs(text: string): string[] {
  const withoutCommand = text.replace(/^\/\w+(@\S+)?\s*/, "")
  return withoutCommand
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0)
}

function looksLikeNumber(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s)
}

export function parseInOutArgs(
  text: string,
): { name: string | null; amount: number } | { error: string } {
  const args = parseArgs(text)

  if (args.length === 0) {
    return { error: "Usage: /in [name] <amount>" }
  }

  if (args.length === 1) {
    const amount = parseFloat(args[0])
    if (isNaN(amount)) return { error: `Invalid amount: '${args[0]}'` }
    return { name: null, amount }
  }

  if (looksLikeNumber(args[0])) {
    const amount = parseFloat(args[0])
    if (isNaN(amount)) return { error: `Invalid amount: '${args[0]}'` }
    return { name: null, amount }
  }

  const amount = parseFloat(args[1])
  if (isNaN(amount)) return { error: `Invalid amount: '${args[1]}'` }
  return { name: args[0], amount }
}

export function parseBuySellArgs(
  text: string,
):
  | {
      name: string | null
      symbol: string
      quantity: number
      price: number
      journal: string | null
    }
  | { error: string } {
  const args = parseArgs(text)

  if (args.length < 3) {
    return { error: "Usage: /buy [name] <symbol> <quantity> <price> [journal]" }
  }

  let idx = 0
  let name: string | null = null

  if (!looksLikeNumber(args[1])) {
    name = args[idx]
    idx++
  }

  if (idx + 2 >= args.length) {
    return { error: "Usage: /buy [name] <symbol> <quantity> <price> [journal]" }
  }

  const symbol = args[idx]
  idx++

  const quantity = parseFloat(args[idx])
  if (isNaN(quantity)) return { error: `Invalid quantity: '${args[idx]}'` }
  idx++

  const price = parseFloat(args[idx])
  if (isNaN(price)) return { error: `Invalid price: '${args[idx]}'` }
  idx++

  const journal = idx < args.length ? args.slice(idx).join(" ") : null

  return { name, symbol, quantity, price, journal }
}

export function parseIlpArgs(
  text: string,
):
  | { name: string | null; product: string; value: number }
  | { error: string } {
  const args = parseArgs(text)

  if (args.length < 2) {
    return { error: "Usage: /ilp [name] <product> <value>" }
  }

  if (args.length === 2) {
    const value = parseFloat(args[1])
    if (isNaN(value)) return { error: `Invalid value: '${args[1]}'` }
    return { name: null, product: args[0], value }
  }

  const lastArg = args[args.length - 1]
  const value = parseFloat(lastArg)
  if (isNaN(value)) return { error: `Invalid value: '${lastArg}'` }

  if (looksLikeNumber(args[0])) {
    const product = args.slice(0, -1).join(" ")
    return { name: null, product, value }
  }

  return { name: args[0], product: args.slice(1, -1).join(" "), value }
}

export function parseGoalArgs(
  text: string,
):
  | { name: string | null; goal: string; amount: number }
  | { error: string } {
  const args = parseArgs(text)

  if (args.length < 2) {
    return { error: "Usage: /goaladd [name] <goal> <amount>" }
  }

  if (args.length === 2) {
    const amount = parseFloat(args[1])
    if (isNaN(amount)) return { error: `Invalid amount: '${args[1]}'` }
    return { name: null, goal: args[0], amount }
  }

  const lastArg = args[args.length - 1]
  const amount = parseFloat(lastArg)
  if (isNaN(amount)) return { error: `Invalid amount: '${lastArg}'` }

  if (looksLikeNumber(args[0])) {
    const goal = args.slice(0, -1).join(" ")
    return { name: null, goal, amount }
  }

  return { name: args[0], goal: args.slice(1, -1).join(" "), amount }
}

export function parseRepayArgs(
  text: string,
):
  | { name: string | null; loan: string; amount: number }
  | { error: string } {
  const args = parseArgs(text)

  if (args.length < 2) {
    return { error: "Usage: /repay [name] <loan> <amount>" }
  }

  if (args.length === 2) {
    const amount = parseFloat(args[1])
    if (isNaN(amount)) return { error: `Invalid amount: '${args[1]}'` }
    return { name: null, loan: args[0], amount }
  }

  const lastArg = args[args.length - 1]
  const amount = parseFloat(lastArg)
  if (isNaN(amount)) return { error: `Invalid amount: '${lastArg}'` }

  if (looksLikeNumber(args[0])) {
    const loan = args.slice(0, -1).join(" ")
    return { name: null, loan, amount }
  }

  return { name: args[0], loan: args.slice(1, -1).join(" "), amount }
}
