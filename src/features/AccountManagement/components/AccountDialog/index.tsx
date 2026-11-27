import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
} from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button, InlineMessage } from "~/components/ui"
import { Modal, MODAL_BODY_SELECTOR } from "~/components/ui/Dialog/Modal"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import AutoDetectErrorAlert from "~/features/AccountManagement/components/AccountDialog/detection/AutoDetectErrorAlert"
import AutoDetectSlowHintAlert from "~/features/AccountManagement/components/AccountDialog/detection/AutoDetectSlowHintAlert"
import { useLoginProviderEvidence } from "~/features/AccountManagement/components/AccountDialog/detection/useLoginProviderEvidence"
import { AccessTokenVerificationGuide } from "~/features/AccountManagement/components/AccountDialog/form/AccessTokenVerificationGuide"
import {
  ACCOUNT_FORM_FEEDBACK_STAGES,
  type AccountFormFeedbackStage,
  type AccountFormSectionId,
} from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import SiteInfoInput from "~/features/AccountManagement/components/AccountDialog/form/SiteInfoInput"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { NewApiAccessTokenVerificationFeedback } from "~/features/AccountManagement/components/AccountDialog/newApiToken/NewApiAccessTokenVerificationFeedback"
import { NewApiTokenCreator } from "~/features/AccountManagement/components/AccountDialog/newApiToken/NewApiTokenCreator"
import { useAccountDialogRecoveryHandoff } from "~/features/AccountManagement/components/AccountDialog/recovery/useAccountDialogRecoveryHandoff"
import { useAccountDialog } from "~/features/AccountManagement/components/AccountDialog/workspace/useAccountDialog"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { useAccountDialogActions } from "~/features/AccountManagement/dialogs/useDialogStateContext"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { resolveLoginProviderClaims } from "~/services/accountLogin/providerClaims"
import {
  ACCOUNT_FORM_FIELDS,
  type AccountFormIssue,
} from "~/services/accounts/editing/accountFormValidation"
import { isAccessTokenRecoveryError } from "~/services/accounts/utils/autoDetectUtils"
import {
  ACCOUNT_SITE_ACCESS_TOKEN_GUIDES,
  getAccountSiteDefinition,
} from "~/services/accountSiteDefinitions"
import {
  isCanonicalAimlApiUrl,
  isCanonicalOpenRouterUrl,
} from "~/services/accountSiteDefinitions/identifiers"
import { isCanonicalRequestyUrl } from "~/services/apiAdapters/requesty/account/accountOnboarding"
import { NEW_API_TOKEN_VALIDATION_STATUSES as VALIDATION_STATUSES } from "~/services/apiService/newApiFamily/accessTokens/protocol"
import type { DisplaySiteData } from "~/types"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import { isExtensionPopup } from "~/utils/browser"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"
import { openApiCredentialProfilesPage } from "~/utils/navigation"

import { AccountDialogWorkflowDialogs } from "./AccountDialogWorkflowDialogs"
import ActionButtons from "./ActionButtons"
import DialogHeader from "./DialogHeader"
import { AccountDialogEditor } from "./form/AccountDialogEditor"
import { AccountDialogSiteStep } from "./form/AccountDialogSiteStep"
import type { AccountFormHandle } from "./form/AccountForm"
import {
  ACCOUNT_DIALOG_PHASES,
  type AccountDialogRecoveryState,
} from "./models"
import {
  CompactTokenEntryHeader,
  NewApiTokenCreationHeader,
} from "./newApiToken/AccountTokenSetupHeaders"
import { useAccountTokenSetup } from "./newApiToken/useAccountTokenSetup"
import { useResumeNewApiTokenRecovery } from "./newApiToken/useResumeNewApiTokenRecovery"

const ACCOUNT_FORM_ID = "account-form"

export interface AccountDialogHandle {
  close: () => Promise<void>
}

interface AccountDialogProps {
  ref?: Ref<AccountDialogHandle>
  isOpen: boolean
  onCloseComplete?: () => void
  onClose: () => void
  mode: DialogMode
  account?: DisplaySiteData | null
  prefill?: AddAccountPrefill | null
  recoveryState?: AccountDialogRecoveryState | null
  focusSection?: AccountFormSectionId
  onSuccess: (data: AccountSaveResponse) => void
  onError: (error: unknown) => void
}

/**
 * Modal dialog for creating or editing account credentials with auto-detect support.
 * @param props Component props to control dialog visibility and behavior.
 * @param props.ref Exposes close completion to the session replacement owner.
 * @param props.isOpen Whether the dialog is currently visible.
 * @param props.onCloseComplete Releases the dialog after its closing animation.
 * @param props.onClose Handler invoked when closing without saving.
 * @param props.mode Current dialog mode (add or edit).
 * @param props.account Account data to prefill the form when editing.
 * @param props.prefill Optional add-mode account prefill.
 * @param props.recoveryState Form carried from the popup for token recovery.
 * @param props.focusSection Section the dialog opens on.
 * @param props.onSuccess Callback fired with saved data.
 * @param props.onError Callback fired when submission fails.
 */
export default function AccountDialog({
  ref,
  isOpen,
  onCloseComplete,
  onClose,
  mode,
  account,
  prefill,
  recoveryState,
  focusSection,
  onSuccess,
  onError,
}: AccountDialogProps) {
  const { t } = useTranslation("messages")
  const { t: tAccountDialog } = useTranslation("accountDialog")
  const {
    accounts,
    displayData,
    detectedSiteAccounts,
    detectedAccount,
    reloadAccountsById,
  } = useAccountDataContext()
  const { openEditAccount } = useAccountDialogActions()

  const workspace = useAccountDialog({
    isOpen,
    onClose: () => {
      onClose()
    },
    mode,
    account,
    prefill,
    recoveryState,
    onPostSaveAccountRefresh: reloadAccountsById,
    onSuccess,
  })
  const { state, setters, handlers } = workspace

  const [feedbackStage, setFeedbackStage] = useState<AccountFormFeedbackStage>()
  const [fieldFocus, setFieldFocus] = useState<{
    field: AccountFormIssue["field"]
  }>()
  const detectionPending = useRef(false)
  const lastRecoveryError = useRef<typeof state.detectionError>(null)
  const formElementRef = useRef<HTMLFormElement>(null)
  const accountFormRef = useRef<AccountFormHandle>(null)
  const focusField = useCallback((field: AccountFormIssue["field"]) => {
    setFieldFocus({ field })
  }, [])
  const queueAccessTokenFocus = useCallback(() => {
    focusField(ACCOUNT_FORM_FIELDS.ACCESS_TOKEN)
  }, [focusField])

  useEffect(() => {
    if (isOpen) return
    setFeedbackStage(undefined)
    setFieldFocus(undefined)
    detectionPending.current = false
    lastRecoveryError.current = null
  }, [isOpen])

  // Login-context claims are read from the already-loaded account list, which
  // refreshes with account changes; the edited account never claims against
  // itself, so its own stored selection stays changeable and clearable. The
  // same last-login evidence the scheduler uses keeps the greyed-out option in
  // step with what a run would actually skip.
  const loginProviderEvidence = useLoginProviderEvidence({
    enabled: isOpen,
    refreshKey: accounts,
  })
  const claimedLoginProviders = useMemo(
    () =>
      resolveLoginProviderClaims({
        accounts,
        accountId: account?.id,
        evidence: loginProviderEvidence,
      }),
    [accounts, account?.id, loginProviderEvidence],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tokenStep) {
      finishTokenEntry(state.accessToken, true)
      return
    }
    if (state.isLoadingAccount || state.accountLoadError) return
    try {
      if (
        mode === DIALOG_MODES.ADD &&
        state.phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT
      ) {
        if (state.url.trim() && !state.isDetecting) {
          await handlers.handleAutoDetect()
        }
        return
      }
      if (
        isAccountSubmissionBlocked ||
        recoveryContinuation?.isOpening ||
        state.isSaving ||
        state.isAutoConfiguring
      )
        return
      if (hasValidationIssues) {
        reviewIssues()
        return
      }
      if (!state.isFormValid) return
      cancelTokenVerification()
      const result = await handlers.handleSaveAccount()
      if (!result) return
      if (!handlers.shouldDeferAccountSaveSuccess(result)) {
        onSuccess(result)
      }
    } catch (error) {
      onError(error)
    }
  }

  const detectedDisplayAccount =
    displayData.find((acc) => acc.id === detectedAccount?.id) ?? null
  const showEntryAuthTypeSelector =
    mode === DIALOG_MODES.ADD &&
    state.phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT
  const addModeSiteInfoProps =
    mode === DIALOG_MODES.ADD
      ? {
          currentTabUrl: state.currentTabUrl,
          isCurrentSiteAdded: detectedSiteAccounts.length > 0,
          detectedAccount: detectedDisplayAccount,
          onUseCurrentTab: handlers.handleUseCurrentTabUrl,
          onEditAccount: openEditAccount,
        }
      : {}
  const cookieAuthPermissionProps = {
    cookieAuthPermissionsGranted: state.cookieAuthPermissionsGranted,
    isRequestingCookieAuthPermissions: state.isRequestingCookieAuthPermissions,
    onRequestCookieAuthPermissions: handlers.handleRequestCookieAuthPermissions,
  }
  const currentSitePolicy = getAccountDialogSitePolicy(state.siteType)
  const siteOnboarding = getAccountSiteDefinition(state.siteType)?.onboarding
  const isAimlApiSite = isCanonicalAimlApiUrl(state.url)
  const isRequestySite = isCanonicalRequestyUrl(state.url)
  const hasManagementAccessToken =
    (isAimlApiSite || isRequestySite) && Boolean(state.accessToken.trim())
  const credentialVerification =
    state.credentialVerification &&
    (!isAimlApiSite ||
      state.credentialVerification.aimlApiKey === state.draft.aimlApiKey) &&
    state.credentialVerification.accessToken === state.accessToken &&
    state.credentialVerification.siteType === state.siteType &&
    state.credentialVerification.userId === state.userId
      ? state.credentialVerification
      : undefined
  const hasInlineCredentialError =
    credentialVerification?.status === "error" &&
    state.novitaCredentialOperation !== "account" &&
    siteOnboarding?.accessTokenVerificationGuide?.copy ===
      ACCOUNT_SITE_ACCESS_TOKEN_GUIDES.Novita
  const needsAimlApiVerification =
    isAimlApiSite && credentialVerification?.status !== "success"

  const manualAddGuideAnchor = siteOnboarding?.manualAddGuideAnchor
  const isOpenRouterBootstrap = isCanonicalOpenRouterUrl(state.url)
  const isAimlApiBootstrap = isAimlApiSite && !hasManagementAccessToken
  const managementKeySiteName = isAimlApiBootstrap
    ? "AI/ML API"
    : isRequestySite && !hasManagementAccessToken
      ? "Requesty"
      : undefined
  const managementKeyAction = managementKeySiteName
    ? tAccountDialog("mode.createManagementKey", {
        siteName: managementKeySiteName,
      })
    : tAccountDialog("mode.createOpenRouterManagementKey")
  const autoDetectPresentation =
    isOpenRouterBootstrap || managementKeySiteName
      ? {
          action: {
            idleLabel: managementKeyAction,
            pendingLabel: managementKeySiteName
              ? tAccountDialog("mode.creatingManagementKey", {
                  siteName: managementKeySiteName,
                })
              : tAccountDialog("mode.creatingOpenRouterManagementKey"),
            reDetectLabel: managementKeyAction,
            multiline: true,
          },
          info: {
            title: managementKeySiteName
              ? tAccountDialog("infoPanel.managementKeyBootstrap", {
                  siteName: managementKeySiteName,
                })
              : tAccountDialog("infoPanel.openrouterBootstrap"),
            description: isAimlApiBootstrap
              ? tAccountDialog("infoPanel.aimlapiBootstrapInfo")
              : managementKeySiteName
                ? tAccountDialog("infoPanel.managementKeyBootstrapInfo", {
                    siteName: managementKeySiteName,
                  })
                : tAccountDialog("infoPanel.openrouterBootstrapInfo"),
          },
        }
      : undefined
  const dialogTitle =
    mode === DIALOG_MODES.ADD
      ? tAccountDialog("title.add")
      : tAccountDialog("title.edit")
  const sharedSiteInfoInputProps = {
    url: state.url,
    onUrlChange: handlers.handleUrlChange,
    isDetected: state.isDetected,
    onClearUrl: handlers.handleClearUrl,
    sitePolicy: currentSitePolicy,
    ...cookieAuthPermissionProps,
    ...addModeSiteInfoProps,
  }
  const siteInfoInputProps: ComponentProps<typeof SiteInfoInput> =
    showEntryAuthTypeSelector
      ? {
          ...sharedSiteInfoInputProps,
          showAuthTypeSelector: true,
          authType: state.authType,
          onAuthTypeChange: setters.setAuthType,
        }
      : sharedSiteInfoInputProps

  const handleOpenApiCredentialProfilesFromDetectFailure = () => {
    void openApiCredentialProfilesPage()
    handleClose()
  }

  const openRouterRecovery = state.openRouterBootstrapRecovery
  const showOpenRouterManualRevocation = Boolean(
    openRouterRecovery?.requiresManualRecovery,
  )
  const showOpenRouterRecovery = Boolean(
    openRouterRecovery?.message || showOpenRouterManualRevocation,
  )

  const showAccountForm =
    state.phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    !state.isLoadingAccount &&
    !state.accountLoadError
  const isAccountSubmissionBlocked =
    !showAccountForm || (mode === DIALOG_MODES.ADD && needsAimlApiVerification)
  const validationIssues = state.validationIssues
  const hasValidationIssues = showAccountForm && validationIssues.length > 0
  const firstIssue = validationIssues[0]
  const tokenSetup = useAccountTokenSetup({
    state,
    mode,
    isOpen,
    showAccountForm,
    validationIssues,
    accountFormRef,
    setAccessToken: setters.setAccessToken,
    focusField,
  })
  const {
    canEnterTokenStep,
    canVerifyToken,
    tokenRecoveryHandled,
    showTokenSetup,
    tokenStep,
    activeTokenSetup,
    tokenRecoveryReason,
    tokenNeedsReplacement,
    hasVerifiedCreatedToken,
    tokenVerificationStatus,
    cancelTokenVerification,
    finishTokenEntry,
    openFullForm,
    setCompactAccount,
    tokenStepActions,
    setTokenStepActions,
    creation,
  } = tokenSetup
  const needsTokenHandoff =
    isAccessTokenRecoveryError(state.detectionError) ||
    siteOnboarding?.accessTokenVerificationGuide?.copy ===
      ACCOUNT_SITE_ACCESS_TOKEN_GUIDES.Novita ||
    Boolean(tokenRecoveryReason)
  const recoveryContinuation = useAccountDialogRecoveryHandoff({
    enabled: isOpen && isExtensionPopup(),
    state:
      state.cookieRecoveryState ??
      state.sub2apiLoginRecoveryState ??
      (needsTokenHandoff ? state.tokenRecoveryState : null) ??
      null,
  })
  const accessTokenContinuation =
    state.cookieRecoveryState || state.sub2apiLoginRecoveryState
      ? undefined
      : recoveryContinuation
  const cookieRecoveryContinuation = state.cookieRecoveryState
    ? recoveryContinuation
    : undefined
  const sub2apiSessionContinuation = state.sub2apiLoginRecoveryState
    ? recoveryContinuation
    : undefined
  const isCreatingToken = creation.isOpen
  const { handleClose: closeAccountDialog } = handlers
  const handleClose = useCallback(() => {
    cancelTokenVerification()
    return closeAccountDialog()
  }, [cancelTokenVerification, closeAccountDialog])
  useImperativeHandle(ref, () => ({ close: handleClose }), [handleClose])

  const reviewIssues = () => {
    if (!firstIssue) return
    setFeedbackStage(ACCOUNT_FORM_FEEDBACK_STAGES.SUBMITTED)
    focusField(firstIssue.field)
  }

  const hasDetectionAlert = Boolean(
    state.detectionError &&
    !hasInlineCredentialError &&
    !activeTokenSetup &&
    !tokenRecoveryHandled,
  )
  const hasTopBanner =
    hasDetectionAlert || Boolean(openRouterRecovery && showOpenRouterRecovery)

  useEffect(() => {
    if (!isOpen) return
    if (state.isDetecting) {
      detectionPending.current = true
      return
    }
    if (!showAccountForm) return
    const accessTokenRecovery = isAccessTokenRecoveryError(state.detectionError)
    const newRecovery =
      accessTokenRecovery && state.detectionError !== lastRecoveryError.current
    const justDetected = detectionPending.current
    detectionPending.current = false
    lastRecoveryError.current = state.detectionError
    if (!justDetected && !newRecovery) return
    setFeedbackStage(ACCOUNT_FORM_FEEDBACK_STAGES.DETECTED)
    setCompactAccount(canEnterTokenStep)
    if (hasTopBanner) {
      const body =
        formElementRef.current?.closest<HTMLElement>(MODAL_BODY_SELECTOR)
      if (body) body.scrollTop = 0
      return
    }
    if (firstIssue) focusField(firstIssue.field)
    else if (showTokenSetup) queueAccessTokenFocus()
  }, [
    isOpen,
    state.isDetecting,
    state.detectionError,
    showAccountForm,
    canEnterTokenStep,
    hasTopBanner,
    firstIssue,
    focusField,
    queueAccessTokenFocus,
    setCompactAccount,
    showTokenSetup,
  ])

  const { siteOpenFailed, clearSiteOpenFailure } = useResumeNewApiTokenRecovery(
    {
      isOpen,
      showAccountForm,
      recoveryState,
      siteType: state.siteType,
      url: state.url,
      userId: state.userId,
      startTokenCreation: creation.start,
      focusAccessToken: queueAccessTokenFocus,
    },
  )

  useEffect(() => {
    if (!fieldFocus || !showAccountForm || isCreatingToken) return
    accountFormRef.current?.focusIssue(fieldFocus.field)
    setFieldFocus(undefined)
  }, [fieldFocus, showAccountForm, isCreatingToken])

  const tokenCreationTitle = creation.reviewing
    ? tAccountDialog("tokenCreation.reviewTokens")
    : tAccountDialog("tokenCreation.title")
  const focusAccessToken = () => {
    clearSiteOpenFailure()
    accountFormRef.current?.focusAccessToken()
  }
  const accessTokenSetup = tokenRecoveryReason ? (
    <AccessTokenVerificationGuide
      recoveryReason={tokenRecoveryReason}
      siteUrl={state.url}
      siteType={state.siteType}
      manualAddGuideAnchor={manualAddGuideAnchor}
      continuation={accessTokenContinuation}
      onPrepareAccessTokenInput={focusAccessToken}
      onStartTokenCreation={creation.start}
      tokenActionsTarget={tokenStep ? tokenStepActions : undefined}
      externalNavigationFailed={siteOpenFailed}
    />
  ) : siteOpenFailed ? (
    <InlineMessage role="alert" tone="warning" size="sm">
      {tAccountDialog("accessTokenVerification.openSecurityFailed")}
    </InlineMessage>
  ) : undefined
  const detectionAlert =
    hasDetectionAlert && state.detectionError ? (
      <AutoDetectErrorAlert
        error={state.detectionError}
        siteUrl={state.url}
        siteType={state.siteType}
        accessTokenContinuation={accessTokenContinuation}
        manualAddGuideAnchor={
          mode === DIALOG_MODES.ADD ? manualAddGuideAnchor : undefined
        }
        onPrepareAccessTokenInput={focusAccessToken}
        onRetryAutoDetect={handlers.handleAutoDetect}
        onApiCredentialProfilesClick={
          handleOpenApiCredentialProfilesFromDetectFailure
        }
      />
    ) : null
  const tokenHost = tokenStep ? tryParseHttpUrl(state.url)?.host : undefined
  const compactTitle = tAccountDialog("validation.tokenNeeded", {
    site: state.siteName || tokenHost || state.url,
  })
  const detectedDetails = [state.draft.username, tokenHost]
    .filter(Boolean)
    .join(" · ")
  const tokenFeedback = canVerifyToken ? (
    <NewApiAccessTokenVerificationFeedback
      status={tokenVerificationStatus}
      created={hasVerifiedCreatedToken}
    />
  ) : undefined
  const tokenFeedbackVariant = tokenNeedsReplacement
    ? "warning"
    : tokenVerificationStatus === VALIDATION_STATUSES.VALID ||
        (!tokenVerificationStatus && hasVerifiedCreatedToken)
      ? "success"
      : undefined

  return (
    <>
      <Modal
        isOpen={isOpen}
        onCloseComplete={onCloseComplete}
        focusWorkflowId={ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog}
        onClose={handleClose}
        size={tokenStep ? (isCreatingToken ? "lg" : "md") : "xl"}
        panelClassName={
          mode === DIALOG_MODES.EDIT
            ? "h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-4rem)]"
            : tokenStep && !isCreatingToken
              ? "max-w-lg"
              : undefined
        }
        title={
          isCreatingToken
            ? tokenCreationTitle
            : tokenStep
              ? compactTitle
              : dialogTitle
        }
        showCloseButton={!isCreatingToken}
        closeOnEsc={!isCreatingToken}
        closeOnBackdropClick={!isCreatingToken}
        panelTestId={ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog}
        header={
          isCreatingToken ? (
            <NewApiTokenCreationHeader
              title={tokenCreationTitle}
              siteUrl={state.url}
              siteName={state.siteName}
              headingRef={creation.headingRef}
              busy={creation.busy}
              reviewing={creation.reviewing}
              onBack={
                creation.reviewing
                  ? () => creation.setReviewing(false)
                  : creation.goBack
              }
            />
          ) : tokenStep ? (
            <CompactTokenEntryHeader
              title={compactTitle}
              details={detectedDetails}
              onOpenFullForm={openFullForm}
            />
          ) : (
            <DialogHeader mode={mode} />
          )
        }
        footer={
          isCreatingToken ? (
            <div ref={creation.setFooter} />
          ) : (
            <ActionButtons
              showAccountActions={activeTokenSetup}
              compactTokenActions={
                tokenStep ? (
                  <div
                    ref={setTokenStepActions}
                    className="w-full min-w-0 sm:ml-auto sm:w-auto"
                  />
                ) : undefined
              }
              hasValidationIssues={hasValidationIssues}
              mode={mode}
              url={state.url}
              autoDetectPresentation={autoDetectPresentation?.action}
              phase={state.phase}
              formSource={state.formSource}
              isDetecting={state.isDetecting}
              onAutoDetect={handlers.handleAutoDetect}
              detectFromCredential={
                needsAimlApiVerification && hasManagementAccessToken
              }
              onShowManualForm={handlers.handleShowManualForm}
              onClose={handleClose}
              isFormValid={state.isFormValid}
              isSubmissionBlocked={
                isAccountSubmissionBlocked || recoveryContinuation?.isOpening
              }
              isSaving={state.isSaving}
              onAutoConfig={() => {
                cancelTokenVerification()
                return handlers.handleAutoConfig()
              }}
              isAutoConfiguring={state.isAutoConfiguring}
              accountPostSaveWorkflowStep={state.accountPostSaveWorkflowStep}
              // ensure submit button in footer can submit the form by linking via form id
              formId={ACCOUNT_FORM_ID}
            />
          )
        }
      >
        {isCreatingToken && (
          <div key="token-creation" ref={creation.bodyRef}>
            <NewApiTokenCreator
              siteUrl={state.url}
              userId={state.userId}
              onReturnToAccount={creation.goBack}
              reviewing={creation.reviewing}
              onReviewingChange={creation.setReviewing}
              footer={creation.footer}
              onBusyChange={creation.setBusy}
              onCreated={creation.finish}
            />
          </div>
        )}
        <div hidden={isCreatingToken}>
          <form
            ref={formElementRef}
            id={ACCOUNT_FORM_ID}
            onSubmit={handleSubmit}
            noValidate={hasValidationIssues}
            inert={recoveryContinuation?.isOpening}
            className="flex flex-col gap-x-2 gap-y-density-2"
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountForm}
            data-account-form-ready={showAccountForm ? "" : undefined}
          >
            {state.accountLoadError && (
              <Alert
                variant="destructive"
                title={tAccountDialog("messages.loadFailed")}
                data-testid="account-dialog-load-error"
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handlers.retryAccountLoad()}
                >
                  {t("common:actions.retry")}
                </Button>
              </Alert>
            )}
            {detectionAlert}

            {openRouterRecovery && showOpenRouterRecovery && (
              <Alert
                variant="warning"
                title={tAccountDialog("openrouterBootstrapRecovery.title")}
                tabIndex={-1}
                aria-live="assertive"
                aria-atomic="true"
              >
                <div className="space-y-density-2 text-sm leading-relaxed">
                  {openRouterRecovery.message && (
                    <p>{openRouterRecovery.message}</p>
                  )}
                  {showOpenRouterManualRevocation && (
                    <>
                      {openRouterRecovery.label && (
                        <p>
                          {tAccountDialog("openrouterBootstrapRecovery.label", {
                            label: openRouterRecovery.label,
                          })}
                        </p>
                      )}
                      <p>
                        {tAccountDialog(
                          "openrouterBootstrapRecovery.manualRevocation",
                        )}
                      </p>
                    </>
                  )}
                </div>
              </Alert>
            )}

            {state.isDetecting && state.isDetectingSlow && (
              <AutoDetectSlowHintAlert />
            )}

            <AccountDialogSiteStep
              isOpen={isOpen}
              mode={mode}
              phase={state.phase}
              formSource={state.formSource}
              siteInfoInput={<SiteInfoInput {...siteInfoInputProps} />}
              autoDetectPresentation={autoDetectPresentation?.info}
              manualAddGuideAnchor={
                state.detectionError ? undefined : manualAddGuideAnchor
              }
              onApplyPrefill={(nextPrefill) => {
                handlers.handleUrlChange(nextPrefill.siteUrl, {
                  applyAuthDefault: false,
                })
                setters.setSiteType(nextPrefill.siteType)
                if (nextPrefill.authType)
                  setters.setAuthType(nextPrefill.authType)
              }}
            />

            {state.isLoadingAccount && (
              <div
                className="min-h-0 flex-1"
                aria-busy="true"
                data-testid="account-dialog-loading"
              >
                <span role="status" className="sr-only">
                  {t("common:status.loading")}
                </span>
              </div>
            )}
            {showAccountForm && (
              <AccountDialogEditor
                workspace={workspace}
                account={account}
                mode={mode}
                formRef={accountFormRef}
                siteInfoInput={<SiteInfoInput {...siteInfoInputProps} />}
                sitePolicy={currentSitePolicy}
                claimedLoginProviders={claimedLoginProviders}
                feedbackStage={feedbackStage}
                focusSection={focusSection}
                tokenSetup={tokenSetup}
                accessTokenSetup={accessTokenSetup}
                accessTokenFeedback={tokenFeedback}
                accessTokenFeedbackVariant={tokenFeedbackVariant}
                accessTokenContinuation={accessTokenContinuation}
                cookieRecoveryContinuation={cookieRecoveryContinuation}
                sub2apiSessionContinuation={sub2apiSessionContinuation}
                credentialVerification={credentialVerification}
                hasInlineCredentialError={hasInlineCredentialError}
                manualAddGuideAnchor={manualAddGuideAnchor}
              />
            )}
          </form>
        </div>
      </Modal>

      <AccountDialogWorkflowDialogs state={state} handlers={handlers} />
    </>
  )
}
