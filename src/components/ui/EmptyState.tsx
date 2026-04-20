import React from "react"

import { cn } from "~/lib/utils"

import { Button } from "./button"

export type EmptyStateAction = {
  label: string
  onClick: () => void
  variant?: React.ComponentProps<typeof Button>["variant"]
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  /** @deprecated Prefer `leftIcon`. When both are set, `leftIcon` takes precedence. */
  icon?: React.ReactNode
  disabled?: boolean
  loading?: boolean
}

export interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: EmptyStateAction
  actions?: EmptyStateAction[]
  variant?: "default" | "destructive"
  className?: string
  descriptionClassName?: string
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon,
      title,
      description,
      action,
      actions,
      variant = "default",
      className,
      descriptionClassName,
    },
    ref,
  ) => {
    const resolvedActions = actions ?? (action ? [action] : [])
    const isDestructive = variant === "destructive"

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center py-12 text-center",
          className,
        )}
        role={isDestructive ? "alert" : "status"}
        aria-live={isDestructive ? "assertive" : "polite"}
      >
        <div
          className={cn(
            "mb-4 flex h-12 w-12 items-center justify-center text-gray-300 dark:text-gray-600",
            isDestructive && "text-destructive",
          )}
        >
          {icon}
        </div>
        <p
          className={cn(
            "dark:text-dark-text-secondary mb-4 text-sm font-medium text-gray-700",
            isDestructive &&
              "dark:text-dark-text-primary font-semibold text-gray-900",
          )}
        >
          {title}
        </p>
        {description && (
          <p
            className={cn(
              "dark:text-dark-text-tertiary mb-4 text-sm text-gray-400",
              isDestructive && "leading-6",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        )}
        {resolvedActions.length === 1 ? (
          <Button
            variant={resolvedActions[0].variant || "default"}
            onClick={resolvedActions[0].onClick}
            leftIcon={resolvedActions[0].leftIcon ?? resolvedActions[0].icon}
            rightIcon={resolvedActions[0].rightIcon}
            disabled={resolvedActions[0].disabled}
            loading={resolvedActions[0].loading}
          >
            {resolvedActions[0].label}
          </Button>
        ) : resolvedActions.length > 1 ? (
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            {resolvedActions.map((resolvedAction, index) => (
              <Button
                key={`${resolvedAction.label}-${index}`}
                variant={resolvedAction.variant || "default"}
                onClick={resolvedAction.onClick}
                leftIcon={resolvedAction.leftIcon ?? resolvedAction.icon}
                rightIcon={resolvedAction.rightIcon}
                disabled={resolvedAction.disabled}
                loading={resolvedAction.loading}
              >
                {resolvedAction.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    )
  },
)
EmptyState.displayName = "EmptyState"
