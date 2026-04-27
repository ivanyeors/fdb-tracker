interface SectionHeaderProps {
  readonly title: string
  readonly description?: string
  readonly children?: React.ReactNode
}

export function SectionHeader({
  title,
  description,
  children,
}: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && (
        <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  )
}
