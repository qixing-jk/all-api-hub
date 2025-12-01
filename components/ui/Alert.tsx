import { cva, type VariantProps } from "class-variance-authority"
import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react"
import React from "react"

import { Heading5 } from "~/components/ui/Typography.tsx"
import { cn } from "~/lib/utils.ts"

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4",
  {
    variants: {
      variant: {
        default:
          "bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary border-gray-200 dark:border-dark-bg-tertiary",
        destructive:
          "bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-700",
        success:
          "bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700",
        warning:
          "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700",
        info: "bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
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
      title,
      description,
      showIcon = true,
      children,
      ...props
    },
    ref
  ) => {
    const getIcon = () => {
      if (!showIcon) return null

      switch (variant) {
        case "destructive":
          return <AlertCircle className="h-4 w-4" />
        case "success":
          return <CheckCircle className="h-4 w-4" />
        case "warning":
          return <AlertTriangle className="h-4 w-4" />
        case "info":
          return <Info className="h-4 w-4" />
        default:
          return <Info className="h-4 w-4" />
      }
    }

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}>
        {getIcon()}
        <div className="ml-0 space-y-1.5">
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
  }
)
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 leading-none font-medium tracking-tight", className)}
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
