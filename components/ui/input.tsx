import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

const inputVariants = cva(
  "w-full rounded-md border border-gray-300 dark:border-dark-bg-tertiary bg-white dark:bg-dark-bg-secondary px-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
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
        default: "h-10",
        sm: "h-9 px-2 text-xs",
        lg: "h-11 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  error?: string
  success?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, variant, size, leftIcon, rightIcon, error, success, ...props },
    ref,
  ) => {
    const inputVariant = error ? "error" : success ? "success" : variant

    return (
      <div className="relative">
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <span className="text-gray-400 dark:text-gray-500">{leftIcon}</span>
          </div>
        )}
        <input
          className={cn(
            inputVariants({ variant: inputVariant, size, className }),
            leftIcon && "pl-10",
            rightIcon && "pr-10",
          )}
          ref={ref}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            <span className="text-gray-400 dark:text-gray-500">
              {rightIcon}
            </span>
          </div>
        )}
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
      </div>
    )
  },
)
Input.displayName = "Input"

export { Input, inputVariants }
