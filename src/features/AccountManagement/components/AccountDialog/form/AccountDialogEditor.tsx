import type { ComponentProps, ReactNode, RefObject } from "react"

import type { DialogMode } from "~/constants/dialogModes"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { isAccessTokenRecoveryError } from "~/services/accounts/utils/autoDetectUtils"
import {
  ACCOUNT_SITE_ACCESS_TOKEN_GUIDES,
  getAccountSiteDefinition,
} from "~/services/accountSiteDefinitions"
import type { DisplaySiteData } from "~/types"

import InfoPanel from "../InfoPanel"
import { AUTO_CREATE_ACCESS_TOKEN_STATUSES } from "../models"
import type { useAccountTokenSetup } from "../newApiToken/useAccountTokenSetup"
import type { AccountRecoveryContinuation } from "../recovery/useAccountDialogRecoveryHandoff"
import type { useAccountDialog } from "../workspace/useAccountDialog"
import AccountForm, { type AccountFormHandle } from "./AccountForm"
import type { AccountDialogSitePolicy } from "./sitePolicy"

type AccountFormProps = ComponentProps<typeof AccountForm>
type AccountDialogWorkspace = ReturnType<typeof useAccountDialog>

/** Connects the account editor to the active dialog draft and its workflows. */
export function AccountDialogEditor({
  workspace: { state, handlers, setters },
  account,
  mode,
  formRef,
  siteInfoInput,
  sitePolicy,
  claimedLoginProviders,
  feedbackStage,
  focusSection,
  tokenSetup,
  accessTokenSetup,
  accessTokenFeedback,
  accessTokenFeedbackVariant,
  accessTokenContinuation,
  cookieRecoveryContinuation,
  credentialVerification,
  hasInlineCredentialError,
  manualAddGuideAnchor,
}: {
  workspace: AccountDialogWorkspace
  account?: DisplaySiteData | null
  mode: DialogMode
  formRef: RefObject<AccountFormHandle | null>
  siteInfoInput: ReactNode
  sitePolicy: AccountDialogSitePolicy
  claimedLoginProviders: AccountFormProps["claimedLoginProviders"]
  feedbackStage: AccountFormProps["feedbackStage"]
  focusSection: AccountFormProps["focusSection"]
  tokenSetup: Pick<
    ReturnType<typeof useAccountTokenSetup>,
    "tokenStep" | "finishTokenEntry" | "verifyToken" | "tokenVerificationStatus"
  >
  accessTokenSetup: ReactNode
  accessTokenFeedback?: ReactNode
  accessTokenFeedbackVariant: AccountFormProps["accessTokenFeedbackVariant"]
  accessTokenContinuation?: AccountRecoveryContinuation
  cookieRecoveryContinuation?: AccountRecoveryContinuation
  credentialVerification?: NonNullable<
    AccountDialogWorkspace["state"]["credentialVerification"]
  >
  hasInlineCredentialError: boolean
  manualAddGuideAnchor?: ComponentProps<
    typeof InfoPanel
  >["manualAddGuideAnchor"]
}) {
  const { tags, tagCountsById, createTag, renameTag, deleteTag } =
    useAccountDataContext()
  const verificationGuide = getAccountSiteDefinition(state.siteType)?.onboarding
    ?.accessTokenVerificationGuide
  return (
    <AccountForm
      continuous
      compact={tokenSetup.tokenStep}
      onCompleteCompactToken={
        tokenSetup.tokenStep ? tokenSetup.finishTokenEntry : undefined
      }
      validationIssues={state.validationIssues}
      feedbackStage={feedbackStage}
      accessTokenSetup={accessTokenSetup}
      accessTokenFeedback={accessTokenFeedback}
      accessTokenFeedbackVariant={accessTokenFeedbackVariant}
      newApiTokenVerification={
        tokenSetup.verifyToken && {
          onVerify: tokenSetup.verifyToken,
          status: tokenSetup.tokenVerificationStatus,
          disabled:
            state.isSaving || state.isAutoConfiguring || state.isDetecting,
        }
      }
      focusSection={focusSection}
      guidance={
        <InfoPanel
          mode={mode}
          phase={state.phase}
          formSource={state.formSource}
          presentation="guidance"
          manualAddGuideAnchor={
            state.detectionError ? undefined : manualAddGuideAnchor
          }
        />
      }
      siteInfoInput={siteInfoInput}
      siteUrl={state.url}
      ref={formRef}
      draft={state.draft}
      feedbackAccountId={
        account &&
        account.baseUrl === state.url &&
        account.siteType === state.draft.siteType &&
        String(account.userId) === state.draft.userId
          ? account.id
          : undefined
      }
      feedbackBaseUrl={state.url}
      feedbackOriginalBaseUrl={account?.baseUrl}
      sitePolicy={sitePolicy}
      claimedLoginProviders={claimedLoginProviders}
      isDetected={state.isDetected}
      showAccessTokenGuidance={
        hasInlineCredentialError ||
        !isAccessTokenRecoveryError(state.detectionError) ||
        !verificationGuide
      }
      isImportingSub2apiSession={state.isImportingSub2apiSession}
      isManualBalanceUsdInvalid={state.isManualBalanceUsdInvalid}
      showAccessToken={state.showAccessToken}
      onSiteNameChange={setters.setSiteName}
      onUsernameChange={setters.setUsername}
      onUserIdChange={setters.setUserId}
      onAccessTokenChange={setters.setAccessToken}
      novitaCredentialActions={
        verificationGuide?.copy === ACCOUNT_SITE_ACCESS_TOKEN_GUIDES.Novita
          ? {
              onAcquireConsole: () =>
                void handlers.handleAcquireNovitaConsole(),
              onVerify: () => void handlers.handleVerifyNovitaCredential(),
              isVerifying: state.isDetecting,
              operation: state.novitaCredentialOperation,
              verification: credentialVerification,
              continuation: accessTokenContinuation ?? undefined,
            }
          : undefined
      }
      autoCreateAccessToken={
        sitePolicy.canAutoCreateAccessToken
          ? {
              enabled: true,
              status: state.isDetecting
                ? AUTO_CREATE_ACCESS_TOKEN_STATUSES.Working
                : AUTO_CREATE_ACCESS_TOKEN_STATUSES.Idle,
              onCreate: () => {
                void handlers.handleAutoDetect()
              },
            }
          : undefined
      }
      onAimlApiKeyChange={setters.setAimlApiKey}
      onSub2apiUseRefreshTokenChange={
        handlers.handleSub2apiUseRefreshTokenChange
      }
      onSub2apiRefreshTokenChange={setters.setSub2apiRefreshToken}
      onImportSub2apiSession={handlers.handleImportSub2apiSession}
      onExchangeRateChange={setters.setExchangeRate}
      onManualBalanceUsdChange={setters.setManualBalanceUsd}
      onShowAccessTokenChange={setters.setShowAccessToken}
      onNotesChange={setters.setNotes}
      onSelectedTagIdsChange={setters.setTagIds}
      onExcludeFromTotalBalanceChange={setters.setExcludeFromTotalBalance}
      onExcludeFromTodayIncomeChange={setters.setExcludeFromTodayIncome}
      tags={tags}
      tagCountsById={tagCountsById}
      createTag={createTag}
      renameTag={renameTag}
      deleteTag={deleteTag}
      onLoginChange={setters.setLogin}
      onCheckInChange={setters.setCheckIn}
      onCheckInSelectionChange={setters.setCheckInSelection}
      onRedetectCheckInMethods={handlers.handleRedetectCheckInMethods}
      isRedetectingCheckInMethods={state.isRedetectingCheckInMethods}
      checkInRedetectionFeedback={state.checkInRedetectionFeedback}
      onSiteTypeChange={setters.setSiteType}
      onAuthTypeChange={setters.setAuthType}
      isImportingCookies={state.isImportingCookies}
      cookieRecovery={{
        pending:
          state.isRecoveringCookies ||
          cookieRecoveryContinuation?.isPending === true,
        disabled: cookieRecoveryContinuation?.disabled,
        errorMessage: cookieRecoveryContinuation?.errorMessage,
        verifiedCookie: state.verifiedCookie,
        onRecover:
          cookieRecoveryContinuation?.onContinue ??
          (() => void handlers.handleRecoverCookieSession()),
      }}
      showCookiePermissionWarning={state.showCookiePermissionWarning}
      cookieAuthPermissionsGranted={state.cookieAuthPermissionsGranted}
      isRequestingCookieAuthPermissions={
        state.isRequestingCookieAuthPermissions
      }
      onCookieAuthSessionCookieChange={setters.setCookieAuthSessionCookie}
      onImportCookieAuthSessionCookie={
        handlers.handleImportCookieAuthSessionCookie
      }
      onOpenCookiePermissionSettings={
        handlers.handleOpenCookiePermissionSettings
      }
      onRequestCookieAuthPermissions={
        handlers.handleRequestCookieAuthPermissions
      }
    />
  )
}
