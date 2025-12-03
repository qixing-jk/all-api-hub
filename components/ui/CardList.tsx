import React from "react"

import { cn } from "~/lib/utils"

export interface CardListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  dividers?: boolean
}

const CardList = React.forwardRef<HTMLDivElement, CardListProps>(
  ({ className, children, dividers = true, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          dividers
            ? "dark:divide-dark-bg-tertiary divide-y divide-gray-200"
            : "space-y-4",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
CardList.displayName = "CardList"

export { CardList }
