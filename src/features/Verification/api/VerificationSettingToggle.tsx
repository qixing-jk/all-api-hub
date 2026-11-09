import type { ComponentProps, ReactNode } from "react"

import { Switch } from "~/components/ui"
import { cn } from "~/lib/utils"

/** Shared labelled test option; callers retain the setting and its disabled policy. */
export function VerificationSettingToggle({
  label,
  hint,
  hintId,
  className,
  ...props
}: ComponentProps<typeof Switch> & {
  id: string
  label: ReactNode
  hint: ReactNode
  hintId?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="space-y-1">
        <label
          htmlFor={props.id}
          className="text-foreground text-sm font-medium"
        >
          {label}
        </label>
        <p
          id={hintId}
          className="text-muted-foreground text-xs leading-relaxed"
        >
          {hint}
        </p>
      </div>
      <Switch size="sm" {...props} />
    </div>
  )
}
