import type { ReactNode } from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CollapsibleSection,
  Heading3,
} from "~/components/ui"
import { ACCOUNT_EDIT_SECTIONS } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import { useIsSmallScreen } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"

interface AccountFormSectionProps {
  title: string
  description?: string
  headerAction?: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  testId: string
  id?: string
  children: ReactNode
  continuous?: boolean
  contentClassName?: string
}

/**
 * Responsive section wrapper for the account form.
 * Continuous forms use flat sections; other callers retain responsive cards/panels.
 */
export function AccountFormSection({
  title,
  description,
  headerAction,
  defaultOpen = false,
  open,
  onOpenChange,
  testId,
  id,
  children,
  continuous = false,
  contentClassName,
}: AccountFormSectionProps) {
  const isSmallScreen = useIsSmallScreen()
  const Icon = ACCOUNT_EDIT_SECTIONS.find((section) => section.id === id)?.icon

  if (continuous) {
    return (
      <section
        id={id}
        aria-labelledby={`${id}-heading`}
        data-account-form-section=""
        data-testid={testId}
        data-layout="continuous"
        className="relative -mx-3 min-w-0 scroll-mt-24 border-t border-border px-3 pt-density-6 pb-density-6 first:border-t-0 first:pt-0 lg:scroll-mt-3"
      >
        <span
          aria-hidden="true"
          data-navigation-feedback=""
          className="pointer-events-none absolute inset-0 rounded-lg opacity-0 ring-2 ring-theme-500 ring-offset-2 ring-offset-popover dark:ring-theme-400"
        />
        <div
          className={cn(
            "mb-density-4",
            headerAction &&
              "flex flex-wrap items-center justify-between gap-x-density-3 gap-y-density-1",
          )}
        >
          <Heading3
            id={`${id}-heading`}
            tabIndex={-1}
            className="flex min-w-0 items-center gap-2.5 text-base outline-none"
          >
            {Icon && (
              <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
            {title}
          </Heading3>
          {headerAction}
          {description && (
            <p className="mt-1 basis-full text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div className={contentClassName ?? "space-y-density-4"}>
          {children}
        </div>
      </section>
    )
  }

  if (isSmallScreen) {
    return (
      <div
        className="scroll-mt-2 rounded-lg"
        data-testid={testId}
        id={id}
        data-default-open={defaultOpen ? "true" : "false"}
        data-layout="mobile-collapsible"
      >
        <CollapsibleSection
          title={
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {title}
              </div>
              {description && (
                <div className="mt-density-1 text-xs text-muted-foreground dark:text-secondary-foreground">
                  {description}
                </div>
              )}
            </div>
          }
          defaultOpen={defaultOpen}
          open={open}
          onOpenChange={onOpenChange}
          className="rounded-lg border border-border bg-card px-3 py-density-2 shadow-sm"
          buttonClassName="rounded-md px-0 py-0 text-left hover:bg-transparent"
          panelClassName="mt-density-3 border-0 bg-transparent p-0"
        >
          <div className="space-y-density-4">
            {headerAction}
            {children}
          </div>
        </CollapsibleSection>
      </div>
    )
  }

  return (
    <div
      className="scroll-mt-2 rounded-lg"
      data-testid={testId}
      id={id}
      data-default-open={defaultOpen ? "true" : "false"}
      data-layout="desktop-card"
    >
      <Card
        variant="default"
        padding="none"
        className="overflow-hidden shadow-sm"
      >
        <CardHeader padding="sm">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
          {headerAction && <CardAction>{headerAction}</CardAction>}
        </CardHeader>
        <CardContent padding="sm" spacing="sm">
          {children}
        </CardContent>
      </Card>
    </div>
  )
}
