import type { Table } from "@tanstack/react-table"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

import { MANAGED_SITE_CHANNELS_TEST_IDS } from "../testIds"
import type {
  ManagedChannelsLabels,
  ManagedChannelsPagination,
  ManagedChannelsRowViewModel,
} from "./contracts"

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

type ManagedSiteChannelsPaginationProps = {
  table: Table<ManagedChannelsRowViewModel>
  pagination: ManagedChannelsPagination
  total: number
  labels: ManagedChannelsLabels
  onPaginationChange: (pagination: ManagedChannelsPagination) => void
}

/** Renders controlled page sizing, summary, and navigation. */
export function ManagedSiteChannelsPagination({
  table,
  pagination,
  total,
  labels,
  onPaginationChange,
}: ManagedSiteChannelsPaginationProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <Label htmlFor="rows-per-page" className="text-xs font-medium">
          {labels.rowsPerPage}
        </Label>
        <Select
          value={String(pagination.pageSize)}
          onValueChange={(value) =>
            onPaginationChange({
              ...pagination,
              pageSize: Number(value),
            })
          }
        >
          <SelectTrigger
            id="rows-per-page"
            size="sm"
            aria-label={labels.rowsPerPage}
            className="w-[110px]"
          >
            <SelectValue placeholder={labels.rowsPerPage} />
          </SelectTrigger>
          <SelectContent>
            {ROWS_PER_PAGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-muted-foreground ml-auto">
        {total ? (
          <span
            data-testid={MANAGED_SITE_CHANNELS_TEST_IDS.paginationSummary}
            data-start={pagination.pageIndex * pagination.pageSize + 1}
            data-end={Math.min(
              (pagination.pageIndex + 1) * pagination.pageSize,
              total,
            )}
            data-total={total}
          >
            {labels.paginationSummary}
          </span>
        ) : (
          <span>{labels.noEntries}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label={labels.paginationPrev}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label={labels.paginationNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
