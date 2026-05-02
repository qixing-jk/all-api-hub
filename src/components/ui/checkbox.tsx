import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"
import * as React from "react"

import { cn } from "~/lib/utils"

/**
 * Checkbox renders a styled Radix checkbox with consistent focus and validation states.
 */
function Checkbox({
  checked,
  className,
  defaultChecked,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const iconState = checked ?? defaultChecked

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={checked}
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground dark:data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      defaultChecked={defaultChecked}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        {iconState === "indeterminate" ? (
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
