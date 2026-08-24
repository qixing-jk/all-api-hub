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
        "h-auto px-4 py-2 text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400",
        className,
      )}
    >
      <button
        type="button"
        className="-mx-2 flex min-h-9 items-center gap-1.5 rounded-md px-2 text-left hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:hover:bg-gray-700"
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
