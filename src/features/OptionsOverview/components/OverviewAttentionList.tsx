import type { TFunction } from "i18next"
import { CheckCircle2 } from "lucide-react"
import { useState } from "react"

import { Badge, Card, WorkflowTransitionButton } from "~/components/ui"
import { cn } from "~/lib/utils"

import { OPTIONS_OVERVIEW_ATTENTION_CATEGORIES } from "../ids"
import { OPTIONS_OVERVIEW_TEST_IDS } from "../testIds"
import type { OptionsOverviewAttentionItem } from "../types"
import {
  getAttentionActionLabel,
  getAttentionCategoryLabel,
  getAttentionDescription,
  getAttentionSeverityLabel,
  getAttentionTitle,
} from "./attentionListText"
import {
  OVERVIEW_ATTENTION_BADGE_VARIANTS,
  OVERVIEW_SEVERITY_INDICATOR_CLASSES,
} from "./overviewPresentation"

const ATTENTION_FILTER_ALL = "all"

type AttentionSeverityFilter =
  | typeof ATTENTION_FILTER_ALL
  | OptionsOverviewAttentionItem["severity"]
type AttentionCategoryFilter =
  | typeof ATTENTION_FILTER_ALL
  | OptionsOverviewAttentionItem["category"]

/** Returns whether an item matches the active severity facet. */
function matchesAttentionSeverity(
  item: OptionsOverviewAttentionItem,
  filter: AttentionSeverityFilter,
): boolean {
  return filter === ATTENTION_FILTER_ALL || item.severity === filter
}

/** Returns whether an item matches the active category facet. */
function matchesAttentionCategory(
  item: OptionsOverviewAttentionItem,
  filter: AttentionCategoryFilter,
): boolean {
  return filter === ATTENTION_FILTER_ALL || item.category === filter
}

const ATTENTION_SEVERITY_FILTERS: {
  filter: AttentionSeverityFilter
  indicatorClassName?: string
}[] = [
  { filter: ATTENTION_FILTER_ALL },
  {
    filter: "error",
    indicatorClassName: OVERVIEW_SEVERITY_INDICATOR_CLASSES.error,
  },
  {
    filter: "warning",
    indicatorClassName: OVERVIEW_SEVERITY_INDICATOR_CLASSES.warning,
  },
  {
    filter: "info",
    indicatorClassName: OVERVIEW_SEVERITY_INDICATOR_CLASSES.info,
  },
]

const ATTENTION_CATEGORY_FILTERS: AttentionCategoryFilter[] = [
  ATTENTION_FILTER_ALL,
  ...Object.values(OPTIONS_OVERVIEW_ATTENTION_CATEGORIES),
]

interface AttentionFilterOption<Filter extends string> {
  filter: Filter
  label: string
  count: number
  indicatorClassName?: string
}

/**
 * Renders one single-choice filter row with faceted counts.
 */
function AttentionFilterRow<Filter extends string>({
  label,
  testId,
  options,
  activeFilter,
  onSelect,
}: {
  label: string
  testId: string
  options: AttentionFilterOption<Filter>[]
  activeFilter: Filter
  onSelect: (filter: Filter) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="gap-x-density-2 gap-y-density-1 flex min-w-0 flex-wrap items-center"
    >
      <span className="text-muted-foreground shrink-0 text-xs font-medium select-none sm:min-w-12 sm:text-right">
        {label}
      </span>
      <ul
        className="gap-density-1 m-0 flex list-none flex-wrap items-center p-0"
        data-testid={testId}
      >
        {options.map((option) => {
          const isActive = option.filter === activeFilter

          return (
            <li key={option.filter}>
              <button
                type="button"
                aria-pressed={isActive}
                aria-label={`${option.label} ${option.count}`}
                onClick={() => onSelect(option.filter)}
                className={cn(
                  "gap-x-density-1-5 inline-flex items-center rounded-full border px-2 py-0.5 text-xs transition-colors select-none",
                  "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
                  isActive
                    ? "border-border-strong bg-surface-strong text-foreground font-medium"
                    : "border-border-subtle text-secondary-foreground hover:bg-surface-subtle hover:text-foreground",
                )}
              >
                {option.indicatorClassName ? (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      option.indicatorClassName,
                    )}
                    aria-hidden
                  />
                ) : null}
                <span>{option.label}</span>
                <span
                  className={cn(
                    "text-2xs tabular-nums",
                    isActive ? "text-foreground/70" : "text-faint-foreground",
                  )}
                >
                  {option.count}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface OverviewAttentionListProps {
  items: OptionsOverviewAttentionItem[]
  t: TFunction
  onNavigate: (target: OptionsOverviewAttentionItem["target"]) => void
}

/**
 * Renders prioritized setup, health, and automation actions.
 */
export function OverviewAttentionList({
  items,
  t,
  onNavigate,
}: OverviewAttentionListProps) {
  const [severityFilter, setSeverityFilter] =
    useState<AttentionSeverityFilter>(ATTENTION_FILTER_ALL)
  const [categoryFilter, setCategoryFilter] =
    useState<AttentionCategoryFilter>(ATTENTION_FILTER_ALL)

  if (items.length === 0) {
    return (
      <Card className="dark:bg-card/95 border-border/80 bg-card/90 shadow-border/50 dark:border-foreground/10 dark:shadow-shadow/20 p-density-6 flex h-full items-center justify-center shadow-sm">
        <div className="gap-density-3 flex max-w-sm flex-col items-center text-center">
          <CheckCircle2 className="text-success-indicator h-5 w-5" />
          <div className="space-y-density-1">
            <div className="text-sm font-medium">
              {t("optionsOverview:states.allClear")}
            </div>
            <div className="text-muted-foreground text-xs leading-relaxed">
              {t("optionsOverview:states.allClearDescription")}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  // A reload can remove an active value or the last item it matched; fall back
  // to the full queue so the list never renders empty next to a pending count.
  const hasMatchingItem = items.some(
    (item) =>
      matchesAttentionSeverity(item, severityFilter) &&
      matchesAttentionCategory(item, categoryFilter),
  )
  const resolvedSeverityFilter = hasMatchingItem
    ? severityFilter
    : ATTENTION_FILTER_ALL
  const resolvedCategoryFilter = hasMatchingItem
    ? categoryFilter
    : ATTENTION_FILTER_ALL

  const scopedBySeverity = items.filter((item) =>
    matchesAttentionSeverity(item, resolvedSeverityFilter),
  )
  const scopedByCategory = items.filter((item) =>
    matchesAttentionCategory(item, resolvedCategoryFilter),
  )

  // Faceted counts: each row counts within the other row's active selection.
  const severityOptions: AttentionFilterOption<AttentionSeverityFilter>[] =
    ATTENTION_SEVERITY_FILTERS.map((entry) => ({
      ...entry,
      count: scopedByCategory.filter((item) =>
        matchesAttentionSeverity(item, entry.filter),
      ).length,
      label:
        entry.filter === ATTENTION_FILTER_ALL
          ? t("optionsOverview:attention.filterAll")
          : getAttentionSeverityLabel(entry.filter, t),
    })).filter((entry) => entry.count > 0)
  const categoryOptions: AttentionFilterOption<AttentionCategoryFilter>[] =
    ATTENTION_CATEGORY_FILTERS.map((filter) => ({
      filter,
      count: scopedBySeverity.filter((item) =>
        matchesAttentionCategory(item, filter),
      ).length,
      label:
        filter === ATTENTION_FILTER_ALL
          ? t("optionsOverview:attention.filterAll")
          : getAttentionCategoryLabel(filter, t),
    })).filter((entry) => entry.count > 0)
  const visibleItems = hasMatchingItem
    ? items.filter(
        (item) =>
          matchesAttentionSeverity(item, resolvedSeverityFilter) &&
          matchesAttentionCategory(item, resolvedCategoryFilter),
      )
    : items

  return (
    <Card className="border-border/80 bg-card/95 shadow-border/60 dark:border-foreground/10 dark:shadow-shadow/20 h-full max-h-[28rem] overflow-x-hidden overflow-y-auto shadow-sm">
      <div className="border-border-subtle dark:border-foreground/10 gap-x-density-3 gap-y-density-2 py-density-3 flex flex-wrap items-center justify-between border-b px-4 sm:items-start">
        <div className="space-y-density-1 min-w-0 sm:pt-0.5">
          <div className="text-sm font-medium">
            {t("optionsOverview:attention.summary", { count: items.length })}
          </div>
          <div className="text-faint-foreground text-xs">
            {t("optionsOverview:attention.sortHint")}
          </div>
        </div>
        <div className="gap-y-density-1-5 flex min-w-0 flex-col items-start sm:items-end">
          <AttentionFilterRow
            label={t("optionsOverview:attention.severityFilterLabel")}
            testId={OPTIONS_OVERVIEW_TEST_IDS.attentionSeverityFilters}
            options={severityOptions}
            activeFilter={resolvedSeverityFilter}
            onSelect={setSeverityFilter}
          />
          {categoryOptions.length > 2 ? (
            <AttentionFilterRow
              label={t("optionsOverview:attention.categoryFilterLabel")}
              testId={OPTIONS_OVERVIEW_TEST_IDS.attentionCategoryFilters}
              options={categoryOptions}
              activeFilter={resolvedCategoryFilter}
              onSelect={setCategoryFilter}
            />
          ) : null}
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {visibleItems.map((item) => {
          const title = getAttentionTitle(item, t)
          const description = getAttentionDescription(item, t)
          const actionLabel = getAttentionActionLabel(item, t)

          return (
            <li
              key={item.id}
              className="border-border-subtle hover:bg-surface-subtle dark:border-foreground/10 dark:hover:bg-card gap-density-3 py-density-4 flex min-w-0 flex-col border-b px-4 transition-colors last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="space-y-density-1-5 min-w-0 flex-1">
                <div className="gap-x-density-2 gap-y-density-1 flex min-w-0 flex-wrap items-start">
                  <Badge
                    variant={OVERVIEW_ATTENTION_BADGE_VARIANTS[item.severity]}
                    size="sm"
                    className="mt-0.5"
                  >
                    {getAttentionSeverityLabel(item.severity, t)}
                  </Badge>
                  <div className="min-w-0 text-sm font-medium break-words">
                    {title}
                  </div>
                </div>
                {description ? (
                  <div
                    className="text-muted-foreground line-clamp-3 text-sm leading-relaxed break-words"
                    title={description}
                  >
                    {description}
                  </div>
                ) : null}
              </div>
              <WorkflowTransitionButton
                type="button"
                variant="outline"
                size="sm"
                className="w-full shrink-0 sm:w-auto"
                aria-label={`${actionLabel}: ${title}`}
                onClick={() => onNavigate(item.target)}
              >
                {actionLabel}
              </WorkflowTransitionButton>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
