import { PanelRightOpen } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { ActionGroup, Alert, Button } from "~/components/ui"
import {
  getAccountSiteApiRouter,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { ManualAddGuideButton } from "~/features/AccountManagement/components/AccountDialog/ManualAddGuideButton"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  getAccountSiteDefinition,
  type AccountSiteAccessTokenVerificationGuide,
  type AccountSiteManualAddGuideAnchor,
} from "~/services/accountSiteDefinitions"
import { createTab } from "~/utils/browser/tabs"
import { joinUrl } from "~/utils/core/url"
import { isHttpUrl } from "~/utils/core/urlParsing"

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
  const guide =
    getAccountSiteDefinition(siteType)?.onboarding?.accessTokenVerificationGuide
  const guideCopy = {
    security: {
      generateStep: t("accessTokenVerification.generateStep"),
      openPage: t("accessTokenVerification.openSecurity"),
      openPageFailed: t("accessTokenVerification.openSecurityFailed"),
    },
    apiyi: {
      generateStep: t("accessTokenVerification.apiyi.generateStep"),
      openPage: t("accessTokenVerification.apiyi.openProfile"),
      openPageFailed: t("accessTokenVerification.apiyi.openProfileFailed"),
    },
    laozhang: {
      generateStep: t("accessTokenVerification.laozhang.generateStep"),
      openPage: t("accessTokenVerification.laozhang.openProfile"),
      openPageFailed: t("accessTokenVerification.laozhang.openProfileFailed"),
    },
  } satisfies Record<
    AccountSiteAccessTokenVerificationGuide["copy"],
    { generateStep: string; openPage: string; openPageFailed: string }
  >
  const copy = guideCopy[guide?.copy ?? "security"]

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
      <div className="space-y-density-2 text-sm leading-relaxed">
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
            <ol className="space-y-density-1 list-decimal pl-5">
              <li>{copy.generateStep}</li>
              <li>{t("accessTokenVerification.pasteStep")}</li>
            </ol>
            {guide?.showRotationWarning && (
              <p>{t("accessTokenVerification.rotationWarning")}</p>
            )}
            <ActionGroup className="items-stretch justify-start">
              {accessTokenPath && siteUrl && isHttpUrl(siteUrl) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={openAccessTokenPage}
                  leftIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
                >
                  {copy.openPage}
                </Button>
              )}
              {manualAddGuideAnchor && (
                <ManualAddGuideButton anchor={manualAddGuideAnchor} />
              )}
            </ActionGroup>
            {navigationFailed && <p role="alert">{copy.openPageFailed}</p>}
          </>
        )}
      </div>
    </Alert>
  )
}
