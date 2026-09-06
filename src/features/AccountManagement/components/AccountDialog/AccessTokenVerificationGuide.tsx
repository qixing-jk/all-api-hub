import { PanelRightOpen } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Alert, Button } from "~/components/ui"
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

/** Guides verified New API token-generation failures into manual PAT entry. */
export function AccessTokenVerificationGuide({
  message,
  siteUrl,
  manualAddGuideAnchor,
  continuation,
}: {
  message: string
  siteUrl?: string
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
  continuation?: AccessTokenContinuationAction
}) {
  const { t } = useTranslation("accountDialog")
  const [navigationFailed, setNavigationFailed] = useState(false)

  const openSecurityPage = async () => {
    if (!siteUrl || !isHttpUrl(siteUrl)) return
    setNavigationFailed(false)
    try {
      // The verified upstream token-management screen lives at /security.
      // https://github.com/QuantumNous/new-api/blob/a8729b5c3709cc01d88fc3f2db5b91347fc9129e/web/src/routes/_authenticated/security/index.tsx
      await createTab(joinUrl(siteUrl, "/security"), true)
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
              <li>{t("accessTokenVerification.generateStep")}</li>
              <li>{t("accessTokenVerification.pasteStep")}</li>
            </ol>
            <p>{t("accessTokenVerification.rotationWarning")}</p>
            <div className="flex flex-wrap gap-2">
              {siteUrl && isHttpUrl(siteUrl) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={openSecurityPage}
                  leftIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
                >
                  {t("accessTokenVerification.openSecurity")}
                </Button>
              )}
              {manualAddGuideAnchor && (
                <ManualAddGuideButton anchor={manualAddGuideAnchor} />
              )}
            </div>
            {navigationFailed && (
              <p role="alert">
                {t("accessTokenVerification.openSecurityFailed")}
              </p>
            )}
          </>
        )}
      </div>
    </Alert>
  )
}
