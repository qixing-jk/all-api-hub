import { useRef, useState, type ReactNode } from "react"

import { Button } from "~/components/ui/button"

import type { NotificationAction } from "./types"

/** Shared message and optional recovery action inside the standard toast card. */
export function NotificationMessage({
  message,
  action,
  title,
  secondaryAction,
  onDismiss,
}: {
  message: ReactNode
  title?: string
  action?: NotificationAction
  secondaryAction?: NotificationAction
  onDismiss: () => void
}) {
  const [pendingAction, setPendingAction] = useState<
    "primary" | "secondary" | null
  >(null)
  const pendingRef = useRef(false)

  const handleAction = async (
    selected: NotificationAction,
    key: "primary" | "secondary",
  ) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPendingAction(key)
    try {
      await selected.onClick()
      onDismiss()
    } catch {
      // The caller surfaces actionable errors; retain the action for retry.
    } finally {
      pendingRef.current = false
      setPendingAction(null)
    }
  }

  const isPending = pendingAction !== null

  return (
    <span className="flex min-w-0 flex-col gap-2">
      {title && <span className="text-foreground font-semibold">{title}</span>}
      <span className="min-w-0">{message}</span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {action && (
          <Button
            type="button"
            onClick={() => handleAction(action, "primary")}
            variant="link"
            size="sm"
            loading={pendingAction === "primary"}
            disabled={isPending && pendingAction !== "primary"}
            className="h-auto min-h-0 w-fit p-0 font-medium"
          >
            {pendingAction === "primary"
              ? action.pendingLabel ?? action.label
              : action.label}
          </Button>
        )}
        {secondaryAction && (
          <Button
            type="button"
            onClick={() => handleAction(secondaryAction, "secondary")}
            variant="link"
            size="sm"
            loading={pendingAction === "secondary"}
            disabled={isPending && pendingAction !== "secondary"}
            className="text-muted-foreground hover:text-foreground h-auto min-h-0 w-fit p-0 font-normal"
          >
            {pendingAction === "secondary"
              ? secondaryAction.pendingLabel ?? secondaryAction.label
              : secondaryAction.label}
          </Button>
        )}
      </span>
    </span>
  )
}
