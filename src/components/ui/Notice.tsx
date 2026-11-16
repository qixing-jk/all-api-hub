import React, { useId } from "react"

import { cn } from "~/lib/utils"

import { ActionGroup } from "./ActionGroup"
import { feedbackToneStyles, type FeedbackTone } from "./feedbackTone"

// General guidance follows the theme; explicit status tones keep their meaning.
export type NoticeTone = FeedbackTone

const NOTICE_SIZES = { Default: "default", Small: "sm" } as const

export type NoticeSize = (typeof NOTICE_SIZES)[keyof typeof NOTICE_SIZES]

const noticeToneStyles: Record<
  NoticeTone,
  {
    surface: string
    icon: string
  }
> = {
  default: {
    surface: "border-primary-soft-border bg-primary-soft",
    icon: "bg-primary-soft-hover text-primary-soft-foreground",
  },
  neutral: {
    surface:
      "border-border/60 bg-muted/40 text-muted-foreground dark:border-border/40 dark:bg-muted/20",
    icon: "bg-muted text-muted-foreground",
  },
  info: {
    surface: "border-info-border bg-info-soft",
    icon: "bg-info-soft text-info-soft-foreground",
  },
  warning: {
    surface: "border-warning-border bg-warning-soft",
    icon: "bg-warning-soft text-warning-soft-foreground",
  },
  success: {
    surface: "border-success-border bg-success-soft",
    icon: "bg-success-soft text-success-soft-foreground",
  },
  destructive: {
    surface: "border-destructive-border bg-destructive-soft",
    icon: "bg-destructive-soft text-destructive-soft-foreground",
  },
}

export const NOTICE_ACTION_LAYOUTS = {
  Below: "below",
  Inline: "inline",
} as const

export interface NoticeProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "title"
> {
  tone?: NoticeTone
  size?: NoticeSize
  title?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  iconWrapperClassName?: string
  actions?: React.ReactNode
  /** Inline actions sit beside the copy when the notice itself has enough room. */
  actionsLayout?: (typeof NOTICE_ACTION_LAYOUTS)[keyof typeof NOTICE_ACTION_LAYOUTS]
}

/**
 * Bounded contextual guidance with a title, details or grouped recovery actions.
 */
export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  (
    {
      className,
      tone = "default",
      size = NOTICE_SIZES.Default,
      title,
      description,
      icon,
      iconWrapperClassName,
      actions,
      actionsLayout = NOTICE_ACTION_LAYOUTS.Below,
      children,
      ...props
    },
    ref,
  ) => {
    const titleId = useId()
    const descriptionId = useId()
    const toneStyles = noticeToneStyles[tone]
    const DefaultIcon = feedbackToneStyles[tone].Icon
    const isCompact = size === NOTICE_SIZES.Small
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
          "@container/notice rounded-lg border px-3",
          isCompact
            ? "py-density-2 text-xs leading-normal"
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
                "flex shrink-0 items-center justify-center",
                title || !description
                  ? "text-sm leading-normal"
                  : isCompact
                    ? "text-xs leading-normal"
                    : "text-xs leading-[max(1.25rem,var(--font-size-xs--line-height))]",
                // Align to the first text line, including when the title wraps
                // or the user's text size changes.
                isCompact
                  ? "h-[1lh]"
                  : cn(
                      "mt-[calc((1lh-1.5rem)/2)] size-6 rounded-full",
                      toneStyles.icon,
                    ),
                iconWrapperClassName,
              )}
            >
              {resolvedIcon}
            </div>
          ) : null}
          <div
            className={cn(
              "min-w-0 flex-1",
              actionsLayout === NOTICE_ACTION_LAYOUTS.Inline &&
                "flex flex-col gap-density-1 @md/notice:flex-row @md/notice:gap-x-3",
            )}
          >
            <div className="min-w-0 flex-1">
              {title ? (
                <div
                  id={titleId}
                  className="text-sm leading-normal font-medium text-foreground"
                >
                  {title}
                </div>
              ) : null}
              {description ? (
                <p
                  id={descriptionId}
                  className={cn(
                    "text-xs",
                    isCompact
                      ? "leading-normal text-muted-foreground"
                      : "leading-[max(1.25rem,var(--font-size-xs--line-height))] text-muted-foreground dark:text-secondary-foreground",
                    !isCompact && title && "mt-0.5",
                  )}
                >
                  {description}
                </p>
              ) : null}
              {children}
            </div>
            {actions ? (
              <ActionGroup
                className={cn(
                  "max-w-full min-w-0 items-stretch justify-start [&_[data-slot=button][data-size=sm]]:text-xs",
                  actionsLayout === NOTICE_ACTION_LAYOUTS.Inline
                    ? "self-start @md/notice:self-center"
                    : isCompact
                      ? "mt-density-1"
                      : "mt-density-2",
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
