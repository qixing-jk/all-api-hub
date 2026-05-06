import type { ReactNode } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CollapsibleSection,
} from "~/components/ui"
import { useIsSmallScreen } from "~/hooks/useMediaQuery"

interface AccountFormSectionProps {
  title: string
  description?: string
  defaultOpen?: boolean
  testId: string
  children: ReactNode
}

/**
 * Responsive section wrapper for the account form.
 * Desktop uses static cards while mobile uses collapsible panels.
 */
export function AccountFormSection({
  title,
  description,
  defaultOpen = false,
  testId,
  children,
}: AccountFormSectionProps) {
  const isSmallScreen = useIsSmallScreen()

  if (isSmallScreen) {
    return (
      <div
        data-testid={testId}
        data-default-open={defaultOpen ? "true" : "false"}
        data-layout="mobile-collapsible"
      >
        <CollapsibleSection
          title={
            <div className="min-w-0">
              <div className="dark:text-dark-text-primary truncate text-sm font-medium text-gray-900">
                {title}
              </div>
              {description && (
                <div className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
                  {description}
                </div>
              )}
            </div>
          }
          defaultOpen={defaultOpen}
          className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm"
          buttonClassName="rounded-md px-0 py-0 text-left hover:bg-transparent dark:hover:bg-transparent"
          panelClassName="mt-3 border-0 bg-transparent p-0"
        >
          <div className="space-y-4">{children}</div>
        </CollapsibleSection>
      </div>
    )
  }

  return (
    <div
      data-testid={testId}
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
