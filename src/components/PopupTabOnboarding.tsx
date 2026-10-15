import { Plus } from "lucide-react"
import type React from "react"
import type { ComponentType, ReactNode } from "react"

import { Button } from "~/components/ui"
import { cn } from "~/lib/utils"

export interface PopupTabOnboardingAction {
  label: string
  onClick: () => void
  leftIcon?: ReactNode
  analyticsAction?: React.ComponentProps<typeof Button>["analyticsAction"]
  testId?: string
}

export interface PopupTabOnboardingProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon: ComponentType<{
    className?: string
    "aria-hidden"?: boolean | "true" | "false"
  }>
  title: ReactNode
  titleId?: string
  description: ReactNode
  action?: PopupTabOnboardingAction
  extra?: ReactNode
  sponsors?: ReactNode
  padded?: boolean
}

/**
 * Unified onboarding layout for popup tabs (Accounts, Bookmarks, Credentials)
 * when no items exist. Presents a branded icon badge, title, description,
 * primary full-width action button, optional footnote (e.g. Notice), and
 * sponsor recommendations.
 */
export function PopupTabOnboarding({
  icon: Icon,
  title,
  titleId,
  description,
  action,
  extra,
  sponsors,
  padded = true,
  className,
  ...props
}: PopupTabOnboardingProps) {
  return (
    <div
      className={cn(
        "space-y-density-3",
        padded && "py-density-3 sm:py-density-4 px-3 sm:px-4",
        className,
      )}
      {...props}
    >
      <div className="gap-y-density-3 flex flex-col">
        <div className="gap-y-density-1-5 flex flex-col">
          <div className="flex items-center gap-x-2">
            <div className="bg-primary-soft text-primary-soft-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
              <Icon aria-hidden="true" className="size-3.5" />
            </div>
            <h2
              id={titleId}
              className="text-foreground text-sm leading-snug font-semibold sm:text-base"
            >
              {title}
            </h2>
          </div>
          <p className="dark:text-secondary-foreground text-muted-foreground text-xs leading-5 sm:text-sm">
            {description}
          </p>
        </div>
        {(action || extra) && (
          <div className="gap-y-density-2 flex flex-col">
            {action && (
              <Button
                className="w-full"
                onClick={action.onClick}
                leftIcon={
                  action.leftIcon ?? (
                    <Plus aria-hidden="true" className="size-4" />
                  )
                }
                size="sm"
                analyticsAction={action.analyticsAction}
                data-testid={action.testId}
              >
                {action.label}
              </Button>
            )}
            {extra}
          </div>
        )}
      </div>
      {sponsors}
    </div>
  )
}
