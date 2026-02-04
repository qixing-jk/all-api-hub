import React from "react"
import { useTranslation } from "react-i18next"

import {
  Body,
  Button,
  Card,
  CardContent,
  CardHeader,
  Heading3,
} from "~/components/ui"

export type ApiCheckConfirmToastAction = "confirm" | "cancel"

/**
 * Top-right confirmation toast used by auto-detect.
 *
 * This toast MUST NOT reveal sensitive data; it only asks the user to open the
 * centered modal where the user can review/edit values.
 */
export const ApiCheckConfirmToast: React.FC<{
  onAction: (action: ApiCheckConfirmToastAction) => void
}> = ({ onAction }) => {
  const { t } = useTranslation(["webAiApiCheck", "common"])

  return (
    <Card>
      <CardHeader padding="sm">
        <Heading3>{t("webAiApiCheck:confirmToast.title")}</Heading3>
      </CardHeader>
      <CardContent padding="sm" className="space-y-3">
        <Body>{t("webAiApiCheck:confirmToast.body")}</Body>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              onAction("cancel")
            }}
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation()
              onAction("confirm")
            }}
          >
            {t("webAiApiCheck:confirmToast.open")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
