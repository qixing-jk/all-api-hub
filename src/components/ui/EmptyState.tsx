import React from "react"

import { cn } from "~/lib/utils"

import { Button } from "./button"

export type EmptyStateAction = {
  label: string
  onClick: () => void
  variant?: React.ComponentProps<typeof Button>["variant"]
  icon?: React.ReactNode
  disabled?: boolean
  loading?: boolean
}

export interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: EmptyStateAction
  actions?: EmptyStateAction[]
  className?: string
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, actions, className }, ref) => {
    const resolvedActions = actions ?? (action ? [action] : [])

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center py-12 text-center",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center text-gray-300 dark:text-gray-600">
          {icon}
        </div>
        <p className="dark:text-dark-text-secondary mb-4 text-sm text-gray-500">
          {title}
        </p>
        {description && (
          <p className="dark:text-dark-text-tertiary mb-4 text-sm text-gray-400">
            {description}
          </p>
        )}
        {resolvedActions.length === 1 ? (
          <Button
            variant={resolvedActions[0].variant || "default"}
            onClick={resolvedActions[0].onClick}
            leftIcon={resolvedActions[0].icon}
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
                leftIcon={resolvedAction.icon}
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
