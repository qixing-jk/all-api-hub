import { XMarkIcon } from "@heroicons/react/24/outline"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"
import toast, { ToastBar, Toaster } from "react-hot-toast"

import { getThemeAwareToastStyles } from "~/components/toast/themeAwareToastStyles"
import { useToasterPortalHost } from "~/components/toast/ToasterPortal"
import { IconButton } from "~/components/ui"
import { useTheme } from "~/contexts/ThemeContext"

interface ThemeAwareToasterProps {
  reverseOrder?: boolean
  position?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"
  containerClassName?: string
  containerStyle?: CSSProperties
}

export const ThemeAwareToaster = ({
  reverseOrder = false,
  position = "bottom-center",
  containerClassName = "",
  containerStyle,
}: ThemeAwareToasterProps) => {
  const { resolvedTheme } = useTheme()
  const portalHost = useToasterPortalHost()

  const toaster = (
    <Toaster
      position={position}
      reverseOrder={reverseOrder}
      gutter={8}
      containerClassName={containerClassName}
      containerStyle={containerStyle}
      toastOptions={{
        className: "rounded-lg shadow-lg",
        duration: 4000,
        style: getThemeAwareToastStyles(resolvedTheme),
        success: {
          duration: 3000,
          iconTheme: {
            primary: resolvedTheme === "dark" ? "#10b981" : "#059669",
            secondary: resolvedTheme === "dark" ? "#1e293b" : "#fff",
          },
        },
        error: {
          duration: 5000,
          iconTheme: {
            primary: resolvedTheme === "dark" ? "#ef4444" : "#dc2626",
            secondary: resolvedTheme === "dark" ? "#1e293b" : "#fff",
          },
        },
        loading: {
          iconTheme: {
            primary: resolvedTheme === "dark" ? "#3b82f6" : "#2563eb",
            secondary: resolvedTheme === "dark" ? "#1e293b" : "#fff",
          },
        },
      }}
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => {
            return (
              <>
                {icon}
                {message}
                {t.type !== "loading" && (
                  <IconButton
                    type="button"
                    aria-label="Close notification"
                    variant="ghost"
                    size="xs"
                    onClick={() => toast.dismiss(t.id)}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </IconButton>
                )}
              </>
            )
          }}
        </ToastBar>
      )}
    </Toaster>
  )

  return portalHost ? createPortal(toaster, portalHost) : toaster
}
