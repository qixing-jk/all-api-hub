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
      className={cn(emphasized && "border-blue-200/80 dark:border-blue-900/60")}
      data-testid={testId}
    >
      <CardContent
        spacing="none"
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Compass className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1 max-w-2xl leading-5">
              {description}
            </CardDescription>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      </CardContent>
    </Card>
  )
}
