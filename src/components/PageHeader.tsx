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
  "gap-y-density-3 w-full min-w-0 justify-start gap-x-3 [@container(min-width:42rem)]:w-auto [@container(min-width:42rem)]:flex-initial [@container(min-width:42rem)]:justify-end",
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
      data-page-motion-item
      className={cn(
        "[container-type:inline-size] [overflow-wrap:anywhere]",
        spacing === "compact" ? "mb-density-4" : "mb-density-6",
        className,
      )}
    >
      <div className="grid grid-cols-1 gap-x-4 [@container(min-width:42rem)]:grid-cols-[minmax(16rem,1fr)_auto] [@container(min-width:42rem)]:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon
              className={cn(
                "text-muted-foreground size-6 shrink-0",
                iconClassName,
              )}
            />
            <div
              className="gap-y-density-2 flex min-w-0 items-center gap-x-2"
              data-testid={titleActionsTestId}
            >
              <Heading2 className="text-foreground tracking-tight">
                {title}
              </Heading2>
              {titleActions}
            </div>
          </div>
        </div>
        {description && (
          <BodySmall className="text-muted-foreground mt-density-1-5 max-w-prose leading-relaxed [@container(min-width:42rem)]:col-span-2 [@container(min-width:42rem)]:row-start-2">
            {description}
          </BodySmall>
        )}
        {actions && (
          <div
            className={cn(
              pageHeaderActionsClassName,
              "mt-density-4 [@container(min-width:42rem)]:col-start-2 [@container(min-width:42rem)]:row-start-1 [@container(min-width:42rem)]:mt-0",
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
