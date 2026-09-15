import { X } from "lucide-react"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"
import toast, { ToastBar, Toaster } from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { getThemeAwareToastStyles } from "~/components/toast/themeAwareToastStyles"
import { useToasterPortalHost } from "~/components/toast/ToasterPortal"
import { NOTIFICATION_DURATIONS } from "~/lib/notify/defaults"

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
  const portalHost = useToasterPortalHost()
  const { t: translate } = useTranslation("common")

  const toaster = (
    <Toaster
      position={position}
      reverseOrder={reverseOrder}
      gutter={8}
      containerClassName={containerClassName}
      containerStyle={containerStyle}
      toastOptions={{
        className: "rounded-lg shadow-lg",
        duration: NOTIFICATION_DURATIONS.info,
        style: {
          ...getThemeAwareToastStyles(),
          // Override the toast library's unlayered 8px default with our token.
          borderRadius: "var(--radius-lg)",
        },
        success: {
          duration: NOTIFICATION_DURATIONS.success,
          iconTheme: {
            primary: "var(--success-text)",
            secondary: "var(--popover)",
          },
        },
        error: {
          duration: NOTIFICATION_DURATIONS.error,
          iconTheme: {
            primary: "var(--destructive-text)",
            secondary: "var(--popover)",
          },
        },
        loading: {
          duration: NOTIFICATION_DURATIONS.loading,
          iconTheme: {
            primary: "var(--primary)",
            secondary: "var(--popover)",
          },
        },
      }}
    >
      {(toastInstance) => (
        <ToastBar toast={toastInstance}>
          {({ icon, message }) => {
            return (
              <>
                {icon}
                {message}
                {toastInstance.type !== "loading" && (
                  <button
                    type="button"
                    className="focus-visible:ring-ring inline-flex size-(--density-control-xs) shrink-0 items-center justify-center rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    aria-label={translate("actions.close")}
                    onClick={() => toast.dismiss(toastInstance.id)}
                  >
                    <X className="h-4 w-4" />
                  </button>
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
