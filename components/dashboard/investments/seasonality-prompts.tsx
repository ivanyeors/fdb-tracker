"use client"

import { useMemo } from "react"
import Link from "next/link"
import { AlertTriangle, TrendingUp, ArrowRight, Calendar } from "lucide-react"

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import {
  getActiveEvents,
  getUpcomingEvents,
  getNextEvent,
  type SeasonalityEvent,
} from "@/lib/investments/seasonality"

function formatDateRange(e: SeasonalityEvent): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const start = `${months[e.startMonth - 1]} ${e.startDay}`
  if (e.startMonth === e.endMonth && e.startDay === e.endDay) return start
  const end = `${months[e.endMonth - 1]} ${e.endDay}`
  return `${start} \u2013 ${end}`
}

const CATEGORY_LABELS: Record<string, string> = {
  earnings: "Earnings",
  options_expiry: "Options",
  quad_witching: "Quad Witching",
  macro: "Macro",
  seasonal: "Seasonal",
  entry_window: "Entry Window",
}

function EventCard({ event }: { event: SeasonalityEvent }) {
  const isRisk = event.type === "risk"
  return (
    <Alert
      className={
        isRisk
          ? "border-l-4 border-l-amber-500 dark:border-l-amber-400"
          : "border-l-4 border-l-emerald-500 dark:border-l-emerald-400"
      }
    >
      {isRisk ? (
        <AlertTriangle className="size-4 text-amber-500 dark:text-amber-400" />
      ) : (
        <TrendingUp className="size-4 text-emerald-500 dark:text-emerald-400" />
      )}
      <AlertTitle className="flex items-center gap-2">
        <span>
          {event.title}{" "}
          <span className="text-muted-foreground font-normal">
            ({formatDateRange(event)})
          </span>
        </span>
        {event.category && (
          <Badge variant="outline" className="text-[10px]">
            {CATEGORY_LABELS[event.category] ?? event.category}
          </Badge>
        )}
      </AlertTitle>
      <AlertDescription>{event.description}</AlertDescription>
    </Alert>
  )
}

function QuietCard({ next }: { next: SeasonalityEvent | null }) {
  return (
    <Alert className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
      <Calendar className="size-4 text-blue-500 dark:text-blue-400" />
      <AlertTitle>Quiet Period</AlertTitle>
      <AlertDescription>
        No active seasonality events right now.
        {next && (
          <>
            {" "}
            Next up:{" "}
            <span className="font-medium text-foreground">
              {next.title}
            </span>{" "}
            ({formatDateRange(next)})
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}

function FullVariant() {
  const active = useMemo(() => getActiveEvents(), [])
  const upcoming = useMemo(() => getUpcomingEvents(), [])
  const next = useMemo(() => getNextEvent(), [])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">Market Seasonality</h3>
        <InfoTooltip id="SEASONALITY_PROMPTS" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Current */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Current
          </p>
          {active.length > 0 ? (
            active.map((e) => <EventCard key={e.id} event={e} />)
          ) : (
            <QuietCard next={null} />
          )}
        </div>

        {/* Upcoming */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Upcoming
          </p>
          {upcoming.length > 0 ? (
            upcoming.map((e) => <EventCard key={e.id} event={e} />)
          ) : next ? (
            <Alert className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
              <Calendar className="size-4 text-blue-500 dark:text-blue-400" />
              <AlertTitle>
                {next.title}{" "}
                <span className="font-normal text-muted-foreground">
                  ({formatDateRange(next)})
                </span>
              </AlertTitle>
              <AlertDescription>{next.description}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              No upcoming events in the next 7 days.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function CompactVariant() {
  const active = useMemo(() => getActiveEvents(), [])
  const next = useMemo(() => getNextEvent(), [])

  // No active events — show quiet state with next upcoming
  if (active.length === 0) {
    return (
      <Alert className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
        <Calendar className="size-4 text-blue-500 dark:text-blue-400" />
        <AlertTitle className="flex items-center justify-between">
          <span>
            Quiet Period
            {next && (
              <span className="font-normal text-muted-foreground">
                {" "}
                — Next: {next.title} ({formatDateRange(next)})
              </span>
            )}
          </span>
          <Link
            href="/dashboard/investments"
            className="ml-2 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View <ArrowRight className="size-3" />
          </Link>
        </AlertTitle>
      </Alert>
    )
  }

  // Prioritize risk over opportunity for the single banner
  const sorted = [...active].sort((a, b) => {
    if (a.type === "risk" && b.type !== "risk") return -1
    if (a.type !== "risk" && b.type === "risk") return 1
    return 0
  })
  const event = sorted[0]!
  const isRisk = event.type === "risk"

  return (
    <Alert
      className={
        isRisk
          ? "border-l-4 border-l-amber-500 dark:border-l-amber-400"
          : "border-l-4 border-l-emerald-500 dark:border-l-emerald-400"
      }
    >
      {isRisk ? (
        <AlertTriangle className="size-4 text-amber-500 dark:text-amber-400" />
      ) : (
        <TrendingUp className="size-4 text-emerald-500 dark:text-emerald-400" />
      )}
      <AlertTitle className="flex items-center justify-between">
        <span>
          {event.title}{" "}
          <span className="font-normal text-muted-foreground">
            ({formatDateRange(event)})
          </span>
        </span>
        <Link
          href="/dashboard/investments"
          className="ml-2 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          View <ArrowRight className="size-3" />
        </Link>
      </AlertTitle>
      <AlertDescription className="line-clamp-1">
        {event.description}
        {active.length > 1 && (
          <span className="text-muted-foreground">
            {" "}
            +{active.length - 1} more
          </span>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function SeasonalityPrompts({
  variant = "full",
}: {
  variant?: "full" | "compact"
}) {
  if (variant === "compact") return <CompactVariant />
  return <FullVariant />
}
