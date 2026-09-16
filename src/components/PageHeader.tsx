import type { ComponentType, ReactNode } from "react"

import { BodySmall, Heading2 } from "~/components/ui"
import { actionGroupClassName } from "~/components/ui/ActionGroup"
import { cn } from "~/lib/utils"

interface PageHeaderProps {
  icon: ComponentType<{ className?: string }>
  title: ReactNode
  titleActions?: ReactNode
  titleActionsTestId?: string
  description?: ReactNode
  actions?: ReactNode
  spacing?: "default" | "compact"
  className?: string
  iconClassName?: string
}

export const pageHeaderActionsClassName = actionGroupClassName(
  "wrap",
  "gap-y-density-3 w-full min-w-0 justify-start gap-x-3 [@container(min-width:42rem)]:w-auto [@container(min-width:42rem)]:flex-1 [@container(min-width:42rem)]:justify-end",
)

/**
 * Shared section header for pages with icon, title, description, and action slots.
 * @param props Component props bundle.
 * @param props.icon Icon component rendered next to the title.
 * @param props.title Header title node.
 * @param props.titleActions Optional compact action elements rendered next to the title.
 * @param props.titleActionsTestId Optional test id for the title action container.
 * @param props.description Optional helper text shown below the title.
 * @param props.actions Optional action elements rendered on the right.
 * @param props.spacing Adjusts vertical spacing (default or compact).
 * @param props.className Extra class names for the container.
 * @param props.iconClassName Extra class names passed to the icon.
 */
export function PageHeader({
  icon: Icon,
  title,
  titleActions,
  titleActionsTestId,
  description,
  actions,
  spacing = "default",
  className,
  iconClassName,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "[container-type:inline-size]",
        spacing === "compact" ? "mb-density-6" : "mb-density-8",
        className,
      )}
    >
      <div className="gap-y-density-2 [@container(min-width:42rem)]:gap-y-density-4 flex flex-col gap-x-2 [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-start [@container(min-width:42rem)]:justify-between [@container(min-width:42rem)]:gap-x-4">
        <div className="gap-y-density-3 flex min-w-0 items-center gap-x-3">
          <Icon
            className={cn(
              "text-theme-600 dark:text-theme-400 h-6 w-6 shrink-0",
              iconClassName,
            )}
          />
          <div
            className="gap-y-density-2 flex min-w-0 items-center gap-x-2"
            data-testid={titleActionsTestId}
          >
            <Heading2 className="text-foreground">{title}</Heading2>
            {titleActions}
          </div>
        </div>
        {actions && <div className={pageHeaderActionsClassName}>{actions}</div>}
      </div>
      {description && (
        <BodySmall className="dark:text-secondary-foreground text-muted-foreground mt-density-2">
          {description}
        </BodySmall>
      )}
    </div>
  )
}
