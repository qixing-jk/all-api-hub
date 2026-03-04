import { XMarkIcon } from "@heroicons/react/24/outline"
import toast, { ToastBar, Toaster } from "react-hot-toast"

import { useTheme } from "~/contexts/ThemeContext"

interface ThemeAwareToasterProps {
  reverseOrder?: boolean
}

export const ThemeAwareToaster = ({
  reverseOrder = false,
}: ThemeAwareToasterProps) => {
  const { resolvedTheme } = useTheme()

  const getToastStyles = () => {
    if (resolvedTheme === "dark") {
      return {
        background: "#1e293b",
        color: "#f1f5f9",
        border: "1px solid #334155",
      }
    }
    return {
      background: "#fff",
      color: "#363636",
      border: "1px solid #e5e7eb",
    }
  }

  return (
    <Toaster
      position="bottom-center"
      reverseOrder={reverseOrder}
      gutter={8}
      containerClassName=""
      containerStyle={{}}
      toastOptions={{
        className: "rounded-lg shadow-lg",
        duration: 4000,
        style: getToastStyles(),
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
