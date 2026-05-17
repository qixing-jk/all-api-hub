import type { HTMLAttributes, ReactNode } from "react"

import {
  ToggleButton,
  type ToggleButtonProps,
} from "~/components/ui/ToggleButton"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { cn } from "~/lib/utils"

type ResponsiveButtonGroupVariant = "segmented" | "plain"

export const responsiveButtonGroupItemClassName =
  "min-w-fit flex-1 [@container(min-width:42rem)]:flex-none"

interface ResponsiveButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  variant?: ResponsiveButtonGroupVariant
}

/**
 * Renders a settings button group that wraps on narrow cards and uses natural width on wider cards.
 */
export function ResponsiveButtonGroup({
  children,
  className,
  variant = "segmented",
  ...props
}: ResponsiveButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(
        "flex w-full flex-wrap [@container(min-width:42rem)]:w-auto",
        variant === "segmented"
          ? `${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`
          : "gap-2",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export interface ResponsiveToggleGroupOption<Value extends string> {
  value: Value
  label: ReactNode
  ariaLabel?: string
  title?: string
  disabled?: boolean
  buttonClassName?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

interface ResponsiveToggleGroupProps<Value extends string>
  extends Omit<ResponsiveButtonGroupProps, "children"> {
  value: Value
  options: ResponsiveToggleGroupOption<Value>[]
  onValueChange: (value: Value) => void
  buttonSize?: ToggleButtonProps["size"]
  showActiveIndicator?: boolean
}

/**
 * Renders a responsive group of ToggleButton options with shared narrow-card behavior.
 * Prefer this for 2-3 short options; use Select for larger sets or long labels.
 */
export function ResponsiveToggleGroup<Value extends string>({
  value,
  options,
  onValueChange,
  buttonSize = "default",
  showActiveIndicator = false,
  ...groupProps
}: ResponsiveToggleGroupProps<Value>) {
  return (
    <ResponsiveButtonGroup {...groupProps}>
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          onClick={() => onValueChange(option.value)}
          isActive={value === option.value}
          disabled={option.disabled}
          size={buttonSize}
          showActiveIndicator={showActiveIndicator}
          title={option.title}
          aria-label={option.ariaLabel}
          leftIcon={option.leftIcon}
          rightIcon={option.rightIcon}
          className={cn(
            responsiveButtonGroupItemClassName,
            option.buttonClassName,
          )}
        >
          {option.label}
        </ToggleButton>
      ))}
    </ResponsiveButtonGroup>
  )
}
