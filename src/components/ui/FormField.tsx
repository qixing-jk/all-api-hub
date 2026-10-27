import React from "react"

import { cn } from "~/lib/utils"

import { Label } from "./label"

export interface FormFieldProps {
  label?: React.ReactNode
  labelAction?: React.ReactNode
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
      labelAction,
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
    const fieldLabel = label && (
      <Label
        htmlFor={htmlFor}
        required={required}
        variant={error ? "error" : success ? "success" : "default"}
        className={labelClassName}
      >
        {label}
      </Label>
    )
    return (
      <div ref={ref} className={cn("space-y-density-2", className)} {...props}>
        {labelAction ? (
          <div className="gap-density-2 flex items-center justify-between">
            {fieldLabel}
            {labelAction}
          </div>
        ) : (
          fieldLabel
        )}
        {children}
        {description && !error && !success && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
        {error && <p className="text-destructive-text text-xs">{error}</p>}
        {success && <p className="text-success-text text-xs">{success}</p>}
      </div>
    )
  },
)
FormField.displayName = "FormField"

export { FormField }
