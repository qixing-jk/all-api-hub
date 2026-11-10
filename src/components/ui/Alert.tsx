import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"
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
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string
  description?: string
  action?: React.ReactNode
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
      action,
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
          return <CircleAlert className={iconClassName} />
        case "success":
          return <CircleCheck className={iconClassName} />
        case "warning":
          return <TriangleAlert className={iconClassName} />
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
        data-slot="alert"
        className={cn(
          alertVariants({ variant, compact }),
          showIcon
            ? "grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3"
            : action
              ? "grid grid-cols-1 gap-y-density-3"
              : "block",
          action &&
            (showIcon
              ? "gap-y-density-3 md:grid-cols-[auto_minmax(0,1fr)_auto]"
              : "md:grid-cols-[minmax(0,1fr)_auto]"),
          className,
        )}
        {...props}
      >
        {icon}
        <div className="ml-0 min-w-0 space-y-density-1-5">
          {title && (
            <Heading5 className="leading-none tracking-tight">{title}</Heading5>
          )}
          {description && (
            <div className="text-sm [&_p]:leading-relaxed">{description}</div>
          )}
          {children}
        </div>
        {action && (
          <div
            className={cn(
              "min-w-0",
              showIcon
                ? "col-start-2 md:col-start-3 md:row-start-1"
                : "md:col-start-2 md:row-start-1",
            )}
          >
            {action}
          </div>
        )}
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
    data-slot="alert-title"
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
    data-slot="alert-description"
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

/** Groups alert actions while allowing localized labels to wrap. */
function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-density-2",
        className,
      )}
      {...props}
    />
  )
}

export { AlertAction, Alert, AlertTitle, AlertDescription }
