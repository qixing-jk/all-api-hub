import type { ComponentType, ReactNode } from "react"

import { BodySmall, Heading2 } from "~/components/ui"
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
        spacing === "compact" ? "mb-6" : "mb-8",
        className,
      )}
    >
      <div className="flex flex-col gap-2 [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-start [@container(min-width:42rem)]:justify-between [@container(min-width:42rem)]:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Icon
            className={cn(
              "h-6 w-6 shrink-0 text-blue-600 dark:text-blue-400",
              iconClassName,
            )}
          />
          <div
            className="flex min-w-0 items-center gap-2"
            data-testid={titleActionsTestId}
          >
            <Heading2 className="dark:text-dark-text-primary text-gray-900">
              {title}
            </Heading2>
            {titleActions}
          </div>
        </div>
        {actions && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-3 [&_[data-slot=button]]:h-auto [&_[data-slot=button]]:min-h-9 [&_[data-slot=button]]:max-w-full [&_[data-slot=button]]:whitespace-normal [&_[data-slot=button][data-size=default]]:min-h-9 [&_[data-slot=button][data-size=icon-lg]]:min-h-10 [&_[data-slot=button][data-size=icon-sm]]:min-h-8 [&_[data-slot=button][data-size=icon-xs]]:min-h-6 [&_[data-slot=button][data-size=icon]]:min-h-9 [&_[data-slot=button][data-size=lg]]:min-h-10 [&_[data-slot=button][data-size=sm]]:min-h-8 [@container(min-width:42rem)]:w-auto [@container(min-width:42rem)]:flex-1 [@container(min-width:42rem)]:justify-end">
            {actions}
          </div>
        )}
      </div>
      {description && (
        <BodySmall className="dark:text-dark-text-secondary mt-2 text-gray-600">
          {description}
        </BodySmall>
      )}
    </div>
  )
}
