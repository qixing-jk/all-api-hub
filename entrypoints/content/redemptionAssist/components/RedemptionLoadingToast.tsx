import React from "react"

interface RedemptionLoadingToastProps {
  message: string
}

export const RedemptionLoadingToast: React.FC<RedemptionLoadingToastProps> = ({
  message
}) => {
  return (
    <div className="pointer-events-auto w-full rounded-2xl border border-blue-200/70 bg-white/95 p-4 text-blue-900 shadow-xl ring-1 shadow-blue-500/20 ring-blue-100/80 dark:border-blue-500/30 dark:bg-slate-900/95 dark:text-blue-100 dark:ring-blue-500/40">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-100/80 text-blue-500 dark:bg-blue-500/10 dark:text-blue-200">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent dark:border-blue-300" />
        </span>
        <p className="text-sm leading-snug font-medium text-blue-900 dark:text-blue-100">
          {message}
        </p>
      </div>
    </div>
  )
}
