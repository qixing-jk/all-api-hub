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

interface ClearableFieldButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
}

/**
 * Renders the compact clear button used by clearable form fields.
 */
function ClearableFieldButton({
  className,
  label,
  ...props
}: ClearableFieldButtonProps) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        "text-faint-foreground hover:text-muted-foreground focus-visible:ring-ring dark:hover:text-secondary-foreground flex size-(--density-control-xs) shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        className,
      )}
      aria-label={label}
      title={label}
    >
      <XIcon className="size-4" />
    </button>
  )
}

export { ClearableFieldButton, getClearableFieldValue }
