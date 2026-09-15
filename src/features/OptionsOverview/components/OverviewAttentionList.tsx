import type { TFunction } from "i18next"
import { CheckCircle2 } from "lucide-react"

import { Badge, Card, WorkflowTransitionButton } from "~/components/ui"

import type { OptionsOverviewAttentionItem } from "../types"
import {
  getAttentionDescription,
  getAttentionSeverityLabel,
  getAttentionTitle,
} from "./attentionListText"
import { OVERVIEW_ATTENTION_BADGE_VARIANTS } from "./overviewPresentation"

interface OverviewAttentionListProps {
  items: OptionsOverviewAttentionItem[]
  t: TFunction
  onNavigate: (target: OptionsOverviewAttentionItem["target"]) => void
}

/**
 * Renders prioritized setup and health attention items.
 */
export function OverviewAttentionList({
  items,
  t,
  onNavigate,
}: OverviewAttentionListProps) {
  if (items.length === 0) {
    return (
      <Card className="dark:bg-card/95 border-border/80 bg-card/90 shadow-border/50 dark:border-foreground/10 dark:shadow-shadow/20 flex h-full items-center justify-center shadow-sm">
        <div className="gap-density-3 flex items-center">
          <CheckCircle2 className="text-success-text h-5 w-5" />
          <div className="text-sm font-medium">
            {t("optionsOverview:states.allClear")}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="border-border/80 bg-card/95 shadow-border/60 dark:border-foreground/10 dark:shadow-shadow/20 h-full max-h-[28rem] overflow-x-hidden overflow-y-auto shadow-sm">
      <ul className="m-0 list-none p-0">
        {items.map((item) => {
          const title = getAttentionTitle(item, t)
          const description = getAttentionDescription(item, t)

          return (
            <li
              key={item.id}
              className="border-border-subtle dark:border-foreground/10 gap-density-3 py-density-4 first:pt-density-4 last:pb-density-4 flex min-w-0 flex-col border-b px-4 sm:flex-row sm:items-start sm:justify-between"
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
                    className="text-muted-foreground line-clamp-2 text-sm break-words"
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
                className="shrink-0"
                aria-label={`${t("optionsOverview:actions.open")}: ${title}`}
                onClick={() => onNavigate(item.target)}
              >
                {t("optionsOverview:actions.open")}
              </WorkflowTransitionButton>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
