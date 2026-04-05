"use client"

import dynamic from "next/dynamic"
import {
  ResponsiveSheetHeader,
  ResponsiveSheetTitle,
  ResponsiveSheetDescription,
} from "@/components/ui/responsive-sheet"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { AddIlpForm } from "@/components/dashboard/investments/add-ilp-form"
import { Loader2 } from "lucide-react"

const IlpFundImportTab = dynamic(
  () =>
    import("@/components/settings/ilp-fund-import-tab").then((m) => ({
      default: m.IlpFundImportTab,
    })),
  {
    loading: () => (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
)

interface AddIlpSheetContentProps {
  onSuccess: () => void
}

export function AddIlpSheetContent({ onSuccess }: AddIlpSheetContentProps) {
  return (
    <>
      <ResponsiveSheetHeader className="border-b p-4 text-left">
        <ResponsiveSheetTitle>Add ILP Product</ResponsiveSheetTitle>
        <ResponsiveSheetDescription>
          Create a new ILP product manually or import from a fund report.
        </ResponsiveSheetDescription>
      </ResponsiveSheetHeader>
      <Tabs defaultValue="manual" className="flex flex-1 flex-col">
        <TabsList className="mx-4 mt-4 w-fit">
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="import">Import from report</TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="p-4">
          <AddIlpForm onSuccess={onSuccess} />
        </TabsContent>
        <TabsContent value="import" className="p-4">
          <IlpFundImportTab
            familyId={null}
            variant="inline"
            onSuccess={onSuccess}
          />
        </TabsContent>
      </Tabs>
    </>
  )
}
