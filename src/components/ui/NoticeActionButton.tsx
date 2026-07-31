import type { ButtonHTMLAttributes } from "react"

import { cn } from "~/lib/utils"

/**
 * Inline text action used inside lightweight notice descriptions.
 */
export function NoticeActionButton({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-blue-200",
        className,
      )}
      {...props}
    />
  )
}
