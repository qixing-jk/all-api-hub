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
import { Fragment, type ReactNode } from "react"
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
  countActiveResultFilterDimensions,
  countAutoCheckinResults,
  countAutoCheckinResultsNeedingAttention,
  countAutoCheckinSkippedCategories,
  countAutoCheckinSkippedReasons,
  createNeedsAttentionResultFilter,
  EMPTY_AUTO_CHECKIN_RESULT_FILTER,
  filterAutoCheckinResults,
  isAutoCheckinNeedsAttentionFilter,
  type AutoCheckinResultFilter,
} from "~/features/AutoCheckin/utils/autoCheckin"
import {
  AUTO_CHECKIN_SKIP_CATEGORIES,
  AUTO_CHECKIN_SKIP_CATEGORY_REASONS,
  getAutoCheckinSkipCategory,
  type AutoCheckinSkipCategory,
} from "~/features/AutoCheckin/utils/skipCategories"
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
  translateAutoCheckinSkipReason,
  type AutoCheckinSkipReason,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

import TableFilterToolbar from "./TableFilterToolbar"

interface FilterBarProps {
  accountResults: CheckinAccountResult[]
  filter: AutoCheckinResultFilter
  keyword: string
  onFilterChange: (filter: AutoCheckinResultFilter) => void
  onKeywordChange: (keyword: string) => void
}

interface StatusFilterOption {
  value: CheckinResultStatus
  label: string
  count: number
  icon: ReactNode
}

interface SkipReasonFilterOption {
  value: AutoCheckinSkipReason
  label: string
  count: number
}

interface SkipCategoryFilterOption {
  value: AutoCheckinSkipCategory
  label: string
  count: number
  selected: boolean
  /** Precise reasons this category resolves to, derived from the results. */
  reasons: SkipReasonFilterOption[]
  selectedReasonCount: number
}

const SKIP_CATEGORY_LABEL_KEYS: Record<
  AutoCheckinSkipCategory,
  `execution.filters.${string}`
> = {
  action_required: "execution.filters.skipCategoryActionRequired",
  waiting: "execution.filters.skipCategoryWaiting",
  account_disabled: "execution.filters.skipCategoryAccountDisabled",
  disabled: "execution.filters.skipCategoryDisabled",
  unsupported: "execution.filters.skipCategoryUnsupported",
  expected: "execution.filters.skipCategoryExpected",
}

/** Right-aligned count rendered next to a filter entry label. */
function MenuCount({ count }: { count: number }) {
  return (
    <Badge variant="secondary" size="sm" className="ml-auto tabular-nums">
      {count}
    </Badge>
  )
}

/**
 * Filter controls for the auto-checkin execution list: a status multi-select
 * with reason narrowing for skipped rows, and keyword search.
 */
export default function FilterBar({
  accountResults,
  filter,
  keyword,
  onFilterChange,
  onKeywordChange,
}: FilterBarProps) {
  const { t } = useTranslation("autoCheckin")

  const resultCounts = countAutoCheckinResults(accountResults)
  const needsAttentionCount =
    countAutoCheckinResultsNeedingAttention(accountResults)
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
    nextFilter: AutoCheckinResultFilter,
    nextKeyword: string,
  ) =>
    filterAutoCheckinResults(accountResults, nextFilter, nextKeyword, t).length
  const filteredCount = getFilteredResultCount(filter, keyword)
  const isFiltered =
    filter.statuses.length > 0 ||
    filter.skippedCategories.length > 0 ||
    Boolean(keyword.trim())
  const countLabel = isFiltered
    ? t("execution.filters.countFiltered", {
        filtered: filteredCount,
        total: resultCounts.total,
      })
    : t("execution.filters.countTotal", { total: resultCounts.total })

  const isNeedsAttentionPreset = isAutoCheckinNeedsAttentionFilter(filter)
  const selectedStatusLabels = statusOptions
    .filter((option) => filter.statuses.includes(option.value))
    .map((option) => option.label)
  const statusSummary =
    filter.statuses.length === 0
      ? null
      : isNeedsAttentionPreset
        ? t("execution.filters.needsAttention")
        : filter.statuses.length === 1
          ? selectedStatusLabels[0]
          : t("execution.filters.selectedStatuses", {
              count: filter.statuses.length,
            })
  const resolvedCategoryLabels = AUTO_CHECKIN_SKIP_CATEGORIES.filter(
    (category) => filter.skippedCategories.includes(category),
  ).map((category) => t(SKIP_CATEGORY_LABEL_KEYS[category]))
  const selectedReasonFilterCount =
    filter.skippedCategories.length + filter.reasons.length
  const categorySummary =
    selectedReasonFilterCount === 0 || isNeedsAttentionPreset
      ? null
      : filter.reasons.length === 0 && filter.skippedCategories.length === 1
        ? resolvedCategoryLabels[0]
        : t("execution.filters.selectedReasons", {
            count: selectedReasonFilterCount,
          })
  const selectedStatusSummary =
    [statusSummary, categorySummary].filter(Boolean).join(" · ") ||
    t("execution.filters.all")

  const showsSkipCategories = filter.statuses.includes(
    CHECKIN_RESULT_STATUS.SKIPPED,
  )
  const skippedResults = filterAutoCheckinResults(
    accountResults,
    {
      statuses: [CHECKIN_RESULT_STATUS.SKIPPED],
      skippedCategories: [],
      reasons: [],
    },
    keyword,
    t,
  )
  const skippedCategoryCounts =
    countAutoCheckinSkippedCategories(skippedResults)
  const skippedReasonCounts = countAutoCheckinSkippedReasons(skippedResults)
  const skipCategoryOptions: SkipCategoryFilterOption[] =
    AUTO_CHECKIN_SKIP_CATEGORIES.map((category) => {
      const reasons = AUTO_CHECKIN_SKIP_CATEGORY_REASONS[category]
        .filter(
          (reason) =>
            skippedReasonCounts[reason] > 0 || filter.reasons.includes(reason),
        )
        .map((reason) => ({
          value: reason,
          label: translateAutoCheckinSkipReason(t, reason),
          count: skippedReasonCounts[reason],
        }))

      return {
        value: category,
        label: t(SKIP_CATEGORY_LABEL_KEYS[category]),
        count: skippedCategoryCounts[category],
        selected: filter.skippedCategories.includes(category),
        reasons,
        selectedReasonCount: reasons.filter((reason) =>
          filter.reasons.includes(reason.value),
        ).length,
      }
    }).filter(
      (option) =>
        option.count > 0 || option.selected || option.selectedReasonCount > 0,
    )

  const trackFilterSelection = (
    mode:
      | typeof PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
      | typeof PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
    nextFilter: AutoCheckinResultFilter = filter,
    nextKeyword: string = keyword,
  ) => {
    void trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAutoCheckinResults,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAutoCheckinFilterBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ResultFilter,
        mode,
        filterCount: countActiveResultFilterDimensions(nextFilter, nextKeyword),
        resultCount: getFilteredResultCount(nextFilter, nextKeyword),
      },
    })
  }

  const applyFilter = (nextFilter: AutoCheckinResultFilter) => {
    const normalizedFilter: AutoCheckinResultFilter = {
      statuses: [...nextFilter.statuses],
      skippedCategories: [...nextFilter.skippedCategories],
      reasons: [...nextFilter.reasons],
    }
    onFilterChange(normalizedFilter)
    trackFilterSelection(
      PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
      normalizedFilter,
    )
  }

  const toggleStatus = (status: CheckinResultStatus) => {
    const nextStatuses = filter.statuses.includes(status)
      ? filter.statuses.filter((value) => value !== status)
      : [...filter.statuses, status]

    // Manual status selection resets reason narrowing to "every reason".
    applyFilter({
      statuses: nextStatuses,
      skippedCategories: [],
      reasons: [],
    })
  }

  /** Keeps skipped rows in scope whenever a reason is being narrowed. */
  const withSkippedStatus = (statuses: CheckinResultStatus[]) => {
    if (statuses.includes(CHECKIN_RESULT_STATUS.SKIPPED)) return statuses
    if (statuses.length === 0) return [CHECKIN_RESULT_STATUS.SKIPPED]

    return [...statuses, CHECKIN_RESULT_STATUS.SKIPPED]
  }

  const toggleSkipCategory = (category: AutoCheckinSkipCategory) => {
    const isSelected = filter.skippedCategories.includes(category)
    const nextCategories = isSelected
      ? filter.skippedCategories.filter((value) => value !== category)
      : [...filter.skippedCategories, category]

    // A whole category and its precise reasons are one selection, so picking
    // the category replaces any sub-type that belongs to it.
    const nextReasons = isSelected
      ? filter.reasons
      : filter.reasons.filter(
          (reason) => getAutoCheckinSkipCategory(reason) !== category,
        )

    applyFilter({
      statuses: withSkippedStatus(filter.statuses),
      skippedCategories: nextCategories,
      reasons: nextReasons,
    })
  }

  const toggleSkipReason = (reason: AutoCheckinSkipReason) => {
    const isSelected = filter.reasons.includes(reason)
    const nextReasons = isSelected
      ? filter.reasons.filter((value) => value !== reason)
      : [...filter.reasons, reason]
    const category = getAutoCheckinSkipCategory(reason)

    applyFilter({
      statuses: withSkippedStatus(filter.statuses),
      skippedCategories: isSelected
        ? filter.skippedCategories
        : filter.skippedCategories.filter((value) => value !== category),
      reasons: nextReasons,
    })
  }

  return (
    <TableFilterToolbar
      countLabel={countLabel}
      clearLabel={t("execution.filters.clearAll")}
      showClear={isFiltered && filteredCount > 0}
      onClearFilters={() => {
        onFilterChange({ statuses: [], skippedCategories: [], reasons: [] })
        onKeywordChange("")
        trackFilterSelection(
          keyword.trim()
            ? PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
            : PRODUCT_ANALYTICS_MODE_IDS.StatusFilter,
          EMPTY_AUTO_CHECKIN_RESULT_FILTER,
          "",
        )
      }}
      controlsClassName="grid gap-x-2 gap-y-density-2 md:grid-cols-[minmax(14rem,1fr)_minmax(12rem,auto)] md:items-center"
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
              filter,
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
            <span className="gap-y-density-2 flex min-w-0 items-center gap-x-2">
              <List className="h-4 w-4 shrink-0" />
              <span className="truncate">{selectedStatusSummary}</span>
            </span>
            <span className="gap-y-density-1-5 flex shrink-0 items-center gap-x-1.5">
              {isFiltered && filter.statuses.length > 0 ? (
                <Badge variant="secondary" size="sm">
                  {filter.statuses.length}
                </Badge>
              ) : null}
              <ChevronDown className="h-4 w-4" />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>
            {t("execution.filters.statusLabel")}
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => applyFilter(EMPTY_AUTO_CHECKIN_RESULT_FILTER)}
          >
            <List className="h-4 w-4" />
            <span>{t("execution.filters.all")}</span>
            <MenuCount count={resultCounts.total} />
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => applyFilter(createNeedsAttentionResultFilter())}
          >
            <CircleAlert className="text-destructive-indicator h-4 w-4" />
            <span>{t("execution.filters.needsAttention")}</span>
            <MenuCount count={needsAttentionCount} />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {statusOptions.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={filter.statuses.includes(option.value)}
              onCheckedChange={() => toggleStatus(option.value)}
              onSelect={(event) => event.preventDefault()}
              aria-label={`${option.label} ${option.count}`}
            >
              {option.icon}
              <span>{option.label}</span>
              <MenuCount count={option.count} />
            </DropdownMenuCheckboxItem>
          ))}
          {showsSkipCategories && skipCategoryOptions.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {t("execution.filters.skipReasonLabel")}
              </DropdownMenuLabel>
              {skipCategoryOptions.map((option) => (
                <Fragment key={option.value}>
                  <DropdownMenuCheckboxItem
                    checked={option.selected}
                    onCheckedChange={() => toggleSkipCategory(option.value)}
                    onSelect={(event) => event.preventDefault()}
                    aria-label={`${option.label} ${option.count}`}
                  >
                    <span className="text-muted-foreground">
                      {option.label}
                    </span>
                    <MenuCount count={option.count} />
                  </DropdownMenuCheckboxItem>
                  {option.reasons.length > 1
                    ? option.reasons.map((reason) => (
                        <DropdownMenuCheckboxItem
                          key={reason.value}
                          className="pl-12 text-xs"
                          checked={filter.reasons.includes(reason.value)}
                          onCheckedChange={() => toggleSkipReason(reason.value)}
                          onSelect={(event) => event.preventDefault()}
                          aria-label={`${reason.label} ${reason.count}`}
                        >
                          <span className="text-muted-foreground">
                            {reason.label}
                          </span>
                          <MenuCount count={reason.count} />
                        </DropdownMenuCheckboxItem>
                      ))
                    : null}
                </Fragment>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableFilterToolbar>
  )
}
