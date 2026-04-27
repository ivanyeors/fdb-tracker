"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { CurrencyInput } from "@/components/ui/currency-input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { formatCurrency } from "@/lib/utils"
import { ChevronDown, Plus, X, SlidersHorizontal, RotateCcw } from "lucide-react"
import type {
  CpfSimulatorResult,
  HypotheticalLoan,
} from "@/hooks/use-cpf-simulator"

type CpfSimulatorPanelProps = {
  readonly simulator: CpfSimulatorResult
}

export function CpfSimulatorPanel({ simulator }: CpfSimulatorPanelProps) {
  const [open, setOpen] = useState(false)
  const [showHypoForm, setShowHypoForm] = useState(false)
  const [hypoDraft, setHypoDraft] = useState<HypotheticalLoan>({
    principal: 300000,
    ratePct: 2.6,
    tenureMonths: 300,
  })

  const { state, isModified, deltaAt55 } = simulator

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-4 py-3 sm:px-6 sm:py-4 text-left hover:bg-muted/50 transition-colors rounded-t-lg">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Simulate Growth</span>
              {isModified && (
                <span className="text-xs text-muted-foreground">
                  (modified)
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isModified && deltaAt55 !== 0 && (
                <span
                  className={`text-xs font-medium tabular-nums ${deltaAt55 > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                >
                  {deltaAt55 > 0 ? "+" : ""}${formatCurrency(deltaAt55)} at 55
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              />
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-5 border-t pt-4">
            {/* Income section */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Annual Salary
                </Label>
                <CurrencyInput
                  prefix="$"
                  value={state.annualSalary}
                  onChange={(v) => simulator.setAnnualSalary(v ?? 0)}
                  decimalsLimit={0}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Income Growth Rate (%/yr)
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={20}
                  step={0.5}
                  value={state.incomeGrowthRate * 100}
                  onChange={(e) =>
                    simulator.setIncomeGrowthRate(
                      Number.parseFloat(e.target.value) / 100 || 0,
                    )
                  }
                />
              </div>
            </div>

            {/* Loans section */}
            {(state.loanOverrides.length > 0 ||
              state.hypotheticalLoan ||
              showHypoForm) && (
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Loans (CPF OA Deductions)
                </Label>

                {state.loanOverrides.map((loan, i) => (
                  <div
                    key={i}
                    className="space-y-2 rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={loan.enabled}
                          onCheckedChange={(checked) =>
                            simulator.setLoanEnabled(i, !!checked)
                          }
                          size="sm"
                        />
                        <span className="text-sm font-medium">
                          {loan.name}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ${formatCurrency(loan.monthlyPayment)}/mo ·{" "}
                        {Math.ceil(loan.remainingMonths / 12)}y left
                      </span>
                    </div>
                    {loan.enabled && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            Principal
                          </Label>
                          <CurrencyInput
                            prefix="$"
                            value={loan.principal}
                            onChange={(v) =>
                              simulator.setLoanField(
                                i,
                                "principal",
                                v ?? 0,
                              )
                            }
                            decimalsLimit={0}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            Rate (%)
                          </Label>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={20}
                            step={0.1}
                            value={loan.ratePct}
                            onChange={(e) =>
                              simulator.setLoanField(
                                i,
                                "ratePct",
                                Number.parseFloat(e.target.value) || 0,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">
                            Tenure (mo)
                          </Label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={600}
                            value={loan.tenureMonths}
                            onChange={(e) =>
                              simulator.setLoanField(
                                i,
                                "tenureMonths",
                                Number.parseInt(e.target.value) || 1,
                              )
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Hypothetical loan */}
                {state.hypotheticalLoan && (
                  <div className="space-y-2 rounded-md border border-dashed p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">
                        Hypothetical Loan
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          simulator.setHypotheticalLoan(null)
                          setShowHypoForm(false)
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Principal
                        </Label>
                        <CurrencyInput
                          prefix="$"
                          value={state.hypotheticalLoan.principal}
                          onChange={(v) =>
                            simulator.setHypotheticalLoan({
                              ...state.hypotheticalLoan!,
                              principal: v ?? 0,
                            })
                          }
                          decimalsLimit={0}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Rate (%)
                        </Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={20}
                          step={0.1}
                          value={state.hypotheticalLoan.ratePct}
                          onChange={(e) =>
                            simulator.setHypotheticalLoan({
                              ...state.hypotheticalLoan!,
                              ratePct: Number.parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Tenure (mo)
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={600}
                          value={state.hypotheticalLoan.tenureMonths}
                          onChange={(e) =>
                            simulator.setHypotheticalLoan({
                              ...state.hypotheticalLoan!,
                              tenureMonths:
                                Number.parseInt(e.target.value) || 1,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Add hypothetical loan form */}
                {!state.hypotheticalLoan && !showHypoForm && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowHypoForm(true)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add hypothetical loan
                  </Button>
                )}

                {!state.hypotheticalLoan && showHypoForm && (
                  <div className="space-y-2 rounded-md border border-dashed p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">
                        New Hypothetical Loan
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setShowHypoForm(false)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Principal
                        </Label>
                        <CurrencyInput
                          prefix="$"
                          value={hypoDraft.principal}
                          onChange={(v) =>
                            setHypoDraft((d) => ({
                              ...d,
                              principal: v ?? 0,
                            }))
                          }
                          decimalsLimit={0}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Rate (%)
                        </Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={20}
                          step={0.1}
                          value={hypoDraft.ratePct}
                          onChange={(e) =>
                            setHypoDraft((d) => ({
                              ...d,
                              ratePct: Number.parseFloat(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Tenure (mo)
                        </Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={600}
                          value={hypoDraft.tenureMonths}
                          onChange={(e) =>
                            setHypoDraft((d) => ({
                              ...d,
                              tenureMonths:
                                Number.parseInt(e.target.value) || 1,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        simulator.setHypotheticalLoan({ ...hypoDraft })
                        setShowHypoForm(false)
                      }}
                    >
                      Apply to Projection
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Add loan button when no loans exist */}
            {state.loanOverrides.length === 0 &&
              !state.hypotheticalLoan &&
              !showHypoForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHypoForm(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add hypothetical loan
                </Button>
              )}

            {/* Voluntary top-ups */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Voluntary OA Top-up (/mo)
                </Label>
                <CurrencyInput
                  prefix="$"
                  value={state.additionalOaTopUp}
                  onChange={(v) =>
                    simulator.setAdditionalOaTopUp(v ?? 0)
                  }
                  decimalsLimit={0}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Voluntary SA Top-up (/mo)
                </Label>
                <CurrencyInput
                  prefix="$"
                  value={state.additionalSaTopUp}
                  onChange={(v) =>
                    simulator.setAdditionalSaTopUp(v ?? 0)
                  }
                  decimalsLimit={0}
                />
              </div>
            </div>

            {/* DPS toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Include DPS deduction
              </Label>
              <Switch
                checked={state.includeDps}
                onCheckedChange={(checked) =>
                  simulator.setIncludeDps(!!checked)
                }
                size="sm"
              />
            </div>

            {/* Reset button */}
            {isModified && (
              <div className="flex items-center justify-between border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={simulator.reset}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Reset to Actual
                </Button>
                {deltaAt55 !== 0 && (
                  <span
                    className={`text-sm font-medium tabular-nums ${deltaAt55 > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {deltaAt55 > 0 ? "+" : ""}${formatCurrency(deltaAt55)}{" "}
                    at age 55
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
