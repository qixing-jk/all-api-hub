import { XMarkIcon } from "@heroicons/react/24/outline"
import { useRef, useState } from "react"
import toast, { ToastBar, type Toast } from "react-hot-toast"

import { Button } from "~/components/ui/button"
import { useTheme } from "~/contexts/ThemeContext"

import { getThemeAwareToastStyles } from "./themeAwareToastStyles"
import type { WarningToastAction } from "./types"
import { WarningToastIcon } from "./WarningToastIcon"

interface WarningToastProps {
  toastInstance: Toast
  message: string
  action?: WarningToastAction
}

/**
 * Shared warning toast UI for non-fatal states that still need user attention.
 * Keeps the same rounded card / dismiss affordance as the default toaster while
 * giving warning flows their own visual emphasis.
 */
export function WarningToast({
  toastInstance,
  message,
  action,
}: WarningToastProps) {
  const { resolvedTheme } = useTheme()
  const [isActionPending, setIsActionPending] = useState(false)
  const isActionPendingRef = useRef(false)

  const warningToast: Toast = {
    ...toastInstance,
    className: [toastInstance.className, "rounded-lg shadow-lg"]
      .filter(Boolean)
      .join(" "),
    style: {
      ...getThemeAwareToastStyles(resolvedTheme),
      ...toastInstance.style,
    },
    icon: <WarningToastIcon resolvedTheme={resolvedTheme} />,
  }

  const handleActionClick = async () => {
    if (!action || isActionPendingRef.current) return

    isActionPendingRef.current = true
    setIsActionPending(true)
    try {
      await action.onClick()
      toast.dismiss(toastInstance.id)
    } catch {
      // Keep the warning toast available so callers can surface retry/error UI.
    } finally {
      isActionPendingRef.current = false
      setIsActionPending(false)
    }
  }

  return (
    <ToastBar toast={{ ...warningToast, message }}>
      {({ icon, message: renderedMessage }) => (
        <>
          {icon}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="min-w-0">{renderedMessage}</div>
            {action ? (
              <Button
                type="button"
                onClick={handleActionClick}
                variant="link"
                size="sm"
                loading={isActionPending}
                className="h-auto w-fit p-0"
              >
                {isActionPending
                  ? action.pendingLabel ?? action.label
                  : action.label}
              </Button>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close notification"
            onClick={() => toast.dismiss(toastInstance.id)}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </>
      )}
    </ToastBar>
  )
}
