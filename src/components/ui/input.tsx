import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

const inputVariants = cva(
  "file:text-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:border-dark-bg-tertiary placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
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
        default: "h-9",
        sm: "h-8 px-2 text-xs",
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
    Omit<VariantProps<typeof inputVariants>, "size"> {
  /**
   * Controls both the visual size variant and the native `<input size>` attribute.
   *
   * This component historically used `size` for styling variants (`"sm" | "default" | "lg"`).
   * Some call sites also need the native `size` attribute (character width). To stay
   * backward compatible, we interpret:
   *
   * - `"sm" | "default" | "lg"` (string) as the **visual** size variant (no `size` attribute is set)
   * - `number` as the **native** `<input size>` attribute (visual size falls back to default)
   */
  size?:
    | VariantProps<typeof inputVariants>["size"]
    | React.InputHTMLAttributes<HTMLInputElement>["size"]
  /**
   * Classes applied to the outer wrapper `<div>`.
   *
   * Use this for layout utilities (e.g. `w-full`, `flex-1`) so the component can
   * size correctly when used as a flex/grid item, while keeping `className`
   * reserved for styling the actual `<input>` element.
   */
  containerClassName?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  error?: string
  success?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      variant,
      size,
      leftIcon,
      rightIcon,
      error,
      success,
      ...props
    },
    ref,
  ) => {
    const inputVariant = error ? "error" : success ? "success" : variant
    const variantSize = typeof size === "string" ? size : undefined
    const nativeSize = typeof size === "number" ? size : undefined

    return (
      <div className={cn("relative", containerClassName)}>
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <span className="text-gray-400 dark:text-gray-500">{leftIcon}</span>
          </div>
        )}
        <input
          className={cn(
            inputVariants({
              variant: inputVariant,
              size: variantSize,
              className,
            }),
            leftIcon && "pl-10",
            rightIcon && "pr-10",
          )}
          size={nativeSize}
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
