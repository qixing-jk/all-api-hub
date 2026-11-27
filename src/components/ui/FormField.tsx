import React from "react"

import { cn } from "~/lib/utils"

import { Label } from "./label"

type FieldControlProps = Pick<
  React.ComponentProps<"input">,
  "id" | "aria-describedby" | "aria-invalid" | "disabled" | "required"
>

export interface FormFieldProps {
  label?: React.ReactNode
  /** Help or other secondary controls adjacent to, but outside, the input label. */
  labelAccessory?: React.ReactNode
  labelAction?: React.ReactNode
  /** Allow wide actions to move below the label on narrow layouts. */
  wrapLabelAction?: boolean
  required?: boolean
  disabled?: boolean
  error?: string
  errors?: readonly ({ message?: string } | undefined)[]
  success?: string
  description?: string
  /** Render props explicitly associate a control; composite children are never cloned. */
  children: React.ReactNode | ((control: FieldControlProps) => React.ReactNode)
  orientation?: "vertical" | "horizontal" | "responsive"
  className?: string
  labelClassName?: string
  htmlFor?: string
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  (
    {
      label,
      labelAccessory,
      labelAction,
      wrapLabelAction = false,
      required,
      disabled,
      error,
      errors,
      success,
      description,
      children,
      orientation = "vertical",
      className,
      labelClassName,
      htmlFor,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId()
    const controlId = htmlFor ?? generatedId
    const messages = [
      ...new Set(
        [error, ...(errors ?? []).map((item) => item?.message)].filter(
          (message): message is string => Boolean(message),
        ),
      ),
    ]
    const invalid = messages.length > 0
    const descriptionId = `${controlId}-description`
    const errorId = `${controlId}-error`
    const successId = `${controlId}-success`
    const control: FieldControlProps = {
      id: controlId,
      "aria-invalid": invalid || undefined,
      "aria-describedby":
        [
          description && descriptionId,
          invalid && errorId,
          !invalid && success && successId,
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      disabled,
      required,
    }
    return (
      <div
        ref={ref}
        data-slot="field"
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        data-orientation={orientation}
        className={cn(
          "group/field grid content-start gap-y-density-2",
          orientation === "horizontal" &&
            "grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-x-4",
          orientation === "responsive" &&
            "sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start sm:gap-x-4",
          className,
        )}
        {...props}
      >
        {(label || labelAction) && (
          <div
            className={cn(
              "flex items-center justify-between gap-x-density-2 gap-y-density-1",
              wrapLabelAction && "flex-wrap",
            )}
          >
            {label && (
              <div className="inline-flex min-w-0 items-center gap-x-1 gap-y-density-1">
                <Label
                  htmlFor={
                    htmlFor ??
                    (typeof children === "function" ? controlId : undefined)
                  }
                  required={required}
                  variant={invalid ? "error" : success ? "success" : "default"}
                  className={labelClassName}
                >
                  {label}
                </Label>
                {labelAccessory}
              </div>
            )}
            {labelAction}
          </div>
        )}
        <div
          data-slot="field-content"
          className="grid min-w-0 grid-cols-1 gap-y-density-2"
        >
          {typeof children === "function" ? children(control) : children}
          {description && (
            <p
              id={descriptionId}
              data-slot="field-description"
              className="text-xs text-muted-foreground"
            >
              {description}
            </p>
          )}
          {invalid && (
            <div
              id={errorId}
              role="alert"
              data-slot="field-error"
              className="text-xs text-destructive-text"
            >
              {messages.length === 1 ? (
                messages[0]
              ) : (
                <ul className="list-disc space-y-1 pl-4">
                  {messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!invalid && success && (
            <p id={successId} className="text-xs text-success-text">
              {success}
            </p>
          )}
        </div>
      </div>
    )
  },
)
FormField.displayName = "FormField"

export { FormField }
