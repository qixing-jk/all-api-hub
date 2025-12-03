import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

import { BodySmall, Heading3 } from "./Typography"

const cardVariants = cva(
  "rounded-lg border bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary",
  {
    variants: {
      variant: {
        default: "border-gray-200 dark:border-dark-bg-tertiary shadow-sm",
        elevated: "border-gray-200 dark:border-dark-bg-tertiary shadow-md",
        interactive:
          "border-gray-200 dark:border-dark-bg-tertiary shadow-sm hover:shadow-md transition-shadow cursor-pointer",
        outlined: "border-gray-300 dark:border-gray-600 shadow-none",
        ghost: "border-transparent shadow-none",
      },
      padding: {
        none: "p-0",
        default: "p-0",
        sm: "p-2 sm:p-3",
        md: "p-4 sm:p-6",
        lg: "p-6 sm:p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "default",
    },
  },
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding, className }))}
      {...props}
    />
  ),
)
Card.displayName = "Card"

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to show a bottom border. Defaults to true */
  bordered?: boolean
  /** Padding size. Defaults to "default" (px-6 py-4) */
  padding?: "none" | "sm" | "default" | "lg"
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, bordered = true, padding = "default", ...props }, ref) => {
    const paddingClasses = {
      none: "",
      sm: "px-4 py-3",
      default: "px-6 py-4",
      lg: "px-8 py-6",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col space-y-1.5",
          bordered && "dark:border-dark-bg-tertiary border-b border-gray-200",
          paddingClasses[padding],
          className,
        )}
        {...props}
      />
    )
  },
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <Heading3
    ref={ref}
    className={cn("leading-none tracking-tight", className)}
    {...props}
  >
    {children}
  </Heading3>
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => (
  <BodySmall
    ref={ref}
    className={cn("dark:text-dark-text-secondary text-gray-600", className)}
    {...props}
  >
    {children}
  </BodySmall>
))
CardDescription.displayName = "CardDescription"

const cardContentVariants = cva("", {
  variants: {
    padding: {
      none: "p-0",
      sm: "p-3",
      default: "p-4",
      md: "p-6",
      lg: "p-8",
    },
    spacing: {
      none: "",
      sm: "space-y-2",
      default: "space-y-4",
      md: "space-y-6",
      lg: "space-y-8",
    },
  },
  defaultVariants: {
    padding: "default",
    spacing: "default",
  },
})

export interface CardContentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardContentVariants> {}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding, spacing, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardContentVariants({ padding, spacing }), className)}
        {...props}
      />
    )
  },
)

CardContent.displayName = "CardContent"

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to show a top border. Defaults to true */
  bordered?: boolean
  /** Padding size. Defaults to "default" (px-6 py-4) */
  padding?: "none" | "sm" | "default" | "lg"
}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, bordered = true, padding = "default", ...props }, ref) => {
    const paddingClasses = {
      none: "",
      sm: "px-4 py-3",
      default: "px-6 py-4",
      lg: "px-8 py-6",
    }

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-end space-x-3",
          bordered && "dark:border-dark-bg-tertiary border-t border-gray-200",
          paddingClasses[padding],
          className,
        )}
        {...props}
      />
    )
  },
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
