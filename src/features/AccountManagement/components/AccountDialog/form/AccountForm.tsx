import { KeyRound } from "lucide-react"
import { useRef, type ReactNode, type Ref } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button, FormField, Input, Notice } from "~/components/ui"
import { SITE_TYPES } from "~/constants/siteType"
import { AccountCheckInSection } from "~/features/AccountManagement/components/AccountDialog/checkin/AccountCheckInSection"
import { AccountFormLayout } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormLayout"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormSection"
import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  ACCOUNT_FORM_SECTIONS,
  type AccountFormFeedbackStage,
  type AccountFormSectionId,
} from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import type { CookieAuthPermissionRecommendationProps } from "~/features/AccountManagement/components/AccountDialog/form/CookieAuthPermissionRecommendation"
import { NanoGptCredentialGuide } from "~/features/AccountManagement/components/AccountDialog/form/NanoGptCredentialGuide"
import {
  NovitaCredentialGuide,
  type NovitaCredentialActions,
} from "~/features/AccountManagement/components/AccountDialog/form/NovitaCredentialGuide"
import type { AccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { AccountLoginSection } from "~/features/AccountManagement/components/AccountDialog/login/AccountLoginSection"
import {
  AUTO_CREATE_ACCESS_TOKEN_STATUSES,
  type AccountCheckInRedetectionFeedback,
  type AccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import type { AccountRecoveryContinuation } from "~/features/AccountManagement/components/AccountDialog/recovery/useAccountDialogRecoveryHandoff"
import { AccountCredentialRecoveryGuidance } from "~/features/AccountManagement/credentialRecovery/AccountCredentialRecoveryGuidance"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  supportsAccountCookieRecovery,
  supportsAccountCredentialRecovery,
} from "~/services/accountCredentialRecovery/policy"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import { isAccountLoginConfigured } from "~/services/accountLogin/configCodec"
import type { LoginProviderClaimConflict } from "~/services/accountLogin/providerClaims"
import {
  ACCOUNT_FORM_FIELDS,
  type AccountFormIssue,
} from "~/services/accounts/editing/accountFormValidation"
import type { AccountCookieValidationEvidence } from "~/services/apiAdapters/contracts/accountLogin"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/discovery/inspection"
import { getCheckInAccountLoginMode } from "~/services/checkin/autoCheckin/providers/registry"
import { AuthTypeEnum, type CheckInConfig, type Tag } from "~/types"
import type { AccountLoginConfiguration } from "~/types/accountLogin"

import {
  AccountAccessTokenField,
  getAccountAccessTokenInput,
  type AccountAccessTokenVerificationAction,
} from "./AccountAccessTokenField"
import { AccountAuthMethodField } from "./AccountAuthMethodField"
import { AccountBalanceSection } from "./AccountBalanceSection"
import { AccountCookieField } from "./AccountCookieField"
import { AccountIdentityFields } from "./AccountIdentityFields"
import { AccountSiteSection } from "./AccountSiteSection"
import { AccountTagsAndNotesSection } from "./AccountTagsAndNotesSection"
import { Sub2ApiRefreshTokenFields } from "./Sub2ApiRefreshTokenFields"
import { useAccountFormFeedback } from "./useAccountFormFeedback"
import {
  useAccountFormFocus,
  type AccountFormHandle,
} from "./useAccountFormFocus"

export type { AccountFormHandle } from "./useAccountFormFocus"

type AccountFormPresentationSitePolicy = Pick<
  AccountDialogSitePolicy,
  | "siteTypeLabel"
  | "accessTokenPresentation"
  | "forceAccessTokenAuth"
  | "allowCookieAuthSession"
  | "usesBrowserCookieSession"
  | "supportsCookieValidation"
  | "allowSub2ApiRefreshTokenState"
  | "allowAimlApiKey"
  | "requireUsername"
  | "requireUserId"
>

interface AccountFormProps {
  continuous?: boolean
  /** Section this form opens on, forwarded from a guidance action. */
  focusSection?: AccountFormSectionId
  guidance?: ReactNode
  accessTokenSetup?: ReactNode
  accessTokenFeedback?: ReactNode
  accessTokenFeedbackVariant?: "success" | "warning"
  newApiTokenVerification?: AccountAccessTokenVerificationAction
  compact?: boolean
  onCompleteCompactToken?: (value: string, focusToken: boolean) => void
  validationIssues?: readonly AccountFormIssue[]
  feedbackStage?: AccountFormFeedbackStage
  siteInfoInput?: ReactNode
  feedbackAccountId?: string
  feedbackBaseUrl?: string
  feedbackOriginalBaseUrl?: string
  ref?: Ref<AccountFormHandle>
  draft: AccountDialogDraft
  siteUrl?: string
  sitePolicy: AccountFormPresentationSitePolicy
  /** Login providers already claimed by another enabled AgentRouter account. */
  claimedLoginProviders?: readonly LoginProviderClaimConflict[]
  isDetected: boolean
  /** A recovery guide already owns the full credential instructions. */
  showAccessTokenGuidance?: boolean
  isManualBalanceUsdInvalid: boolean
  showAccessToken: boolean
  isImportingCookies: boolean
  showCookiePermissionWarning: boolean
  isWebsiteSessionBound?: boolean
  isImportingSub2apiSession: boolean
  onSiteNameChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onUserIdChange: (value: string) => void
  onAccessTokenChange: (value: string) => void
  novitaCredentialActions?: NovitaCredentialActions
  /** Optional console-session credential creation for supported sites. */
  autoCreateAccessToken?: {
    enabled: boolean
    status: (typeof AUTO_CREATE_ACCESS_TOKEN_STATUSES)[keyof typeof AUTO_CREATE_ACCESS_TOKEN_STATUSES]
    message?: string
    onCreate: () => void
  }
  onExchangeRateChange: (value: string) => void
  onManualBalanceUsdChange: (value: string) => void
  onShowAccessTokenChange: (value: boolean) => void
  onNotesChange: (value: string) => void
  onSelectedTagIdsChange: (value: string[]) => void
  onExcludeFromTotalBalanceChange: (value: boolean) => void
  onExcludeFromTodayIncomeChange: (value: boolean) => void
  onCookieAuthSessionCookieChange: (value: string) => void
  onImportCookieAuthSessionCookie: () => void
  cookieRecovery?: {
    pending: boolean
    disabled?: boolean
    errorMessage?: string | null
    onRecover: () => void
    verifiedCookie?: AccountCookieValidationEvidence | null
  }
  onOpenCookiePermissionSettings: () => void
  cookieAuthPermissionsGranted?: CookieAuthPermissionRecommendationProps["cookieAuthPermissionsGranted"]
  isRequestingCookieAuthPermissions?: boolean
  onRequestCookieAuthPermissions?: () => void
  onAimlApiKeyChange: (value: string) => void
  onSub2apiUseRefreshTokenChange: (value: boolean) => void
  onSub2apiRefreshTokenChange: (value: string) => void
  onImportSub2apiSession: () => void
  onAcquireSub2apiSession?: () => void
  isAcquiringSub2apiSession?: boolean
  sub2apiSessionContinuation?: AccountRecoveryContinuation
  tags: Tag[]
  tagCountsById?: Record<string, number>
  createTag: (name: string) => Promise<Tag>
  renameTag: (tagId: string, name: string) => Promise<Tag>
  deleteTag: (tagId: string) => Promise<{ updatedAccounts: number }>
  onSiteTypeChange: (value: string) => void
  onAuthTypeChange: (value: AuthTypeEnum) => void
  onLoginChange: (value: AccountLoginConfiguration | undefined) => void
  onCheckInChange: (value: CheckInConfig) => void
  onCheckInSelectionChange: (value: CheckInConfig) => void
  onRedetectCheckInMethods: () => void
  isRedetectingCheckInMethods: boolean
  checkInRedetectionFeedback: AccountCheckInRedetectionFeedback | null
}

/**
 * Account form body used inside the account dialog for creating/editing accounts.
 */
export default function AccountForm({
  continuous = false,
  focusSection,
  guidance,
  accessTokenSetup,
  accessTokenFeedback,
  accessTokenFeedbackVariant,
  newApiTokenVerification,
  compact,
  onCompleteCompactToken,
  validationIssues,
  feedbackStage,
  siteInfoInput,
  ref,
  draft,
  sitePolicy,
  claimedLoginProviders,
  isDetected,
  showAccessTokenGuidance = true,
  isManualBalanceUsdInvalid,
  showAccessToken,
  isImportingCookies,
  showCookiePermissionWarning,
  isWebsiteSessionBound,
  isImportingSub2apiSession,
  onSiteNameChange,
  onUsernameChange,
  onUserIdChange,
  onAccessTokenChange,
  novitaCredentialActions,
  autoCreateAccessToken,
  onExchangeRateChange,
  onManualBalanceUsdChange,
  onShowAccessTokenChange,
  onNotesChange,
  onSelectedTagIdsChange,
  onExcludeFromTotalBalanceChange,
  onExcludeFromTodayIncomeChange,
  onCookieAuthSessionCookieChange,
  onImportCookieAuthSessionCookie,
  cookieRecovery,
  onOpenCookiePermissionSettings,
  cookieAuthPermissionsGranted,
  isRequestingCookieAuthPermissions,
  onRequestCookieAuthPermissions,
  onAimlApiKeyChange,
  onSub2apiUseRefreshTokenChange,
  onSub2apiRefreshTokenChange,
  onImportSub2apiSession,
  onAcquireSub2apiSession,
  isAcquiringSub2apiSession = false,
  sub2apiSessionContinuation,
  tags,
  tagCountsById,
  createTag,
  renameTag,
  deleteTag,
  onSiteTypeChange,
  onAuthTypeChange,
  onLoginChange,
  onCheckInChange,
  onCheckInSelectionChange,
  onRedetectCheckInMethods,
  isRedetectingCheckInMethods,
  checkInRedetectionFeedback,
  siteUrl,
  feedbackAccountId,
  feedbackBaseUrl = "",
  feedbackOriginalBaseUrl,
}: AccountFormProps) {
  const { t } = useTranslation(["accountDialog", "common"])
  const {
    authType,
    siteName,
    username,
    userId,
    accessToken,
    notes,
    tagIds,
    cookieAuthSessionCookie,
    sub2apiUseRefreshToken,
    sub2apiRefreshToken,
    sub2apiTokenExpiresAt,
    aimlApiKey,
    checkIn,
    siteType,
  } = draft
  const canUseSub2ApiRefreshToken = sitePolicy.allowSub2ApiRefreshTokenState
  const canUseAimlApiKey = sitePolicy.allowAimlApiKey
  const credentialPresentation = sitePolicy.accessTokenPresentation
  const accessTokenInput = getAccountAccessTokenInput(siteType, accessToken)
  const accessTokenRequired = accessTokenInput.required
  const { fieldStatus, fieldStatusProps, rememberField, issueSections } =
    useAccountFormFeedback(validationIssues, feedbackStage, compact)
  const accessTokenInputRef = useRef<HTMLInputElement>(null)
  const loginTarget = {
    authType,
    site_type: siteType,
    site_url: siteUrl ?? "",
    account_info: { id: userId },
  }
  const supportsCookieRecovery = supportsAccountCookieRecovery(loginTarget)
  const loginMethods = getAccountLoginMethods(loginTarget)
  const usesLoginCheckIn = Boolean(
    getCheckInAccountLoginMode(
      resolveSelectedCheckInMethod({ config: checkIn, siteType, siteUrl }),
    ) && loginMethods.length,
  )
  const usesAccountLogin =
    usesLoginCheckIn || supportsAccountCredentialRecovery(loginTarget)
  const loginConfigured = isAccountLoginConfigured(draft.login, loginMethods)
  const hasUserId = Boolean(userId.trim())
  const canAcquireSub2apiSession =
    canUseSub2ApiRefreshToken && hasUserId && loginConfigured
  const sub2apiSessionAction =
    canAcquireSub2apiSession && onAcquireSub2apiSession
      ? {
          onAcquire: onAcquireSub2apiSession,
          isAcquiring: isAcquiringSub2apiSession,
          isImporting: isImportingSub2apiSession,
          continuation: sub2apiSessionContinuation,
        }
      : undefined
  const {
    formRootRef,
    loginMethodRef,
    isLoginSectionOpen,
    setIsLoginSectionOpen,
    isAuthSectionOpen,
    setIsAuthSectionOpen,
    handleConfigureLogin,
  } = useAccountFormFocus({
    ref,
    focusSection,
    usesAccountLogin,
    compact,
    accessToken,
    accessTokenRequired,
  })

  const hasFeedbackSiteChanged = Boolean(
    feedbackOriginalBaseUrl && feedbackOriginalBaseUrl !== feedbackBaseUrl,
  )

  const identityFields = (
    <AccountIdentityFields
      siteType={siteType}
      username={username}
      userId={userId}
      accessToken={accessToken}
      requireUsername={sitePolicy.requireUsername}
      requireUserId={sitePolicy.requireUserId}
      onUsernameChange={onUsernameChange}
      onUserIdChange={onUserIdChange}
      usernameValidation={fieldStatusProps(ACCOUNT_FORM_FIELDS.USERNAME)}
      usernameFeedback={fieldStatus(ACCOUNT_FORM_FIELDS.USERNAME)}
      userIdValidation={fieldStatusProps(ACCOUNT_FORM_FIELDS.USER_ID)}
      userIdFeedback={fieldStatus(ACCOUNT_FORM_FIELDS.USER_ID)}
    />
  )

  const cookieRecoveryAction = supportsCookieRecovery ? (
    <AccountCredentialRecoveryGuidance
      compact
      account={{ siteType, authType, baseUrl: siteUrl ?? "" }}
      onConfigure={handleConfigureLogin}
    />
  ) : null

  const tagsAndNotes = (
    <AccountTagsAndNotesSection
      continuous={continuous}
      tags={tags}
      tagCountsById={tagCountsById}
      tagIds={tagIds}
      onSelectedTagIdsChange={onSelectedTagIdsChange}
      createTag={createTag}
      renameTag={renameTag}
      deleteTag={deleteTag}
      notes={notes}
      onNotesChange={onNotesChange}
    />
  )

  const accessTokenField = (labelAction?: ReactNode) => (
    <AccountAccessTokenField
      accessTokenInputRef={accessTokenInputRef}
      siteType={siteType}
      userId={userId}
      labelKey={credentialPresentation.accessTokenLabelKey}
      labelAction={labelAction}
      value={accessTokenInput.value}
      required={accessTokenRequired}
      showAccessToken={showAccessToken}
      onShowAccessTokenChange={onShowAccessTokenChange}
      onValueChange={(value) =>
        onAccessTokenChange(accessTokenInput.replaceValue(value))
      }
      novitaCredentialActions={novitaCredentialActions}
      newApiTokenVerification={newApiTokenVerification}
      accessTokenFeedback={accessTokenFeedback}
      accessTokenFeedbackVariant={accessTokenFeedbackVariant}
      accessTokenSetup={accessTokenSetup}
      compact={compact}
      onCompleteCompactToken={onCompleteCompactToken}
      containsFocusTarget={(target) =>
        Boolean(
          formRootRef.current?.closest('[role="dialog"]')?.contains(target),
        )
      }
      validationAttributes={fieldStatusProps(ACCOUNT_FORM_FIELDS.ACCESS_TOKEN)}
      validationFeedback={fieldStatus(ACCOUNT_FORM_FIELDS.ACCESS_TOKEN)}
    />
  )

  if (compact) {
    return (
      <div
        ref={formRootRef}
        onBlurCapture={(event) => rememberField(event.target)}
      >
        {accessTokenField()}
      </div>
    )
  }

  return (
    <AccountFormLayout
      formRef={formRootRef}
      onBlurField={rememberField}
      issueSections={issueSections}
      continuous={continuous}
      focusSection={focusSection}
      hasAccountLogin={usesAccountLogin}
      guidance={guidance}
    >
      <AccountSiteSection
        continuous={continuous}
        siteInfoInput={siteInfoInput}
        siteName={siteName}
        siteType={siteType}
        onSiteNameChange={onSiteNameChange}
        onSiteTypeChange={onSiteTypeChange}
        validation={fieldStatusProps(ACCOUNT_FORM_FIELDS.SITE_NAME)}
        feedback={fieldStatus(ACCOUNT_FORM_FIELDS.SITE_NAME)}
      >
        {continuous && identityFields}
      </AccountSiteSection>

      <AccountFormSection
        continuous={continuous}
        id={ACCOUNT_FORM_SECTION_ELEMENT_IDS[ACCOUNT_FORM_SECTIONS.AUTH]}
        contentClassName={
          continuous
            ? authType === AuthTypeEnum.Cookie
              ? "space-y-density-4"
              : "grid items-start gap-4 sm:grid-cols-2"
            : undefined
        }
        title={t("sections.accountAuth.title")}
        defaultOpen={
          ACCOUNT_FORM_MOBILE_DEFAULT_OPEN[ACCOUNT_FORM_SECTIONS.AUTH]
        }
        open={isAuthSectionOpen}
        onOpenChange={setIsAuthSectionOpen}
        testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth}
      >
        <AccountAuthMethodField
          continuous={continuous}
          authType={authType}
          sitePolicy={sitePolicy}
          isDetected={isDetected}
          onAuthTypeChange={onAuthTypeChange}
          validation={fieldStatusProps(ACCOUNT_FORM_FIELDS.AUTH_TYPE)}
          feedback={fieldStatus(ACCOUNT_FORM_FIELDS.AUTH_TYPE)}
        />

        {!continuous && identityFields}

        {authType === AuthTypeEnum.AccessToken && (
          <>
            {siteType === SITE_TYPES.NOVITA && novitaCredentialActions ? (
              <NovitaCredentialGuide
                credential={accessToken}
                onCredentialChange={onAccessTokenChange}
                actions={novitaCredentialActions}
                onPrepareInput={() => accessTokenInputRef.current?.focus()}
              >
                {accessTokenField}
              </NovitaCredentialGuide>
            ) : siteType === SITE_TYPES.NANOGPT ? (
              <NanoGptCredentialGuide
                credential={accessToken}
                onCredentialChange={onAccessTokenChange}
              >
                {accessTokenField()}
              </NanoGptCredentialGuide>
            ) : (
              accessTokenField()
            )}

            {accessTokenSetup && (
              <div className="col-span-full min-w-0">{accessTokenSetup}</div>
            )}

            {autoCreateAccessToken?.enabled &&
              accessToken.trim().length === 0 && (
                <div className="flex flex-col gap-y-density-2">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={
                      autoCreateAccessToken.status ===
                      AUTO_CREATE_ACCESS_TOKEN_STATUSES.Working
                    }
                    disabled={
                      autoCreateAccessToken.status ===
                      AUTO_CREATE_ACCESS_TOKEN_STATUSES.Working
                    }
                    onClick={autoCreateAccessToken.onCreate}
                    data-testid={
                      ACCOUNT_MANAGEMENT_TEST_IDS.autoCreateAccessTokenButton
                    }
                  >
                    {t("form.autoCreateAccessToken")}
                  </Button>
                  {autoCreateAccessToken.status ===
                    AUTO_CREATE_ACCESS_TOKEN_STATUSES.Failed &&
                    autoCreateAccessToken.message && (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid={
                          ACCOUNT_MANAGEMENT_TEST_IDS.autoCreateAccessTokenError
                        }
                      >
                        {autoCreateAccessToken.message}
                      </p>
                    )}
                </div>
              )}
            {showAccessTokenGuidance &&
              !(siteType === SITE_TYPES.NANOGPT && accessToken.trim()) &&
              !(siteType === SITE_TYPES.NOVITA && novitaCredentialActions) &&
              credentialPresentation.accessTokenGuidanceKey &&
              (!isDetected || accessToken.trim().length === 0) && (
                <Alert
                  className={continuous ? "col-span-full" : undefined}
                  variant="default"
                  title={
                    credentialPresentation.accessTokenGuidanceTitleKey
                      ? t(credentialPresentation.accessTokenGuidanceTitleKey)
                      : undefined
                  }
                  description={t(credentialPresentation.accessTokenGuidanceKey)}
                />
              )}
          </>
        )}

        {authType === AuthTypeEnum.AccessToken && canUseAimlApiKey && (
          <FormField label={t("form.aimlApiKey")}>
            <div className="space-y-density-2">
              <Input
                type="password"
                revealable
                revealLabels={{
                  show: t("form.showAccessToken"),
                  hide: t("form.hideAccessToken"),
                }}
                value={aimlApiKey}
                onChange={(e) => onAimlApiKeyChange(e.target.value)}
                placeholder={t("form.aimlApiKeyPlaceholder")}
                leftIcon={<KeyRound className="h-5 w-5" />}
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.aimlApiKeyInput}
              />
              <p className="text-xs text-muted-foreground">
                {t("form.aimlApiKeyHelp")}
              </p>
            </div>
          </FormField>
        )}

        {canUseSub2ApiRefreshToken && (
          <Sub2ApiRefreshTokenFields
            enabled={sub2apiUseRefreshToken}
            refreshToken={sub2apiRefreshToken}
            expiresAt={sub2apiTokenExpiresAt}
            isImporting={isImportingSub2apiSession}
            onEnabledChange={onSub2apiUseRefreshTokenChange}
            onRefreshTokenChange={onSub2apiRefreshTokenChange}
            onImportSession={onImportSub2apiSession}
            acquireSession={sub2apiSessionAction}
            loginSetup={
              usesAccountLogin && onAcquireSub2apiSession
                ? {
                    hasUserId,
                    loginConfigured,
                    onConfigure: handleConfigureLogin,
                  }
                : undefined
            }
            isAcquiring={isAcquiringSub2apiSession}
            validation={fieldStatusProps(ACCOUNT_FORM_FIELDS.REFRESH_TOKEN)}
            isWebsiteSessionBound={isWebsiteSessionBound}
          />
        )}

        {authType === AuthTypeEnum.Cookie && (
          <AccountCookieField
            siteType={siteType}
            siteUrl={siteUrl}
            userId={userId}
            continuous={continuous}
            usesBrowserCookieSession={sitePolicy.usesBrowserCookieSession}
            supportsValidation={sitePolicy.supportsCookieValidation}
            cookieAuthSessionCookie={cookieAuthSessionCookie}
            onCookieAuthSessionCookieChange={onCookieAuthSessionCookieChange}
            hasAccessToken={Boolean(accessToken.trim())}
            isImportingCookies={isImportingCookies}
            onImportCookieAuthSessionCookie={onImportCookieAuthSessionCookie}
            permissionProps={{
              cookieAuthPermissionsGranted,
              isRequestingCookieAuthPermissions,
              onRequestCookieAuthPermissions,
            }}
            showCookiePermissionWarning={showCookiePermissionWarning}
            onOpenCookiePermissionSettings={onOpenCookiePermissionSettings}
            supportsCookieRecovery={supportsCookieRecovery}
            cookieRecoveryAction={cookieRecoveryAction}
            recoveryPending={cookieRecovery?.pending}
            verifiedCookie={cookieRecovery?.verifiedCookie}
            recovery={
              supportsCookieRecovery
                ? {
                    configured:
                      loginConfigured &&
                      supportsAccountCookieRecovery(
                        loginTarget,
                        draft.login?.methodId,
                      ) &&
                      Boolean(cookieRecovery),
                    pending: cookieRecovery?.pending === true,
                    disabled: cookieRecovery?.disabled,
                    errorMessage: cookieRecovery?.errorMessage,
                    onRecover: () => cookieRecovery?.onRecover(),
                    onConfigure: handleConfigureLogin,
                  }
                : undefined
            }
            validationAttributes={fieldStatusProps(ACCOUNT_FORM_FIELDS.COOKIE)}
            validationFeedback={fieldStatus(ACCOUNT_FORM_FIELDS.COOKIE)}
          />
        )}
      </AccountFormSection>

      {!continuous && tagsAndNotes}

      <AccountCheckInSection
        nativePageDiscoveryIdentity={draft}
        continuous={continuous}
        loginMethodId={draft.login?.methodId}
        loginConfigured={loginConfigured}
        onConfigureLogin={usesLoginCheckIn ? handleConfigureLogin : undefined}
        feedbackSource={{
          accountId: feedbackAccountId,
          snapshot: {
            baseUrl: feedbackBaseUrl,
            siteName,
            siteType,
            checkIn: hasFeedbackSiteChanged
              ? {
                  ...checkIn,
                  methodKnowledge: { methods: {} },
                  selection: { mode: "automatic" },
                }
              : checkIn,
          },
          auth: hasFeedbackSiteChanged
            ? undefined
            : { authType, accessToken, userId },
        }}
        checkIn={checkIn}
        siteType={siteType}
        siteUrl={siteUrl}
        onCheckInChange={onCheckInChange}
        onCheckInSelectionChange={onCheckInSelectionChange}
        onRedetectCheckInMethods={onRedetectCheckInMethods}
        isRedetectingCheckInMethods={isRedetectingCheckInMethods}
        checkInRedetectionFeedback={checkInRedetectionFeedback}
      />

      {!usesAccountLogin &&
        draft.loginChanged &&
        Boolean(draft.login) &&
        !loginConfigured && (
          <Notice
            tone="warning"
            description={t("login.incompleteHidden")}
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onLoginChange(undefined)}
              >
                {t("common:actions.clear")}
              </Button>
            }
          />
        )}

      {usesAccountLogin && (
        <AccountLoginSection
          continuous={continuous}
          siteUrl={siteUrl}
          siteType={siteType}
          login={draft.login}
          authType={authType}
          claimedLoginProviders={claimedLoginProviders}
          onChange={onLoginChange}
          methodRef={loginMethodRef}
          validationProps={fieldStatusProps(ACCOUNT_FORM_FIELDS.LOGIN)}
          feedback={fieldStatus(ACCOUNT_FORM_FIELDS.LOGIN)}
          open={isLoginSectionOpen}
          onOpenChange={setIsLoginSectionOpen}
          sub2apiSession={
            sub2apiUseRefreshToken && sub2apiSessionAction
              ? sub2apiRefreshToken.trim()
                ? { configured: true }
                : { configured: false, action: sub2apiSessionAction }
              : undefined
          }
        />
      )}

      <AccountBalanceSection
        continuous={continuous}
        draft={draft}
        fieldFeedback={{ fieldStatus, fieldStatusProps }}
        usesFormValidation={Boolean(validationIssues)}
        isManualBalanceUsdInvalid={isManualBalanceUsdInvalid}
        onExchangeRateChange={onExchangeRateChange}
        onManualBalanceUsdChange={onManualBalanceUsdChange}
        onExcludeFromTotalBalanceChange={onExcludeFromTotalBalanceChange}
        onExcludeFromTodayIncomeChange={onExcludeFromTodayIncomeChange}
      />
      {continuous && tagsAndNotes}
    </AccountFormLayout>
  )
}
