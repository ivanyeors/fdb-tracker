"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, ExternalLink, HelpCircle, Loader2, X } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricCard } from "@/components/dashboard/metric-card"
import { SectionHeader } from "@/components/dashboard/section-header"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { Skeleton } from "@/components/ui/skeleton"
import { GiroRulesForm } from "./giro-rules-form"
import { calculateOcbc360Interest } from "@/lib/calculations/bank-interest"
import {
  ocbc360RowsToConfig,
  type Ocbc360CategoryRow,
} from "@/lib/calculations/ocbc360-status"
import { Switch } from "@/components/ui/switch"
import { cn, formatCurrency } from "@/lib/utils"
import { SavingsGoalsSection } from "@/components/dashboard/savings-goals-section"
import {
  aggregateForecast,
  type ForecastMonth,
} from "@/lib/calculations/balance-forecast"
import { Badge } from "@/components/ui/badge"
import { useApi } from "@/hooks/use-api"
import { useDataRefresh } from "@/hooks/use-data-refresh"

type Ocbc360Derived = {
  categories: Ocbc360CategoryRow[]
  evalMonth: string
}

type BankAccountRow = {
  id?: string
  bank_name?: string
  account_type?: string
  profile_id?: string | null
  latest_balance?: number
  opening_balance?: number
  ocbc360Config?: Record<string, unknown> | null
  ocbc360Derived?: Ocbc360Derived | null
}

function formatEvalMonth(iso: string) {
  const [y, m] = iso.slice(0, 10).split("-")
  if (!y || !m) return iso
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short" })
}

function zoneBadgeClass(zone: string | null | undefined): string {
  if (zone === "safe") return "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
  if (zone === "cautious") return "border-amber-500/50 text-amber-600 dark:text-amber-400"
  return "border-red-500/50 text-red-600 dark:text-red-400"
}

function zoneBgClass(zone: string | null | undefined): string {
  if (zone === "safe") return "bg-emerald-500"
  if (zone === "cautious") return "bg-amber-500"
  return "bg-red-500"
}

/** Matches GET /api/bank-accounts when `profileId` is set: that profile's rows + shared (`profile_id` null). */
function filterAccountsForActiveProfile(
  list: BankAccountRow[],
  profileId: string | null,
): BankAccountRow[] {
  if (!profileId) return list
  return list.filter(
    (a) => a.profile_id == null || a.profile_id === profileId,
  )
}

function buildBankAccountsUrl(
  profileId: string | null,
  familyId: string | null,
): string | null {
  if (!profileId && !familyId) return null
  const url = new URL("/api/bank-accounts", "http://localhost")
  if (profileId) url.searchParams.set("profileId", profileId)
  else if (familyId) url.searchParams.set("familyId", familyId)
  return `${url.pathname}${url.search}`
}

export function BanksClient({
  initialData,
}: {
  readonly initialData: BankAccountRow[]
}) {
  const { activeProfileId, activeFamilyId, profiles } = useActiveProfile()
  const { triggerRefresh } = useDataRefresh()
  const [ocbcSaving, setOcbcSaving] = useState<string | null>(null)

  const apiPath = buildBankAccountsUrl(activeProfileId, activeFamilyId)

  const { data: rawAccounts, isLoading } = useApi<BankAccountRow[]>(apiPath, {
    fallbackData: initialData,
  })

  const accounts = useMemo(() => rawAccounts ?? [], [rawAccounts])

  const visibleAccounts = useMemo(
    () => filterAccountsForActiveProfile(accounts, activeProfileId),
    [accounts, activeProfileId],
  )

  const staleRowsRemoved =
    Boolean(activeProfileId) && accounts.length > visibleAccounts.length

  const activeProfileName = activeProfileId
    ? profiles.find((p) => p.id === activeProfileId)?.name
    : null

  const ocbc360Account = visibleAccounts.find(
    (a) => a.account_type === "ocbc_360",
  )
  const derived = ocbc360Account?.ocbc360Derived

  const categories = useMemo(() => derived?.categories ?? [], [derived])

  const ocbc360Balance =
    ocbc360Account == null
      ? 0
      : (ocbc360Account.latest_balance ?? ocbc360Account.opening_balance ?? 0)

  const tieredInterest = useMemo(() => {
    if (categories.length === 0 || ocbc360Balance <= 0) return null
    const cfg = ocbc360RowsToConfig(categories)
    return calculateOcbc360Interest(ocbc360Balance, cfg)
  }, [categories, ocbc360Balance])

  const effectiveRatePct =
    tieredInterest != null && ocbc360Balance > 0
      ? tieredInterest.annualRate * 100
      : 0
  const projectedMonthlyInterest = tieredInterest?.monthlyInterest ?? 0

  const patchOcbc360 = useCallback(
    async (
      accountId: string,
      body: {
        insure_met?: boolean
        invest_met?: boolean
      },
    ) => {
      setOcbcSaving(accountId)
      try {
        const res = await fetch(`/api/bank-accounts/${accountId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ocbc360: body }),
        })
        if (!res.ok) {
          console.error("Failed to update OCBC 360 settings")
          return
        }
        triggerRefresh()
      } finally {
        setOcbcSaving(null)
      }
    },
    [triggerRefresh],
  )

  const evalMonthLabel = derived?.evalMonth
    ? formatEvalMonth(derived.evalMonth)
    : null

  const searchParams = useSearchParams()
  const router = useRouter()
  const defaultTab = searchParams.get("tab") === "giro" ? "giro" : "overview"

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "giro") {
      params.set("tab", "giro")
    } else {
      params.delete("tab")
    }
    const qs = params.toString()
    const suffix = qs ? `?${qs}` : ""
    router.replace(`/dashboard/banks${suffix}`, { scroll: false })
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <SectionHeader
        title="Banks"
        description={
          activeProfileId
            ? `Balances for ${activeProfileName ?? "this profile"} and shared accounts (no owner). Personal accounts must be assigned to a user under Settings \u2192 User Settings \u2192 Banks, or they stay "shared" and show for every profile.`
            : "Per-bank balances for the whole family (combined). Pick a profile above to focus on one person plus shared accounts."
        }
      />

      <Tabs value={defaultTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="giro">GIRO Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {(() => {
            if (isLoading && accounts.length === 0) {
              return (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetricCard label="" value={0} loading />
            <MetricCard label="" value={0} loading />
          </div>
          {activeProfileId && (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="mt-2 h-4 w-64" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
            </Card>
          )}
        </>
              )
            }
            if (visibleAccounts.length === 0) {
              return (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
          No bank accounts found for this profile.
        </div>
              )
            }
            return (
        <>
          {staleRowsRemoved ? (
            <p className="text-muted-foreground text-sm">
              Showing only this profile and shared accounts. If the list still
              looked like &quot;combined&quot;, refresh the page or check
              Settings &rarr; User Settings &rarr; Banks: each personal account
              should have an owner so it isn&apos;t treated as shared.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {visibleAccounts.map((acc, i) => (
              <MetricCard
                key={acc.id || i}
                label={acc.bank_name || "Bank Account"}
                value={acc.latest_balance ?? acc.opening_balance ?? 0}
                prefix="$"
                trend={0}
                trendLabel="vs last month"
                tooltipId="BANK_BALANCE"
              />
            ))}
          </div>

          {!activeProfileId &&
          visibleAccounts.some((a) => a.account_type === "ocbc_360") ? (
            <p className="text-muted-foreground text-sm">
              Select a profile (not Combined) to see the OCBC 360 interest
              breakdown and cashflow-linked categories.
            </p>
          ) : null}

          {activeProfileId && ocbc360Account && categories.length > 0 ? (
            <>
              {/* Standalone Monthly Spend Progress */}
              {(() => {
                const spendCat = categories.find((c) => c.id === "spend")
                if (!spendCat?.progress || spendCat.progress.target <= 0)
                  return null
                const pct = Math.min(
                  100,
                  (spendCat.progress.current / spendCat.progress.target) * 100,
                )
                return (
                  <Card>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            Monthly Spend Progress
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ${spendCat.progress.current.toFixed(0)} / $
                            {spendCat.progress.target.toFixed(0)} spent this
                            month
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            zoneBadgeClass(spendCat.zone),
                          )}
                        >
                          {spendCat.met ? "Met" : `${pct.toFixed(0)}%`}
                        </Badge>
                      </div>
                      <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="absolute inset-0 flex rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500/8"
                            style={{ width: "70%" }}
                          />
                          <div
                            className="h-full bg-amber-500/8"
                            style={{ width: "30%" }}
                          />
                        </div>
                        <div
                          className={cn(
                            "relative h-full rounded-full transition-all",
                            zoneBgClass(spendCat.zone),
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        OCBC 360 Spend condition
                      </p>
                    </CardContent>
                  </Card>
                )
              })()}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-1.5">
                    <CardTitle>OCBC 360 Interest Breakdown</CardTitle>
                    <a
                      href="https://www.ocbc.com/personal-banking/deposits/360-savings-account"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 text-muted-foreground hover:text-foreground"
                      title="OCBC 360 official page"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex shrink-0 cursor-help rounded-full border-0 bg-transparent p-0 text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          aria-label="About this OCBC 360 projection"
                        >
                          <HelpCircle className="size-4" aria-hidden />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        align="start"
                        side="bottom"
                        className="w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(22rem,70vh)] space-y-2 overflow-y-auto p-3 text-xs leading-relaxed text-muted-foreground"
                      >
                        <p>
                          Salary and Spend use your logged{" "}
                          <Link
                            href="/dashboard/cashflow"
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                          >
                            monthly inflow and outflow
                          </Link>{" "}
                          for the current month (same as Telegram{" "}
                          <span className="font-mono text-[0.85em]">/in</span>{" "}
                          and{" "}
                          <span className="font-mono text-[0.85em]">/out</span>{" "}
                          and Settings monthly logs). If there is no row for
                          this month, Salary falls back to gross monthly salary
                          from income settings. These are approximations vs
                          OCBC&apos;s actual salary-credit and card rules.
                        </p>
                        <p>
                          Save uses month-on-month closing balance change vs the
                          bank&apos;s average daily balance rule. Insure and
                          Invest must match OCBC&apos;s qualifying products.
                          Category bonus rates in this projection follow the
                          usual OCBC 360 two-tranche balance bands (see Bonus
                          tranches row).
                        </p>
                        <p>
                          Switch to a named profile above to see this breakdown
                          (hidden in Combined view).
                        </p>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  <CardDescription>
                    {evalMonthLabel ? (
                      <>
                        Salary &amp; Spend use{" "}
                        <span className="font-medium text-foreground">
                          {evalMonthLabel}
                        </span>{" "}
                        cashflow (Asia/Singapore).{" "}
                      </>
                    ) : null}
                    Effective rate: {effectiveRatePct.toFixed(2)}% &middot;
                    Projected:{" "}
                    <span className="font-semibold text-foreground">
                      ${projectedMonthlyInterest.toFixed(2)}/month
                    </span>{" "}
                    (Grow is separate from the two-tranche bonus base)
                    {(() => {
                      const now = new Date()
                      const daysInMonth = new Date(
                        now.getFullYear(),
                        now.getMonth() + 1,
                        0,
                      ).getDate()
                      const dayOfMonth = now.getDate()
                      const daysLeft = daysInMonth - dayOfMonth
                      return (
                        <span className="block mt-1 text-xs text-muted-foreground">
                          Day {dayOfMonth} of {daysInMonth} — conditions reset
                          in {daysLeft} day{daysLeft === 1 ? "" : "s"}
                        </span>
                      )
                    })()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Category</th>
                          <th className="pb-2 pr-4 font-medium">Requirement</th>
                          <th className="pb-2 pr-4 font-medium">Progress</th>
                          <th className="pb-2 pr-4 text-center font-medium">
                            Status
                          </th>
                          <th className="pb-2 text-right font-medium">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map((cat) => (
                          <tr key={cat.id} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium">
                              {cat.category}
                            </td>
                            <td className="py-2.5 pr-4 text-muted-foreground">
                              {cat.requirement}
                            </td>
                            <td className="py-2.5 pr-4 align-top">
                              {cat.id === "insure" || cat.id === "invest" ? (
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={cat.met}
                                    disabled={
                                      !ocbc360Account.id ||
                                      ocbcSaving === ocbc360Account.id
                                    }
                                    onCheckedChange={(v) => {
                                      if (!ocbc360Account.id) return
                                      void patchOcbc360(ocbc360Account.id, {
                                        [cat.id === "insure"
                                          ? "insure_met"
                                          : "invest_met"]: v,
                                      })
                                    }}
                                    aria-label={`${cat.category} bonus`}
                                  />
                                  <span className="text-muted-foreground text-xs">
                                    {cat.met ? "On" : "Off"}
                                  </span>
                                  {ocbcSaving === ocbc360Account.id ? (
                                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                  ) : null}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <span
                                    className="text-xs text-muted-foreground"
                                    title={
                                      cat.id === "bonus_tranches"
                                        ? "How much of your balance sits in the first S$75k + next S$25k slices (max S$100k) where category bonus rates apply in this projection."
                                        : undefined
                                    }
                                  >
                                    {cat.progressLabel ?? "\u2014"}
                                  </span>
                                  {cat.detail ? (
                                    <span className="block text-[10px] text-muted-foreground/70">
                                      {cat.detail}
                                    </span>
                                  ) : null}
                                  {cat.progress && cat.progress.target > 0 ? (
                                    <div className="relative h-2 w-full max-w-[180px] overflow-hidden rounded-full bg-muted">
                                      {/* Zone background indicators */}
                                      <div className="absolute inset-0 flex rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-red-500/8"
                                          style={{ width: "70%" }}
                                        />
                                        <div
                                          className="h-full bg-amber-500/8"
                                          style={{ width: "30%" }}
                                        />
                                      </div>
                                      <div
                                        className={cn(
                                          "relative h-full rounded-full transition-all",
                                          zoneBgClass(cat.zone),
                                        )}
                                        style={{
                                          width: `${Math.min(
                                            100,
                                            (cat.progress.current /
                                              cat.progress.target) *
                                              100,
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 text-center">
                              {cat.met ? (
                                <Check className="mx-auto size-4 text-emerald-500" />
                              ) : (
                                <X className="mx-auto size-4 text-muted-foreground/50" />
                              )}
                            </td>
                            <td
                              className="py-2.5 text-right tabular-nums"
                              title={
                                cat.id === "bonus_tranches"
                                  ? "Stacked effective annual rate on the first S$75k and next S$25k of balance (sum of rates for met categories; matches the interest calculation)."
                                  : undefined
                              }
                            >
                              {cat.rateLabel}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
            )
          })()}

          {activeProfileId &&
            !isLoading &&
            visibleAccounts.length > 0 && (
              <BalanceForecastSection
                profileId={activeProfileId}
                accounts={visibleAccounts}
              />
            )}

          <SavingsGoalsSection />
        </TabsContent>

        <TabsContent value="giro" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Set up recurring monthly transfers from a bank account to outflow,
            investments, CPF, SRS, or another bank account.
          </p>
          <GiroRulesForm familyId={activeFamilyId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BalanceForecastSection({
  profileId,
  accounts,
}: {
  readonly profileId: string
  readonly accounts: BankAccountRow[]
}) {
  const [forecast, setForecast] = useState<ForecastMonth[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      try {
        const url = new URL("/api/cashflow/effective", globalThis.location.origin)
        url.searchParams.set("profileId", profileId)
        const res = await fetch(url)
        if (!res.ok) {
          setForecast(null)
          return
        }
        const data = await res.json()
        const { inflow = 0, outflow = 0 } = data

        const now = new Date()
        const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

        const result = aggregateForecast({
          accounts: accounts.map((a) => ({
            balance: a.latest_balance ?? a.opening_balance ?? 0,
            annualRatePct: 0,
          })),
          monthlyInflow: inflow,
          monthlyOutflow: outflow,
          months: 6,
          startMonth,
        })

        setForecast(result)
      } catch {
        setForecast(null)
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [profileId, accounts])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!forecast || forecast.length === 0) return null

  const minBalance = Math.min(...forecast.map((f) => f.balance))
  const goesNegative = minBalance < 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>6-Month Balance Forecast</CardTitle>
          {goesNegative && (
            <Badge variant="destructive" className="text-xs">
              Goes Negative
            </Badge>
          )}
        </div>
        <CardDescription>
          Projected total balance based on your effective monthly inflow and
          outflow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Month</th>
                <th className="pb-2 pr-4 text-right font-medium">Balance</th>
                <th className="pb-2 pr-4 text-right font-medium">Inflow</th>
                <th className="pb-2 pr-4 text-right font-medium">Outflow</th>
                <th className="pb-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {forecast.map((f) => {
                const monthLabel = new Date(f.month).toLocaleDateString(
                  "en-SG",
                  {
                    year: "numeric",
                    month: "short",
                  },
                )
                return (
                  <tr
                    key={f.month}
                    className={cn(
                      "border-b last:border-0",
                      f.balance < 0 && "bg-red-50/50 dark:bg-red-950/20",
                    )}
                  >
                    <td className="py-2 pr-4 font-medium">{monthLabel}</td>
                    <td
                      className={cn(
                        "py-2 pr-4 text-right tabular-nums",
                        f.balance < 0 && "text-red-600 dark:text-red-400",
                      )}
                    >
                      ${formatCurrency(f.balance)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-green-600 dark:text-green-400">
                      +${formatCurrency(f.inflow)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-red-600 dark:text-red-400">
                      -${formatCurrency(f.outflow)}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right tabular-nums",
                        f.netChange >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {f.netChange >= 0 ? "+" : ""}$
                      {formatCurrency(f.netChange)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
