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
      className="border-border bg-background text-foreground pointer-events-auto flex w-full flex-col gap-3 rounded-lg border px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
      <div className="text-sm leading-snug whitespace-pre-line">{message}</div>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={handleCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button onClick={handleAutoRedeem}>
          {t("redemptionAssist:actions.autoRedeem")}
        </Button>
      </div>
    </div>
  )
}
