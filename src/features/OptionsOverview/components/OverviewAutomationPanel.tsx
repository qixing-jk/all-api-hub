import type { TFunction } from "i18next"
import { ChevronDown, Settings2, type LucideIcon } from "lucide-react"
import { useId, useState } from "react"

import { OPTIONS_CAPABILITY_ICONS } from "~/components/icons/optionsPageIcons"
import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Badge, Button, Card, WorkflowTransitionButton } from "~/components/ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { cn } from "~/lib/utils"

import {
  OPTIONS_OVERVIEW_AUTOMATION_STATUS_LABELS as AUTOMATION_STATUS_LABELS,
  OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS,
} from "../ids"
import type {
  OptionsOverviewAutomationItem,
  OptionsOverviewAutomationOverview,
} from "../types"
import {
  formatSummaryValue,
  getAutomationActionLabel,
  getAutomationDisabledDescription,
  getAutomationItemLabel,
  getAutomationStatusLabel,
  getAutomationSummaryRowLabel,
} from "./automationPanelText"
import { OverviewAutoCheckinPanel } from "./OverviewAutoCheckinPanel"
import {
  OVERVIEW_NEUTRAL_PANEL_CLASSES,
  OVERVIEW_SEVERITY_BADGE_VARIANTS,
} from "./overviewPresentation"

interface OverviewAutomationPanelProps {
  overview: OptionsOverviewAutomationOverview
  t: TFunction
  onNavigate: (target: OptionsOverviewAutomationItem["primaryTarget"]) => void
}

const itemIcons = {
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.autoCheckin]:
    OPTIONS_CAPABILITY_ICONS.autoCheckin,
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.siteAnnouncements]:
    OPTIONS_CAPABILITY_ICONS.siteAnnouncements,
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.managedSiteModelSync]:
    OPTIONS_CAPABILITY_ICONS.managedSiteModelSync,
  [OPTIONS_OVERVIEW_AUTOMATION_ITEM_IDS.webdavAutoSync]:
    OPTIONS_CAPABILITY_ICONS.webdavSync,
} satisfies Record<OptionsOverviewAutomationItem["id"], LucideIcon>

/**
 * Renders the automation execution overview as compact expandable rows.
 */
export function OverviewAutomationPanel({
  overview,
  t,
  onNavigate,
}: OverviewAutomationPanelProps) {
  return (
    <Card className="dark:bg-dark-bg-secondary/95 flex h-full max-h-none flex-col overflow-hidden border-slate-200/80 bg-white/95 shadow-sm shadow-slate-200/60 xl:max-h-[28rem] dark:border-white/10 dark:shadow-black/20">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
        {overview.items.map((item) => (
          <AutomationItemRow
            key={item.id}
            item={item}
            t={t}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </Card>
  )
}
/**
 * Renders one automation row with independent disclosure and navigation actions.
 */
function AutomationItemRow({
  item,
  t,
  onNavigate,
}: {
  item: OptionsOverviewAutomationItem
  t: TFunction
  onNavigate: OverviewAutomationPanelProps["onNavigate"]
}) {
  const [open, setOpen] = useState(item.defaultExpanded)
  const contentId = useId()
  const Icon = itemIcons[item.id]
  const label = getAutomationItemLabel(item.id, t)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "overflow-hidden rounded-lg border transition-colors",
          OVERVIEW_NEUTRAL_PANEL_CLASSES,
        )}
      >
        <div className="flex min-w-0 items-center gap-2 p-1.5">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="group flex h-auto min-w-0 flex-1 shrink items-center justify-start gap-3 rounded-md px-3 py-2.5 text-left whitespace-normal hover:bg-slate-100/70 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:hover:bg-white/[0.06]"
              aria-label={label}
              aria-expanded={open}
              aria-controls={contentId}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/80 text-gray-600 shadow-sm dark:bg-white/10 dark:text-gray-300">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                    {label}
                  </span>
                  <Badge
                    variant={OVERVIEW_SEVERITY_BADGE_VARIANTS[item.status]}
                    size="sm"
                  >
                    {getAutomationStatusLabel(item, t)}
                  </Badge>
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:text-blue-600 dark:text-gray-500 dark:group-hover:text-blue-300",
                  open ? "rotate-180" : "",
                )}
              />
            </Button>
          </CollapsibleTrigger>

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("optionsOverview:automation.openItem", {
              name: label,
            })}
            onClick={() => onNavigate(item.primaryTarget)}
          >
            <WorkflowTransitionIcon className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <CollapsibleContent id={contentId}>
          <div className="border-t border-slate-200/70 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            {item.autoCheckinPanel ? (
              <OverviewAutoCheckinPanel
                panel={item.autoCheckinPanel}
                t={t}
                onNavigate={onNavigate}
                embedded
              />
            ) : (
              <AutomationSummary item={item} t={t} onNavigate={onNavigate} />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

/**
 * Renders summary facts and explicit actions for a collapsed automation domain.
 */
function AutomationSummary({
  item,
  t,
  onNavigate,
}: {
  item: OptionsOverviewAutomationItem
  t: TFunction
  onNavigate: OverviewAutomationPanelProps["onNavigate"]
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {item.summaryRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-200/70 bg-white/80 p-2.5 dark:border-white/10 dark:bg-white/[0.04]"
          >
            <div className="dark:text-dark-text-tertiary text-xs text-slate-500">
              {getAutomationSummaryRowLabel(item.id, row.id, t)}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-white">
              {formatSummaryValue(item.id, row, t)}
            </div>
          </div>
        ))}
      </div>

      {item.statusLabel === AUTOMATION_STATUS_LABELS.disabled ? (
        <div className="dark:text-dark-text-secondary rounded-md border border-slate-200/70 bg-white/70 p-2.5 text-sm leading-6 text-slate-600 dark:border-white/10 dark:bg-white/[0.04]">
          {getAutomationDisabledDescription(item.id, t)}
        </div>
      ) : null}

      {item.actions.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {item.actions.map((action, index) => (
            <WorkflowTransitionButton
              key={action.id}
              type="button"
              size="sm"
              variant={action.variant ?? (index === 0 ? "default" : "outline")}
              className="sm:flex-1"
              onClick={() => onNavigate(action.target)}
              leftIcon={
                index === 0 ? undefined : <Settings2 className="h-4 w-4" />
              }
            >
              {getAutomationActionLabel(item.id, action.id, t)}
            </WorkflowTransitionButton>
          ))}
        </div>
      ) : null}
    </div>
  )
}
