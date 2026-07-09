import { BookOpenIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Alert, Button } from "~/components/ui"
import {
  AutoDetectErrorType,
  openLoginTab,
  reloadCurrentTab,
  type AutoDetectErrorProps,
} from "~/services/accounts/utils/autoDetectUtils"
import { createTab } from "~/utils/browser/browserApi"
import {
  openApiCredentialProfilesPage,
  openSiteSupportRequestPage,
} from "~/utils/navigation"

/**
 * Alert displayed when automatic credential detection fails so users can recover.
 * @param props Component props describing the error context and handlers.
 * @param props.error Error metadata powering the alert content.
 * @param props.siteUrl Optional site URL used for fallback login redirection.
 * @param props.siteType Optional current site type hint used for login route resolution.
 * @param props.onHelpClick Optional handler invoked when help action is triggered.
 * @param props.onActionClick Optional handler invoked when custom action button is pressed.
 * @param props.onApiCredentialProfilesClick Optional handler invoked when API credential fallback is selected.
 */
export default function AutoDetectErrorAlert({
  error,
  siteUrl,
  siteType,
  onHelpClick,
  onActionClick,
  onApiCredentialProfilesClick,
}: AutoDetectErrorProps) {
  const { t } = useTranslation("accountDialog")

  const handleActionClick = async () => {
    if (onActionClick) {
      onActionClick()
    } else if (error.type === AutoDetectErrorType.UNAUTHORIZED && siteUrl) {
      // 默认行为：打开登录页面
      await openLoginTab(siteUrl, siteType)
    } else if (error.type === AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED) {
      await reloadCurrentTab()
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

    void openApiCredentialProfilesPage()
  }

  const hasRecoveryAction = Boolean(error.actionText || error.helpDocUrl)
  const canShowApiCredentialFallback = Boolean(siteUrl)

  return (
    <div className="mb-4 space-y-3">
      <Alert variant="warning">
        <div className="flex flex-wrap items-start gap-3">
          <p className="min-w-0 flex-1 text-sm leading-relaxed">
            {error.message}
          </p>

          {/* 操作按钮区域 */}
          {hasRecoveryAction && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {/* 主要操作按钮 */}
              {error.actionText && (
                <Button
                  type="button"
                  onClick={handleActionClick}
                  variant="default"
                  size="sm"
                >
                  {error.actionText}
                </Button>
              )}

              {/* 帮助文档按钮 */}
              {error.helpDocUrl && (
                <Button
                  type="button"
                  onClick={handleHelpClick}
                  variant="secondary"
                  size="sm"
                  leftIcon={<BookOpenIcon className="h-3.5 w-3.5" />}
                >
                  {t("actions.helpDocument")}
                </Button>
              )}
            </div>
          )}
        </div>
      </Alert>

      {canShowApiCredentialFallback && (
        <Alert variant="info" compact>
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="font-semibold">{t("apiCredentialFallback.title")}</p>
            <ol className="list-decimal space-y-2 pl-4">
              <li className="pl-1">
                <p>{t("apiCredentialFallback.siteSupport.description")}</p>
                <Button
                  type="button"
                  onClick={handleReportUnsupportedSite}
                  variant="link"
                  size="sm"
                  className="mt-0.5 h-auto p-0 text-sm font-semibold"
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
                  className="mt-0.5 h-auto p-0 text-sm font-semibold"
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
