import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react"
import React from "react"

import { Heading5 } from "~/components/ui/Typography"
import { cn } from "~/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-density-4",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground border-border",
        // Emphasized guidance uses the theme; info is reserved for information states.
        primary:
          "bg-primary-soft text-primary-soft-foreground border-primary-soft-border",
        destructive:
          "bg-destructive-soft text-destructive-soft-foreground border-destructive-border",
        success:
          "bg-success-soft text-success-soft-foreground border-success-border",
        warning:
          "bg-warning-soft text-warning-soft-foreground border-warning-border",
        info: "bg-info-soft text-info-soft-foreground border-info-border",
      },
      compact: {
        false: "",
        true: "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-density-3 px-3 py-density-3",
      },
    },
    defaultVariants: {
      variant: "default",
      compact: false,
    },
  },
)

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string
  description?: string
  showIcon?: boolean
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      variant,
      compact,
      title,
      description,
      showIcon = true,
      children,
      ...props
    },
    ref,
  ) => {
    const getIcon = () => {
      if (!showIcon) return null

      const iconClassName = cn("h-4 w-4", compact && "mt-0.5 shrink-0")

      switch (variant) {
        case "destructive":
          return <AlertCircle className={iconClassName} />
        case "success":
          return <CheckCircle className={iconClassName} />
        case "warning":
          return <AlertTriangle className={iconClassName} />
        case "info":
          return <Info className={iconClassName} />
        default:
          return <Info className={iconClassName} />
      }
    }

    const icon = getIcon()

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          alertVariants({ variant, compact }),
          showIcon
            ? "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3"
            : "block",
          className,
        )}
        {...props}
      >
        {icon}
        <div className={cn("space-y-density-1-5 ml-0", compact && "min-w-0")}>
          {title && (
            <Heading5 className="leading-none tracking-tight">{title}</Heading5>
          )}
          {description && (
            <div className="text-sm [&_p]:leading-relaxed">{description}</div>
          )}
          {children}
        </div>
      </div>
    )
  },
)
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn(
      "mb-density-1 leading-none font-medium tracking-tight",
      className,
    )}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
