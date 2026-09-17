import { Fragment, useId, type HTMLAttributes, type ReactNode } from "react"

import {
  ToggleButton,
  type ToggleButtonProps,
} from "~/components/ui/ToggleButton"
import { ANIMATIONS, COLORS, CORNERS } from "~/constants/designTokens"
import { cn } from "~/lib/utils"

export interface SegmentedControlOption<Value extends string> {
  value: Value
  label: ReactNode
  ariaLabel?: string
  description?: ReactNode
  title?: string
  disabled?: boolean
  testId?: string
  buttonClassName?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

interface SegmentedControlProps<Value extends string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  value: Value
  options: readonly SegmentedControlOption<Value>[]
  onValueChange: (value: Value) => void
  size?: ToggleButtonProps["size"]
  layout?: "responsive" | "fit" | "fill"
}

/**
 * Controlled single selection with native button keyboard activation.
 * Responsive settings groups expand on narrow cards; compact chart controls fit their labels.
 */
export function SegmentedControl<Value extends string>({
  value,
  options,
  onValueChange,
  size = "default",
  layout = "responsive",
  className,
  ...props
}: SegmentedControlProps<Value>) {
  const id = useId()
  return (
    <div
      role="group"
      className={cn(
        `${COLORS.background.tertiary} corners-concentric py-density-1 max-w-full flex-wrap rounded-xl px-1 [--corner-inset:4px] ${CORNERS.buttonItems} ${ANIMATIONS.transition.base}`,
        layout === "responsive" &&
          "flex w-full [@container(min-width:42rem)]:w-auto",
        layout === "fit" && "inline-flex",
        layout === "fill" && "flex w-full",
        className,
      )}
      {...props}
    >
      {options.map((option, index) => {
        const descriptionId = option.description
          ? `${id}-${index}-help`
          : undefined
        return (
          <Fragment key={option.value}>
            <ToggleButton
              type="button"
              onClick={() => onValueChange(option.value)}
              isActive={value === option.value}
              disabled={option.disabled}
              size={size}
              title={option.title}
              aria-label={option.ariaLabel}
              aria-describedby={descriptionId}
              data-testid={option.testId}
              leftIcon={option.leftIcon}
              rightIcon={option.rightIcon}
              className={cn(
                "min-w-fit scale-100 focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                layout === "responsive" &&
                  "flex-1 [@container(min-width:42rem)]:flex-none",
                layout === "fill" && "flex-1",
                option.buttonClassName,
              )}
            >
              {option.label}
            </ToggleButton>
            {descriptionId && (
              <span id={descriptionId} className="sr-only">
                {option.description}
              </span>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
