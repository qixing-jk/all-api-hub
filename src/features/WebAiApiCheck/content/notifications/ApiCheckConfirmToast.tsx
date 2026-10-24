import { Info } from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"

import {
  ContentNotice,
  ContentNoticeAction,
} from "~/components/toast/ContentNotice"
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
  missingBaseUrl?: boolean
}> = ({ onAction, usesEnhancedResult = false, missingBaseUrl = false }) => {
  const { t } = useTranslation(["webAiApiCheck", "common"])

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Content}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck}
      surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckConfirmToast}
    >
      <ContentNotice
        title={
          missingBaseUrl
            ? t("webAiApiCheck:confirmToast.keyOnlyTitle")
            : t("webAiApiCheck:confirmToast.title")
        }
        onClose={() => onAction("cancel")}
        closeAnalyticsAction={
          PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialCheckDismissed
        }
        actions={
          <>
            <ContentNoticeAction
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialCheckDismissed
              }
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation()
                onAction("cancel")
              }}
            >
              {t("common:actions.cancel")}
            </ContentNoticeAction>
            <ContentNoticeAction
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialReviewStarted
              }
              onClick={(e) => {
                e.stopPropagation()
                onAction("confirm")
              }}
            >
              {t("webAiApiCheck:confirmToast.open")}
            </ContentNoticeAction>
          </>
        }
      >
        <p>
          {missingBaseUrl
            ? t("webAiApiCheck:confirmToast.keyOnlyBody")
            : t("webAiApiCheck:confirmToast.body")}
        </p>
        {usesEnhancedResult ? (
          <div className="bg-muted/50 text-muted-foreground gap-y-density-2 py-density-2 flex items-start gap-x-2 rounded-md px-2 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span>{t("webAiApiCheck:confirmToast.enhancedInfo")}</span>
              <div className="mt-density-1 gap-y-density-1 flex flex-wrap gap-x-2">
                <ContentNoticeAction
                  variant="link"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAction("feedback")
                  }}
                >
                  {t("webAiApiCheck:confirmToast.feedback")}
                </ContentNoticeAction>
                <ContentNoticeAction
                  variant="link"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAction("settings")
                  }}
                >
                  {t("webAiApiCheck:confirmToast.settings")}
                </ContentNoticeAction>
              </div>
            </div>
          </div>
        ) : null}
      </ContentNotice>
    </ProductAnalyticsScope>
  )
}
