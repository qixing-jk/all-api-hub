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
  OPTIONS_OVERVIEW_AUTO_CHECKIN_PANEL_STATUSES as AUTO_CHECKIN_PANEL_STATUSES,
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
  getAutomationItemSummaryLine,
  getAutomationStatusLabel,
  getAutomationSummaryRowLabel,
} from "./automationPanelText"
import { OverviewAutoCheckinPanel } from "./OverviewAutoCheckinPanel"
import { OVERVIEW_SEVERITY_BADGE_VARIANTS } from "./overviewPresentation"

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
 * Renders the automation execution overview as one flat disclosure list.
 */
export function OverviewAutomationPanel({
  overview,
  t,
  onNavigate,
}: OverviewAutomationPanelProps) {
  return (
    <Card className="border-border/80 bg-card/95 shadow-border/60 dark:border-foreground/10 dark:shadow-shadow/20 flex h-full max-h-none flex-col overflow-hidden shadow-sm xl:max-h-[28rem]">
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto p-0">
        {overview.items.map((item) => (
          <AutomationItemRow
            key={item.id}
            item={item}
            t={t}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
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
  const disabled = isAutomationItemDisabled(item)
  const summaryLine = disabled ? "" : getAutomationItemSummaryLine(item, t)
  const statusLabel = getAutomationStatusLabel(item, t)
  const accessibleLabel = [label, statusLabel, summaryLine]
    .filter(Boolean)
    .join(", ")

  return (
    <li className="border-border-subtle dark:border-foreground/10 border-b last:border-b-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            "group/item hover:bg-muted/40 dark:hover:bg-foreground/[0.04] pe-density-1 flex min-w-0 items-center transition-colors",
            open && "bg-surface-subtle/60 dark:bg-foreground/[0.035]",
          )}
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="focus-visible:ring-ring py-density-2-5 gap-x-density-2 flex h-auto min-h-0 min-w-0 flex-1 shrink items-center justify-start rounded-none ps-3 pe-2 text-left whitespace-normal hover:bg-transparent focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset dark:hover:bg-transparent"
              aria-label={accessibleLabel}
              aria-expanded={open}
              aria-controls={contentId}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  disabled
                    ? "bg-muted/50 text-faint-foreground dark:bg-foreground/[0.05]"
                    : "bg-muted/70 text-secondary-foreground dark:bg-foreground/10",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="gap-x-density-2 flex min-w-0 items-center">
                  <span
                    className={cn(
                      "text-foreground truncate text-sm font-medium",
                      disabled && "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                  <Badge
                    variant={OVERVIEW_SEVERITY_BADGE_VARIANTS[item.status]}
                    size="sm"
                    className="shrink-0"
                  >
                    {statusLabel}
                  </Badge>
                </span>
                {summaryLine ? (
                  <span className="text-muted-foreground mt-density-1 block truncate text-xs">
                    {summaryLine}
                  </span>
                ) : null}
              </span>
              <ChevronDown
                className={cn(
                  "text-faint-foreground group-hover/item:text-secondary-foreground dark:group-hover/item:text-secondary-foreground h-4 w-4 shrink-0 transition-transform",
                  open ? "rotate-180" : "",
                )}
              />
            </Button>
          </CollapsibleTrigger>

          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-faint-foreground hover:text-foreground shrink-0 opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100 max-sm:hidden pointer-coarse:opacity-100"
            aria-label={t("optionsOverview:automation.openItem", {
              name: label,
            })}
            onClick={() => onNavigate(item.primaryTarget)}
          >
            <WorkflowTransitionIcon className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <CollapsibleContent id={contentId}>
          <div className="pb-density-4 ps-3 pe-3">
            {item.autoCheckinPanel ? (
              <OverviewAutoCheckinPanel
                panel={item.autoCheckinPanel}
                t={t}
                onNavigate={onNavigate}
                embedded
              />
            ) : (
              <AutomationSummary
                item={item}
                t={t}
                onNavigate={onNavigate}
                disabled={disabled}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/**
 * Resolves whether an automation domain is turned off entirely.
 */
function isAutomationItemDisabled(item: OptionsOverviewAutomationItem) {
  if (item.autoCheckinPanel) {
    return item.autoCheckinPanel.status === AUTO_CHECKIN_PANEL_STATUSES.disabled
  }

  return item.statusLabel === AUTOMATION_STATUS_LABELS.disabled
}

/**
 * Renders summary facts and explicit actions for an expanded automation domain.
 */
function AutomationSummary({
  item,
  t,
  onNavigate,
  disabled,
}: {
  item: OptionsOverviewAutomationItem
  t: TFunction
  onNavigate: OverviewAutomationPanelProps["onNavigate"]
  disabled: boolean
}) {
  return (
    <div className="space-y-density-3">
      {disabled ? (
        <p className="text-muted-foreground text-sm leading-6">
          {getAutomationDisabledDescription(item.id, t)}
        </p>
      ) : (
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
      )}

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
