import React from "react"

import { cn } from "~/lib/utils"

import { feedbackToneStyles, type FeedbackTone } from "./feedbackTone"

const inlineMessageSizes = { default: "text-sm", sm: "text-xs" } as const

interface InlineMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: FeedbackTone
  size?: keyof typeof inlineMessageSizes
  icon?: React.ReactNode
}

/** Short contextual copy and inline actions, with status color confined to the icon. */
export const InlineMessage = React.forwardRef<
  HTMLDivElement,
  InlineMessageProps
>(
  (
    {
      className,
      tone = "neutral",
      size = "default",
      icon,
      role = "status",
      children,
      ...props
    },
    ref,
  ) => {
    const { Icon, indicator: iconClassName } = feedbackToneStyles[tone]
    const resolvedIcon = icon === undefined ? <Icon className="size-4" /> : icon
    return (
      <div
        ref={ref}
        role={role}
        aria-live={
          role === "alert"
            ? "assertive"
            : role === "status"
              ? "polite"
              : undefined
        }
        aria-atomic="true"
        data-slot="inline-message"
        data-tone={tone}
        className={cn(
          "flex items-start gap-x-2 leading-normal text-muted-foreground",
          inlineMessageSizes[size],
          className,
        )}
        {...props}
      >
        {resolvedIcon ? (
          <span
            aria-hidden="true"
            className={cn("flex h-[1lh] shrink-0 items-center", iconClassName)}
          >
            {resolvedIcon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 wrap-anywhere">{children}</div>
      </div>
    )
  },
)
InlineMessage.displayName = "InlineMessage"
