import type { Column, RowData } from "@tanstack/react-table"
import { ChevronDown, ChevronUp } from "lucide-react"

import { TableHead } from "~/components/ui"
import { cn } from "~/lib/utils"

interface SortableTableHeadProps<TData extends RowData> {
  column: Column<TData, unknown>
  label: string
  className?: string
  onSort?: () => void
}

/** Accessible table header that exposes and toggles TanStack sorting state. */
export default function SortableTableHead<TData extends RowData>({
  column,
  label,
  className,
  onSort,
}: SortableTableHeadProps<TData>) {
  const sorted = column.getIsSorted()

  return (
    <TableHead
      aria-sort={
        sorted === "asc"
          ? "ascending"
          : sorted === "desc"
            ? "descending"
            : "none"
      }
      className={cn(
        "text-muted-foreground py-density-2 h-auto px-4 text-xs font-medium tracking-wider uppercase",
        className,
      )}
    >
      <button
        type="button"
        className="hover:bg-muted focus-visible:ring-ring dark:hover:bg-secondary gap-y-density-1-5 -mx-2 flex min-h-(--density-control) items-center gap-x-1.5 rounded-md px-2 text-left focus-visible:ring-2 focus-visible:outline-none"
        onClick={() => {
          column.toggleSorting()
          onSort?.()
        }}
        aria-label={label}
      >
        {label}
        {sorted === "asc" && <ChevronUp className="h-3.5 w-3.5" />}
        {sorted === "desc" && <ChevronDown className="h-3.5 w-3.5" />}
      </button>
    </TableHead>
  )
}
