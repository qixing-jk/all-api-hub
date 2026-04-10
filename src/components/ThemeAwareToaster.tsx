import { XMarkIcon } from "@heroicons/react/24/outline"
import type { CSSProperties } from "react"
import toast, { ToastBar, Toaster } from "react-hot-toast"

import { getThemeAwareToastStyles } from "~/components/toast/themeAwareToastStyles"
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

  return (
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
                  <button onClick={() => toast.dismiss(t.id)}>
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </>
            )
          }}
        </ToastBar>
      )}
    </Toaster>
  )
}
