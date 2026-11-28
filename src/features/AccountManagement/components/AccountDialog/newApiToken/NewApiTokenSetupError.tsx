import type { ReactNode } from "react"
import { createPortal } from "react-dom"

import { InlineMessage } from "~/components/ui"

/** Recovery guidance stays in the form while the actions use the dialog footer. */
export function NewApiTokenSetupError({
  title,
  message,
  tone = "warning",
  footer,
  actions,
  children,
}: {
  title: string
  message: string
  tone?: "warning" | "destructive"
  footer?: HTMLElement | null
  actions?: ReactNode
  children?: ReactNode
}) {
  const buttons = actions && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions}
    </div>
  )
  return (
    <div className="space-y-3">
      <InlineMessage role="alert" tone={tone}>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed">{message}</p>
      </InlineMessage>
      {children}
      {buttons && (footer ? createPortal(buttons, footer) : buttons)}
    </div>
  )
}
