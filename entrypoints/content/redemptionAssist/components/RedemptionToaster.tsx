import React from "react"
import { useToaster } from "react-hot-toast/headless"

/**
 * Headless Toaster rendered inside the Shadow DOM root.
 *
 * 所有通过 `react-hot-toast/headless` 触发的 toast（包括 toast.custom）
 * 都会在这里渲染，从而完全运行在 Shadow DOM 中，使用扩展自己的样式体系。
 *
 * 因为 react-hot-toast 默认的 Toaster 组件正确无法渲染在 Shadow DOM 中。
 * @see https://github.com/timolins/react-hot-toast/issues/139
 */
export const RedemptionToaster: React.FC = () => {
  const { toasts, handlers } = useToaster()
  const { startPause, endPause } = handlers

  const visibleToasts = toasts.filter((toast) => toast.visible)

  if (visibleToasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-9999 flex justify-center sm:justify-end"
      onMouseEnter={startPause}
      onMouseLeave={endPause}>
      <div className="flex max-h-[calc(100vh-3rem)] max-w-full flex-col gap-3 overflow-y-auto px-3 sm:px-4">
        {visibleToasts.map((toast) => {
          // 自定义 toast（toast.custom）通常已经在内容组件中处理好样式
          if (toast.type === "custom") {
            return (
              <div
                key={toast.id}
                {...toast.ariaProps}
                className="pointer-events-auto">
                {typeof toast.message === "function"
                  ? toast.message(toast)
                  : toast.message}
              </div>
            )
          }

          const baseCardClasses =
            "pointer-events-auto w-full sm:w-[360px] max-w-[96vw] rounded-lg border border-border bg-background/95 px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm shadow-lg backdrop-blur flex items-start gap-2 text-foreground break-words"

          const typeClasses =
            toast.type === "success"
              ? "border-l-4 border-l-emerald-500 text-emerald-700"
              : toast.type === "error"
                ? "border-l-4 border-l-rose-500 text-rose-700"
                : ""

          const cardClassName = `${baseCardClasses} ${typeClasses}`

          return (
            <div key={toast.id} {...toast.ariaProps} className={cardClassName}>
              {typeof toast.message === "function"
                ? toast.message(toast)
                : toast.message}
            </div>
          )
        })}
      </div>
    </div>
  )
}
