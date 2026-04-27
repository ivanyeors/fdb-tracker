"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CurrencyInput } from "@/components/ui/currency-input"
import { MonthYearPicker } from "@/components/ui/month-year-picker"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { useActiveProfile } from "@/hooks/use-active-profile"
import { ImpactConfirmationDialog } from "@/components/ui/impact-confirmation-dialog"
import { useImpactConfirmation } from "@/hooks/use-impact-confirmation"
import type { IlpFundReportSnapshot } from "@/lib/ilp-import/types"
import { stripMhtmlToHtmlOnly } from "@/lib/ilp-import/strip-mhtml-client"
import {
  allocationSumMessage,
  isValidIlpGroupAllocationSum,
  mergeMultiGroupAllocationItems,
  split100Across,
  sumAllocationPcts,
} from "@/lib/investments/ilp-group-allocation"
import { cn } from "@/lib/utils"

const CREATE_NEW_ILP = "__create_ilp__"
const NO_FUND_GROUP = "__no_group__"
const NEW_FUND_GROUP = "__new_fund_group__"

type Step = "idle" | "extracting" | "preview" | "saving" | "success"

type ParseResponse = {
  suggestedMonth: string | null
  latestNavNumeric: number | null
  snapshot: IlpFundReportSnapshot
}

type IlpProductRow = {
  id: string
  name: string
  fund_group_memberships?: {
    group_id: string
    allocation_pct: number
  }[]
}
type FundGroupRow = { id: string; name: string }

type ParsedBundle = { file: File; parse: ParseResponse }

type ParsedBundleMeta = {
  fileName: string
  snapshot: IlpFundReportSnapshot
  suggestedMonth: string | null
  latestNavNumeric: number | null
}

type IlpImportDraft = {
  productId: string
  newProductName: string
  newMonthlyPremium: number | null
  singlePremiumPaymentMode: "monthly" | "one_time"
  newStartDate: string
  newEndDate: string
  fundGroupChoice: string
  newFundGroupName: string
  singleAllocPct: Record<string, number>
  singleGroupPremiumAmount: number | null
  singleGroupPremiumMode: "monthly" | "one_time"
  month: string
  fundValue: number | null
  premiumsPaid: number | null
  saveMultiAsIndividual: boolean
  multiRows: {
    productId: string
    newProductName: string
    newMonthlyPremium: number | null
    newStartDate: string
    newEndDate: string
    fundGroupChoice: string
    newFundGroupName: string
    month: string
    fundValue: number | null
    premiumsPaid: number | null
  }[]
  multiGroupTarget: string
  multiNewGroupName: string
  multiGroupPremiumAmount: number | null
  multiGroupPremiumMode: "monthly" | "one_time"
  multiAllocPct: Record<string, number>
  multiGroupTotalFundValue: number | null
  parsedBundleMeta: ParsedBundleMeta[]
}

const ILP_IMPORT_STORAGE_KEY = "fdb-ilp-import-draft"

function saveIlpImportDraft(state: IlpImportDraft) {
  try {
    localStorage.setItem(ILP_IMPORT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable
  }
}

function loadIlpImportDraft(): IlpImportDraft | null {
  try {
    if (typeof window === "undefined") return null
    const raw = localStorage.getItem(ILP_IMPORT_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as IlpImportDraft) : null
  } catch {
    return null
  }
}

function clearIlpImportDraft() {
  try {
    localStorage.removeItem(ILP_IMPORT_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function IlpFundImportTab({
  familyId: familyIdProp,
  onSuccess,
  variant = "card",
}: {
  familyId: string | null
  onSuccess?: () => void
  variant?: "card" | "inline"
}) {
  const { activeFamilyId, activeProfileId, profiles } = useActiveProfile()
  const ilpImpact = useImpactConfirmation("ilp.fund_value_manual")
  const familyId = activeFamilyId ?? familyIdProp
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const effectiveProfileId = selectedProfileId ?? activeProfileId

  const [step, setStep] = useState<Step>("idle")
  const [files, setFiles] = useState<File[]>([])
  const [fileLabel, setFileLabel] = useState<string | null>(null)
  const [parsedBundles, setParsedBundles] = useState<ParsedBundle[]>([])
  const [products, setProducts] = useState<IlpProductRow[]>([])
  const [fundGroups, setFundGroups] = useState<FundGroupRow[]>([])
  const [productId, setProductId] = useState<string>("")
  const [newProductName, setNewProductName] = useState("")
  const [newMonthlyPremium, setNewMonthlyPremium] = useState<number | null>(null)
  const [singlePremiumPaymentMode, setSinglePremiumPaymentMode] = useState<
    "monthly" | "one_time"
  >("monthly")
  /** Single-file + join existing group with members: one total premium + mode. */
  const [singleGroupPremiumAmount, setSingleGroupPremiumAmount] = useState<
    number | null
  >(null)
  const [singleGroupPremiumMode, setSingleGroupPremiumMode] = useState<
    "monthly" | "one_time"
  >("monthly")
  const [newStartDate, setNewStartDate] = useState("")
  const [newEndDate, setNewEndDate] = useState("")
  const [fundGroupChoice, setFundGroupChoice] = useState<string>(NO_FUND_GROUP)
  const [newFundGroupName, setNewFundGroupName] = useState("")
  /** Single-file + create new + existing group with members: pct by key `e:${id}` or `new` */
  const [singleAllocPct, setSingleAllocPct] = useState<Record<string, number>>({})
  const [month, setMonth] = useState("")
  const [fundValue, setFundValue] = useState<number | null>(null)
  const [premiumsPaid, setPremiumsPaid] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)

  /** 2+ files: save each as its own policy (no group / allocation step). */
  const [saveMultiAsIndividual, setSaveMultiAsIndividual] = useState(false)
  /** Per-file row for multi-file flows */
  const [multiRows, setMultiRows] = useState<
    {
      productId: string
      newProductName: string
      newMonthlyPremium: number | null
      newStartDate: string
      newEndDate: string
      fundGroupChoice: string
      newFundGroupName: string
      month: string
      fundValue: number | null
      premiumsPaid: number | null
    }[]
  >([])

  /** Multi group: selected target group id (existing uuid) or "new" */
  const [multiGroupTarget, setMultiGroupTarget] = useState<string>(NO_FUND_GROUP)
  const [multiNewGroupName, setMultiNewGroupName] = useState("")
  const [multiGroupPremiumAmount, setMultiGroupPremiumAmount] = useState<
    number | null
  >(null)
  const [multiGroupPremiumMode, setMultiGroupPremiumMode] = useState<
    "monthly" | "one_time"
  >("monthly")
  /** Keys: `e:${productId}` or `n:${fileIndex}` for new products from files */
  const [multiAllocPct, setMultiAllocPct] = useState<Record<string, number>>({})
  const [multiGroupTotalFundValue, setMultiGroupTotalFundValue] = useState<
    number | null
  >(null)
  const [restoredFromDraft, setRestoredFromDraft] = useState(false)

  const loadProducts = useCallback(async () => {
    if (!familyId) return
    const res = await fetch(`/api/investments/ilp?familyId=${familyId}`)
    if (!res.ok) return
    const data = (await res.json()) as IlpProductRow[]
    setProducts(Array.isArray(data) ? data : [])
  }, [familyId])

  const loadFundGroups = useCallback(async () => {
    if (!familyId) return
    const res = await fetch(`/api/investments/ilp/groups?familyId=${familyId}`)
    if (!res.ok) return
    const data = (await res.json()) as FundGroupRow[]
    setFundGroups(Array.isArray(data) ? data : [])
  }, [familyId])

  useEffect(() => {
    void loadProducts()
    void loadFundGroups()
  }, [loadProducts, loadFundGroups])

  // Restore draft from localStorage on mount
  useEffect(() => {
    const draft = loadIlpImportDraft()
    if (!draft || !draft.parsedBundleMeta?.length) return
    // Reconstruct parsedBundles from stored metadata (File objects can't be serialized)
    const bundles: ParsedBundle[] = draft.parsedBundleMeta.map((m) => ({
      file: new File([], m.fileName),
      parse: {
        snapshot: m.snapshot,
        suggestedMonth: m.suggestedMonth,
        latestNavNumeric: m.latestNavNumeric,
      },
    }))
    setParsedBundles(bundles)
    setFileLabel(
      bundles.length === 1
        ? bundles[0]!.file.name
        : `${bundles.length} files (restored)`,
    )
    setStep("preview")
    setProductId(draft.productId)
    setNewProductName(draft.newProductName)
    setNewMonthlyPremium(draft.newMonthlyPremium)
    setSinglePremiumPaymentMode(draft.singlePremiumPaymentMode)
    setNewStartDate(draft.newStartDate ?? "")
    setNewEndDate(draft.newEndDate)
    setFundGroupChoice(draft.fundGroupChoice)
    setNewFundGroupName(draft.newFundGroupName)
    setSingleAllocPct(draft.singleAllocPct)
    setSingleGroupPremiumAmount(draft.singleGroupPremiumAmount)
    setSingleGroupPremiumMode(draft.singleGroupPremiumMode)
    setMonth(draft.month)
    setFundValue(draft.fundValue)
    setPremiumsPaid(draft.premiumsPaid)
    setSaveMultiAsIndividual(draft.saveMultiAsIndividual)
    // Pad multiRows if draft has fewer rows than parsed bundles
    const restoredRows = [...draft.multiRows]
    for (let i = restoredRows.length; i < draft.parsedBundleMeta.length; i++) {
      const meta = draft.parsedBundleMeta[i]!
      restoredRows.push({
        productId: CREATE_NEW_ILP,
        newProductName: meta.snapshot.investmentName ?? "",
        newMonthlyPremium: null,
        newStartDate: "",
        newEndDate: "2060-01-01",
        fundGroupChoice: NO_FUND_GROUP,
        newFundGroupName: "",
        month: meta.suggestedMonth ?? "",
        fundValue: null,
        premiumsPaid: null,
      })
    }
    setMultiRows(restoredRows)
    setMultiGroupTarget(draft.multiGroupTarget)
    setMultiNewGroupName(draft.multiNewGroupName)
    setMultiGroupPremiumAmount(draft.multiGroupPremiumAmount)
    setMultiGroupPremiumMode(draft.multiGroupPremiumMode)
    setMultiAllocPct(draft.multiAllocPct)
    setMultiGroupTotalFundValue(draft.multiGroupTotalFundValue)
    setRestoredFromDraft(true)
    toast.success("Restored draft — pick files again if you need to re-extract.")
  }, [])

  const isMulti = parsedBundles.length >= 2
  const singleParse = parsedBundles.length === 1 ? parsedBundles[0].parse : null

  // Keep multiRows in sync with parsedBundles length (pad missing rows)
  useEffect(() => {
    if (!isMulti) return
    setMultiRows((prev) => {
      if (prev.length === parsedBundles.length) return prev
      if (prev.length > parsedBundles.length) return prev.slice(0, parsedBundles.length)
      const extra = parsedBundles.slice(prev.length).map((b) => ({
        productId: CREATE_NEW_ILP,
        newProductName: b.parse.snapshot.investmentName ?? "",
        newMonthlyPremium: null,
        newStartDate: "",
        newEndDate: "2060-01-01",
        fundGroupChoice: NO_FUND_GROUP,
        newFundGroupName: "",
        month: b.parse.suggestedMonth ?? "",
        fundValue: null,
        premiumsPaid: null,
      }))
      return [...prev, ...extra]
    })
  }, [isMulti, parsedBundles])

  const membersInSelectedGroup = useMemo(() => {
    if (fundGroupChoice === NO_FUND_GROUP || fundGroupChoice === NEW_FUND_GROUP) {
      return []
    }
    return products.filter((p) =>
      p.fund_group_memberships?.some((m) => m.group_id === fundGroupChoice),
    )
  }, [products, fundGroupChoice])

  const needsSingleAllocStep =
    !isMulti &&
    productId === CREATE_NEW_ILP &&
    fundGroupChoice !== NO_FUND_GROUP &&
    fundGroupChoice !== NEW_FUND_GROUP &&
    membersInSelectedGroup.length > 0

  useEffect(() => {
    if (!needsSingleAllocStep) {
      return
    }
    const n = membersInSelectedGroup.length + 1
    const split = split100Across(n)
    const next: Record<string, number> = {}
    membersInSelectedGroup.forEach((m, i) => {
      next[`e:${m.id}`] = split[i]!
    })
    next.new = split[split.length - 1]!
    setSingleAllocPct((prev) => {
      const keys = Object.keys(next)
        .sort((a, b) => a.localeCompare(b))
        .join(",")
      const prevKeys = Object.keys(prev)
        .sort((a, b) => a.localeCompare(b))
        .join(",")
      if (keys === prevKeys && Object.keys(prev).length > 0) return prev
      return next
    })
  }, [needsSingleAllocStep, membersInSelectedGroup])

  // Sum only non-zero existing members + new (0% existing = switch-out)
  const singleAllocSum = useMemo(() => {
    let sum = 0
    for (const [k, v] of Object.entries(singleAllocPct)) {
      if (k.startsWith("e:") && v === 0) continue // switch-out
      sum += v
    }
    return sum
  }, [singleAllocPct])
  const singleAllocValid = !needsSingleAllocStep || isValidIlpGroupAllocationSum(singleAllocSum)

  const resetFlow = useCallback(() => {
    setStep("idle")
    setFiles([])
    setFileLabel(null)
    setParsedBundles([])
    setProductId("")
    setNewProductName("")
    setNewMonthlyPremium(null)
    setSinglePremiumPaymentMode("monthly")
    setSingleGroupPremiumAmount(null)
    setSingleGroupPremiumMode("monthly")
    setNewEndDate("")
    setFundGroupChoice(NO_FUND_GROUP)
    setNewFundGroupName("")
    setSingleAllocPct({})
    setMonth("")
    setFundValue(null)
    setPremiumsPaid(null)
    setProgress(0)
    setSaveMultiAsIndividual(false)
    setMultiRows([])
    setMultiGroupTarget(NO_FUND_GROUP)
    setMultiNewGroupName("")
    setMultiGroupPremiumAmount(null)
    setMultiGroupPremiumMode("monthly")
    setMultiAllocPct({})
    setMultiGroupTotalFundValue(null)
    setRestoredFromDraft(false)
    clearIlpImportDraft()
  }, [])

  const removeBundle = useCallback(
    (index: number) => {
      setParsedBundles((prev) => {
        const next = prev.filter((_, i) => i !== index)
        if (next.length === 0) {
          resetFlow()
          return next
        }
        setFiles((f) => f.filter((_, i) => i !== index))
        setFileLabel(
          next.length === 1 ? next[0]!.file.name : `${next.length} files selected`,
        )
        setMultiRows((rows) => rows.filter((_, i) => i !== index))
        // Re-index n:* keys (file-based allocation entries)
        setMultiAllocPct((pct) => {
          const out: Record<string, number> = {}
          for (const [k, v] of Object.entries(pct)) {
            if (k.startsWith("e:")) {
              out[k] = v
            }
          }
          let ni = 0
          for (let i = 0; i < prev.length; i++) {
            if (i === index) continue
            const old = pct[`n:${i}`]
            if (old != null) out[`n:${ni}`] = old
            ni++
          }
          return out
        })
        return next
      })
    },
    [resetFlow],
  )

  // Auto-save form state to localStorage (debounced)
  useEffect(() => {
    if (step !== "preview" || parsedBundles.length === 0) return
    const timer = setTimeout(() => {
      const draft: IlpImportDraft = {
        productId,
        newProductName,
        newMonthlyPremium,
        singlePremiumPaymentMode,
        newStartDate,
        newEndDate,
        fundGroupChoice,
        newFundGroupName,
        singleAllocPct,
        singleGroupPremiumAmount,
        singleGroupPremiumMode,
        month,
        fundValue,
        premiumsPaid,
        saveMultiAsIndividual,
        multiRows,
        multiGroupTarget,
        multiNewGroupName,
        multiGroupPremiumAmount,
        multiGroupPremiumMode,
        multiAllocPct,
        multiGroupTotalFundValue,
        parsedBundleMeta: parsedBundles.map((b) => ({
          fileName: b.file.name,
          snapshot: b.parse.snapshot,
          suggestedMonth: b.parse.suggestedMonth,
          latestNavNumeric: b.parse.latestNavNumeric,
        })),
      }
      saveIlpImportDraft(draft)
    }, 500)
    return () => clearTimeout(timer)
  }, [
    step,
    parsedBundles,
    productId,
    newProductName,
    newMonthlyPremium,
    singlePremiumPaymentMode,
    newStartDate,
    newEndDate,
    fundGroupChoice,
    newFundGroupName,
    singleAllocPct,
    singleGroupPremiumAmount,
    singleGroupPremiumMode,
    month,
    fundValue,
    premiumsPaid,
    saveMultiAsIndividual,
    multiRows,
    multiGroupTarget,
    multiNewGroupName,
    multiGroupPremiumAmount,
    multiGroupPremiumMode,
    multiAllocPct,
    multiGroupTotalFundValue,
  ])

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return
    const arr = Array.from(list).filter((f) => {
      const lower = f.name.toLowerCase()
      return lower.endsWith(".mhtml") || lower.endsWith(".mht")
    })
    if (arr.length === 0) {
      toast.error("Please choose .mhtml or .mht files (Chrome “Webpage, single file”).")
      return
    }
    if (arr.length < list.length) {
      toast.message("Some files were skipped (only .mhtml / .mht).")
    }
    setFiles(arr)
    setFileLabel(arr.length === 1 ? arr[0]!.name : `${arr.length} files selected`)
    setParsedBundles([])
    setStep("idle")
  }

  const handleExtract = async () => {
    if (files.length === 0) {
      toast.error("Choose one or more fund report files first.")
      return
    }
    setStep("extracting")
    try {
      const bundles: ParsedBundle[] = []
      for (const file of files) {
        // Strip non-HTML MIME parts to reduce payload (avoids 413 on Vercel)
        const rawText = await file.text()
        const stripped = stripMhtmlToHtmlOnly(rawText)
        const slimFile = new File([stripped], file.name, { type: file.type })
        const fd = new FormData()
        fd.set("file", slimFile)
        const res = await fetch("/api/investments/ilp/fund-report/parse", {
          method: "POST",
          body: fd,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? `Parse failed for ${file.name}`)
        }
        const data = (await res.json()) as ParseResponse
        bundles.push({ file, parse: data })
      }
      setParsedBundles(bundles)
      const firstMonth = bundles[0]?.parse.suggestedMonth
      if (firstMonth) setMonth(firstMonth)
      setFundValue(null)
      setProductId("")
      if (bundles.length >= 2) {
        setMultiRows(
          bundles.map((b) => ({
            productId: CREATE_NEW_ILP,
            newProductName: b.parse.snapshot.investmentName ?? "",
            newMonthlyPremium: null,
            newStartDate: "",
            newEndDate: "2060-01-01",
            fundGroupChoice: NO_FUND_GROUP,
            newFundGroupName: "",
            month: b.parse.suggestedMonth ?? "",
            fundValue: null,
            premiumsPaid: null,
          })),
        )
        setSaveMultiAsIndividual(false)
        setMultiGroupTarget(NO_FUND_GROUP)
        setMultiNewGroupName("")
        setMultiGroupPremiumAmount(null)
        setMultiGroupPremiumMode("monthly")
        setMultiAllocPct({})
        setMultiGroupTotalFundValue(null)
      }
      await loadProducts()
      await loadFundGroups()
      setStep("preview")
      toast.success(
        bundles.length === 1
          ? "Fund report extracted — review and confirm below."
          : `${bundles.length} fund reports extracted — configure and save below.`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extract failed")
      setStep("idle")
    }
  }

  const createIlpProduct = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/investments/ilp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(typeof err.error === "string" ? err.error : "Failed to create ILP product")
    }
    return (await res.json()) as { id: string }
  }

  const commitFundReport = async (
    productIdResolved: string,
    snapshot: IlpFundReportSnapshot,
    monthVal: string,
    fv: number,
    prem: number | null,
  ) => {
    const res = await fetch("/api/investments/ilp/fund-report/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: productIdResolved,
        familyId,
        month: monthVal,
        fundValue: fv,
        premiumsPaid: prem,
        snapshot,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(typeof err.error === "string" ? err.error : "Save failed")
    }
  }

  const patchGroupAllocations = async (
    groupId: string,
    items: { productId: string; allocationPct: number }[],
    premiumOpts?: { groupPremiumAmount: number; premiumPaymentMode: "monthly" | "one_time" },
  ) => {
    const body: Record<string, unknown> = { familyId, items }
    if (premiumOpts) {
      body.groupPremiumAmount = premiumOpts.groupPremiumAmount
      body.premiumPaymentMode = premiumOpts.premiumPaymentMode
    }
    const res = await fetch(`/api/investments/ilp/groups/${groupId}/allocations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(typeof err.error === "string" ? err.error : "Failed to set group allocations")
    }
  }

  /** Single-file: resolve product id (create if needed) and optional bulk allocations */
  const resolveProductIdForCommit = async (): Promise<string> => {
    if (productId !== CREATE_NEW_ILP) {
      return productId
    }
    if (!familyId) throw new Error("No family context.")
    if (needsSingleAllocStep) {
      const gp = singleGroupPremiumAmount ?? 0
      if (singleGroupPremiumMode === "monthly" && gp <= 0) {
        throw new Error("Enter a valid total group premium for this fund group.")
      }
      if (singleGroupPremiumMode === "one_time" && gp < 0) {
        throw new Error("Group premium cannot be negative.")
      }
    } else {
      const premium = newMonthlyPremium ?? 0
      const mode = singlePremiumPaymentMode
      if (mode === "monthly" && premium <= 0) {
        throw new Error("Enter a valid monthly premium for the new policy.")
      }
      if (mode === "one_time" && premium < 0) {
        throw new Error("Premium amount cannot be negative.")
      }
    }
    if (!newProductName.trim()) throw new Error("Enter a product name.")
    if (!newEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(newEndDate)) {
      throw new Error("Choose a valid premium end date.")
    }
    if (fundGroupChoice === NEW_FUND_GROUP && !newFundGroupName.trim()) {
      throw new Error("Enter a name for the new fund group, or pick another group option.")
    }

    let ilpFundGroupId: string | undefined
    if (fundGroupChoice !== NO_FUND_GROUP && fundGroupChoice !== NEW_FUND_GROUP) {
      ilpFundGroupId = fundGroupChoice
    } else if (fundGroupChoice === NEW_FUND_GROUP) {
      const gRes = await fetch("/api/investments/ilp/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          name: newFundGroupName.trim(),
        }),
      })
      if (!gRes.ok) {
        const err = await gRes.json().catch(() => ({}))
        throw new Error(
          typeof err.error === "string" ? err.error : "Could not create fund group",
        )
      }
      const g = (await gRes.json()) as { id: string }
      ilpFundGroupId = g.id
      await loadFundGroups()
    }

    const baseBody: Record<string, unknown> = {
      name: newProductName.trim(),
      monthlyPremium: needsSingleAllocStep ? 0 : (newMonthlyPremium ?? 0),
      premiumPaymentMode: needsSingleAllocStep
        ? "one_time"
        : singlePremiumPaymentMode,
      endDate: newEndDate,
      ...(newStartDate && { startDate: newStartDate }),
    }
    if (effectiveProfileId) baseBody.profileId = effectiveProfileId
    else if (familyId) baseBody.familyId = familyId

    if (!ilpFundGroupId) {
      const product = await createIlpProduct(baseBody)
      await loadProducts()
      return product.id
    }

    const existingInGroup = products.filter((p) =>
      p.fund_group_memberships?.some((m) => m.group_id === ilpFundGroupId),
    )
    // Create the product without group — group membership is managed via allocations PATCH
    const product = await createIlpProduct(baseBody)

    if (existingInGroup.length === 0) {
      // First product in the group — just set 100% allocation
      await patchGroupAllocations(ilpFundGroupId, [
        { productId: product.id, allocationPct: 100 },
      ], {
        groupPremiumAmount: singleGroupPremiumAmount ?? 0,
        premiumPaymentMode: singleGroupPremiumMode,
      })
      await loadProducts()
      return product.id
    }

    // Group already has members — use the allocation percentages the user set
    const newId = product.id

    const items: { productId: string; allocationPct: number }[] = []
    for (const m of existingInGroup) {
      const k = `e:${m.id}`
      const pct = singleAllocPct[k]
      if (pct == null) throw new Error("Missing allocation for an existing group member.")
      if (pct === 0) continue // switch-out: omit so PATCH removes from group
      items.push({ productId: m.id, allocationPct: pct })
    }
    const newPct = singleAllocPct.new
    if (newPct == null) throw new Error("Missing allocation for the new policy.")
    items.push({ productId: newId, allocationPct: newPct })

    const sum = sumAllocationPcts(items.map((i) => i.allocationPct))
    if (!isValidIlpGroupAllocationSum(sum)) {
      throw new Error(allocationSumMessage(sum))
    }

    await patchGroupAllocations(ilpFundGroupId, items, {
      groupPremiumAmount: singleGroupPremiumAmount ?? 0,
      premiumPaymentMode: singleGroupPremiumMode,
    })
    await loadProducts()
    return newId
  }

  const handleCommitSingle = async () => {
    if (!familyId) {
      toast.error("No family context — open Setup from a logged-in session.")
      return
    }
    if (!singleParse?.snapshot) {
      toast.error("Nothing to save. Extract a file first.")
      return
    }
    if (!productId) {
      toast.error("Select an ILP product or choose “Create new ILP”.")
      return
    }
    if (!month || !/^\d{4}-\d{2}-\d{2}$/.test(month)) {
      toast.error("Choose a valid statement month.")
      return
    }
    const fv = fundValue ?? 0
    if (fv < 0) {
      toast.error("Fund value must be zero or positive.")
      return
    }
    if (needsSingleAllocStep && !singleAllocValid) {
      toast.error(allocationSumMessage(singleAllocSum))
      return
    }

    setStep("saving")
    setProgress(15)
    try {
      let resolvedProductId: string
      try {
        resolvedProductId = await resolveProductIdForCommit()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not prepare ILP product")
        setStep("preview")
        setProgress(0)
        return
      }

      await commitFundReport(
        resolvedProductId,
        singleParse.snapshot,
        month,
        fv,
        premiumsPaid,
      )
      setProgress(100)
      setStep("success")
      clearIlpImportDraft()
      toast.success("ILP entry saved.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
      setStep("preview")
    } finally {
      setProgress(0)
    }
  }

  const resolveMultiRowProductId = async (
    row: (typeof multiRows)[number],
    rowIndex: number,
    options?: { placeholderPremium?: boolean },
  ): Promise<string> => {
    if (row.productId && row.productId !== CREATE_NEW_ILP) {
      return row.productId
    }
    if (!familyId) throw new Error("No family context.")
    if (options?.placeholderPremium) {
      const body: Record<string, unknown> = {
        name: row.newProductName.trim(),
        monthlyPremium: 0,
        premiumPaymentMode: "one_time",
        endDate: row.newEndDate,
        ...(row.newStartDate && { startDate: row.newStartDate }),
      }
      if (effectiveProfileId) body.profileId = effectiveProfileId
      else if (familyId) body.familyId = familyId
      const product = await createIlpProduct(body)
      return product.id
    }
    const premium = row.newMonthlyPremium ?? 0
    if (premium <= 0) throw new Error(`Row ${rowIndex + 1}: enter a valid monthly premium.`)
    if (!row.newProductName.trim()) throw new Error(`Row ${rowIndex + 1}: enter a product name.`)
    if (!row.newEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.newEndDate)) {
      throw new Error(`Row ${rowIndex + 1}: choose a valid premium end date.`)
    }
    if (row.fundGroupChoice === NEW_FUND_GROUP && !row.newFundGroupName.trim()) {
      throw new Error(`Row ${rowIndex + 1}: enter a fund group name or choose No group.`)
    }

    const body: Record<string, unknown> = {
      name: row.newProductName.trim(),
      monthlyPremium: premium,
      premiumPaymentMode: "monthly",
      endDate: row.newEndDate,
      ...(row.newStartDate && { startDate: row.newStartDate }),
    }
    if (effectiveProfileId) body.profileId = effectiveProfileId
    else if (familyId) body.familyId = familyId

    const product = await createIlpProduct(body)
    return product.id
  }

  const handleCommitMultiIndividual = async () => {
    if (!familyId) return
    setStep("saving")
    setProgress(10)
    try {
      for (let i = 0; i < parsedBundles.length; i++) {
        const b = parsedBundles[i]!
        const row = multiRows[i]
        if (!row) throw new Error(`Missing row ${i + 1}`)
        if (!row.month || !/^\d{4}-\d{2}-\d{2}$/.test(row.month)) {
          throw new Error(`Row ${i + 1}: invalid statement month.`)
        }
        const fv = row.fundValue ?? 0
        if (fv < 0) throw new Error(`Row ${i + 1}: fund value must be zero or positive.`)
        if (!row.productId) {
          throw new Error(`Row ${i + 1}: select a policy or Create new ILP.`)
        }
        setProgress(10 + Math.round((80 * i) / parsedBundles.length))
        const pid = await resolveMultiRowProductId(row, i)
        await commitFundReport(pid, b.parse.snapshot, row.month, fv, row.premiumsPaid)
      }
      setProgress(100)
      setStep("success")
      clearIlpImportDraft()
      toast.success("ILP entries saved.")
      await loadProducts()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
      setStep("preview")
    } finally {
      setProgress(0)
    }
  }

  const multiMembersForGroup = useMemo(() => {
    if (multiGroupTarget === NO_FUND_GROUP || multiGroupTarget === NEW_FUND_GROUP) {
      return []
    }
    return products.filter((p) =>
      p.fund_group_memberships?.some((m) => m.group_id === multiGroupTarget),
    )
  }, [products, multiGroupTarget])

  useEffect(() => {
    if (!isMulti || saveMultiAsIndividual) return
    if (multiGroupTarget === NO_FUND_GROUP) {
      setMultiAllocPct({})
      return
    }
    // Only auto-initialize when allocations are empty (don't overwrite user edits or draft)
    setMultiAllocPct((prev) => {
      // If there are already allocation keys matching the current context, keep them
      const hasNewKeys = parsedBundles.some((_, fi) => prev[`n:${fi}`] != null)
      if (hasNewKeys && Object.keys(prev).length > 0) return prev

      if (multiGroupTarget === NEW_FUND_GROUP) {
        const n = parsedBundles.length
        if (n === 0) return prev
        const split = split100Across(n)
        const next: Record<string, number> = {}
        parsedBundles.forEach((_, fi) => {
          next[`n:${fi}`] = split[fi]!
        })
        return next
      }
      const existing = multiMembersForGroup
      const n = existing.length + parsedBundles.length
      if (n === 0) return prev
      const split = split100Across(n)
      const next: Record<string, number> = {}
      existing.forEach((m, i) => {
        next[`e:${m.id}`] = split[i]!
      })
      parsedBundles.forEach((_, fi) => {
        next[`n:${fi}`] = split[existing.length + fi]!
      })
      return next
    })
  }, [
    isMulti,
    saveMultiAsIndividual,
    multiGroupTarget,
    multiMembersForGroup,
    parsedBundles,
  ])

  // Auto-compute per-file fund values from total fund value + allocation %
  useEffect(() => {
    if (!isMulti || saveMultiAsIndividual) return
    if (multiGroupTotalFundValue == null || multiGroupTotalFundValue <= 0) return
    setMultiRows((prev) => {
      const next = [...prev]
      let changed = false
      for (let i = 0; i < next.length; i++) {
        const pct = multiAllocPct[`n:${i}`] ?? 0
        const computed = Math.round(multiGroupTotalFundValue * pct) / 100
        if (next[i] && next[i].fundValue !== computed) {
          next[i] = { ...next[i]!, fundValue: computed }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [isMulti, saveMultiAsIndividual, multiGroupTotalFundValue, multiAllocPct])

  // Sum only non-zero existing members + all new files (0% existing = switch-out)
  const multiAllocSum = useMemo(() => {
    let sum = 0
    for (const [k, v] of Object.entries(multiAllocPct)) {
      if (k.startsWith("e:") && v === 0) continue // switch-out
      sum += v
    }
    return sum
  }, [multiAllocPct])
  const multiAllocValid = isValidIlpGroupAllocationSum(multiAllocSum)

  const handleCommitMultiGroup = async () => {
    if (!familyId) return
    if (multiGroupTarget === NO_FUND_GROUP) {
      toast.error("Select an existing fund group or create a new one.")
      return
    }
    if (!multiAllocValid) {
      toast.error(allocationSumMessage(multiAllocSum))
      return
    }
    // Validate new files have > 0% allocation
    for (let i = 0; i < parsedBundles.length; i++) {
      if ((multiAllocPct[`n:${i}`] ?? 0) <= 0) {
        toast.error(`File ${i + 1} cannot have 0% allocation — new funds must have a positive allocation.`)
        return
      }
    }
    const gp = multiGroupPremiumAmount ?? 0
    if (multiGroupPremiumMode === "monthly" && gp <= 0) {
      toast.error("Enter a valid total group premium for this fund group.")
      return
    }
    if (multiGroupPremiumMode === "one_time" && gp < 0) {
      toast.error("Group premium cannot be negative.")
      return
    }
    for (let i = 0; i < multiRows.length; i++) {
      const row = multiRows[i]!
      if (!row.month || !/^\d{4}-\d{2}-\d{2}$/.test(row.month)) {
        toast.error(`Row ${i + 1}: invalid statement month.`)
        return
      }
      const fv = row.fundValue ?? 0
      if (fv < 0) {
        toast.error(`Row ${i + 1}: fund value must be zero or positive.`)
        return
      }
    }

    setStep("saving")
    setProgress(5)
    try {
      let groupId = multiGroupTarget
      if (multiGroupTarget === NEW_FUND_GROUP) {
        if (!multiNewGroupName.trim()) {
          throw new Error("Enter a name for the new fund group.")
        }
        const gRes = await fetch("/api/investments/ilp/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId, name: multiNewGroupName.trim() }),
        })
        if (!gRes.ok) {
          const err = await gRes.json().catch(() => ({}))
          throw new Error(typeof err.error === "string" ? err.error : "Could not create group")
        }
        const g = (await gRes.json()) as { id: string }
        groupId = g.id
        await loadFundGroups()
      }

      const newProductIds: string[] = []
      const createdProductIds: string[] = []
      for (let i = 0; i < parsedBundles.length; i++) {
        const row = multiRows[i]!
        setProgress(5 + Math.round((40 * i) / parsedBundles.length))
        const wasNew = row.productId === CREATE_NEW_ILP
        const pid = await resolveMultiRowProductId(row, i, {
          placeholderPremium: true,
        })
        if (wasNew) createdProductIds.push(pid)
        newProductIds.push(pid)
      }

      const allItems = mergeMultiGroupAllocationItems(
        multiMembersForGroup,
        newProductIds,
        multiAllocPct,
      )
      // Exclude 0% items (switch-outs) — PATCH endpoint removes omitted products
      const items = allItems.filter((x) => x.allocationPct > 0)

      const sum = sumAllocationPcts(items.map((x) => x.allocationPct))
      if (!isValidIlpGroupAllocationSum(sum)) {
        throw new Error(allocationSumMessage(sum))
      }

      try {
        await patchGroupAllocations(groupId, items, {
          groupPremiumAmount: multiGroupPremiumAmount ?? 0,
          premiumPaymentMode: multiGroupPremiumMode,
        })
      } catch (patchErr) {
        for (const id of createdProductIds) {
          await fetch(`/api/investments/ilp/${id}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ familyId }),
          })
        }
        throw patchErr
      }
      await loadProducts()
      setProgress(50)

      for (let i = 0; i < parsedBundles.length; i++) {
        const b = parsedBundles[i]!
        const row = multiRows[i]!
        setProgress(50 + Math.round((50 * i) / parsedBundles.length))
        await commitFundReport(
          newProductIds[i]!,
          b.parse.snapshot,
          row.month,
          row.fundValue ?? 0,
          row.premiumsPaid,
        )
      }

      setProgress(100)
      setStep("success")
      clearIlpImportDraft()
      toast.success("ILP entries and group allocations saved.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
      setStep("preview")
    } finally {
      setProgress(0)
    }
  }

  const handleCommit = () => {
    ilpImpact.requestChange(() => {
      if (isMulti) {
        if (saveMultiAsIndividual) void handleCommitMultiIndividual()
        else void handleCommitMultiGroup()
      } else {
        void handleCommitSingle()
      }
    })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    onPickFiles(e.dataTransfer.files)
  }

  const singleNewPremiumInvalid =
    productId === CREATE_NEW_ILP &&
    (needsSingleAllocStep
      ? singleGroupPremiumAmount == null ||
        (singleGroupPremiumMode === "monthly" && singleGroupPremiumAmount <= 0) ||
        (singleGroupPremiumMode === "one_time" && singleGroupPremiumAmount < 0)
      : singlePremiumPaymentMode === "monthly"
        ? newMonthlyPremium == null || newMonthlyPremium <= 0
        : newMonthlyPremium == null || newMonthlyPremium < 0)

  const singleConfirmDisabled =
    step === "saving" ||
    !productId ||
    (productId === CREATE_NEW_ILP &&
      (!newProductName.trim() ||
        singleNewPremiumInvalid ||
        !/^\d{4}-\d{2}-\d{2}$/.test(newEndDate) ||
        (fundGroupChoice === NEW_FUND_GROUP && !newFundGroupName.trim()))) ||
    (needsSingleAllocStep && !singleAllocValid) ||
    (needsSingleAllocStep && (singleAllocPct.new ?? 0) <= 0)

  const multiIndividualDisabled =
    step === "saving" ||
    multiRows.length !== parsedBundles.length ||
    multiRows.some(
      (r) =>
        !r.productId ||
        (r.productId === CREATE_NEW_ILP &&
          (!r.newProductName.trim() ||
            r.newMonthlyPremium == null ||
            r.newMonthlyPremium <= 0 ||
            !/^\d{4}-\d{2}-\d{2}$/.test(r.newEndDate) ||
            (r.fundGroupChoice === NEW_FUND_GROUP && !r.newFundGroupName.trim()))),
    )

  const multiGroupPremiumInvalid =
    multiGroupPremiumAmount == null ||
    (multiGroupPremiumMode === "monthly" && multiGroupPremiumAmount <= 0) ||
    (multiGroupPremiumMode === "one_time" && multiGroupPremiumAmount < 0)

  const multiGroupDisabled =
    step === "saving" ||
    multiRows.length !== parsedBundles.length ||
    multiGroupTarget === NO_FUND_GROUP ||
    (multiGroupTarget === NEW_FUND_GROUP && !multiNewGroupName.trim()) ||
    !multiAllocValid ||
    multiGroupPremiumInvalid ||
    // New files must have > 0% allocation
    parsedBundles.some((_, i) => (multiAllocPct[`n:${i}`] ?? 0) <= 0) ||
    multiRows.some(
      (r) =>
        !r.productId ||
        (r.productId === CREATE_NEW_ILP &&
          (!r.newProductName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.newEndDate))),
    )

  const confirmDisabled = isMulti
    ? saveMultiAsIndividual
      ? multiIndividualDisabled
      : multiGroupDisabled
    : singleConfirmDisabled

  const inner = (
    <>
      {variant === "inline" ? (
        <p className="text-sm text-muted-foreground">
          Save Tokio Marine fund page(s) as <strong>Webpage, single file</strong> in Chrome,
          then drop .mhtml file(s) here. Files are processed in memory only and are not stored.
        </p>
      ) : null}
      <div className="space-y-6">
        {!familyId ? (
          <p className="text-sm text-muted-foreground">
            Add a family in onboarding or user settings to import against an ILP product.
          </p>
        ) : null}

        {profiles.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor="ilp-import-profile">Assign to</Label>
            <Select
              value={selectedProfileId ?? activeProfileId ?? ""}
              onValueChange={(v) => setSelectedProfileId(v || null)}
            >
              <SelectTrigger id="ilp-import-profile" className="w-full sm:w-64">
                <SelectValue placeholder="Select profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {step !== "success" ? (
          <>
            <div
              role="button"
              tabIndex={0}
              className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-4 py-6 text-center transition-colors hover:bg-muted/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => document.getElementById("ilp-mhtml-input")?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  document.getElementById("ilp-mhtml-input")?.click()
                }
              }}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop one or more .mhtml files, or click to browse
              </p>
              {fileLabel ? (
                <p className="text-xs font-medium text-foreground">{fileLabel}</p>
              ) : null}
              <input
                id="ilp-mhtml-input"
                type="file"
                accept=".mhtml,.mht,text/html"
                multiple
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={files.length === 0 || step === "extracting"}
                onClick={() => void handleExtract()}
              >
                {step === "extracting" ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Extracting…
                  </>
                ) : (
                  "Extract"
                )}
              </Button>
              {(files.length > 0 || parsedBundles.length > 0) && step !== "extracting" ? (
                <Button type="button" variant="ghost" size="sm" onClick={resetFlow}>
                  Clear
                </Button>
              ) : null}
              {restoredFromDraft && step !== "extracting" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={resetFlow}
                >
                  Discard draft
                </Button>
              ) : null}
            </div>
          </>
        ) : null}

        {step === "saving" ? (
          <div className="space-y-2">
            <Label>Saving</Label>
            <Progress value={progress} className="h-2" />
          </div>
        ) : null}

        {parsedBundles.length === 1 && singleParse && step !== "success" ? (
          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Parsed summary</h4>
                <button
                  type="button"
                  className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                  title="Remove fund"
                  onClick={() => removeBundle(0)}
                >
                  <X className="size-4" />
                </button>
              </div>
              <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">Fund</dt>
                  <dd>{singleParse.snapshot.investmentName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">MS ID</dt>
                  <dd>{singleParse.snapshot.msId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Currency</dt>
                  <dd>{singleParse.snapshot.currencyId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Latest NAV (from report)</dt>
                  <dd>
                    {singleParse.latestNavNumeric != null
                      ? String(singleParse.latestNavNumeric)
                      : "—"}
                  </dd>
                </div>
              </dl>
              {singleParse.snapshot.warnings.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs text-amber-600 dark:text-amber-400">
                  {singleParse.snapshot.warnings.slice(0, 6).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>ILP product</Label>
              <Select
                value={productId || undefined}
                onValueChange={(v) => {
                  setProductId(v)
                  if (v !== CREATE_NEW_ILP) {
                    setNewProductName("")
                    setNewMonthlyPremium(null)
                    setSinglePremiumPaymentMode("monthly")
                    setSingleGroupPremiumAmount(null)
                    setSingleGroupPremiumMode("monthly")
                    setNewEndDate("")
                    setFundGroupChoice(NO_FUND_GROUP)
                    setNewFundGroupName("")
                    setSingleAllocPct({})
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select policy" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={CREATE_NEW_ILP}>Create new ILP…</SelectItem>
                </SelectContent>
              </Select>
              {products.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No policies yet — choose <strong>Create new ILP</strong> below or add one
                  under Investments → ILP.
                </p>
              ) : null}
            </div>

            {productId === CREATE_NEW_ILP ? (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground">New policy</p>
                <div className="space-y-1.5">
                  <Label htmlFor="ilp-import-new-name">Product name</Label>
                  <Input
                    id="ilp-import-new-name"
                    placeholder="e.g. Tokio Marine ILP"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                {!needsSingleAllocStep ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ilp-import-premium-mode">Premium payment</Label>
                      <Select
                        value={singlePremiumPaymentMode}
                        onValueChange={(v) =>
                          setSinglePremiumPaymentMode(v as "monthly" | "one_time")
                        }
                      >
                        <SelectTrigger id="ilp-import-premium-mode" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly (recurring)</SelectItem>
                          <SelectItem value="one_time">One-time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ilp-import-premium">
                        {singlePremiumPaymentMode === "monthly"
                          ? "Monthly premium ($)"
                          : "Premium amount ($)"}
                      </Label>
                      <CurrencyInput
                        id="ilp-import-premium"
                        placeholder="0.00"
                        value={newMonthlyPremium}
                        onChange={(v) => setNewMonthlyPremium(v)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ilp-import-start">Start date (optional)</Label>
                      <DatePicker
                        id="ilp-import-start"
                        value={newStartDate || null}
                        onChange={(d) => setNewStartDate(d ?? "")}
                        placeholder="Select start date"
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ilp-import-end">Premium end date</Label>
                      <DatePicker
                        id="ilp-import-end"
                        value={newEndDate || null}
                        onChange={(d) => setNewEndDate(d ?? "")}
                        placeholder="Select end date"
                        showIsoInput
                        className="w-full"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ilp-import-start-solo">Start date (optional)</Label>
                      <DatePicker
                        id="ilp-import-start-solo"
                        value={newStartDate || null}
                        onChange={(d) => setNewStartDate(d ?? "")}
                        placeholder="Select start date"
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ilp-import-end-solo">Premium end date</Label>
                      <DatePicker
                        id="ilp-import-end-solo"
                        value={newEndDate || null}
                        onChange={(d) => setNewEndDate(d ?? "")}
                        placeholder="Select end date"
                        showIsoInput
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Fund group (optional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Group policies on the Investments dashboard. Adding to a group that already
                    has policies requires allocation % below (must total 100%).
                  </p>
                  <Select
                    value={fundGroupChoice}
                    onValueChange={(v) => {
                      setFundGroupChoice(v)
                      if (v !== NEW_FUND_GROUP) setNewFundGroupName("")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="No group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_FUND_GROUP}>No group</SelectItem>
                      {fundGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_FUND_GROUP}>Create new group…</SelectItem>
                    </SelectContent>
                  </Select>
                  {fundGroupChoice === NEW_FUND_GROUP ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="ilp-import-new-group">New group name</Label>
                      <Input
                        id="ilp-import-new-group"
                        placeholder="e.g. Prudential bundle"
                        value={newFundGroupName}
                        onChange={(e) => setNewFundGroupName(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {needsSingleAllocStep ? (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-sm font-medium">Fund group allocation</p>
                <p className="text-xs text-muted-foreground">
                  Allocations for all policies in this group (including this new one) must total
                  exactly 100%.
                </p>
                <div className="grid gap-3 border-b border-amber-500/20 pb-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ilp-single-group-premium-mode">Group premium</Label>
                    <Select
                      value={singleGroupPremiumMode}
                      onValueChange={(v) =>
                        setSingleGroupPremiumMode(v as "monthly" | "one_time")
                      }
                    >
                      <SelectTrigger id="ilp-single-group-premium-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly total (split by %)</SelectItem>
                        <SelectItem value="one_time">One-time (lump)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ilp-single-group-premium-amt">Total amount ($)</Label>
                    <CurrencyInput
                      id="ilp-single-group-premium-amt"
                      placeholder="0.00"
                      value={singleGroupPremiumAmount}
                      onChange={(v) => setSingleGroupPremiumAmount(v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  {membersInSelectedGroup.map((m) => {
                    const pct = singleAllocPct[`e:${m.id}`] ?? 0
                    const isSwitchOut = pct === 0
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex flex-wrap items-center gap-2",
                          isSwitchOut && "opacity-50",
                        )}
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            isSwitchOut && "line-through",
                          )}
                        >
                          {m.name}
                          {isSwitchOut ? (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              (switching out)
                            </span>
                          ) : null}
                        </span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          max={100}
                          className="w-24"
                          value={singleAllocPct[`e:${m.id}`] ?? ""}
                          onChange={(e) => {
                            const v = Number.parseFloat(e.target.value)
                            setSingleAllocPct((prev) => ({
                              ...prev,
                              [`e:${m.id}`]: Number.isFinite(v) ? v : 0,
                            }))
                          }}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    )
                  })}
                  <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      New policy ({newProductName || "—"})
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      max={100}
                      className="w-24"
                      value={singleAllocPct.new ?? ""}
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value)
                        setSingleAllocPct((prev) => ({
                          ...prev,
                          new: Number.isFinite(v) ? v : 0,
                        }))
                      }}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <p
                    className={
                      singleAllocValid
                        ? "text-xs text-muted-foreground"
                        : "text-xs font-medium text-destructive"
                    }
                  >
                    Total: {singleAllocSum.toFixed(2)}%{!singleAllocValid ? " — must be 100%." : ""}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>Statement month</Label>
              <MonthYearPicker
                value={month || null}
                onChange={(d) => setMonth(d ?? "")}
                placeholder="YYYY-MM from report"
                className="w-full max-w-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Total fund value (SGD)</Label>
              <CurrencyInput
                placeholder="0.00"
                value={fundValue}
                onChange={(v) => setFundValue(v)}
              />
              <p className="text-xs text-muted-foreground">
                Use your policy total fund value for this month (not NAV per unit).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Premiums paid to date (optional)</Label>
              <CurrencyInput
                placeholder="Optional"
                value={premiumsPaid}
                onChange={(v) => setPremiumsPaid(v)}
              />
            </div>

            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={confirmDisabled}
              onClick={() => void handleCommit()}
            >
              {step === "saving" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Confirm and save"
              )}
            </Button>
          </div>
        ) : null}

        {parsedBundles.length >= 2 && step !== "success" ? (
          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Multiple fund reports</p>
                <p className="text-xs text-muted-foreground">
                  {saveMultiAsIndividual
                    ? "Each file is saved as its own policy (no shared group)."
                    : "Assign a fund group and allocation % (must total 100%) before saving."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="ilp-multi-individual" className="text-xs font-normal">
                  Save as individual funds
                </Label>
                <Switch
                  id="ilp-multi-individual"
                  checked={saveMultiAsIndividual}
                  onCheckedChange={setSaveMultiAsIndividual}
                />
              </div>
            </div>

            {saveMultiAsIndividual ? (
              <div className="space-y-4">
                {parsedBundles.map((b, i) => {
                  const row = multiRows[i]
                  if (!row) return null
                  return (
                    <div
                      key={b.file.name + i}
                      className="space-y-3 rounded-lg border bg-muted/20 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-foreground">
                          File {i + 1}: {b.file.name}
                        </p>
                        <button
                          type="button"
                          className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                          title="Remove fund"
                          onClick={() => removeBundle(i)}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {b.parse.snapshot.investmentName ?? "—"}
                      </p>
                      <div className="space-y-2">
                        <Label>ILP product</Label>
                        <Select
                          value={row.productId || undefined}
                          onValueChange={(v) => {
                            setMultiRows((prev) => {
                              const next = [...prev]
                              const cur = next[i]
                              if (!cur) return prev
                              next[i] = {
                                ...cur,
                                productId: v,
                                ...(v !== CREATE_NEW_ILP
                                  ? {
                                      newProductName: "",
                                      newMonthlyPremium: null,
                                      newStartDate: "",
                                      newEndDate: "",
                                      fundGroupChoice: NO_FUND_GROUP,
                                      newFundGroupName: "",
                                    }
                                  : {}),
                              }
                              return next
                            })
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select policy" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={CREATE_NEW_ILP}>Create new ILP…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {row.productId === CREATE_NEW_ILP ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Product name</Label>
                            <Input
                              value={row.newProductName}
                              onChange={(e) => {
                                const v = e.target.value
                                setMultiRows((prev) => {
                                  const next = [...prev]
                                  const c = next[i]
                                  if (!c) return prev
                                  next[i] = { ...c, newProductName: v }
                                  return next
                                })
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Monthly premium ($)</Label>
                            <CurrencyInput
                              value={row.newMonthlyPremium}
                              onChange={(v) => {
                                setMultiRows((prev) => {
                                  const next = [...prev]
                                  const c = next[i]
                                  if (!c) return prev
                                  next[i] = { ...c, newMonthlyPremium: v }
                                  return next
                                })
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Start date (optional)</Label>
                            <DatePicker
                              value={row.newStartDate || null}
                              onChange={(d) => {
                                setMultiRows((prev) => {
                                  const next = [...prev]
                                  const c = next[i]
                                  if (!c) return prev
                                  next[i] = { ...c, newStartDate: d ?? "" }
                                  return next
                                })
                              }}
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Premium end date</Label>
                            <DatePicker
                              value={row.newEndDate || null}
                              onChange={(d) => {
                                setMultiRows((prev) => {
                                  const next = [...prev]
                                  const c = next[i]
                                  if (!c) return prev
                                  next[i] = { ...c, newEndDate: d ?? "" }
                                  return next
                                })
                              }}
                              showIsoInput
                              className="w-full"
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Statement month</Label>
                          <MonthYearPicker
                            value={row.month || null}
                            onChange={(d) => {
                              setMultiRows((prev) => {
                                const next = [...prev]
                                const c = next[i]
                                if (!c) return prev
                                next[i] = { ...c, month: d ?? "" }
                                return next
                              })
                            }}
                            className="w-full max-w-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Fund value (SGD)</Label>
                          <CurrencyInput
                            value={row.fundValue}
                            onChange={(v) => {
                              setMultiRows((prev) => {
                                const next = [...prev]
                                const c = next[i]
                                if (!c) return prev
                                next[i] = { ...c, fundValue: v }
                                return next
                              })
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Fund group</Label>
                  <Select
                    value={multiGroupTarget}
                    onValueChange={(v) => {
                      setMultiGroupTarget(v)
                      if (v !== NEW_FUND_GROUP) setMultiNewGroupName("")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_FUND_GROUP}>Select…</SelectItem>
                      {fundGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_FUND_GROUP}>Create new group…</SelectItem>
                    </SelectContent>
                  </Select>
                  {multiGroupTarget === NEW_FUND_GROUP ? (
                    <Input
                      placeholder="New group name"
                      value={multiNewGroupName}
                      onChange={(e) => setMultiNewGroupName(e.target.value)}
                    />
                  ) : null}
                </div>

                {multiGroupTarget !== NO_FUND_GROUP ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="grid gap-3 border-b pb-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="ilp-multi-group-premium-mode">Group premium</Label>
                        <Select
                          value={multiGroupPremiumMode}
                          onValueChange={(v) =>
                            setMultiGroupPremiumMode(v as "monthly" | "one_time")
                          }
                        >
                          <SelectTrigger id="ilp-multi-group-premium-mode" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly total (split by %)</SelectItem>
                            <SelectItem value="one_time">One-time (lump)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ilp-multi-group-premium-amt">Total amount ($)</Label>
                        <CurrencyInput
                          id="ilp-multi-group-premium-amt"
                          placeholder="0.00"
                          value={multiGroupPremiumAmount}
                          onChange={(v) => setMultiGroupPremiumAmount(v)}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="ilp-multi-group-total-fv">
                          Total fund value (SGD)
                        </Label>
                        <CurrencyInput
                          id="ilp-multi-group-total-fv"
                          placeholder="0.00"
                          value={multiGroupTotalFundValue}
                          onChange={(v) => setMultiGroupTotalFundValue(v)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Per-file fund values are auto-calculated from this total and
                          each file&apos;s allocation %.
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-medium">Allocation (%)</p>
                    <p className="text-xs text-muted-foreground">
                      Includes existing policies in this group (if any) and one row per file.
                      Total must be 100%.
                    </p>
                    {multiMembersForGroup.map((m) => {
                      const pct = multiAllocPct[`e:${m.id}`] ?? 0
                      const isSwitchOut = pct === 0
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex items-center gap-2",
                            isSwitchOut && "opacity-50",
                          )}
                        >
                          <span
                            className={cn(
                              "flex-1 truncate text-sm",
                              isSwitchOut && "line-through",
                            )}
                          >
                            {m.name}
                            {isSwitchOut ? (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                (switching out)
                              </span>
                            ) : null}
                          </span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            className="w-24"
                            value={multiAllocPct[`e:${m.id}`] ?? ""}
                            onChange={(e) => {
                              const v = Number.parseFloat(e.target.value)
                              setMultiAllocPct((prev) => ({
                                ...prev,
                                [`e:${m.id}`]: Number.isFinite(v) ? v : 0,
                              }))
                            }}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      )
                    })}
                    {parsedBundles.map((b, fi) => (
                      <div key={`n-${fi}`} className="flex items-center gap-2">
                        <span className="flex-1 truncate text-sm text-muted-foreground">
                          New ({b.file.name})
                        </span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          className="w-24"
                          value={multiAllocPct[`n:${fi}`] ?? ""}
                          onChange={(e) => {
                            const v = Number.parseFloat(e.target.value)
                            setMultiAllocPct((prev) => ({
                              ...prev,
                              [`n:${fi}`]: Number.isFinite(v) ? v : 0,
                            }))
                          }}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                        <button
                          type="button"
                          className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                          title="Remove fund"
                          onClick={() => removeBundle(fi)}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    <p
                      className={
                        multiAllocValid
                          ? "text-xs text-muted-foreground"
                          : "text-xs font-medium text-destructive"
                      }
                    >
                      Total: {multiAllocSum.toFixed(2)}%{!multiAllocValid ? " — must be 100%." : ""}
                    </p>
                  </div>
                ) : null}

                {parsedBundles.map((b, i) => {
                  const row = multiRows[i]
                  if (!row) return null
                  return (
                    <div
                      key={b.file.name + i}
                      className="space-y-3 rounded-lg border bg-muted/20 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">File {i + 1}: {b.file.name}</p>
                        <button
                          type="button"
                          className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
                          title="Remove fund"
                          onClick={() => removeBundle(i)}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        <Label>ILP product</Label>
                        <Select
                          value={row.productId || undefined}
                          onValueChange={(v) => {
                            setMultiRows((prev) => {
                              const next = [...prev]
                              const cur = next[i]
                              if (!cur) return prev
                              next[i] = {
                                ...cur,
                                productId: v,
                                ...(v !== CREATE_NEW_ILP
                                  ? {
                                      newProductName: "",
                                      newMonthlyPremium: null,
                                      newStartDate: "",
                                      newEndDate: "",
                                      fundGroupChoice: NO_FUND_GROUP,
                                      newFundGroupName: "",
                                    }
                                  : {}),
                              }
                              return next
                            })
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select or create" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={CREATE_NEW_ILP}>Create new ILP…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {row.productId === CREATE_NEW_ILP ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs">Product name</Label>
                            <Input
                              value={row.newProductName}
                              onChange={(e) => {
                                const v = e.target.value
                                setMultiRows((prev) => {
                                  const next = [...prev]
                                  const c = next[i]
                                  if (!c) return prev
                                  next[i] = { ...c, newProductName: v }
                                  return next
                                })
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Start date (optional)</Label>
                            <DatePicker
                              value={row.newStartDate || null}
                              onChange={(d) => {
                                setMultiRows((prev) => {
                                  const next = [...prev]
                                  const c = next[i]
                                  if (!c) return prev
                                  next[i] = { ...c, newStartDate: d ?? "" }
                                  return next
                                })
                              }}
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Premium end date</Label>
                            <DatePicker
                              value={row.newEndDate || null}
                              onChange={(d) => {
                                setMultiRows((prev) => {
                                  const next = [...prev]
                                  const c = next[i]
                                  if (!c) return prev
                                  next[i] = { ...c, newEndDate: d ?? "" }
                                  return next
                                })
                              }}
                              showIsoInput
                              className="w-full"
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Statement month</Label>
                          <MonthYearPicker
                            value={row.month || null}
                            onChange={(d) => {
                              setMultiRows((prev) => {
                                const next = [...prev]
                                const c = next[i]
                                if (!c) return prev
                                next[i] = { ...c, month: d ?? "" }
                                return next
                              })
                            }}
                            className="w-full max-w-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Fund value (SGD)</Label>
                          <CurrencyInput
                            value={row.fundValue}
                            onChange={(v) => {
                              setMultiRows((prev) => {
                                const next = [...prev]
                                const c = next[i]
                                if (!c) return prev
                                next[i] = { ...c, fundValue: v }
                                return next
                              })
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={confirmDisabled}
              onClick={() => void handleCommit()}
            >
              {step === "saving" ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Confirm and save all"
              )}
            </Button>
          </div>
        ) : null}

        {step === "success" ? (
          <div className="space-y-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-sm font-medium text-foreground">Import saved</p>
            <p className="text-sm text-muted-foreground">
              Your ILP entries and fund report snapshots are stored.
              {!onSuccess
                ? " View them on the Investments page under the ILP tab."
                : null}
            </p>
            <div className="flex flex-wrap gap-2">
              {onSuccess ? (
                <Button type="button" onClick={onSuccess}>
                  Done
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/dashboard/investments?tab=ilp">View Investments — ILP</Link>
                </Button>
              )}
              <Button type="button" variant="outline" onClick={resetFlow}>
                Import more files
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )

  const impactDialog = <ImpactConfirmationDialog {...ilpImpact.dialogProps} />

  if (variant === "inline") {
    return <div className="space-y-4">{inner}{impactDialog}</div>
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">ILP fund report import</CardTitle>
        <CardDescription>
          Save Tokio Marine fund page(s) as <strong>Webpage, single file</strong> in Chrome,
          then drop .mhtml file(s) here. Files are processed in memory only and are not stored.
        </CardDescription>
      </CardHeader>
      <CardContent>{inner}</CardContent>
      {impactDialog}
    </Card>
  )
}
