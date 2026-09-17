import type { TFunction } from "i18next"
import { CheckCircle2 } from "lucide-react"
import { useState } from "react"

import { Badge, Card, WorkflowTransitionButton } from "~/components/ui"
import { cn } from "~/lib/utils"

import { OPTIONS_OVERVIEW_TEST_IDS } from "../testIds"
import type { OptionsOverviewAttentionItem } from "../types"
import {
  getAttentionActionLabel,
  getAttentionCategoryLabel,
  getAttentionDescription,
  getAttentionSeverityLabel,
  getAttentionTitle,
} from "./attentionListText"
import { OVERVIEW_ATTENTION_BADGE_VARIANTS } from "./overviewPresentation"

type AttentionSeverityFilter = "all" | OptionsOverviewAttentionItem["severity"]
type AttentionCategoryFilter = "all" | OptionsOverviewAttentionItem["category"]

const ATTENTION_SEVERITY_FILTERS: {
  filter: AttentionSeverityFilter
  indicatorClassName?: string
}[] = [
  { filter: "all" },
  { filter: "error", indicatorClassName: "bg-destructive-indicator" },
  { filter: "warning", indicatorClassName: "bg-warning-indicator" },
  { filter: "info", indicatorClassName: "bg-info-indicator" },
]

const ATTENTION_CATEGORY_FILTERS: AttentionCategoryFilter[] = [
  "all",
  "accounts",
  "credentials",
  "automation",
  "data",
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
      <span className="text-faint-foreground text-xs">{label}</span>
      <ul
        className="gap-x-density-1 gap-y-density-1 m-0 flex list-none flex-wrap items-center p-0"
        data-testid={testId}
      >
        {options.map((option) => (
          <li key={option.filter}>
            <button
              type="button"
              aria-pressed={option.filter === activeFilter}
              onClick={() => onSelect(option.filter)}
              className={cn(
                "gap-x-density-1-5 inline-flex items-center rounded-full px-2 py-1 text-xs transition-colors",
                option.filter === activeFilter
                  ? "bg-surface-subtle text-foreground dark:bg-foreground/[0.08] font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.indicatorClassName ? (
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    option.indicatorClassName,
                  )}
                  aria-hidden
                />
              ) : null}
              <span>
                {option.label} {option.count}
              </span>
            </button>
          </li>
        ))}
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
    useState<AttentionSeverityFilter>("all")
  const [categoryFilter, setCategoryFilter] =
    useState<AttentionCategoryFilter>("all")

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
      (severityFilter === "all" || item.severity === severityFilter) &&
      (categoryFilter === "all" || item.category === categoryFilter),
  )
  const resolvedSeverityFilter = hasMatchingItem ? severityFilter : "all"
  const resolvedCategoryFilter = hasMatchingItem ? categoryFilter : "all"

  const scopedBySeverity = items.filter(
    (item) =>
      resolvedSeverityFilter === "all" ||
      item.severity === resolvedSeverityFilter,
  )
  const scopedByCategory = items.filter(
    (item) =>
      resolvedCategoryFilter === "all" ||
      item.category === resolvedCategoryFilter,
  )

  // Faceted counts: each row counts within the other row's active selection.
  const severityOptions: AttentionFilterOption<AttentionSeverityFilter>[] =
    ATTENTION_SEVERITY_FILTERS.map((entry) => ({
      ...entry,
      count: scopedByCategory.filter(
        (item) => entry.filter === "all" || item.severity === entry.filter,
      ).length,
      label:
        entry.filter === "all"
          ? t("optionsOverview:attention.filterAll")
          : getAttentionSeverityLabel(entry.filter, t),
    })).filter((entry) => entry.count > 0)
  const categoryOptions: AttentionFilterOption<AttentionCategoryFilter>[] =
    ATTENTION_CATEGORY_FILTERS.map((filter) => ({
      filter,
      count: scopedBySeverity.filter(
        (item) => filter === "all" || item.category === filter,
      ).length,
      label:
        filter === "all"
          ? t("optionsOverview:attention.filterAll")
          : getAttentionCategoryLabel(filter, t),
    })).filter((entry) => entry.count > 0)
  const visibleItems = hasMatchingItem
    ? items.filter(
        (item) =>
          (resolvedSeverityFilter === "all" ||
            item.severity === resolvedSeverityFilter) &&
          (resolvedCategoryFilter === "all" ||
            item.category === resolvedCategoryFilter),
      )
    : items

  return (
    <Card className="border-border/80 bg-card/95 shadow-border/60 dark:border-foreground/10 dark:shadow-shadow/20 h-full max-h-[28rem] overflow-x-hidden overflow-y-auto shadow-sm">
      <div className="border-border-subtle dark:border-foreground/10 gap-x-density-3 gap-y-density-2 py-density-3 flex flex-wrap items-center justify-between border-b px-4">
        <div className="space-y-density-1 min-w-0">
          <div className="text-sm font-medium">
            {t("optionsOverview:attention.summary", { total: items.length })}
          </div>
          <div className="text-muted-foreground text-xs">
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
