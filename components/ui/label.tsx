import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "~/lib/utils"

const labelVariants = cva(
  "inline-flex items-center gap-1 text-sm font-medium leading-none select-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  {
    variants: {
      variant: {
        default: "text-foreground",
        error: "text-destructive",
        success: "text-emerald-600 dark:text-emerald-400",
      },
      size: {
        default: "text-sm",
        sm: "text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
  VariantProps<typeof labelVariants> & {
    required?: boolean
    hint?: React.ReactNode
  }

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, variant, size, required, hint, children, ...props }, ref) => {
  return (
    <LabelPrimitive.Root
      ref={ref}
      data-slot="label"
      className={cn(labelVariants({ variant, size }), className)}
      {...props}
    >
      {children}
      {required && <span className="text-destructive">*</span>}
      {hint && (
        <span className="text-muted-foreground text-xs font-normal">
          {hint}
        </span>
      )}
    </LabelPrimitive.Root>
  )
})
Label.displayName = LabelPrimitive.Root.displayName

export { Label, labelVariants }
