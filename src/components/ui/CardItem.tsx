import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

import { BodySmall, Typography } from "./Typography"

const cardItemVariants = cva(
  "flex flex-1 flex-col items-start justify-between gap-4 [container-type:inline-size] transition-colors sm:flex-row sm:items-center",
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
  titleContent?: React.ReactNode
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
      titleContent,
      description,
      onClick,
      children,
      ...props
    },
    ref,
  ) => {
    const isClickable = onClick || interactive
    const hasHeaderContent = !!(title || description)

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
            <div className="flex w-full min-w-0 flex-1 items-center gap-3 [@container(min-width:42rem)]:w-auto">
              {icon && (
                <div className="dark:bg-dark-bg-tertiary shrink-0 rounded-lg bg-gray-100 p-1 transition-colors sm:p-2">
                  {icon}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {title && (
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <Typography
                      variant="h6"
                      className="dark:text-dark-text-primary text-gray-900 transition-colors"
                    >
                      {title}
                    </Typography>
                    {titleContent}
                  </div>
                )}
                {description && (
                  <BodySmall className="dark:text-dark-text-tertiary text-gray-500">
                    {description}
                  </BodySmall>
                )}
                {leftContent && (
                  <div className={cn(hasHeaderContent && "mt-2")}>
                    {leftContent}
                  </div>
                )}
              </div>
            </div>
            {rightContent && (
              <div className="w-full min-w-0 flex-1 sm:ml-auto sm:w-auto sm:flex-none">
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
