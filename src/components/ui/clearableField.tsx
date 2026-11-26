import { XIcon } from "lucide-react"
import React from "react"

import { cn } from "~/lib/utils"

type ClearableFieldValue = string | number | readonly string[] | undefined

/**
 * Converts supported input values into a string for emptiness checks.
 */
function getClearableFieldValue(value: ClearableFieldValue) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.join("")
  }

  return ""
}

interface ClearableFieldButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  showNativeTooltip?: boolean
}

/**
 * Renders the compact clear button used by clearable form fields.
 */
function ClearableFieldButton({
  className,
  label,
  showNativeTooltip = true,
  ...props
}: ClearableFieldButtonProps) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        "flex size-(--density-control-xs) shrink-0 items-center justify-center rounded-full text-faint-foreground transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none dark:hover:text-secondary-foreground",
        className,
      )}
      aria-label={label}
      title={showNativeTooltip ? label : undefined}
    >
      <XIcon className="size-4" />
    </button>
  )
}

export { ClearableFieldButton, getClearableFieldValue }
