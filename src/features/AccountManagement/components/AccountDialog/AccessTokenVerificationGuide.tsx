import { PanelRightOpen } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Alert, Button } from "~/components/ui"
import {
  getAccountSiteApiRouter,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import type { AccountSiteManualAddGuideAnchor } from "~/services/accountSiteDefinitions"
import { createTab } from "~/utils/browser/browserApi"
import { joinUrl } from "~/utils/core/url"
import { isHttpUrl } from "~/utils/core/urlParsing"

import { ManualAddGuideButton } from "./ManualAddGuideButton"

export interface AccessTokenContinuationAction {
  onContinue: () => void
  isPending: boolean
  sidePanelSupported: boolean
  disabled?: boolean
  errorMessage?: string | null
}

/** Guides site-owned security verification into manual account token entry. */
export function AccessTokenVerificationGuide({
  message,
  siteUrl,
  siteType = SITE_TYPES.NEW_API,
  manualAddGuideAnchor,
  continuation,
  onPrepareAccessTokenInput,
}: {
  message: string
  siteUrl?: string
  siteType?: AccountSiteType
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
  continuation?: AccessTokenContinuationAction
  onPrepareAccessTokenInput?: () => void
}) {
  const { t } = useTranslation("accountDialog")
  const [navigationFailed, setNavigationFailed] = useState(false)
  const { accessTokenPath } = getAccountSiteApiRouter(siteType)
  const isApiYi = siteType === SITE_TYPES.APIYI

  const openAccessTokenPage = async () => {
    if (!siteUrl || !isHttpUrl(siteUrl) || !accessTokenPath) return
    setNavigationFailed(false)
    onPrepareAccessTokenInput?.()
    try {
      await createTab(joinUrl(siteUrl, accessTokenPath), true)
    } catch {
      setNavigationFailed(true)
    }
  }

  return (
    <Alert variant="warning" title={t("accessTokenVerification.title")}>
      <div className="space-y-2 text-sm leading-relaxed">
        <p data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage}>
          {message}
        </p>
        {continuation ? (
          <>
            <p>
              {continuation.sidePanelSupported
                ? t("accessTokenVerification.popupHint")
                : t("accessTokenVerification.fullPageHint")}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={continuation.isPending || continuation.disabled}
              onClick={continuation.onContinue}
              leftIcon={<PanelRightOpen className="h-4 w-4" />}
            >
              {continuation.isPending
                ? t("accessTokenVerification.continuing")
                : continuation.sidePanelSupported
                  ? t("accessTokenVerification.continueInSidePanel")
                  : t("accessTokenVerification.continueInFullPage")}
            </Button>
            {continuation.errorMessage && (
              <p role="alert">{continuation.errorMessage}</p>
            )}
          </>
        ) : (
          <>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                {isApiYi
                  ? t("accessTokenVerification.apiyi.generateStep")
                  : t("accessTokenVerification.generateStep")}
              </li>
              <li>{t("accessTokenVerification.pasteStep")}</li>
            </ol>
            {siteType === SITE_TYPES.NEW_API && (
              <p>{t("accessTokenVerification.rotationWarning")}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {accessTokenPath && siteUrl && isHttpUrl(siteUrl) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={openAccessTokenPage}
                  leftIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
                >
                  {isApiYi
                    ? t("accessTokenVerification.apiyi.openProfile")
                    : t("accessTokenVerification.openSecurity")}
                </Button>
              )}
              {manualAddGuideAnchor && (
                <ManualAddGuideButton anchor={manualAddGuideAnchor} />
              )}
            </div>
            {navigationFailed && (
              <p role="alert">
                {isApiYi
                  ? t("accessTokenVerification.apiyi.openProfileFailed")
                  : t("accessTokenVerification.openSecurityFailed")}
              </p>
            )}
          </>
        )}
      </div>
    </Alert>
  )
}
