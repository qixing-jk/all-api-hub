import type { ReactNode } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CollapsibleSection,
  Heading3,
} from "~/components/ui"
import { ACCOUNT_EDIT_SECTIONS } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import { useIsSmallScreen } from "~/hooks/useMediaQuery"

interface AccountFormSectionProps {
  title: string
  description?: string
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
        className="border-border pt-density-6 pb-density-6 relative -mx-3 min-w-0 scroll-mt-24 border-t px-3 first:border-t-0 first:pt-0 lg:scroll-mt-3"
      >
        <span
          aria-hidden="true"
          data-navigation-feedback=""
          className="ring-theme-500 ring-offset-popover dark:ring-theme-400 pointer-events-none absolute inset-0 rounded-lg opacity-0 ring-2 ring-offset-2"
        />
        <div className="mb-density-4">
          <Heading3
            id={`${id}-heading`}
            tabIndex={-1}
            className="flex items-center gap-2.5 text-base outline-none"
          >
            {Icon && (
              <Icon
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
            )}
            {title}
          </Heading3>
          {description && (
            <p className="text-muted-foreground mt-1 text-xs">{description}</p>
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
              <div className="text-foreground truncate text-sm font-medium">
                {title}
              </div>
              {description && (
                <div className="dark:text-secondary-foreground text-muted-foreground mt-density-1 text-xs">
                  {description}
                </div>
              )}
            </div>
          }
          defaultOpen={defaultOpen}
          open={open}
          onOpenChange={onOpenChange}
          className="border-border bg-card py-density-2 rounded-lg border px-3 shadow-sm"
          buttonClassName="rounded-md px-0 py-0 text-left hover:bg-transparent"
          panelClassName="mt-density-3 border-0 bg-transparent p-0"
        >
          <div className="space-y-density-4">{children}</div>
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
        </CardHeader>
        <CardContent padding="sm" spacing="sm">
          {children}
        </CardContent>
      </Card>
    </div>
  )
}
