import type { TFunction } from "i18next"

import { Badge, Card, WorkflowTransitionButton } from "~/components/ui"
import { cn } from "~/lib/utils"

import { OPTIONS_OVERVIEW_CONFIGURATION_STATUSES as CONFIGURATION_STATUSES } from "../ids"
import type {
  OptionsOverviewActionCenterItem,
  OptionsOverviewConfigurationSubItem,
} from "../types"
import {
  getActionCenterDescription,
  getActionCenterLabel,
  getActionCenterStateDescription,
  getActionCenterStatusLabel,
  getConfigurationSubItemLabel,
} from "./actionCenterText"
import { OVERVIEW_CONFIGURATION_BADGE_VARIANTS } from "./overviewPresentation"

interface OverviewActionCenterProps {
  items: OptionsOverviewActionCenterItem[]
  t: TFunction
  onNavigate: (target: OptionsOverviewConfigurationSubItem["target"]) => void
}

const statusClasses = {
  [CONFIGURATION_STATUSES.configured]:
    "border-border/80 bg-card/95 hover:border-theme-200 hover:bg-theme-50/35 dark:border-foreground/10 dark:bg-foreground/[0.03] dark:hover:border-theme-900/70 dark:hover:bg-theme-950/10",
  [CONFIGURATION_STATUSES.disabled]:
    "border-border/80 bg-card/80 hover:border-border-strong hover:bg-surface-subtle dark:border-foreground/10 dark:bg-foreground/[0.025] dark:hover:border-foreground/20",
  [CONFIGURATION_STATUSES.needsSetup]:
    "border-border/80 bg-card/95 hover:border-warning-border hover:bg-warning-soft dark:border-foreground/10 dark:bg-foreground/[0.03]",
  [CONFIGURATION_STATUSES.notApplicable]:
    "border-border/70 bg-card/65 hover:border-border-strong hover:bg-surface-subtle/80 dark:border-foreground/10 dark:bg-transparent dark:hover:border-foreground/20",
} as const

/**
 * Summarizes capability readiness without duplicating the sidebar navigation.
 */
export function OverviewActionCenter({
  items,
  t,
  onNavigate,
}: OverviewActionCenterProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items
        .filter((item) => item.isVisible)
        .map((item) => (
          <Card
            key={item.id}
            className={cn(
              "shadow-border/50 dark:shadow-shadow/20 h-full shadow-sm transition-colors",
              statusClasses[item.status],
            )}
          >
            <div className="flex min-h-28 flex-col gap-3 p-4">
              <div className="min-w-0 space-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="text-foreground truncate text-sm font-semibold">
                    {getActionCenterLabel(item.id, t)}
                  </div>
                  <Badge
                    variant={OVERVIEW_CONFIGURATION_BADGE_VARIANTS[item.status]}
                    size="sm"
                  >
                    {getActionCenterStatusLabel(item.status, t)}
                  </Badge>
                </div>
                <div className="dark:text-secondary-foreground text-muted-foreground text-sm leading-6">
                  {getActionCenterDescription(item.id, t)}
                </div>
                {item.status !== CONFIGURATION_STATUSES.configured ? (
                  <div className="text-muted-foreground text-xs leading-5">
                    {getActionCenterStateDescription(item, t)}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2">
                {item.subItems.map((subItem) => (
                  <ConfigurationSubItemButton
                    key={subItem.id}
                    subItem={subItem}
                    t={t}
                    onClick={() => onNavigate(subItem.target)}
                  />
                ))}
              </div>
            </div>
          </Card>
        ))}
    </div>
  )
}
/**
 * Renders a shared-button entrypoint for one nested configuration destination.
 */
function ConfigurationSubItemButton({
  subItem,
  t,
  onClick,
}: {
  subItem: OptionsOverviewConfigurationSubItem
  t: TFunction
  onClick: () => void
}) {
  const label = getConfigurationSubItemLabel(subItem.id, t)

  return (
    <WorkflowTransitionButton
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      className="group border-border/70 bg-card/65 hover:border-theme-200 hover:bg-theme-50/40 dark:border-foreground/10 dark:bg-foreground/[0.035] dark:hover:border-theme-900/70 dark:hover:bg-theme-950/10 [&>span:last-child_svg]:text-faint-foreground [&>span:last-child_svg]:group-hover:text-muted-foreground dark:[&>span:last-child_svg]:group-hover:text-secondary-foreground h-auto min-h-0 w-full min-w-0 shrink justify-between px-3 py-2 text-left whitespace-normal [&>span:last-child_svg]:h-3.5 [&>span:last-child_svg]:w-3.5 [&>span:last-child_svg]:transition-transform [&>span:last-child_svg]:group-hover:translate-x-0.5"
      onClick={onClick}
    >
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="text-secondary-foreground truncate text-xs font-medium">
          {label}
        </span>
        <Badge
          variant={OVERVIEW_CONFIGURATION_BADGE_VARIANTS[subItem.status]}
          size="sm"
        >
          {getActionCenterStatusLabel(subItem.status, t)}
        </Badge>
      </span>
    </WorkflowTransitionButton>
  )
}
