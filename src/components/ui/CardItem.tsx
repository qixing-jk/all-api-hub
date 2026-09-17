import { cva, type VariantProps } from "class-variance-authority"
import React from "react"

import { cn } from "~/lib/utils"

import { BodySmall, Typography } from "./Typography"

const cardItemVariants = cva(
  "flex flex-1 flex-col items-start justify-between gap-density-4 [container-type:inline-size] transition-colors sm:flex-row sm:items-center",
  {
    variants: {
      padding: {
        none: "p-0",
        sm: "sm:py-density-3 sm:px-4 py-density-2 px-3",
        default: "sm:py-density-4 sm:px-6 py-density-3 px-4",
        md: "sm:py-density-5 sm:px-6 py-density-4 px-5",
        lg: "sm:py-density-6 sm:px-8 py-density-5 px-6",
      },
      interactive: {
        false: "",
        true: "hover:bg-surface-subtle dark:hover:bg-secondary cursor-pointer",
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
  rightContentClassName?: string
  icon?: React.ReactNode
  title?: string
  titleContent?: React.ReactNode
  description?: React.ReactNode
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
      rightContentClassName,
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
          <div
            data-slot="card-item-content"
            className="gap-density-4 flex w-full flex-col items-start justify-between text-left has-[>[data-slot=card-item-control]>[data-slot=switch]]:flex-row has-[>[data-slot=card-item-control]>[data-slot=switch]]:items-center [@container(min-width:42rem)]:flex-row [@container(min-width:42rem)]:items-center"
          >
            <div className="gap-density-3 flex w-full min-w-0 flex-1 items-center [@container(min-width:42rem)]:w-auto">
              {icon && (
                <div className="dark:bg-secondary bg-muted py-density-1 sm:py-density-2 shrink-0 rounded-sm px-1 transition-colors sm:px-2">
                  {icon}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {title && (
                  <div className="gap-density-2 mb-0.5 flex flex-wrap items-center">
                    <Typography
                      variant="h6"
                      className="text-foreground transition-colors"
                    >
                      {title}
                    </Typography>
                    {titleContent}
                  </div>
                )}
                {description && (
                  <BodySmall className="text-muted-foreground">
                    {description}
                  </BodySmall>
                )}
                {leftContent && (
                  <div className={cn(hasHeaderContent && "mt-density-2")}>
                    {leftContent}
                  </div>
                )}
              </div>
            </div>
            {rightContent && (
              <div
                data-slot="card-item-control"
                className={cn(
                  "flex w-full min-w-0 flex-1 justify-end has-[>[data-slot=switch]]:ml-auto has-[>[data-slot=switch]]:w-auto has-[>[data-slot=switch]]:flex-none [@container(min-width:42rem)]:ml-auto [@container(min-width:42rem)]:block [@container(min-width:42rem)]:w-auto [@container(min-width:42rem)]:flex-none",
                  rightContentClassName,
                )}
              >
                {rightContent}
              </div>
            )}
          </div>
        )}
      </Component>
    )
  },
)
CardItem.displayName = "CardItem"

export { CardItem, cardItemVariants }
