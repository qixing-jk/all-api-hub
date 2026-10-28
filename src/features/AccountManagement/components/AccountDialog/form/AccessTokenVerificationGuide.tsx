import { PanelRightOpen } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { ActionGroup, Alert, Button } from "~/components/ui"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { ManualAddGuideButton } from "~/features/AccountManagement/components/AccountDialog/ManualAddGuideButton"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  getStaticAccountSiteRouteUrl,
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import {
  getAccountSiteDefinition,
  type AccountSiteAccessTokenVerificationGuide,
  type AccountSiteManualAddGuideAnchor,
} from "~/services/accountSiteDefinitions"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { createTab } from "~/utils/browser/tabs"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { isHttpUrl } from "~/utils/core/urlParsing"

export interface AccessTokenContinuationAction {
  onContinue: () => void
  isPending: boolean
  sidePanelSupported: boolean
  disabled?: boolean
  errorMessage?: string | null
}

/** Guides manual account token acquisition on the deployment's own page. */
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
  const [isOpening, setIsOpening] = useState(false)
  const opening = useRef(false)
  const target = { baseUrl: siteUrl ?? "", siteType }
  const credentialPage = getStaticAccountSiteRouteUrl(
    target,
    SITE_ROUTE_KINDS.AccessToken,
  )
  const hasContinuation = Boolean(continuation)
  useEffect(() => {
    if (
      hasContinuation ||
      siteType !== SITE_TYPES.NEW_API ||
      !siteUrl ||
      !isHttpUrl(siteUrl) ||
      !credentialPage
    )
      return
    // Start only the quiet network stage while the user reads the guide.
    // Explicit intent is added on click, so warmup cannot open a temp page.
    void resolveAccountSiteRouteUrl(
      { baseUrl: siteUrl, siteType },
      SITE_ROUTE_KINDS.AccessToken,
    ).catch(() => undefined)
  }, [hasContinuation, siteType, siteUrl, credentialPage])
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
    vercel: {
      generateStep: t("accessTokenVerification.vercel.generateStep"),
      openPage: t("accessTokenVerification.vercel.openPage"),
      openPageFailed: t("accessTokenVerification.vercel.openPageFailed"),
    },
    novita: {
      title: t("accessTokenVerification.novita.title"),
      pasteStep: t("accessTokenVerification.novita.pasteStep"),
      generateStep: t("accessTokenVerification.novita.generateStep"),
      openPage: t("accessTokenVerification.novita.openPage"),
      openPageFailed: t("accessTokenVerification.novita.openPageFailed"),
    },
  } satisfies Record<
    AccountSiteAccessTokenVerificationGuide["copy"],
    {
      generateStep: string
      openPage: string
      openPageFailed: string
      title?: string
      pasteStep?: string
    }
  >
  const copy = {
    title: t("accessTokenVerification.title"),
    pasteStep: t("accessTokenVerification.pasteStep"),
    ...guideCopy[guide?.copy ?? "security"],
  }

  const openAccessTokenPage = async () => {
    if (opening.current || !siteUrl || !isHttpUrl(siteUrl) || !credentialPage)
      return
    opening.current = true
    setIsOpening(true)
    setNavigationFailed(false)
    onPrepareAccessTokenInput?.()
    try {
      const destination = await resolveAccountSiteRouteUrl(
        {
          ...target,
          pageInspectionExecution: createUserCommandProtectionBypassExecution(
            PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
            getCurrentTempWindowRequestSource(),
          ),
        },
        SITE_ROUTE_KINDS.AccessToken,
      )
      if (!destination) {
        setNavigationFailed(true)
        return
      }
      await createTab(destination, true)
    } catch {
      setNavigationFailed(true)
    } finally {
      opening.current = false
      setIsOpening(false)
    }
  }

  return (
    <Alert variant="warning" title={copy.title}>
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
              <li>{copy.pasteStep}</li>
            </ol>
            {guide?.showRotationWarning && (
              <p>{t("accessTokenVerification.rotationWarning")}</p>
            )}
            <ActionGroup className="items-stretch justify-start">
              {credentialPage && siteUrl && isHttpUrl(siteUrl) && (
                <Button
                  type="button"
                  size="sm"
                  onClick={openAccessTokenPage}
                  loading={isOpening}
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
