import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

import { BodySmall, Typography } from "./Typography"

const cardItemVariants = cva(
  "flex flex-col sm:flex-row flex-1 items-start sm:items-center justify-between gap-4 transition-colors",
  {
    variants: {
      padding: {
        none: "p-0",
        sm: "sm:py-3 sm:px-4 py-2 px-3",
        default: "sm:py-4 sm:px-6 py-3 px-4",
        md: "sm:py-5 sm:px-6 py-4 px-5",
        lg: "sm:py-6 sm:px-8 py-5 px-6",
      },
      interactive: {
        false: "",
        true: "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary cursor-pointer",
      },
    },
    defaultVariants: {
      padding: "default",
      interactive: false,
    },
  },
)

export interface CardSectionProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardItemVariants> {
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  icon?: React.ReactNode
  title?: string
  description?: string
  onClick?: () => void
}

const CardItem = React.forwardRef<HTMLDivElement, CardSectionProps>(
  (
    {
      className,
      padding,
      interactive,
      leftContent,
      rightContent,
      icon,
      title,
      description,
      onClick,
      children,
      ...props
    },
    ref,
  ) => {
    const isClickable = onClick || interactive

    const Component = (isClickable ? "button" : "div") as any

    return (
      <Component
        ref={ref}
        className={cn(
          cardItemVariants({
            padding,
            interactive: !!isClickable,
            className,
          }),
        )}
        onClick={onClick}
        type={isClickable ? "button" : undefined}
        {...props}
      >
        {children || (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {icon && (
                <div className="dark:bg-dark-bg-tertiary shrink-0 rounded-lg bg-gray-100 p-1 transition-colors sm:p-2">
                  {icon}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {title && (
                  <Typography
                    variant="h6"
                    className="dark:text-dark-text-primary mb-0.5 text-gray-900 transition-colors"
                  >
                    {title}
                  </Typography>
                )}
                {description && (
                  <BodySmall className="dark:text-dark-text-tertiary text-gray-500">
                    {description}
                  </BodySmall>
                )}
                {leftContent}
              </div>
            </div>
            {rightContent && (
              <div className="ml-auto w-full min-w-0 flex-1 sm:w-auto sm:flex-none">
                {rightContent}
              </div>
            )}
          </>
        )}
      </Component>
    )
  },
)
CardItem.displayName = "CardItem"

export { CardItem, cardItemVariants }
