import { cva, type VariantProps } from "class-variance-authority"
import { Eye, EyeOff } from "lucide-react"
import React from "react"

import {
  ClearableFieldButton,
  getClearableFieldValue,
} from "~/components/ui/clearableField"
import { IconButton } from "~/components/ui/IconButton"
import { cn } from "~/lib/utils"

const inputVariants = cva(
  "file:text-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-(--density-control) w-full min-w-0 rounded-md border bg-transparent px-3 py-density-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive placeholder:text-faint-foreground text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
  {
    variants: {
      variant: {
        default: "",
        error:
          "border-destructive-border focus:ring-destructive-text focus:border-destructive-text focus-visible:border-destructive-text focus-visible:ring-destructive-text/40",
        success:
          "border-success-border focus:ring-success-text focus:border-success-text focus-visible:border-success-text focus-visible:ring-success-text/40",
      },
      size: {
        default: "h-(--density-control)",
        sm: "h-(--density-control-sm) px-2 text-xs",
        lg: "h-(--density-input-lg) px-4",
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
  revealable?: boolean
  revealed?: boolean
  defaultRevealed?: boolean
  onRevealedChange?: (revealed: boolean) => void
  revealLabels?: {
    show: string
    hide: string
  }
  onClear?: () => void
  clearButtonLabel?: string
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
      revealable = false,
      revealed,
      defaultRevealed = false,
      onRevealedChange,
      revealLabels = {
        show: "Show password",
        hide: "Hide password",
      },
      onClear,
      clearButtonLabel = "Clear",
      error,
      success,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const [internalRevealed, setInternalRevealed] =
      React.useState(defaultRevealed)
    const inputVariant = error ? "error" : success ? "success" : variant
    const variantSize = typeof size === "string" ? size : undefined
    const nativeSize = typeof size === "number" ? size : undefined
    const showRevealButton = revealable && props.type === "password"
    const isRevealed = revealed ?? internalRevealed
    const showClearButton =
      Boolean(onClear) &&
      getClearableFieldValue(props.value).length > 0 &&
      !props.disabled &&
      !props.readOnly
    const showRightContent =
      Boolean(rightIcon) || showRevealButton || showClearButton
    const rightContentCount =
      Number(Boolean(rightIcon)) +
      Number(showRevealButton) +
      Number(showClearButton)
    const rightPaddingClass =
      rightContentCount >= 3
        ? "pr-[calc(var(--density-control-sm)*3+1rem)]"
        : rightContentCount === 2
          ? "pr-[calc(var(--density-control-sm)*2+1rem)]"
          : rightContentCount === 1
            ? "pr-[calc(var(--density-control-sm)+0.75rem)]"
            : ""
    const inputType = showRevealButton && isRevealed ? "text" : props.type

    const handleRevealToggle = () => {
      const nextRevealed = !isRevealed
      if (revealed === undefined) {
        setInternalRevealed(nextRevealed)
      }
      onRevealedChange?.(nextRevealed)
    }

    const setInputRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node

        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref],
    )

    const focusInputAfterClear = () => {
      const focusInput = () => inputRef.current?.focus()

      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(focusInput)
        return
      }

      focusInput()
    }

    return (
      <div className={cn("relative", containerClassName)}>
        {leftIcon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <span className="text-faint-foreground">{leftIcon}</span>
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
            rightPaddingClass,
          )}
          size={nativeSize}
          ref={setInputRef}
          {...props}
          type={inputType}
        />
        {showRightContent && (
          <div className="gap-y-density-1 pointer-events-none absolute inset-y-0 right-0 flex items-center gap-x-1 pr-2">
            {rightIcon && (
              <span className="text-faint-foreground pointer-events-auto">
                {rightIcon}
              </span>
            )}
            {showRevealButton && (
              <span className="text-faint-foreground pointer-events-auto">
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleRevealToggle}
                  disabled={props.disabled}
                  aria-label={
                    isRevealed ? revealLabels.hide : revealLabels.show
                  }
                >
                  {isRevealed ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </IconButton>
              </span>
            )}
            {showClearButton && (
              <ClearableFieldButton
                label={clearButtonLabel}
                onClick={() => {
                  onClear?.()
                  focusInputAfterClear()
                }}
                className="pointer-events-auto"
              />
            )}
          </div>
        )}
        {(error || success) && (
          <p
            className={cn(
              "mt-density-1 text-xs",
              error ? "text-destructive-text" : "text-success-text",
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
