import { Info } from "lucide-react"
import React, { useState } from "react"
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

import {
  API_CHECK_CONFIRM_TOAST_ACTIONS,
  type ApiCheckConfirmToastAction,
} from "./confirmToastActions"

export type { ApiCheckConfirmToastAction } from "./confirmToastActions"

/**
 * Top-right confirmation toast used by auto-detect.
 *
 * This toast MUST NOT reveal sensitive data; it only asks the user to open the
 * centered modal where the user can review/edit values.
 */
export const ApiCheckConfirmToast: React.FC<{
  onAction: (action: ApiCheckConfirmToastAction) => void | Promise<void>
  usesEnhancedResult?: boolean
  missingBaseUrl?: boolean
}> = ({ onAction, usesEnhancedResult = false, missingBaseUrl = false }) => {
  const { t } = useTranslation(["webAiApiCheck", "common"])
  const [savingSite, setSavingSite] = useState(false)
  const [siteError, setSiteError] = useState(false)

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
        onClose={() => onAction(API_CHECK_CONFIRM_TOAST_ACTIONS.CANCEL)}
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
                onAction(API_CHECK_CONFIRM_TOAST_ACTIONS.CANCEL)
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
                onAction(API_CHECK_CONFIRM_TOAST_ACTIONS.CONFIRM)
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
        <ContentNoticeAction
          variant="link"
          disabled={savingSite}
          onClick={async (event) => {
            event.stopPropagation()
            setSavingSite(true)
            setSiteError(false)
            try {
              await onAction(API_CHECK_CONFIRM_TOAST_ACTIONS.DISABLE_SITE)
            } catch {
              setSiteError(true)
            } finally {
              setSavingSite(false)
            }
          }}
        >
          {t("webAiApiCheck:siteControl.disable")}
        </ContentNoticeAction>
        {siteError ? (
          <p role="alert">{t("webAiApiCheck:siteControl.failed")}</p>
        ) : null}
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
                    onAction(API_CHECK_CONFIRM_TOAST_ACTIONS.FEEDBACK)
                  }}
                >
                  {t("webAiApiCheck:confirmToast.feedback")}
                </ContentNoticeAction>
                <ContentNoticeAction
                  variant="link"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAction(API_CHECK_CONFIRM_TOAST_ACTIONS.SETTINGS)
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
