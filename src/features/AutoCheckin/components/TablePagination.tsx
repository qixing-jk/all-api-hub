import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"

export const DEFAULT_AUTO_CHECKIN_TABLE_PAGE_SIZE = 25

const PAGE_SIZE_OPTIONS = [10, DEFAULT_AUTO_CHECKIN_TABLE_PAGE_SIZE, 50, 100]

interface TablePaginationProps {
  id: string
  pageIndex: number
  pageSize: number
  total: number
  onPageIndexChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
}

/** Keeps long execution-result lists bounded and keyboard navigable. */
export default function TablePagination({
  id,
  pageIndex,
  pageSize,
  total,
  onPageIndexChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const { t } = useTranslation("autoCheckin")

  if (total <= PAGE_SIZE_OPTIONS[0]) return null

  const start = pageIndex * pageSize + 1
  const end = Math.min((pageIndex + 1) * pageSize, total)
  const canGoBack = pageIndex > 0
  const canGoForward = end < total
  const pageSizeSelectId = `${id}-page-size`

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-sm sm:flex-row sm:items-center dark:border-gray-800">
      <div className="flex items-center gap-2">
        <Label htmlFor={pageSizeSelectId} className="text-xs font-medium">
          {t("execution.pagination.rowsPerPage")}
        </Label>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            id={pageSizeSelectId}
            size="sm"
            className="w-20"
            aria-label={t("execution.pagination.rowsPerPage")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <span
        className="text-xs text-gray-500 sm:ml-auto dark:text-gray-400"
        aria-live="polite"
      >
        {t("execution.pagination.summary", { start, end, total })}
      </span>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!canGoBack}
          onClick={() => onPageIndexChange(pageIndex - 1)}
          aria-label={t("execution.pagination.previous")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!canGoForward}
          onClick={() => onPageIndexChange(pageIndex + 1)}
          aria-label={t("execution.pagination.next")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
