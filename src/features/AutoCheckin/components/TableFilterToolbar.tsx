import type { ReactNode } from "react"

import { Button } from "~/components/ui"
import { cn } from "~/lib/utils"

interface TableFilterToolbarProps {
  children: ReactNode
  countLabel: string
  clearLabel: string
  showClear: boolean
  onClearFilters: () => void
  controlsClassName?: string
}

/**
 * Provides consistent responsive layout, result count, and reset affordance for
 * auto-check-in table filters.
 */
export default function TableFilterToolbar({
  children,
  countLabel,
  clearLabel,
  showClear,
  onClearFilters,
  controlsClassName,
}: TableFilterToolbarProps) {
  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className={cn("min-w-0 flex-1", controlsClassName)}>
          {children}
        </div>
        <div className="flex items-center justify-between gap-3 xl:justify-end">
          <span
            className="text-xs whitespace-nowrap text-gray-500 dark:text-gray-400"
            aria-live="polite"
          >
            {countLabel}
          </span>
          {showClear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={onClearFilters}
            >
              {clearLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
