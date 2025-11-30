import React from "react"
import { useTranslation } from "react-i18next"

import {
  Body,
  Button,
  Caption,
  Card,
  CardContent,
  CardHeader,
  Heading3,
  Link
} from "~/components/ui"
import { sendRuntimeMessage } from "~/utils/browserApi"

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

  const handleOpenSettings = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await sendRuntimeMessage({
        action: "openSettings:checkinRedeem"
      })
    } catch (error) {
      console.error("[RedemptionAssist] Failed to open settings page:", error)
    }
  }

  return (
    <Card>
      <CardHeader padding="sm">
        <Heading3>{t("redemptionAssist:messages.promptTitle")}</Heading3>
      </CardHeader>
      <CardContent padding="sm">
        <Body>{message}</Body>
        <div className="flex flex-wrap items-center gap-1">
          <Caption>{t("redemptionAssist:messages.promptSource")}</Caption>
          <Link size="xs" href="#" onClick={handleOpenSettings}>
            {t("redemptionAssist:messages.promptSettingsLink")}
          </Link>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleCancel}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={handleAutoRedeem}>
            {t("redemptionAssist:actions.autoRedeem")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
