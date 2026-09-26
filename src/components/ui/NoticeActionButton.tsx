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
        "text-link focus-visible:ring-ring rounded-xs font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  )
}
