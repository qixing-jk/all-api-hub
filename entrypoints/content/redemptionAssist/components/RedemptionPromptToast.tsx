import React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

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

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAction("cancel")
  }

  const handleAutoRedeem = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAction("auto")
  }

  return (
    <div
      data-all-api-hub="redemption-assist-toast"
      className="border-border bg-background/95 flex w-[320px] max-w-[92vw] flex-col gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur">
      <div className="text-sm leading-snug whitespace-pre-line">{message}</div>
      <div className="mt-2 flex justify-end gap-2">
        <Button onClick={handleCancel}>{t("common:actions.cancel")}</Button>
        <Button onClick={handleAutoRedeem}>
          {t("redemptionAssist:actions.autoRedeem")}
        </Button>
      </div>
    </div>
  )
}
