import { BookOpen } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Alert, Button } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { AccessTokenVerificationGuide } from "~/features/AccountManagement/components/AccountDialog/form/AccessTokenVerificationGuide"
import { ManualAddGuideButton } from "~/features/AccountManagement/components/AccountDialog/ManualAddGuideButton"
import type { AccountRecoveryContinuation } from "~/features/AccountManagement/components/AccountDialog/recovery/useAccountDialogRecoveryHandoff"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  AutoDetectErrorType,
  isAccessTokenRecoveryError,
  openLoginTab,
  reloadCurrentTab,
  type AutoDetectErrorProps,
} from "~/services/accounts/utils/autoDetectUtils"
import type { AccountSiteManualAddGuideAnchor } from "~/services/accountSiteDefinitions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
} from "~/services/productAnalytics/contracts"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/runtime/dispatch"
import { createTab } from "~/utils/browser/tabs"
import { openApiCredentialProfilesPage } from "~/utils/navigation"
import { openSiteSupportRequestPage } from "~/utils/navigation/feedbackPages"

interface AutoDetectErrorAlertProps extends AutoDetectErrorProps {
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
  accessTokenContinuation?: AccountRecoveryContinuation
  onPrepareAccessTokenInput?: () => void
  onRetryAutoDetect?: () => void | Promise<void>
}

const apiCredentialRecoveryErrorTypes = new Set<AutoDetectErrorType>([
  AutoDetectErrorType.INVALID_RESPONSE,
  AutoDetectErrorType.NOT_FOUND,
  AutoDetectErrorType.FORBIDDEN,
  AutoDetectErrorType.UNKNOWN,
])

/**
 * Alert displayed when automatic credential detection fails so users can recover.
 * @param props Component props describing the error context and handlers.
 * @param props.error Error metadata powering the alert content.
 * @param props.siteUrl Optional site URL used for fallback login redirection.
 * @param props.siteType Optional current site type hint used for login route resolution.
 * @param props.onHelpClick Optional handler invoked when help action is triggered.
 * @param props.onActionClick Optional handler invoked when custom action button is pressed.
 * @param props.onApiCredentialProfilesClick Optional handler invoked when API credential fallback is selected.
 * @param props.manualAddGuideAnchor Optional site-specific manual completion guide.
 * @param props.accessTokenContinuation Optional popup-to-persistent-view action.
 * @param props.onPrepareAccessTokenInput Reveals and focuses the token field before site navigation.
 * @param props.onRetryAutoDetect Runs detection after the site's reload completes.
 */
export default function AutoDetectErrorAlert({
  error,
  siteUrl,
  siteType,
  onHelpClick,
  onActionClick,
  onApiCredentialProfilesClick,
  manualAddGuideAnchor,
  accessTokenContinuation,
  onPrepareAccessTokenInput,
  onRetryAutoDetect,
}: AutoDetectErrorAlertProps) {
  const { t } = useTranslation("accountDialog")
  const [isReloadingTab, setIsReloadingTab] = useState(false)
  const mounted = useRef(false)
  const reloading = useRef(false)
  const requiresReload =
    error.type === AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const handleActionClick = async () => {
    if (onActionClick) {
      onActionClick()
    } else if (error.type === AutoDetectErrorType.UNAUTHORIZED && siteUrl) {
      // 默认行为：打开登录页面
      await openLoginTab(siteUrl, siteType)
    } else if (requiresReload && !reloading.current) {
      reloading.current = true
      setIsReloadingTab(true)
      try {
        await reloadCurrentTab(siteUrl)
        if (mounted.current) await onRetryAutoDetect?.()
      } catch {
        // Keep the recovery action available when the site cannot be refreshed.
      } finally {
        reloading.current = false
        if (mounted.current) setIsReloadingTab(false)
      }
    }
  }

  const handleHelpClick = () => {
    if (onHelpClick) {
      onHelpClick()
    } else if (error.helpDocUrl) {
      // 默认行为：打开帮助文档
      void createTab(error.helpDocUrl, true)
    }
  }

  const handleReportUnsupportedSite = () => {
    void openSiteSupportRequestPage({
      siteUrl,
      errorType: error.type,
      errorMessage: error.message,
    })
  }

  const handleApiCredentialProfilesClick = () => {
    if (onApiCredentialProfilesClick) {
      onApiCredentialProfilesClick()
      return
    }

    void trackProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountDialogAutoDetectRecovery,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
        guidance_action_kind:
          PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.SaveApiCredentialRecovery,
      },
    )
    void openApiCredentialProfilesPage()
  }

  const actionText =
    requiresReload && onRetryAutoDetect && !onActionClick
      ? t("tokenCreation.connection.reloadAndRetry")
      : error.actionText
  const hasRecoveryAction = Boolean(actionText || error.helpDocUrl)
  const canRecoverWithApiCredentialProfile =
    apiCredentialRecoveryErrorTypes.has(error.type)
  const canShowApiCredentialFallback =
    Boolean(siteUrl) &&
    canRecoverWithApiCredentialProfile &&
    error.canUseApiCredentialFallback !== false

  if (isAccessTokenRecoveryError(error)) {
    return (
      <AccessTokenVerificationGuide
        message={error.message}
        siteUrl={siteUrl}
        siteType={siteType}
        manualAddGuideAnchor={manualAddGuideAnchor}
        continuation={accessTokenContinuation}
        onPrepareAccessTokenInput={onPrepareAccessTokenInput}
      />
    )
  }

  return (
    <div className="mb-density-4 space-y-density-3">
      <Alert
        variant={
          [
            AutoDetectErrorType.UNAUTHORIZED,
            AutoDetectErrorType.FORBIDDEN,
            AutoDetectErrorType.NOT_FOUND,
            AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED,
            AutoDetectErrorType.RATE_LIMITED,
          ].includes(error.type)
            ? "warning"
            : "destructive"
        }
      >
        <div className="flex min-w-0 flex-col items-start gap-x-3 gap-y-density-3 sm:flex-row sm:flex-wrap">
          <p
            className="min-w-0 flex-1 text-sm leading-relaxed"
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage}
          >
            {error.message}
          </p>

          {/* 操作按钮区域 */}
          {hasRecoveryAction && (
            <div className="flex max-w-full shrink-0 flex-wrap gap-x-2 gap-y-density-2">
              {/* 主要操作按钮 */}
              {actionText && (
                <Button
                  type="button"
                  onClick={handleActionClick}
                  variant="default"
                  size="sm"
                  loading={isReloadingTab}
                >
                  {actionText}
                </Button>
              )}

              {/* 帮助文档按钮 */}
              {error.helpDocUrl && (
                <Button
                  type="button"
                  onClick={handleHelpClick}
                  variant="secondary"
                  size="sm"
                  leftIcon={<BookOpen className="h-3.5 w-3.5" />}
                >
                  {t("actions.helpDocument")}
                </Button>
              )}
            </div>
          )}
        </div>
      </Alert>

      {manualAddGuideAnchor && (
        <Alert variant="default" compact>
          <div className="space-y-density-2 text-sm leading-relaxed">
            <p className="font-semibold">{t("manualAddRecovery.title")}</p>
            <p>{t("manualAddRecovery.description")}</p>
            <ManualAddGuideButton
              anchor={manualAddGuideAnchor}
              variant="default"
            />
          </div>
        </Alert>
      )}

      {canShowApiCredentialFallback && (
        <Alert variant="default" compact>
          <div className="space-y-density-2 text-sm leading-relaxed">
            <p className="font-semibold">{t("apiCredentialFallback.title")}</p>
            <ol className="list-decimal space-y-density-2 pl-4">
              <li className="pl-1">
                <p>{t("apiCredentialFallback.siteSupport.description")}</p>
                <Button
                  type="button"
                  onClick={handleReportUnsupportedSite}
                  variant="link"
                  size="sm"
                  className="mt-0.5 h-auto min-h-0 p-0 text-sm font-semibold"
                  rightIcon={
                    <WorkflowTransitionIcon
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                    />
                  }
                >
                  {t("actions.reportUnsupportedSite")}
                </Button>
              </li>
              <li className="pl-1">
                <p>{t("apiCredentialFallback.apiCredentials.description")}</p>
                <Button
                  type="button"
                  onClick={handleApiCredentialProfilesClick}
                  variant="link"
                  size="sm"
                  className="mt-0.5 h-auto min-h-0 p-0 text-sm font-semibold"
                  rightIcon={
                    <WorkflowTransitionIcon
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                    />
                  }
                >
                  {t("actions.openApiCredentialProfiles")}
                </Button>
              </li>
            </ol>
          </div>
        </Alert>
      )}
    </div>
  )
}
