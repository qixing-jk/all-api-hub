import { XIcon } from "lucide-react"
import React from "react"

import { cn } from "~/lib/utils"

type ClearableFieldValue = string | number | readonly string[] | undefined

/**
 *
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
 *
 */
function ClearableFieldButton({
  className,
  label,
  ...props
}: ClearableFieldButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-gray-500 dark:hover:text-gray-300",
        className,
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      <XIcon className="size-4" />
    </button>
  )
}

export { ClearableFieldButton, getClearableFieldValue }
