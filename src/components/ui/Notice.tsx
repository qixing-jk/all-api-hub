import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"
import React, { useId } from "react"

import { cn } from "~/lib/utils"

type NoticeTone = "info" | "warning" | "success" | "destructive"

const noticeToneStyles: Record<
  NoticeTone,
  {
    surface: string
    icon: string
    Icon: React.ComponentType<{ className?: string }>
  }
> = {
  info: {
    surface:
      "border-blue-200/70 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20",
    icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200",
    Icon: Info,
  },
  warning: {
    surface:
      "border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/25",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200",
    Icon: TriangleAlert,
  },
  success: {
    surface:
      "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/25",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200",
    Icon: CircleCheck,
  },
  destructive: {
    surface:
      "border-red-200/80 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/25",
    icon: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200",
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
      tone = "info",
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
        aria-live="polite"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "rounded-lg border p-3 shadow-xs",
          toneStyles.surface,
          className,
        )}
        {...props}
      >
        <div className="flex gap-2.5">
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
              <div
                id={titleId}
                className="dark:text-dark-text-primary text-sm leading-5 font-medium text-gray-900"
              >
                {title}
              </div>
            ) : null}
            {description ? (
              <p
                id={descriptionId}
                className="dark:text-dark-text-secondary mt-0.5 text-xs leading-5 text-gray-600"
              >
                {description}
              </p>
            ) : null}
            {children}
            {actions ? (
              <div className="mt-2 flex flex-wrap gap-2">{actions}</div>
            ) : null}
          </div>
        </div>
      </div>
    )
  },
)
Notice.displayName = "Notice"
