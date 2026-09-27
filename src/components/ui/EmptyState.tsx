import React from "react"

import { cn } from "~/lib/utils"

import { Button } from "./button"

export type EmptyStateAction = {
  label: string
  loadingLabel?: string
  onClick: () => void
  variant?: React.ComponentProps<typeof Button>["variant"]
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  /** @deprecated Prefer `leftIcon`. When both are set, `leftIcon` takes precedence. */
  icon?: React.ReactNode
  disabled?: boolean
  loading?: boolean
  testId?: string
  analyticsAction?: React.ComponentProps<typeof Button>["analyticsAction"]
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

/** Renders an empty-state action with shared loading, icon, and analytics semantics. */
function EmptyStateActionButton({ action }: { action: EmptyStateAction }) {
  return (
    <Button
      variant={action.variant || "default"}
      onClick={action.onClick}
      leftIcon={action.leftIcon ?? action.icon}
      rightIcon={action.rightIcon}
      disabled={action.disabled}
      loading={action.loading}
      data-testid={action.testId}
      analyticsAction={action.analyticsAction}
    >
      {action.loading ? action.loadingLabel ?? action.label : action.label}
    </Button>
  )
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
          "py-density-12 flex flex-col items-center text-center",
          className,
        )}
        role={isDestructive ? "alert" : "status"}
        aria-live={isDestructive ? "assertive" : "polite"}
      >
        <div
          className={cn(
            "text-disabled-foreground mb-density-4 flex h-12 w-12 items-center justify-center",
            isDestructive && "text-destructive-indicator",
          )}
        >
          {icon}
        </div>
        <p
          className={cn(
            "text-secondary-foreground mb-density-4 text-sm font-medium",
            isDestructive && "text-foreground font-semibold",
          )}
        >
          {title}
        </p>
        {description && (
          <p
            className={cn(
              "dark:text-muted-foreground text-faint-foreground mb-density-4 text-sm",
              isDestructive && "leading-6",
              descriptionClassName,
            )}
          >
            {description}
          </p>
        )}
        {resolvedActions.length === 1 ? (
          <EmptyStateActionButton action={resolvedActions[0]} />
        ) : resolvedActions.length > 1 ? (
          <div className="gap-y-density-2 flex flex-col items-center gap-x-2 sm:flex-row sm:justify-center">
            {resolvedActions.map((resolvedAction, index) => (
              <EmptyStateActionButton
                key={`${resolvedAction.label}-${index}`}
                action={resolvedAction}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  },
)
EmptyState.displayName = "EmptyState"
