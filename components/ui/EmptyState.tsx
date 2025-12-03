import React from "react"

import { cn } from "~/lib/utils"

import { Button, type ButtonProps } from "./button"

export interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    variant?: ButtonProps["variant"]
    icon?: React.ReactNode
  }
  className?: string
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("py-12 text-center", className)}
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center text-gray-300 dark:text-gray-600">
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
        {action && (
          <Button
            variant={action.variant || "default"}
            onClick={action.onClick}
            leftIcon={action.icon}
            className="mx-auto"
          >
            {action.label}
          </Button>
        )}
      </div>
    )
  },
)
EmptyState.displayName = "EmptyState"
