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
    <Card className="border-border/80 bg-card/95 shadow-border/60 dark:border-foreground/10 dark:shadow-shadow/20 flex h-full max-h-none flex-col overflow-hidden shadow-sm xl:max-h-[28rem]">
      <div className="space-y-density-2 py-density-3 min-h-0 flex-1 overflow-y-auto px-3">
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
        <div className="gap-y-density-2 py-density-1-5 flex min-w-0 items-center gap-x-2 px-1.5">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="group hover:bg-muted/70 focus-visible:ring-ring dark:hover:bg-foreground/[0.06] gap-y-density-3 py-density-2-5 flex h-auto min-h-0 min-w-0 flex-1 shrink items-center justify-start gap-x-3 rounded-md px-3 text-left whitespace-normal focus-visible:ring-2 focus-visible:outline-none"
              aria-label={label}
              aria-expanded={open}
              aria-controls={contentId}
            >
              <span className="bg-card/80 text-muted-foreground dark:bg-foreground/10 dark:text-secondary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow-sm">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="gap-y-density-2 flex min-w-0 flex-wrap items-center gap-x-2">
                  <span className="text-foreground truncate text-sm font-semibold">
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
                  "text-faint-foreground group-hover:text-theme-600 dark:group-hover:text-theme-300 h-4 w-4 shrink-0 transition-transform",
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
          <div className="border-border/70 bg-surface-subtle/60 dark:border-foreground/10 dark:bg-foreground/[0.03] py-density-3 border-t px-3">
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
    <div className="space-y-density-3">
      <div className="gap-y-density-2 grid grid-cols-1 gap-x-2 sm:grid-cols-2">
        {item.summaryRows.map((row) => (
          <div
            key={row.id}
            className="border-border/70 bg-card/80 dark:border-foreground/10 dark:bg-foreground/[0.04] py-density-2-5 rounded-md border px-2.5"
          >
            <div className="text-muted-foreground text-xs">
              {getAutomationSummaryRowLabel(item.id, row.id, t)}
            </div>
            <div className="text-foreground mt-density-1 truncate text-sm font-semibold">
              {formatSummaryValue(item.id, row, t)}
            </div>
          </div>
        ))}
      </div>

      {item.statusLabel === AUTOMATION_STATUS_LABELS.disabled ? (
        <div className="dark:text-secondary-foreground border-border/70 bg-card/70 text-muted-foreground dark:border-foreground/10 dark:bg-foreground/[0.04] py-density-2-5 rounded-md border px-2.5 text-sm leading-6">
          {getAutomationDisabledDescription(item.id, t)}
        </div>
      ) : null}

      {item.actions.length > 0 ? (
        <div className="gap-y-density-2 flex flex-col gap-x-2 sm:flex-row">
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
