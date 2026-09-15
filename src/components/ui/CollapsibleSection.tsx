import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"

import { cn } from "~/lib/utils"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible"

export type CollapsibleSectionProps = {
  title: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  buttonClassName?: string
  panelClassName?: string
  children: ReactNode
}

/**
 * CollapsibleSection renders a lightweight disclosure for showing/hiding content.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
  buttonClassName,
  panelClassName,
  children,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = controlledOpen ?? internalOpen
  const handleOpenChange = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className={className}
    >
      <CollapsibleTrigger
        className={cn(
          "dark:hover:bg-secondary text-secondary-foreground hover:bg-surface-subtle flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs",
          buttonClassName,
        )}
      >
        <span className="min-w-0 truncate">{title}</span>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "dark:border-border border-border-subtle bg-card mt-2 rounded-md border p-2",
          panelClassName,
        )}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
