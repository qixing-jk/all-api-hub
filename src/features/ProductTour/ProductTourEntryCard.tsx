import { Compass } from "lucide-react"
import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardTitle } from "~/components/ui"
import { cn } from "~/lib/utils"

interface ProductTourEntryCardProps {
  actions: ReactNode
  description: ReactNode
  emphasized?: boolean
  id?: string
  testId: string
  title: ReactNode
}

/** Shared visual frame for the first-run invitation and the persistent replay entry. */
export function ProductTourEntryCard({
  actions,
  description,
  emphasized = false,
  id,
  testId,
  title,
}: ProductTourEntryCardProps) {
  return (
    <Card
      id={id}
      className={cn(
        emphasized && "border-theme-200/80 dark:border-theme-900/60",
      )}
      data-testid={testId}
    >
      <CardContent
        spacing="none"
        className="gap-y-density-4 flex flex-col gap-x-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="gap-y-density-3 flex min-w-0 gap-x-3">
          <div className="bg-theme-50 text-theme-600 dark:bg-theme-950/60 dark:text-theme-400 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Compass className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-density-1 max-w-2xl leading-5">
              {description}
            </CardDescription>
          </div>
        </div>
        <div className="gap-y-density-2 flex w-full shrink-0 items-center justify-end gap-x-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      </CardContent>
    </Card>
  )
}
