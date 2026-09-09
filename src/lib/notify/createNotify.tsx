import { Info, TriangleAlert } from "lucide-react"
import type toast from "react-hot-toast"
import type { ToastOptions } from "react-hot-toast"

import { NotificationMessage } from "~/components/toast/NotificationMessage"
import type { NotificationAction } from "~/components/toast/types"

import { NOTIFICATION_DURATIONS } from "./defaults"

export type NotificationOptions = ToastOptions & {
  action?: NotificationAction
}

/** Creates the same notification API for page and isolated content runtimes. */
export function createNotify(runtime: typeof toast) {
  const showStandard = (
    kind: "success" | "error" | "loading",
    ...args: Parameters<typeof toast.success>
  ) => {
    const [message, options] = args
    // Updates merge with the existing record. Reset presentation owned by this
    // facade so a warning's icon or lifetime cannot leak into the next state.
    return runtime[kind](message, {
      ...(options?.id ? { icon: undefined } : {}),
      duration: NOTIFICATION_DURATIONS[kind],
      ...options,
    })
  }
  const showNotice = (
    kind: "info" | "warning",
    message: Parameters<typeof toast>[0],
    options?: NotificationOptions,
  ) => {
    // Ignore empty text notices, while retaining JSX and renderer messages.
    if (typeof message === "string") {
      message = message.trim()
      if (!message) return undefined
    }
    const { action, ...overrides } = options ?? {}
    const Icon = kind === "warning" ? TriangleAlert : Info
    return runtime(
      action
        ? (instance) => (
            <NotificationMessage
              key={instance.id}
              message={
                typeof message === "function" ? message(instance) : message
              }
              action={action}
              onDismiss={() => runtime.dismiss(instance.id)}
            />
          )
        : message,
      {
        duration: NOTIFICATION_DURATIONS[kind],
        ...overrides,
        icon: (
          <Icon
            aria-hidden="true"
            className={
              kind === "warning"
                ? "h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400"
                : "h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400"
            }
          />
        ),
      },
    )
  }

  const promise: typeof runtime.promise = (...args) => {
    const [task, messages, options] = args
    return runtime.promise(task, messages, {
      ...options,
      loading: {
        ...(options?.id ? { icon: options.icon } : {}),
        duration: options?.duration ?? NOTIFICATION_DURATIONS.loading,
        ...options?.loading,
      },
      success: {
        ...(options?.id ? { icon: options.icon } : {}),
        duration: options?.duration ?? NOTIFICATION_DURATIONS.success,
        ...options?.success,
      },
      error: {
        ...(options?.id ? { icon: options.icon } : {}),
        duration: options?.duration ?? NOTIFICATION_DURATIONS.error,
        ...options?.error,
      },
    })
  }

  return {
    success: (...args: Parameters<typeof toast.success>) =>
      showStandard("success", ...args),
    error: (...args: Parameters<typeof toast.error>) =>
      showStandard("error", ...args),
    loading: (...args: Parameters<typeof toast.loading>) =>
      showStandard("loading", ...args),
    info: (
      message: Parameters<typeof toast>[0],
      options?: NotificationOptions,
    ) => showNotice("info", message, options),
    warning: (
      message: Parameters<typeof toast>[0],
      options?: NotificationOptions,
    ) => showNotice("warning", message, options),
    dismiss: (...args: Parameters<typeof toast.dismiss>) =>
      runtime.dismiss(...args),
    remove: (...args: Parameters<typeof toast.remove>) =>
      runtime.remove(...args),
    promise,
    custom: (...args: Parameters<typeof toast.custom>) =>
      runtime.custom(...args),
  }
}
