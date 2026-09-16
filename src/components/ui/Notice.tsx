import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"
import React, { useId } from "react"

import { cn } from "~/lib/utils"

// General guidance follows the theme; explicit status tones keep their meaning.
type NoticeTone = "default" | "info" | "warning" | "success" | "destructive"

const noticeToneStyles: Record<
  NoticeTone,
  {
    surface: string
    icon: string
    Icon: React.ComponentType<{ className?: string }>
  }
> = {
  default: {
    surface: "border-primary-soft-border bg-primary-soft",
    icon: "bg-primary-soft-hover text-primary-soft-foreground",
    Icon: Info,
  },
  info: {
    surface: "border-info-border bg-info-soft",
    icon: "bg-info-soft text-info-soft-foreground",
    Icon: Info,
  },
  warning: {
    surface: "border-warning-border bg-warning-soft",
    icon: "bg-warning-soft text-warning-soft-foreground",
    Icon: TriangleAlert,
  },
  success: {
    surface: "border-success-border bg-success-soft",
    icon: "bg-success-soft text-success-soft-foreground",
    Icon: CircleCheck,
  },
  destructive: {
    surface: "border-destructive-border bg-destructive-soft",
    icon: "bg-destructive-soft text-destructive-soft-foreground",
    Icon: CircleAlert,
  },
}

export interface NoticeProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: NoticeTone
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
}

/**
 * Lightweight non-blocking notice for contextual guidance and recoverable states.
 */
export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  (
    {
      className,
      tone = "default",
      title,
      description,
      icon,
      actions,
      children,
      ...props
    },
    ref,
  ) => {
    const titleId = useId()
    const descriptionId = useId()
    const toneStyles = noticeToneStyles[tone]
    const DefaultIcon = toneStyles.Icon
    const resolvedIcon =
      icon === undefined ? <DefaultIcon className="h-3.5 w-3.5" /> : icon

    return (
      <div
        ref={ref}
        role="status"
        data-tone={tone}
        aria-live="polite"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "py-density-3 rounded-lg border px-3 shadow-xs",
          toneStyles.surface,
          className,
        )}
        {...props}
      >
        <div className="gap-y-density-2-5 flex gap-x-2.5">
          {resolvedIcon ? (
            <div
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                toneStyles.icon,
              )}
            >
              {resolvedIcon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <div id={titleId} className="text-foreground text-sm font-medium">
                {title}
              </div>
            ) : null}
            {description ? (
              <p
                id={descriptionId}
                className="dark:text-secondary-foreground text-muted-foreground mt-0.5 text-xs leading-[max(1.25rem,var(--font-size-xs--line-height))]"
              >
                {description}
              </p>
            ) : null}
            {children}
            {actions ? (
              <div className="mt-density-2 gap-y-density-2 flex flex-wrap gap-x-2">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  },
)
Notice.displayName = "Notice"
