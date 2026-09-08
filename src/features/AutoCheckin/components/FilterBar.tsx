import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  List,
  Search,
  TriangleAlert,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge, Button, Input } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  countAutoCheckinResults,
  filterAutoCheckinResults,
  NEEDS_ATTENTION_RESULT_STATUSES,
} from "~/features/AutoCheckin/utils/autoCheckin"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

import TableFilterToolbar from "./TableFilterToolbar"

interface FilterBarProps {
  accountResults: CheckinAccountResult[]
  selectedStatuses: CheckinResultStatus[]
  keyword: string
  onSelectedStatusesChange: (statuses: CheckinResultStatus[]) => void
  onKeywordChange: (keyword: string) => void
}

interface StatusFilterOption {
  value: CheckinResultStatus
  label: string
  count: number
  icon: ReactNode
}

/**
 * Filter controls for the auto-checkin execution list: a status multi-select
 * and keyword search.
 */
export default function FilterBar({
  accountResults,
  selectedStatuses,
  keyword,
  onSelectedStatusesChange,
  onKeywordChange,
}: FilterBarProps) {
  const { t } = useTranslation("autoCheckin")

  const resultCounts = countAutoCheckinResults(accountResults)
  const needsAttentionCount =
    resultCounts.failed + resultCounts.uncertain + resultCounts.skipped
  const statusOptions: StatusFilterOption[] = [
    {
      value: CHECKIN_RESULT_STATUS.SUCCESS,
      label: t("execution.filters.success"),
      count: resultCounts.success,
      icon: <CircleCheck className="h-4 w-4" />,
    },
    {
      value: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      label: t("execution.filters.alreadyChecked"),
      count: resultCounts.alreadyChecked,
      icon: <CircleCheck className="h-4 w-4" />,
    },
    {
      value: CHECKIN_RESULT_STATUS.FAILED,
      label: t("execution.filters.failed"),
      count: resultCounts.failed,
      icon: <CircleX className="h-4 w-4" />,
    },
    {
      value: CHECKIN_RESULT_STATUS.UNCERTAIN,
      label: t("execution.filters.uncertain"),
      count: resultCounts.uncertain,
      icon: <CircleHelp className="h-4 w-4" />,
    },
    {
      value: CHECKIN_RESULT_STATUS.SKIPPED,
      label: t("execution.filters.skipped"),
      count: resultCounts.skipped,
      icon: <TriangleAlert className="h-4 w-4" />,
    },
  ]

  const getFilteredResultCount = (
    nextStatuses: readonly CheckinResultStatus[],
    nextKeyword: string,
  ) =>
    filterAutoCheckinResults(accountResults, nextStatuses, nextKeyword, t)
      .length
  const filteredCount = getFilteredResultCount(selectedStatuses, keyword)
  const isFiltered = selectedStatuses.length > 0 || Boolean(keyword.trim())
  const countLabel = isFiltered
    ? t("execution.filters.countFiltered", {
        filtered: filteredCount,
        total: resultCounts.total,
      })
    : t("execution.filters.countTotal", { total: resultCounts.total })

  const isNeedsAttentionPreset =
    selectedStatuses.length === NEEDS_ATTENTION_RESULT_STATUSES.length &&
    NEEDS_ATTENTION_RESULT_STATUSES.every((status) =>
      selectedStatuses.includes(status),
    )
  const selectedStatusLabels = statusOptions
    .filter((option) => selectedStatuses.includes(option.value))
    .map((option) => option.label)
  const selectedStatusSummary =
    selectedStatuses.length === 0
      ? t("execution.filters.all")
      : isNeedsAttentionPreset
        ? t("execution.filters.needsAttention")
        : selectedStatuses.length === 1
          ? selectedStatusLabels[0]
          : t("execution.filters.selectedStatuses", {
              count: selectedStatuses.length,
            })

  const trackFilterSelection = (
    mode:
      | typeof PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
      | typeof PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
    nextStatuses: readonly CheckinResultStatus[] = selectedStatuses,
    nextKeyword: string = keyword,
  ) => {
    const filterCount =
      (nextStatuses.length > 0 ? 1 : 0) + (nextKeyword.trim() ? 1 : 0)

    void trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAutoCheckinResults,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinFilterBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ResultFilter,
        mode,
        filterCount,
        resultCount: getFilteredResultCount(nextStatuses, nextKeyword),
      },
    })
  }

  const applyStatuses = (nextStatuses: readonly CheckinResultStatus[]) => {
    const normalizedStatuses = [...nextStatuses]
    onSelectedStatusesChange(normalizedStatuses)
    trackFilterSelection(
      PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
      normalizedStatuses,
    )
  }

  const toggleStatus = (status: CheckinResultStatus) => {
    applyStatuses(
      selectedStatuses.includes(status)
        ? selectedStatuses.filter((value) => value !== status)
        : [...selectedStatuses, status],
    )
  }

  const renderMenuCount = (count: number) => (
    <Badge variant="secondary" size="sm" className="ml-auto tabular-nums">
      {count}
    </Badge>
  )

  return (
    <TableFilterToolbar
      countLabel={countLabel}
      clearLabel={t("execution.filters.clearAll")}
      showClear={isFiltered && filteredCount > 0}
      onClearFilters={() => {
        onSelectedStatusesChange([])
        onKeywordChange("")
        trackFilterSelection(
          keyword.trim()
            ? PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
            : PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
          [],
          "",
        )
      }}
      controlsClassName="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_minmax(12rem,auto)] md:items-center"
    >
      <div className="relative w-full lg:max-w-xs">
        <Input
          type="text"
          aria-label={t("execution.filters.searchLabel")}
          placeholder={t("execution.filters.searchPlaceholder") as string}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          onClear={() => {
            onKeywordChange("")
            trackFilterSelection(
              PRODUCT_ANALYTICS_MODE_IDS.SearchFilter,
              selectedStatuses,
              "",
            )
          }}
          clearButtonLabel={t("common:actions.clear")}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between md:w-56"
            aria-label={`${t("execution.filters.statusLabel")}: ${selectedStatusSummary}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <List className="h-4 w-4 shrink-0" />
              <span className="truncate">{selectedStatusSummary}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {selectedStatuses.length > 0 ? (
                <Badge variant="secondary" size="sm">
                  {selectedStatuses.length}
                </Badge>
              ) : null}
              <ChevronDown className="h-4 w-4" />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            {t("execution.filters.statusLabel")}
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => applyStatuses([])}>
            <List className="h-4 w-4" />
            <span>{t("execution.filters.all")}</span>
            {renderMenuCount(resultCounts.total)}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => applyStatuses(NEEDS_ATTENTION_RESULT_STATUSES)}
          >
            <CircleAlert className="h-4 w-4 text-red-500" />
            <span>{t("execution.filters.needsAttention")}</span>
            {renderMenuCount(needsAttentionCount)}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {statusOptions.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selectedStatuses.includes(option.value)}
              onCheckedChange={() => toggleStatus(option.value)}
              onSelect={(event) => event.preventDefault()}
              aria-label={`${option.label} ${option.count}`}
            >
              {option.icon}
              <span>{option.label}</span>
              {renderMenuCount(option.count)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableFilterToolbar>
  )
}
