import React from "react"

interface RedemptionLoadingToastProps {
  message: string
}

export const RedemptionLoadingToast: React.FC<RedemptionLoadingToastProps> = ({
  message,
}) => {
  return (
    <div className="border-theme-200/70 bg-card/95 text-theme-900 shadow-theme-500/20 ring-theme-100/80 dark:border-theme-500/30 dark:bg-background/95 dark:text-theme-100 dark:ring-theme-500/40 py-density-4 pointer-events-auto w-full rounded-2xl border px-4 shadow-xl ring-1">
      <div className="gap-y-density-3 flex items-center gap-x-3">
        <span className="bg-theme-100/80 text-theme-500 dark:bg-theme-500/10 dark:text-theme-200 inline-flex h-10 w-10 items-center justify-center rounded-full">
          <span className="border-theme-500 dark:border-theme-300 h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
        </span>
        <p className="text-theme-900 dark:text-theme-100 text-sm leading-snug font-medium">
          {message}
        </p>
      </div>
    </div>
  )
}
