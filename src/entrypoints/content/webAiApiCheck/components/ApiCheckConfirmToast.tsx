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
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

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
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Content}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck}
      surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckConfirmToast}
    >
      <Card>
        <CardHeader padding="sm">
          <Heading3>{t("webAiApiCheck:confirmToast.title")}</Heading3>
        </CardHeader>
        <CardContent padding="sm" className="space-y-3">
          <Body>{t("webAiApiCheck:confirmToast.body")}</Body>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialCheckDismissed
              }
              onClick={(e) => {
                e.stopPropagation()
                onAction("cancel")
              }}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialReviewStarted
              }
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
    </ProductAnalyticsScope>
  )
}
