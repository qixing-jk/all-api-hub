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
      <Card className="dark:bg-dark-bg-secondary/95 flex h-full items-center justify-center border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:shadow-black/20">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div className="text-sm font-medium">
            {t("optionsOverview:states.allClear")}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="dark:bg-dark-bg-secondary/95 h-full max-h-[28rem] overflow-x-hidden overflow-y-auto overscroll-contain border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:shadow-black/20">
      <ul className="m-0 list-none p-0">
        {items.map((item) => {
          const title = getAttentionTitle(item, t)
          const description = getAttentionDescription(item, t)

          return (
            <li
              key={item.id}
              className="flex min-w-0 flex-col gap-3 border-b border-slate-100 p-4 first:pt-4 last:pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-white/10"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
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
                    className="dark:text-dark-text-tertiary line-clamp-2 text-sm break-words text-slate-600"
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
