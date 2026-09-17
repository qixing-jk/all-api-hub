import type { TFunction } from "i18next"
import { CheckCircle2 } from "lucide-react"
import { useState } from "react"

import { Badge, Button, Card, WorkflowTransitionButton } from "~/components/ui"

import { OPTIONS_OVERVIEW_TEST_IDS } from "../testIds"
import type { OptionsOverviewAttentionItem } from "../types"
import {
  getAttentionActionLabel,
  getAttentionDescription,
  getAttentionSeverityLabel,
  getAttentionTitle,
} from "./attentionListText"
import { OVERVIEW_ATTENTION_BADGE_VARIANTS } from "./overviewPresentation"

/** Keeps the collapsed card scannable while the rest stays one click away. */
const COLLAPSED_ATTENTION_ITEM_LIMIT = 3

const ATTENTION_SEVERITY_SUMMARY: {
  severity: OptionsOverviewAttentionItem["severity"]
  indicatorClassName: string
}[] = [
  { severity: "error", indicatorClassName: "bg-destructive-indicator" },
  { severity: "warning", indicatorClassName: "bg-warning-indicator" },
  { severity: "info", indicatorClassName: "bg-info-indicator" },
]

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
  const [isExpanded, setIsExpanded] = useState(false)

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

  const visibleItems = isExpanded
    ? items
    : items.slice(0, COLLAPSED_ATTENTION_ITEM_LIMIT)
  const hiddenItemCount = items.length - visibleItems.length
  const severityCounts = ATTENTION_SEVERITY_SUMMARY.map((entry) => ({
    ...entry,
    count: items.filter((item) => item.severity === entry.severity).length,
  })).filter((entry) => entry.count > 0)

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
          <ul
            className="gap-x-density-3 gap-y-density-1 m-0 flex list-none flex-wrap items-center p-0"
            data-testid={OPTIONS_OVERVIEW_TEST_IDS.attentionSeverityCounts}
          >
            {severityCounts.map((entry) => (
              <li
                key={entry.severity}
                className="text-muted-foreground gap-x-density-1-5 inline-flex items-center text-xs"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${entry.indicatorClassName}`}
                  aria-hidden
                />
                <span>
                  {getAttentionSeverityLabel(entry.severity, t)} {entry.count}
                </span>
              </li>
            ))}
          </ul>
          {items.length > COLLAPSED_ATTENTION_ITEM_LIMIT ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-auto px-0 text-xs"
              data-testid={OPTIONS_OVERVIEW_TEST_IDS.attentionToggle}
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((value) => !value)}
            >
              {isExpanded
                ? t("optionsOverview:attention.showLess")
                : t("optionsOverview:attention.showAll", {
                    total: hiddenItemCount,
                  })}
            </Button>
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
