import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

import { BodySmall, Heading3 } from "./Typography"

const cardEdgePaddingClasses = {
  none: "",
  sm: "px-4 py-density-3",
  default: "px-4 py-density-4 sm:px-6",
  lg: "px-6 py-density-6 sm:px-8",
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
  extends
    React.HTMLAttributes<HTMLDivElement>,
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
        data-slot="card-header"
        ref={ref}
        className={cn(
          "flex flex-col space-y-density-1-5 rounded-t-[var(--corner-inner-radius,0px)] has-[>[data-slot=card-action]]:grid has-[>[data-slot=card-action]]:gap-density-3 has-[>[data-slot=card-action]]:space-y-0 sm:has-[>[data-slot=card-action]]:grid-cols-[minmax(0,1fr)_auto]",
          bordered && "border-b border-border",
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
    data-slot="card-title"
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
    data-slot="card-description"
    ref={ref}
    className={cn(
      "text-muted-foreground dark:text-secondary-foreground",
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
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardContentVariants> {}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding, spacing, ...props }, ref) => {
    return (
      <div
        data-slot="card-content"
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
        data-slot="card-footer"
        ref={ref}
        className={cn(
          "flex items-center justify-end space-x-3 rounded-b-[var(--corner-inner-radius,0px)]",
          bordered && "border-t border-border",
          cardEdgePaddingClasses[padding],
          className,
        )}
        {...props}
      />
    )
  },
)
CardFooter.displayName = "CardFooter"

/** Places a header action beside the title when space permits. */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "max-w-full min-w-0 self-center sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end",
        className,
      )}
      {...props}
    />
  )
}

export {
  CardAction,
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
