import React from "react"

import { cn } from "~/lib/utils"

import { Label } from "./label"

export interface FormFieldProps {
  label?: string
  required?: boolean
  error?: string
  success?: string
  description?: string
  children: React.ReactNode
  className?: string
  labelClassName?: string
  htmlFor?: string
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      label,
      required,
      error,
      success,
      description,
      children,
      className,
      labelClassName,
      htmlFor,
      ...props
    },
    ref,
  ) => {
    return (
      <div ref={ref} className={cn("space-y-2", className)} {...props}>
        {label && (
          <Label
            htmlFor={htmlFor}
            required={required}
            variant={error ? "error" : success ? "success" : "default"}
            className={labelClassName}
          >
            {label}
          </Label>
        )}
        {children}
        {description && !error && !success && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        {success && (
          <p className="text-xs text-green-600 dark:text-green-400">
            {success}
          </p>
        )}
      </div>
    )
  },
)
FormField.displayName = "FormField"

export { FormField }
