import type { Table } from "@tanstack/react-table"
import { useEffect } from "react"

/** Keeps a controlled TanStack table on its last available page as data shrinks. */
export function useClampedTablePagination<TData>(table: Table<TData>): void {
  const pageCount = table.getPageCount()
  const pageIndex = table.getState().pagination.pageIndex

  useEffect(() => {
    if (pageIndex >= pageCount) {
      table.setPageIndex(Math.max(0, pageCount - 1))
    }
  }, [pageCount, pageIndex, table])
}
