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
        data-slot="card-list"
        className={cn(
          dividers ? "divide-border divide-y" : "space-y-4",
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
