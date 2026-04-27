"use client"

import { Card, CardContent, CardDescription } from "@/components/ui/card"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import type { TaxSnapshot } from "@/lib/tax/tax-snapshot"
import { formatMarginalBandLine } from "@/lib/tax/format-marginal"
import { formatCurrency } from "@/lib/utils"

type ProfileRef = { id: string; name: string }

interface ReliefsBracketSummaryCardProps {
  readonly className?: string
  readonly selectedYear: number
  readonly totalReliefs: number
  readonly manualReliefTotal: number
  readonly autoReliefTotal: number
  readonly profiles: ProfileRef[]
  readonly taxSnapshots: Record<string, TaxSnapshot> | undefined
  readonly taxSnapshotsNextYa: Record<string, TaxSnapshot> | undefined
  readonly activeProfileId?: string | null
}

export function ReliefsBracketSummaryCard({
  className,
  selectedYear,
  totalReliefs,
  manualReliefTotal,
  autoReliefTotal,
  profiles,
  taxSnapshots,
  taxSnapshotsNextYa,
  activeProfileId,
}: ReliefsBracketSummaryCardProps) {
  const nextYa = selectedYear + 1
  const orderedProfiles = [...profiles].sort((a, b) => {
    if (activeProfileId && a.id === activeProfileId) return -1
    if (activeProfileId && b.id === activeProfileId) return 1
    return a.name.localeCompare(b.name)
  })

  function snapCurrent(id: string): TaxSnapshot | null {
    const s = taxSnapshots?.[id]
    return s && s.year === selectedYear ? s : null
  }

  function snapNext(id: string): TaxSnapshot | null {
    const s = taxSnapshotsNextYa?.[id]
    return s && s.year === nextYa ? s : null
  }

  const profilesWithSnap = orderedProfiles.filter((p) => snapCurrent(p.id) != null)
  const showBracketLines = profilesWithSnap.length > 0

  return (
    <Card className={className}>
      <CardContent className="space-y-4 pt-6">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm text-muted-foreground">Total reliefs</p>
            <InfoTooltip id="TAX_RELIEF_INPUTS" />
          </div>
          <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
            ${formatCurrency(totalReliefs)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Counted in model (auto + manual rows for YA {selectedYear}), before
            comparing to the $80k cap per person in tax.
          </p>
        </div>

        <div className="border-t border-border/60 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            By source
          </p>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">You entered (manual)</span>
              <span className="tabular-nums font-medium">
                ${formatCurrency(manualReliefTotal)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Auto-derived</span>
              <span className="tabular-nums font-medium">
                ${formatCurrency(autoReliefTotal)}
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Manual: SRS, donations, CPF top-ups, etc. Auto: earned income relief, CPF, life
            insurance from your profile.
          </p>
        </div>

        {showBracketLines ? (
          <div className="border-t border-border/60 pt-4 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Marginal band (YA {selectedYear})
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Per person (chargeable income from this model).
              </p>
              <ul className="mt-2 space-y-2">
                {profilesWithSnap.map((p) => {
                  const s = snapCurrent(p.id)!
                  return (
                    <li key={p.id} className="min-w-0 text-sm leading-snug">
                      {profiles.length > 1 && (
                        <span className="font-medium text-foreground">{p.name}: </span>
                      )}
                      <span className="text-muted-foreground break-words">
                        {formatMarginalBandLine(s)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>

            {(() => {
              const withNext = profilesWithSnap.filter((p) => snapNext(p.id) != null)
              if (withNext.length === 0) return null
              return (
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Illustrative marginal band (YA {nextYa})
                  </p>
                  <InfoTooltip id="TAX_NEXT_YA_ILLUSTRATIVE" />
                </div>
                <ul className="mt-2 space-y-2">
                  {withNext.map((p) => {
                    const sN = snapNext(p.id)!
                    return (
                      <li key={`${p.id}-next`} className="min-w-0 text-sm leading-snug">
                        {profiles.length > 1 && (
                          <span className="font-medium text-foreground">{p.name}: </span>
                        )}
                        <span className="text-muted-foreground break-words">
                          {formatMarginalBandLine(sN)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <CardDescription className="mt-2 text-[11px] leading-snug">
                  Same salary, bonus, and manual relief entries as YA {selectedYear}; age and CPF rules
                  can differ for YA {nextYa}. Not a forecast of next calendar year&apos;s income.
                </CardDescription>
              </div>
              )
            })()}
          </div>
        ) : (
          <div className="border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">
              Add income in settings to see each person&apos;s marginal band here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
