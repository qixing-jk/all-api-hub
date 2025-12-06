import type { ComponentType, ReactNode } from "react"

import { BodySmall, Heading2 } from "~/components/ui"
import { cn } from "~/lib/utils"

interface PageHeaderProps {
  icon: ComponentType<{ className?: string }>
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  spacing?: "default" | "compact"
  className?: string
  iconClassName?: string
}

/**
 * Shared section header for options pages with icon, title, description, and action slots.
 * @param props Component props bundle.
 * @param props.icon Icon component rendered next to the title.
 * @param props.title Header title node.
 * @param props.description Optional helper text shown below the title.
 * @param props.actions Optional action elements rendered on the right.
 * @param props.spacing Adjusts vertical spacing (default or compact).
 * @param props.className Extra class names for the container.
 * @param props.iconClassName Extra class names passed to the icon.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  spacing = "default",
  className,
  iconClassName,
}: PageHeaderProps) {
  return (
    <div className={cn(spacing === "compact" ? "mb-6" : "mb-8", className)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="flex items-center gap-3">
          <Icon
            className={cn(
              "h-6 w-6 text-blue-600 dark:text-blue-400",
              iconClassName,
            )}
          />
          <Heading2 className="dark:text-dark-text-primary text-gray-900">
            {title}
          </Heading2>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
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
