import type { HTMLAttributes } from "react"

import { cn } from "~/lib/utils"

export type ActionGroupLayout = "wrap" | "stack-on-narrow"

export interface ActionGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Controls whether narrow layouts wrap actions or stack them vertically. */
  layout?: ActionGroupLayout
}

/** Resolves the shared action layout for runtime CSS validation. */
export function actionGroupClassName(
  layout: ActionGroupLayout,
  className?: string,
) {
  return cn(
    "gap-y-density-2 flex gap-x-2",
    layout === "stack-on-narrow"
      ? "flex-col-reverse sm:flex-row sm:justify-end"
      : "flex-wrap items-center justify-end",
    className,
  )
}

/**
 * Groups related actions with the shared responsive layout used by cards,
 * dialogs, and transient prompts.
 */
export function ActionGroup({
  className,
  layout = "wrap",
  ...props
}: ActionGroupProps) {
  return (
    <div
      role="group"
      data-slot="action-group"
      className={actionGroupClassName(layout, className)}
      {...props}
    />
  )
}
