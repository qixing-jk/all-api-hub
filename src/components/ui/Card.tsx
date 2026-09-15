import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

import { BodySmall, Heading3 } from "./Typography"

const cardEdgePaddingClasses = {
  none: "",
  sm: "px-4 py-density-3",
  default: "px-6 py-density-4",
  lg: "px-8 py-density-6",
} as const

const cardVariants = cva(
  "rounded-lg corners-concentric [--corner-inset:1px] border bg-card text-foreground",
  {
    variants: {
      variant: {
        default: "border-border shadow-sm",
        elevated: "border-border shadow-md",
        interactive:
          "border-border shadow-sm hover:shadow-md transition-shadow",
        outlined: "border-border-strong shadow-none",
        ghost: "border-transparent shadow-none",
      },
      padding: {
        none: "p-0",
        default: "p-0",
        sm: "px-2 py-density-2 [--corner-inset:calc(--spacing(2)+1px)] sm:px-3 sm:py-density-3 sm:[--corner-inset:calc(--spacing(3)+1px)]",
        md: "px-4 py-density-4 [--corner-inset:calc(--spacing(4)+1px)] sm:px-6 sm:py-density-6 sm:[--corner-inset:calc(--spacing(6)+1px)]",
        lg: "px-6 py-density-6 [--corner-inset:calc(--spacing(6)+1px)] sm:px-8 sm:py-density-8 sm:[--corner-inset:calc(--spacing(8)+1px)]",
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
      data-slot="card"
      className={cn(cardVariants({ variant, padding, className }))}
      {...props}
    />
  ),
)
Card.displayName = "Card"

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether to show a bottom border. Defaults to true */
  bordered?: boolean
  /** Padding size. Defaults to "default" (px-6 py-density-4) */
  padding?: keyof typeof cardEdgePaddingClasses
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, bordered = true, padding = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "space-y-density-1-5 flex flex-col rounded-t-[var(--corner-inner-radius,0px)]",
          bordered && "border-border border-b",
          cardEdgePaddingClasses[padding],
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
    className={cn(
      "dark:text-secondary-foreground text-muted-foreground",
      className,
    )}
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
      sm: "px-3 py-density-3",
      default: "px-4 py-density-4",
      md: "px-6 py-density-6",
      lg: "px-8 py-density-8",
    },
    spacing: {
      none: "",
      sm: "space-y-density-2",
      default: "space-y-density-4",
      md: "space-y-density-6",
      lg: "space-y-density-8",
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
  /** Padding size. Defaults to "default" (px-6 py-density-4) */
  padding?: keyof typeof cardEdgePaddingClasses
}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, bordered = true, padding = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-end space-x-3 rounded-b-[var(--corner-inner-radius,0px)]",
          bordered && "border-border border-t",
          cardEdgePaddingClasses[padding],
          className,
        )}
        {...props}
      />
    )
  },
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
