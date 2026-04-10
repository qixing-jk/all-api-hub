import { XMarkIcon } from "@heroicons/react/24/outline"
import toast, { ToastBar, type Toast } from "react-hot-toast"

import { useTheme } from "~/contexts/ThemeContext"

import { getThemeAwareToastStyles } from "./themeAwareToastStyles"
import { WarningToastIcon } from "./WarningToastIcon"

interface WarningToastProps {
  toastInstance: Toast
  message: string
}

/**
 * Shared warning toast UI for non-fatal states that still need user attention.
 * Keeps the same rounded card / dismiss affordance as the default toaster while
 * giving warning flows their own visual emphasis.
 */
export function WarningToast({ toastInstance, message }: WarningToastProps) {
  const { resolvedTheme } = useTheme()

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

  return (
    <ToastBar toast={{ ...warningToast, message }}>
      {({ icon, message: renderedMessage }) => (
        <>
          {icon}
          {renderedMessage}
          <button type="button" onClick={() => toast.dismiss(toastInstance.id)}>
            <XMarkIcon className="h-4 w-4" />
          </button>
        </>
      )}
    </ToastBar>
  )
}
