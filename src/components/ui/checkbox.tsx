import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import * as React from "react"

import { cn } from "~/lib/utils"

/**
 * Checkbox renders a styled Radix checkbox with consistent focus and validation states.
 */
function Checkbox({
  checked,
  className,
  defaultChecked,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const isControlled = checked !== undefined
  const [uncontrolledChecked, setUncontrolledChecked] = React.useState(
    defaultChecked ?? false,
  )
  const currentChecked = isControlled ? checked : uncontrolledChecked

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={currentChecked}
      className={cn(
        "peer relative size-4 shrink-0 rounded-micro border border-input shadow-xs transition-shadow outline-none after:absolute after:-inset-1 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      onCheckedChange={(nextChecked) => {
        if (!isControlled) {
          setUncontrolledChecked(nextChecked)
        }

        onCheckedChange?.(nextChecked)
      }}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        {currentChecked === "indeterminate" ? (
          <MinusIcon
            aria-hidden="true"
            className="size-3.5"
            data-slot="checkbox-indeterminate-icon"
          />
        ) : (
          <CheckIcon
            aria-hidden="true"
            className="size-3.5"
            data-slot="checkbox-checked-icon"
          />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
