export type SeasonalityEventType = "risk" | "opportunity"

export type SeasonalityCategory =
  | "earnings"
  | "options_expiry"
  | "quad_witching"
  | "macro"
  | "seasonal"
  | "entry_window"

export type SeasonalityEvent = {
  id: string
  title: string
  description: string
  type: SeasonalityEventType
  startMonth: number // 1-12
  startDay: number // 1-31
  endMonth: number // 1-12
  endDay: number // 1-31 (same as start for single-day events)
  category?: SeasonalityCategory
}

// ---------------------------------------------------------------------------
// Dataset 1 — Risk / Caution events (recurring annual cycle)
// ---------------------------------------------------------------------------

const RISK_EVENTS: SeasonalityEvent[] = [
  {
    id: "q1-earnings",
    title: "Earning Season",
    description:
      "Q4 earnings reports. Expect increased volatility around individual stock results.",
    type: "risk",
    startMonth: 1,
    startDay: 2,
    endMonth: 1,
    endDay: 12,
    category: "earnings",
  },
  {
    id: "jan-effect-fade",
    title: "Jan Effect Fade",
    description:
      "The January effect rally fades. Small-cap outperformance from early January typically reverses.",
    type: "risk",
    startMonth: 1,
    startDay: 25,
    endMonth: 2,
    endDay: 10,
    category: "seasonal",
  },
  {
    id: "feb-opex",
    title: "Options Expiring",
    description:
      "February options expiration. Elevated pin risk and gamma exposure near key strikes.",
    type: "risk",
    startMonth: 2,
    startDay: 20,
    endMonth: 2,
    endDay: 20,
    category: "options_expiry",
  },
  {
    id: "mar-quad-witching",
    title: "Quad Witching",
    description:
      "Simultaneous expiry of index futures, index options, stock options, and stock futures. Expect unusual volume and price swings.",
    type: "risk",
    startMonth: 3,
    startDay: 20,
    endMonth: 3,
    endDay: 20,
    category: "quad_witching",
  },
  {
    id: "q2-earnings",
    title: "Earning Season",
    description:
      "Q1 earnings reports. Expect increased volatility around individual stock results.",
    type: "risk",
    startMonth: 4,
    startDay: 1,
    endMonth: 4,
    endDay: 12,
    category: "earnings",
  },
  {
    id: "apr-opex",
    title: "Options Expiring",
    description:
      "April options expiration. Elevated pin risk and gamma exposure near key strikes.",
    type: "risk",
    startMonth: 4,
    startDay: 17,
    endMonth: 4,
    endDay: 17,
    category: "options_expiry",
  },
  {
    id: "sell-in-may",
    title: "Sell in May",
    description:
      'Classic "Sell in May and go away" period. Historically weaker returns through the summer months.',
    type: "risk",
    startMonth: 5,
    startDay: 1,
    endMonth: 5,
    endDay: 20,
    category: "seasonal",
  },
  {
    id: "summer-liquidity-vacuum",
    title: "Summer Liquidity Vacuum",
    description:
      "Reduced trading volume as institutional desks go on holiday. Thin liquidity can amplify moves.",
    type: "risk",
    startMonth: 6,
    startDay: 15,
    endMonth: 7,
    endDay: 5,
    category: "seasonal",
  },
  {
    id: "q3-earnings",
    title: "Earning Season",
    description:
      "Q2 earnings reports. Expect increased volatility around individual stock results.",
    type: "risk",
    startMonth: 7,
    startDay: 1,
    endMonth: 7,
    endDay: 12,
    category: "earnings",
  },
  {
    id: "jul-opex",
    title: "Options Expiring",
    description:
      "July options expiration. Elevated pin risk and gamma exposure near key strikes.",
    type: "risk",
    startMonth: 7,
    startDay: 17,
    endMonth: 7,
    endDay: 17,
    category: "options_expiry",
  },
  {
    id: "aug-downturn",
    title: "August Downturn",
    description:
      "Historically markets tend to decline in late July through August. Low volume amplifies selling pressure.",
    type: "risk",
    startMonth: 7,
    startDay: 28,
    endMonth: 8,
    endDay: 30,
    category: "seasonal",
  },
  {
    id: "jackson-hole",
    title: "Jackson Hole / Fed Policy",
    description:
      "Jackson Hole Economic Symposium risk window. Fed policy signals can trigger sharp repricing across asset classes.",
    type: "risk",
    startMonth: 8,
    startDay: 15,
    endMonth: 8,
    endDay: 30,
    category: "macro",
  },
  {
    id: "sep-worst-month",
    title: "Statistically Worst Month",
    description:
      "September is historically the worst-performing month for equities. Tax-loss harvesting and fund rebalancing add selling pressure.",
    type: "risk",
    startMonth: 9,
    startDay: 5,
    endMonth: 9,
    endDay: 25,
    category: "seasonal",
  },
  {
    id: "oct-volatility",
    title: "Pre-Election Volatility + Earning Season",
    description:
      "Q3 earnings overlap with election-year uncertainty. Historically elevated VIX and sector rotation.",
    type: "risk",
    startMonth: 10,
    startDay: 1,
    endMonth: 10,
    endDay: 20,
    category: "earnings",
  },
  {
    id: "nov-opex",
    title: "Options Expiring",
    description:
      "November options expiration. Elevated pin risk and gamma exposure near key strikes.",
    type: "risk",
    startMonth: 11,
    startDay: 20,
    endMonth: 11,
    endDay: 20,
    category: "options_expiry",
  },
  {
    id: "dec-quad-witching",
    title: "Quad Witching",
    description:
      "Year-end simultaneous expiry of index futures, index options, stock options, and stock futures. Expect unusual volume and price swings.",
    type: "risk",
    startMonth: 12,
    startDay: 18,
    endMonth: 12,
    endDay: 18,
    category: "quad_witching",
  },
]

// ---------------------------------------------------------------------------
// Dataset 2 — Opportunity / Enter Long & Take Profit windows
// ---------------------------------------------------------------------------

const OPPORTUNITY_EVENTS: SeasonalityEvent[] = [
  {
    id: "feb-entry",
    title: "Entry Window",
    description:
      "Historically favorable period for entering long positions after January volatility settles.",
    type: "opportunity",
    startMonth: 2,
    startDay: 23,
    endMonth: 3,
    endDay: 15,
    category: "entry_window",
  },
  {
    id: "apr-entry",
    title: "Entry Window",
    description:
      "Post-earnings dip buying opportunity. Volatility from Q1 earnings typically subsides.",
    type: "opportunity",
    startMonth: 4,
    startDay: 18,
    endMonth: 4,
    endDay: 25,
    category: "entry_window",
  },
  {
    id: "jul-entry",
    title: "Entry Window",
    description:
      "Post-earnings and post-opex entry window. Markets tend to stabilize briefly before August weakness.",
    type: "opportunity",
    startMonth: 7,
    startDay: 18,
    endMonth: 7,
    endDay: 25,
    category: "entry_window",
  },
  {
    id: "sep-entry",
    title: "Entry Window",
    description:
      "Late September recovery. Historically the September bottom provides a brief long entry before Q4.",
    type: "opportunity",
    startMonth: 9,
    startDay: 25,
    endMonth: 9,
    endDay: 29,
    category: "entry_window",
  },
  {
    id: "nov-early-entry",
    title: "Entry Window",
    description:
      "Early November rally. Post-election clarity and pre-holiday buying typically lift markets.",
    type: "opportunity",
    startMonth: 11,
    startDay: 5,
    endMonth: 11,
    endDay: 15,
    category: "entry_window",
  },
  {
    id: "nov-late-entry",
    title: "Entry Window",
    description:
      "Thanksgiving to mid-December rally. Institutional window dressing and holiday optimism drive gains.",
    type: "opportunity",
    startMonth: 11,
    startDay: 22,
    endMonth: 12,
    endDay: 13,
    category: "entry_window",
  },
  {
    id: "santa-rally",
    title: "Santa Rally",
    description:
      "Year-end Santa Claus rally. Historically strong final trading days as tax-loss selling ends and new-year optimism begins.",
    type: "opportunity",
    startMonth: 12,
    startDay: 23,
    endMonth: 12,
    endDay: 31,
    category: "entry_window",
  },
]

// ---------------------------------------------------------------------------
// Combined dataset
// ---------------------------------------------------------------------------

export const SEASONALITY_EVENTS: SeasonalityEvent[] = [
  ...RISK_EVENTS,
  ...OPPORTUNITY_EVENTS,
]

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Resolve a month/day pair to a Date in the same year as `ref`. */
export function toDateThisYear(
  month: number,
  day: number,
  ref: Date = new Date(),
): Date {
  return new Date(ref.getFullYear(), month - 1, day)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Events whose window contains the given date. */
export function getActiveEvents(date: Date = new Date()): SeasonalityEvent[] {
  const today = startOfDay(date)
  return SEASONALITY_EVENTS.filter((e) => {
    const start = toDateThisYear(e.startMonth, e.startDay, today)
    const end = toDateThisYear(e.endMonth, e.endDay, today)
    return today >= start && today <= end
  })
}

/** The single next event (by start date) that hasn't started yet. */
export function getNextEvent(date: Date = new Date()): SeasonalityEvent | null {
  const today = startOfDay(date)
  let closest: SeasonalityEvent | null = null
  let closestDiff = Infinity

  for (const e of SEASONALITY_EVENTS) {
    const start = toDateThisYear(e.startMonth, e.startDay, today)
    const diff = start.getTime() - today.getTime()
    if (diff > 0 && diff < closestDiff) {
      closestDiff = diff
      closest = e
    }
  }

  return closest
}

/** Events whose start date falls within the next `daysAhead` days (not yet active). */
export function getUpcomingEvents(
  date: Date = new Date(),
  daysAhead: number = 7,
): SeasonalityEvent[] {
  const today = startOfDay(date)
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + daysAhead)

  return SEASONALITY_EVENTS.filter((e) => {
    const start = toDateThisYear(e.startMonth, e.startDay, today)
    return start > today && start <= horizon
  })
}
