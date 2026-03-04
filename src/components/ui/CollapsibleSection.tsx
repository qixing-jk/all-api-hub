import { ChevronDownIcon } from "@heroicons/react/24/outline"
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
  className,
  buttonClassName,
  panelClassName,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger
        className={cn(
          "dark:hover:bg-dark-bg-tertiary dark:text-dark-text-secondary flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-50",
          buttonClassName,
        )}
      >
        <span className="min-w-0 truncate">{title}</span>
        <ChevronDownIcon
          className={cn(
            "dark:text-dark-text-tertiary h-4 w-4 shrink-0 text-gray-500 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary mt-2 rounded-md border border-gray-100 bg-white p-2",
          panelClassName,
        )}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
