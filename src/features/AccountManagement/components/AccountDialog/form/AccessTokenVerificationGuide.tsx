import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { SidebarIcon } from "~/components/icons/SidebarIcon"
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
  ACCOUNT_SITE_ACCESS_TOKEN_GUIDES as GUIDE_COPIES,
  type AccountSiteAccessTokenVerificationGuide,
  type AccountSiteManualAddGuideAnchor,
} from "~/services/accountSiteDefinitions"
import { supportsNewApiTokenSetup } from "~/services/apiService/newApiFamily/accessTokens/validation"
import { isHttpUrl } from "~/utils/core/urlParsing"

import { ACCOUNT_DIALOG_RECOVERY_ACTIONS } from "../models"
import { NewApiTokenAcquisition } from "../newApiToken/NewApiTokenAcquisition"
import type { NewApiTokenRecoveryReason } from "../newApiToken/tokenVerification"
import { openAccountAccessTokenPage } from "../recovery/openAccountAccessTokenPage"
import type { AccountRecoveryContinuation } from "../recovery/useAccountDialogRecoveryHandoff"

type AccessTokenVerificationGuideProps = {
  siteUrl?: string
  siteType?: AccountSiteType
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
  onPrepareAccessTokenInput?: () => void
  continuation?: AccountRecoveryContinuation
} & (
  | {
      message: string
      recoveryReason?: never
      onStartTokenCreation?: never
      tokenActionsTarget?: never
      externalNavigationFailed?: never
    }
  | {
      message?: never
      recoveryReason: NewApiTokenRecoveryReason
      onStartTokenCreation: () => void
      tokenActionsTarget?: HTMLElement | null
      externalNavigationFailed?: boolean
    }
)

/** Guides manual account token acquisition on the deployment's own page. */
export function AccessTokenVerificationGuide({
  message,
  siteUrl,
  siteType = SITE_TYPES.NEW_API,
  manualAddGuideAnchor,
  continuation,
  recoveryReason,
  onPrepareAccessTokenInput,
  onStartTokenCreation,
  tokenActionsTarget,
  externalNavigationFailed,
}: AccessTokenVerificationGuideProps) {
  const { t } = useTranslation("accountDialog")
  const showSiteGuide = recoveryReason !== undefined
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
      !supportsNewApiTokenSetup(siteType) ||
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
    [GUIDE_COPIES.AiMlApi]: {
      title: t("form.aimlApiManagementKeyGuidanceTitle"),
      generateStep: t("form.aimlApiManagementKeyGuidance"),
      pasteStep: t("accessTokenVerification.aimlapi.pasteStep"),
      openPage: t("accessTokenVerification.aimlapi.openPage"),
      openPageFailed: t("accessTokenVerification.aimlapi.openPageFailed"),
    },
    [GUIDE_COPIES.NanoGpt]: {
      description: t("accessTokenVerification.nanogpt.description"),
      title: t("form.nanoGptApiKeyGuidanceTitle"),
      generateStep: t("form.nanoGptApiKeyGuidance"),
      pasteStep: t("accessTokenVerification.nanogpt.pasteStep"),
      openPage: t("accessTokenVerification.nanogpt.openPage"),
      openPageFailed: t("accessTokenVerification.nanogpt.openPageFailed"),
    },
    [GUIDE_COPIES.Security]: {
      generateStep: t("accessTokenVerification.generateStep"),
      openPage: t("accessTokenVerification.openSecurity"),
      openPageFailed: t("accessTokenVerification.openSecurityFailed"),
    },
    [GUIDE_COPIES.ApiYi]: {
      generateStep: t("accessTokenVerification.apiyi.generateStep"),
      openPage: t("accessTokenVerification.apiyi.openProfile"),
      openPageFailed: t("accessTokenVerification.apiyi.openProfileFailed"),
    },
    [GUIDE_COPIES.ShellApi]: {
      generateStep: t("accessTokenVerification.shellApi.generateStep"),
      openPage: t("accessTokenVerification.shellApi.openProfile"),
      openPageFailed: t("accessTokenVerification.shellApi.openProfileFailed"),
    },
    [GUIDE_COPIES.LaoZhang]: {
      generateStep: t("accessTokenVerification.laozhang.generateStep"),
      openPage: t("accessTokenVerification.laozhang.openProfile"),
      openPageFailed: t("accessTokenVerification.laozhang.openProfileFailed"),
    },
    [GUIDE_COPIES.Vercel]: {
      generateStep: t("accessTokenVerification.vercel.generateStep"),
      openPage: t("accessTokenVerification.vercel.openPage"),
      openPageFailed: t("accessTokenVerification.vercel.openPageFailed"),
    },
    [GUIDE_COPIES.Novita]: {
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
      description?: string
      pasteStep?: string
    }
  >
  const copy = {
    description: undefined as string | undefined,
    title: t("accessTokenVerification.title"),
    pasteStep: t("accessTokenVerification.pasteStep"),
    ...guideCopy[guide?.copy ?? GUIDE_COPIES.Security],
  }

  const openAccessTokenPage = async () => {
    if (showSiteGuide && continuation) {
      continuation.onContinue(ACCOUNT_DIALOG_RECOVERY_ACTIONS.NewApiTokenSite)
      return
    }
    if (opening.current || !siteUrl || !isHttpUrl(siteUrl) || !credentialPage)
      return
    opening.current = true
    setIsOpening(true)
    setNavigationFailed(false)
    onPrepareAccessTokenInput?.()
    try {
      const opened = await openAccountAccessTokenPage(target)
      if (!opened) {
        setNavigationFailed(true)
      }
    } catch {
      setNavigationFailed(true)
    } finally {
      opening.current = false
      setIsOpening(false)
    }
  }

  const isContinuingSite =
    showSiteGuide &&
    continuation?.pendingAction ===
      ACCOUNT_DIALOG_RECOVERY_ACTIONS.NewApiTokenSite
  const openSiteAction = credentialPage && siteUrl && isHttpUrl(siteUrl) && (
    <Button
      type="button"
      size="sm"
      variant={showSiteGuide ? "outline" : "default"}
      className={
        showSiteGuide
          ? "h-auto min-h-(--density-control) max-w-full whitespace-normal"
          : undefined
      }
      onClick={openAccessTokenPage}
      disabled={
        showSiteGuide && continuation
          ? continuation.disabled || continuation.isPending
          : undefined
      }
      loading={showSiteGuide && continuation ? isContinuingSite : isOpening}
      leftIcon={<WorkflowTransitionIcon className="h-4 w-4" />}
    >
      {showSiteGuide ? t("tokenCreation.openSite") : copy.openPage}
    </Button>
  )
  const rotationWarning =
    guide?.showRotationWarning && t("accessTokenVerification.rotationWarning")
  const manualSteps = (
    <div className="space-y-density-2 text-sm leading-relaxed">
      <ol className="list-decimal space-y-density-1 pl-5">
        <li>{copy.generateStep}</li>
        <li>{copy.pasteStep}</li>
      </ol>
      {rotationWarning && <p>{rotationWarning}</p>}
      <ActionGroup className="items-stretch justify-start">
        {openSiteAction}
        {manualAddGuideAnchor && (
          <ManualAddGuideButton anchor={manualAddGuideAnchor} />
        )}
      </ActionGroup>
      {navigationFailed && <p role="alert">{copy.openPageFailed}</p>}
    </div>
  )
  if (showSiteGuide) {
    return (
      <NewApiTokenAcquisition
        recoveryReason={recoveryReason}
        tokenActionsTarget={tokenActionsTarget}
        openSiteAction={openSiteAction}
        onStartTokenCreation={onStartTokenCreation}
        continuation={continuation}
        manualAddGuideAnchor={manualAddGuideAnchor}
        navigationError={
          navigationFailed || externalNavigationFailed
            ? copy.openPageFailed
            : undefined
        }
        rotationWarning={rotationWarning}
      />
    )
  }

  return (
    <Alert variant="warning" title={copy.title}>
      <div className="space-y-density-2 text-sm leading-relaxed">
        <p data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage}>
          {copy.description ?? message}
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
              onClick={() => continuation.onContinue()}
              leftIcon={<SidebarIcon side="right" className="h-4 w-4" />}
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
          manualSteps
        )}
      </div>
    </Alert>
  )
}
