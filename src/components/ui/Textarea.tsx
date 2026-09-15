import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import {
  ClearableFieldButton,
  getClearableFieldValue,
} from "~/components/ui/clearableField"
import { cn } from "~/lib/utils"

const textareaVariants = cva(
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-faint-foreground text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-vertical",
  {
    variants: {
      variant: {
        default: "",
        error:
          "border-destructive-border focus:ring-destructive-text focus:border-destructive-text",
        success:
          "border-success-border focus:ring-success-text focus:border-success-text",
      },
      size: {
        default: "min-h-16",
        sm: "min-h-14 px-2 py-1 text-xs",
        lg: "min-h-20 px-4 py-3",
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
  onClear?: () => void
  clearButtonLabel?: string
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
      onClear,
      clearButtonLabel = "Clear",
      ...props
    },
    ref,
  ) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
    const textareaVariant = error ? "error" : success ? "success" : variant
    const currentLength = typeof value === "string" ? value.length : 0
    const showClearButton =
      Boolean(onClear) &&
      getClearableFieldValue(value).length > 0 &&
      !props.disabled &&
      !props.readOnly

    const setTextareaRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node

        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref],
    )

    const focusTextareaAfterClear = () => {
      const focusTextarea = () => textareaRef.current?.focus()

      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(focusTextarea)
        return
      }

      focusTextarea()
    }

    return (
      <div className="relative">
        <textarea
          className={cn(
            textareaVariants({ variant: textareaVariant, size, className }),
            showClearButton && "pr-10",
          )}
          ref={setTextareaRef}
          value={value}
          maxLength={maxLength}
          {...props}
        />
        {showClearButton && (
          <ClearableFieldButton
            label={clearButtonLabel}
            onClick={() => {
              onClear?.()
              focusTextareaAfterClear()
            }}
            className="absolute top-2 right-2"
          />
        )}
        {(error || success) && (
          <p
            className={cn(
              "mt-1 text-xs",
              error ? "text-destructive-text" : "text-success-text",
            )}
          >
            {error || success}
          </p>
        )}
        {showCount && maxLength && (
          <div className="text-faint-foreground absolute right-2 bottom-2 text-xs">
            {currentLength}/{maxLength}
          </div>
        )}
      </div>
    )
  },
)
Textarea.displayName = "Textarea"

export { Textarea, textareaVariants }
