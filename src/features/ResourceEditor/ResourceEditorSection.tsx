import { ChevronDown } from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"

/** Keeps drafts mounted and makes validation errors visible even in a closed section. */
export function ResourceEditorSection({
  label,
  summary,
  defaultOpen = false,
  columns,
  hasErrors,
  children,
}: {
  label: string
  summary?: string
  defaultOpen?: boolean
  columns?: 2
  hasErrors: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const summaryId = useId()
  const open = expanded || hasErrors
  useEffect(() => {
    if (hasErrors) setExpanded(true)
  }, [hasErrors])
  return (
    <Collapsible
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen || !hasErrors) setExpanded(nextOpen)
      }}
      className="border-border corners-concentric min-w-0 rounded-lg border [--corner-inset:1px]"
    >
      <CollapsibleTrigger
        aria-label={label}
        aria-describedby={summary ? summaryId : undefined}
        className="hover:bg-muted/50 focus-visible:ring-ring flex w-full min-w-0 items-center gap-2 rounded-[var(--corner-inner-radius)] px-3 py-3 text-left focus-visible:ring-2 focus-visible:outline-none data-[state=open]:rounded-b-none"
      >
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
        {summary && (
          <span
            id={summaryId}
            className="text-muted-foreground ml-auto max-w-[40%] truncate text-xs"
          >
            {summary}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent forceMount hidden={!open}>
        <fieldset
          className={
            columns === 2
              ? "grid min-w-0 grid-cols-1 gap-4 px-3 pt-1 pb-4 sm:grid-cols-2"
              : "min-w-0 space-y-4 px-3 pt-1 pb-4"
          }
        >
          <legend className="sr-only">{label}</legend>
          {children}
        </fieldset>
      </CollapsibleContent>
    </Collapsible>
  )
}
