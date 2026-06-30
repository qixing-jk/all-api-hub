import { Info } from "lucide-react"
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
} from "~/services/productAnalytics/contracts"

export type ApiCheckConfirmToastAction =
  | "confirm"
  | "cancel"
  | "settings"
  | "feedback"

/**
 * Top-right confirmation toast used by auto-detect.
 *
 * This toast MUST NOT reveal sensitive data; it only asks the user to open the
 * centered modal where the user can review/edit values.
 */
export const ApiCheckConfirmToast: React.FC<{
  onAction: (action: ApiCheckConfirmToastAction) => void
  usesEnhancedResult?: boolean
}> = ({ onAction, usesEnhancedResult = false }) => {
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
          {usesEnhancedResult ? (
            <div className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-md px-2 py-2 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span>{t("webAiApiCheck:confirmToast.enhancedInfo")}</span>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAction("feedback")
                    }}
                  >
                    {t("webAiApiCheck:confirmToast.feedback")}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAction("settings")
                    }}
                  >
                    {t("webAiApiCheck:confirmToast.settings")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
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
