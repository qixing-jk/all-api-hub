import type { AnchorHTMLAttributes, ReactNode } from "react"

import { cn } from "~/src/lib/utils"
import { normalizeHttpUrl } from "~/src/utils/core/url"

export interface ExternalUrlTextProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
  /**
   * Raw URL string to display. When valid, it becomes a clickable external link.
   * - Missing scheme will be treated as `https://`.
   * - Non-HTTP(S) schemes (e.g. `javascript:`) are rejected and rendered as plain text.
   */
  value?: string | null
  /**
   * Placeholder shown when `value` is empty.
   */
  emptyPlaceholder?: ReactNode
}

/**
 * Render a user-supplied URL as clickable external link when it is a valid HTTP(S) URL.
 */
export function ExternalUrlText({
  value,
  className,
  emptyPlaceholder = "-",
  ...anchorProps
}: ExternalUrlTextProps) {
  const text = value?.trim()

  if (!text) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        {emptyPlaceholder}
      </span>
    )
  }

  const href = normalizeHttpUrl(text)
  if (!href) {
    return (
      <span className={cn("text-muted-foreground", className)}>{text}</span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "text-muted-foreground hover:text-foreground hover:underline",
        className,
      )}
      title={href}
      {...anchorProps}
    >
      {text}
    </a>
  )
}
