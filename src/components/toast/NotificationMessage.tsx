import { useRef, useState, type ReactNode } from "react"

import { Button } from "~/components/ui/button"

import type { NotificationAction } from "./types"

/** Shared message and optional recovery action inside the standard toast card. */
export function NotificationMessage({
  message,
  action,
  onDismiss,
}: {
  message: ReactNode
  action: NotificationAction
  onDismiss: () => void
}) {
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)

  const handleAction = async () => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    try {
      await action.onClick()
      onDismiss()
    } catch {
      // The caller surfaces actionable errors; retain the action for retry.
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="min-w-0">{message}</span>
      <Button
        type="button"
        onClick={handleAction}
        variant="link"
        size="sm"
        loading={pending}
        className="h-auto w-fit p-0"
      >
        {pending ? action.pendingLabel ?? action.label : action.label}
      </Button>
    </span>
  )
}
