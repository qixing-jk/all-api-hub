import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

const textareaVariants = cva(
  "flex w-full rounded-md border border-gray-300 dark:border-dark-bg-tertiary bg-white dark:bg-dark-bg-secondary px-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-vertical",
  {
    variants: {
      variant: {
        default: "",
        error:
          "border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500",
        success:
          "border-green-300 dark:border-green-600 focus:ring-green-500 focus:border-green-500",
      },
      size: {
        default: "min-h-16",
        sm: "min-h-14 px-2 py-1 text-xs",
        lg: "min-h-18 px-4 py-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {
  error?: string
  success?: string
  showCount?: boolean
  maxLength?: number
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      variant,
      size,
      error,
      success,
      showCount,
      maxLength,
      value,
      ...props
    },
    ref,
  ) => {
    const textareaVariant = error ? "error" : success ? "success" : variant
    const currentLength = typeof value === "string" ? value.length : 0

    return (
      <div className="relative">
        <textarea
          className={cn(
            textareaVariants({ variant: textareaVariant, size, className }),
          )}
          ref={ref}
          value={value}
          maxLength={maxLength}
          {...props}
        />
        {(error || success) && (
          <p
            className={cn(
              "mt-1 text-xs",
              error
                ? "text-red-600 dark:text-red-400"
                : "text-green-600 dark:text-green-400",
            )}
          >
            {error || success}
          </p>
        )}
        {showCount && maxLength && (
          <div className="absolute right-2 bottom-2 text-xs text-gray-400 dark:text-gray-500">
            {currentLength}/{maxLength}
          </div>
        )}
      </div>
    )
  },
)
Textarea.displayName = "Textarea"

export { Textarea, textareaVariants }
