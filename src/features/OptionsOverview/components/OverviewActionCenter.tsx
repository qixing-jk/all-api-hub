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
    "border-slate-200/80 bg-white/95 hover:border-blue-200 hover:bg-blue-50/35 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-blue-900/70 dark:hover:bg-blue-950/10",
  [CONFIGURATION_STATUSES.disabled]:
    "border-slate-200/80 bg-white/80 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-white/20",
  [CONFIGURATION_STATUSES.needsSetup]:
    "border-slate-200/80 bg-white/95 hover:border-amber-200 hover:bg-amber-50/25 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-amber-900/70 dark:hover:bg-amber-950/10",
  [CONFIGURATION_STATUSES.notApplicable]:
    "border-slate-200/70 bg-white/65 hover:border-slate-300 hover:bg-slate-50/80 dark:border-white/10 dark:bg-transparent dark:hover:border-white/20",
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
              "h-full shadow-sm shadow-slate-200/50 transition-colors dark:shadow-black/20",
              statusClasses[item.status],
            )}
          >
            <div className="flex min-h-28 flex-col gap-3 p-4">
              <div className="min-w-0 space-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="dark:text-dark-text-primary truncate text-sm font-semibold text-slate-950">
                    {getActionCenterLabel(item.id, t)}
                  </div>
                  <Badge
                    variant={OVERVIEW_CONFIGURATION_BADGE_VARIANTS[item.status]}
                    size="sm"
                  >
                    {getActionCenterStatusLabel(item.status, t)}
                  </Badge>
                </div>
                <div className="dark:text-dark-text-secondary text-sm leading-6 text-slate-600">
                  {getActionCenterDescription(item.id, t)}
                </div>
                {item.status !== CONFIGURATION_STATUSES.configured ? (
                  <div className="dark:text-dark-text-tertiary text-xs leading-5 text-slate-500">
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
      className="group h-auto w-full min-w-0 shrink justify-between border-slate-200/70 bg-white/65 px-3 py-2 text-left whitespace-normal hover:border-blue-200 hover:bg-blue-50/40 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-blue-900/70 dark:hover:bg-blue-950/10 [&>span:last-child_svg]:h-3.5 [&>span:last-child_svg]:w-3.5 [&>span:last-child_svg]:text-slate-400 [&>span:last-child_svg]:transition-transform [&>span:last-child_svg]:group-hover:translate-x-0.5 [&>span:last-child_svg]:group-hover:text-slate-600 dark:[&>span:last-child_svg]:text-slate-500 dark:[&>span:last-child_svg]:group-hover:text-slate-300"
      onClick={onClick}
    >
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
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
