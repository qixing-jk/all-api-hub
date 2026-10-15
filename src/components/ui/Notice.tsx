import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"
import React, { useId } from "react"

import { cn } from "~/lib/utils"

import { ActionGroup } from "./ActionGroup"

// General guidance follows the theme; explicit status tones keep their meaning.
export type NoticeTone =
  | "default"
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "destructive"

export type NoticeSize = "default" | "sm"

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
  neutral: {
    surface:
      "border-border/60 bg-muted/40 text-muted-foreground dark:border-border/40 dark:bg-muted/20",
    icon: "bg-muted text-muted-foreground",
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
  size?: NoticeSize
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  iconWrapperClassName?: string
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
      size = "default",
      title,
      description,
      icon,
      iconWrapperClassName,
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
    const isCompact = size === "sm"
    const resolvedIcon =
      icon === undefined ? (
        <DefaultIcon
          className={cn("h-3.5 w-3.5", isCompact && "text-muted-foreground")}
        />
      ) : (
        icon
      )

    return (
      <div
        ref={ref}
        role="status"
        data-tone={tone}
        aria-live="polite"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "rounded-lg border px-3",
          isCompact
            ? "py-density-2 text-xs leading-5"
            : "py-density-3 shadow-xs",
          toneStyles.surface,
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "flex gap-x-2.5",
            isCompact ? "items-start" : "gap-y-density-2-5",
          )}
        >
          {resolvedIcon ? (
            <div
              aria-hidden="true"
              className={cn(
                isCompact
                  ? "mt-0.5 flex shrink-0 items-center justify-center"
                  : cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                      toneStyles.icon,
                    ),
                iconWrapperClassName,
              )}
            >
              {resolvedIcon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <div
                id={titleId}
                className={cn(
                  "text-foreground font-medium",
                  isCompact ? "text-xs" : "text-sm",
                )}
              >
                {title}
              </div>
            ) : null}
            {description ? (
              <p
                id={descriptionId}
                className={cn(
                  "text-xs leading-[max(1.25rem,var(--font-size-xs--line-height))]",
                  isCompact
                    ? "text-muted-foreground"
                    : "dark:text-secondary-foreground text-muted-foreground mt-0.5",
                )}
              >
                {description}
              </p>
            ) : null}
            {children}
            {actions ? (
              <ActionGroup
                className={cn(
                  "items-stretch justify-start",
                  isCompact ? "mt-density-1-5" : "mt-density-2",
                )}
              >
                {actions}
              </ActionGroup>
            ) : null}
          </div>
        </div>
      </div>
    )
  },
)
Notice.displayName = "Notice"
