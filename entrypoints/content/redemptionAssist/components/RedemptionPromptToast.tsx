import React from "react"
import { useTranslation } from "react-i18next"

export type RedemptionPromptAction = "auto" | "cancel"

interface RedemptionPromptToastProps {
  message: string
  onAction: (action: RedemptionPromptAction) => void
}

export const RedemptionPromptToast: React.FC<RedemptionPromptToastProps> = ({
  message,
  onAction
}) => {
  const { t } = useTranslation("redemptionAssist")

  return (
    <div
      data-all-api-hub="redemption-assist-toast"
      className="border-border bg-background/95 flex w-[320px] max-w-[92vw] flex-col gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur">
      <div className="text-sm leading-snug whitespace-pre-line">{message}</div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onAction("cancel")}
          className="border-border text-foreground hover:bg-muted inline-flex items-center rounded-md border bg-transparent px-3 py-1 text-xs font-medium">
          {t("common:actions.cancel", { defaultValue: "取消" })}
        </button>
        <button
          type="button"
          onClick={() => onAction("auto")}
          className="bg-semantic-info-600 hover:bg-semantic-info-500 inline-flex items-center rounded-md border border-transparent px-3 py-1 text-xs font-medium text-white">
          {t("redemptionAssist:actions.autoRedeem", {
            defaultValue: "自动兑换"
          })}
        </button>
      </div>
    </div>
  )
}
