import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Cookie,
  DollarSign,
  Download,
  Hash,
  KeyRound,
} from "lucide-react"
import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react"
import { useTranslation } from "react-i18next"

import {
  AccountSiteTypeIcon,
  AccountUserIcon,
  HelpHintIcon,
} from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import {
  Alert,
  Button,
  FormField,
  IconButton,
  Input,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "~/components/ui"
import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { ACCOUNT_SITE_TYPES, SITE_TYPES } from "~/constants/siteType"
import { AccountCheckInSection } from "~/features/AccountManagement/components/AccountDialog/checkin/AccountCheckInSection"
import { AccountCookieVerification } from "~/features/AccountManagement/components/AccountDialog/form/AccountCookieVerification"
import { AccountFormLayout } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormLayout"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormSection"
import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  type AccountFormSectionId,
} from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import { CookieAuthCompatibilityHint } from "~/features/AccountManagement/components/AccountDialog/form/CookieAuthCompatibilityHint"
import {
  CookieAuthPermissionRecommendation,
  type CookieAuthPermissionRecommendationProps,
} from "~/features/AccountManagement/components/AccountDialog/form/CookieAuthPermissionRecommendation"
import { NanoGptCredentialGuide } from "~/features/AccountManagement/components/AccountDialog/form/NanoGptCredentialGuide"
import {
  NovitaCredentialGuide,
  type NovitaCredentialActions,
} from "~/features/AccountManagement/components/AccountDialog/form/NovitaCredentialGuide"
import type { AccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { VercelTeamSelector } from "~/features/AccountManagement/components/AccountDialog/form/VercelTeamSelector"
import {
  ACCOUNT_LOGIN_SECTION_ID,
  AccountLoginSection,
} from "~/features/AccountManagement/components/AccountDialog/login/AccountLoginSection"
import {
  AUTO_CREATE_ACCESS_TOKEN_STATUSES,
  type AccountCheckInRedetectionFeedback,
  type AccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import { AccountCredentialRecoveryGuidance } from "~/features/AccountManagement/credentialRecovery/AccountCredentialRecoveryGuidance"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSiteTypeOptionTestId,
} from "~/features/AccountManagement/testIds"
import {
  supportsAccountCookieRecovery,
  supportsAccountCredentialRecovery,
} from "~/services/accountCredentialRecovery/policy"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import { isAccountLoginConfigured } from "~/services/accountLogin/configCodec"
import type { LoginProviderClaimConflict } from "~/services/accountLogin/providerClaims"
import { isValidExchangeRate } from "~/services/accounts/editing/accountFormValidation"
import type { AccountCookieValidationEvidence } from "~/services/apiAdapters/contracts/accountLogin"
import {
  encodeNanoGptCredentials,
  parseNanoGptCredentials,
} from "~/services/apiService/nanogpt/credentials"
import {
  encodeNovitaCredentials,
  parseNovitaCredentials,
} from "~/services/apiService/novita/constants"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/discovery/inspection"
import { AuthTypeEnum, type CheckInConfig, type Tag } from "~/types"
import type { AccountLoginConfiguration } from "~/types/accountLogin"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { revealNavigationTarget } from "~/utils/dom/navigationTarget"

const ACCOUNT_FORM_SITE_TYPE_OPTIONS = ACCOUNT_SITE_TYPES.filter(
  (siteType) => siteType !== SITE_TYPES.UNKNOWN,
)
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

export interface AccountFormHandle {
  focusAccessToken: () => void
}

interface AccountFormProps {
  continuous?: boolean
  /** Section this form opens on, forwarded from a guidance action. */
  focusSection?: AccountFormSectionId
  guidance?: ReactNode
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
    exchangeRate,
    manualBalanceUsd,
    notes,
    tagIds,
    excludeFromTotalBalance,
    excludeFromTodayIncome,
    cookieAuthSessionCookie,
    sub2apiUseRefreshToken,
    sub2apiRefreshToken,
    sub2apiTokenExpiresAt,
    aimlApiKey,
    checkIn,
    siteType,
  } = draft
  const isAuthTypeLocked = sitePolicy.forceAccessTokenAuth
  const canUseCookieAuth = sitePolicy.allowCookieAuthSession
  const canUseSub2ApiRefreshToken = sitePolicy.allowSub2ApiRefreshTokenState
  const canUseAimlApiKey = sitePolicy.allowAimlApiKey
  const credentialPresentation = sitePolicy.accessTokenPresentation
  const nanoGptCredentials = parseNanoGptCredentials(accessToken)
  const novitaCredentials = parseNovitaCredentials(accessToken)
  const accessTokenRequired =
    siteType === SITE_TYPES.NANOGPT
      ? !nanoGptCredentials.managementToken
      : siteType !== SITE_TYPES.NOVITA || !novitaCredentials.consoleToken
  const accessTokenInputValue =
    siteType === SITE_TYPES.NOVITA
      ? novitaCredentials.apiKey
      : siteType === SITE_TYPES.NANOGPT
        ? nanoGptCredentials.apiKey
        : accessToken
  const accessTokenLabel =
    siteType === SITE_TYPES.NOVITA
      ? t("novitaCredentials.apiKey")
      : t(credentialPresentation.accessTokenLabelKey ?? "form.accessToken")
  const accessTokenInputRef = useRef<HTMLInputElement>(null)
  const credentialFeedbackId = useId()
  const showApiKeyVerification =
    siteType === SITE_TYPES.NOVITA && Boolean(novitaCredentialActions)
  const isConsoleOperation = novitaCredentialActions?.operation === "console"
  const isAccountOperation = novitaCredentialActions?.operation === "account"
  const verificationStatus =
    showApiKeyVerification &&
    Boolean(novitaCredentials.apiKey) &&
    !isConsoleOperation &&
    !isAccountOperation
      ? novitaCredentialActions?.verification?.status
      : undefined
  const isVerifyingApiKey =
    showApiKeyVerification &&
    Boolean(novitaCredentials.apiKey) &&
    !isConsoleOperation &&
    !isAccountOperation &&
    novitaCredentialActions?.isVerifying
  const credentialFeedback = isVerifyingApiKey
    ? t("novitaCredentials.verifying")
    : verificationStatus === "success"
      ? t("novitaCredentials.apiKeyVerified", {
          account:
            novitaCredentialActions?.verification?.accountLabel || userId,
        })
      : verificationStatus === "error"
        ? novitaCredentialActions?.verification?.message
        : undefined
  const loginMethodRef = useRef<HTMLButtonElement>(null)
  const clearLoginHighlightRef = useRef<(() => void) | undefined>(undefined)
  const [isLoginSectionOpen, setIsLoginSectionOpen] = useState(true)
  const [loginFocusRequested, setLoginFocusRequested] = useState(false)
  const handleConfigureLogin = () => {
    setIsLoginSectionOpen(true)
    setLoginFocusRequested(true)
  }
  const usesLoginCheckIn =
    resolveSelectedCheckInMethod({ config: checkIn, siteType, siteUrl }) ===
    AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn
  const loginTarget = {
    authType,
    site_type: siteType,
    site_url: siteUrl ?? "",
    account_info: { id: userId },
  }
  const supportsCookieRecovery = supportsAccountCookieRecovery(loginTarget)
  const usesAccountLogin =
    usesLoginCheckIn || supportsAccountCredentialRecovery(loginTarget)
  useEffect(() => {
    if (focusSection === "account-login" && usesAccountLogin) {
      setIsLoginSectionOpen(true)
      setLoginFocusRequested(true)
    }
  }, [focusSection, usesAccountLogin])
  const loginConfigured = isAccountLoginConfigured(
    draft.login,
    getAccountLoginMethods(loginTarget),
  )
  const [isAuthSectionOpen, setIsAuthSectionOpen] = useState(
    ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["account-auth"],
  )
  const [accessTokenFocusRequested, setAccessTokenFocusRequested] =
    useState(false)

  useImperativeHandle(
    ref,
    () => ({
      focusAccessToken: () => {
        setIsAuthSectionOpen(true)
        setAccessTokenFocusRequested(true)
      },
    }),
    [],
  )

  useLayoutEffect(() => {
    if (!accessTokenFocusRequested) return

    const input = accessTokenInputRef.current
    if (input) revealNavigationTarget(input, { block: "center", focus: true })
    setAccessTokenFocusRequested(false)
  }, [accessTokenFocusRequested, isAuthSectionOpen])

  useLayoutEffect(() => {
    if (!loginFocusRequested) return
    loginMethodRef.current?.focus({ preventScroll: true })
    const section = document.getElementById(ACCOUNT_LOGIN_SECTION_ID)
    if (section) {
      clearLoginHighlightRef.current = revealNavigationTarget(section, {
        highlight: true,
      })
    }
    setLoginFocusRequested(false)
  }, [loginFocusRequested, isLoginSectionOpen])

  useEffect(() => () => clearLoginHighlightRef.current?.(), [usesAccountLogin])

  const hasFeedbackSiteChanged = Boolean(
    feedbackOriginalBaseUrl && feedbackOriginalBaseUrl !== feedbackBaseUrl,
  )

  const identityFields = (
    <>
      <FormField
        label={t("form.username")}
        required={sitePolicy.requireUsername}
      >
        <Input
          type="text"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder={t("form.username")}
          leftIcon={<AccountUserIcon className="h-5 w-5" />}
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.usernameInput}
          required={sitePolicy.requireUsername}
        />
      </FormField>

      {siteType === SITE_TYPES.VERCEL_AI_GATEWAY ? (
        <VercelTeamSelector
          accessToken={accessToken}
          value={userId}
          onChange={onUserIdChange}
        />
      ) : (
        <FormField label={t("form.userId")} required={sitePolicy.requireUserId}>
          <Input
            // Compatible account sites may expose alphanumeric user IDs. Reference: https://github.com/qixing-jk/all-api-hub/issues/964
            type="text"
            autoComplete="off"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
            placeholder={t("form.userId")}
            leftIcon={<Hash className="h-5 w-5" aria-hidden="true" />}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput}
            required={sitePolicy.requireUserId}
          />
        </FormField>
      )}
    </>
  )

  const cookieImportButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onImportCookieAuthSessionCookie}
      loading={isImportingCookies}
      disabled={cookieRecovery?.pending}
      leftIcon={<Download className="h-4 w-4" />}
      className="shrink-0"
      aria-label={
        isImportingCookies
          ? t("messages.importCookiesLoading")
          : t("form.importCookieAuthSessionCookie")
      }
    >
      <span className="sm:hidden">{t("common:actions.import")}</span>
      <span className="hidden sm:inline">
        {isImportingCookies
          ? t("messages.importCookiesLoading")
          : t("form.importCookieAuthSessionCookie")}
      </span>
    </Button>
  )
  const cookieFieldActions = sitePolicy.supportsCookieValidation ? (
    <>
      <Tooltip
        anchorAsChild
        positionStrategy="fixed"
        content={t("form.cookieAuthSessionCookieHelpDesc")}
        className="max-w-[min(22rem,calc(100vw-2rem))]! text-left leading-relaxed font-normal whitespace-normal"
      >
        <button
          type="button"
          aria-label={t("form.cookieAuthSessionCookieHelp")}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mr-auto inline-flex size-6 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2"
        >
          <HelpHintIcon className="size-4" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip
        anchorAsChild
        positionStrategy="fixed"
        content={t("form.importCookieAuthSessionCookieHint")}
        className="max-w-[min(22rem,calc(100vw-2rem))]! text-left leading-relaxed font-normal whitespace-normal"
      >
        {cookieImportButton}
      </Tooltip>
    </>
  ) : (
    cookieImportButton
  )
  const cookieRecoveryAction = supportsCookieRecovery ? (
    <AccountCredentialRecoveryGuidance
      compact
      account={{ siteType, authType, baseUrl: siteUrl ?? "" }}
      onConfigure={handleConfigureLogin}
    />
  ) : null

  const tagsAndNotes = (
    <AccountFormSection
      continuous={continuous}
      id={ACCOUNT_FORM_SECTION_ELEMENT_IDS["tags-notes"]}
      contentClassName={continuous ? "grid gap-4 sm:grid-cols-2" : undefined}
      title={t("sections.tagsAndNotes.title")}
      description={t("sections.tagsAndNotes.description")}
      defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["tags-notes"]}
      testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionTagsNotes}
    >
      <FormField label={t("form.tags")} description={t("form.tagsDescription")}>
        <TagPicker
          tags={tags}
          tagCountsById={tagCountsById}
          selectedTagIds={tagIds}
          onSelectedTagIdsChange={onSelectedTagIdsChange}
          onCreateTag={createTag}
          onRenameTag={renameTag}
          onDeleteTag={deleteTag}
          placeholder={t("form.tagsPlaceholder")}
        />
      </FormField>

      <FormField label={t("form.notes")}>
        <div className="relative">
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={t("form.notesPlaceholder")}
            rows={2}
          />
        </div>
      </FormField>
    </AccountFormSection>
  )

  const accessTokenField = (labelAction?: ReactNode) => (
    <FormField
      label={accessTokenLabel}
      labelAction={labelAction}
      required={accessTokenRequired}
    >
      <Input
        ref={accessTokenInputRef}
        type="password"
        revealable
        revealed={showAccessToken}
        onRevealedChange={onShowAccessTokenChange}
        revealLabels={{
          show:
            siteType === SITE_TYPES.NOVITA
              ? t("novitaCredentials.showApiKey")
              : t("form.showAccessToken"),
          hide:
            siteType === SITE_TYPES.NOVITA
              ? t("novitaCredentials.hideApiKey")
              : t("form.hideAccessToken"),
        }}
        value={accessTokenInputValue}
        variant={
          verificationStatus === "error"
            ? "error"
            : verificationStatus === "success"
              ? "success"
              : undefined
        }
        aria-invalid={verificationStatus === "error" || undefined}
        aria-busy={isVerifyingApiKey || undefined}
        aria-describedby={credentialFeedback ? credentialFeedbackId : undefined}
        rightIcon={
          showApiKeyVerification && novitaCredentialActions ? (
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("novitaCredentials.verifyKey")}
              onClick={novitaCredentialActions.onVerify}
              loading={Boolean(isVerifyingApiKey)}
              disabled={
                novitaCredentialActions.isVerifying ||
                !accessTokenInputValue.trim()
              }
            >
              <BadgeCheck className="h-4 w-4" />
            </IconButton>
          ) : undefined
        }
        onChange={(e) =>
          onAccessTokenChange(
            siteType === SITE_TYPES.NOVITA
              ? encodeNovitaCredentials({
                  ...novitaCredentials,
                  apiKey: e.target.value,
                })
              : siteType === SITE_TYPES.NANOGPT
                ? encodeNanoGptCredentials({
                    ...nanoGptCredentials,
                    apiKey: e.target.value,
                  })
                : e.target.value,
          )
        }
        placeholder={accessTokenLabel}
        leftIcon={<KeyRound className="h-5 w-5" />}
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput}
        required={accessTokenRequired}
      />
      {credentialFeedback && (
        <p
          id={credentialFeedbackId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={
            verificationStatus === "error"
              ? "text-destructive-text text-xs"
              : verificationStatus === "success"
                ? "text-success-text text-xs"
                : "text-muted-foreground text-xs"
          }
        >
          {credentialFeedback}
        </p>
      )}
    </FormField>
  )

  return (
    <AccountFormLayout
      continuous={continuous}
      focusSection={focusSection}
      hasAccountLogin={usesAccountLogin}
      guidance={guidance}
    >
      <AccountFormSection
        continuous={continuous}
        id={ACCOUNT_FORM_SECTION_ELEMENT_IDS["site-info"]}
        contentClassName={
          continuous ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : undefined
        }
        title={t("sections.siteInfo.title")}
        defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["site-info"]}
        testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo}
      >
        {siteInfoInput && (
          <div className="space-y-density-2 col-span-full">{siteInfoInput}</div>
        )}
        <FormField label={t("form.siteName")} required>
          <Input
            type="text"
            value={siteName}
            onChange={(e) => onSiteNameChange(e.target.value)}
            placeholder="example.com"
            leftIcon={<Building2 className="h-5 w-5" aria-hidden="true" />}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput}
            required
          />
        </FormField>

        <FormField label={t("form.siteType")}>
          <Select
            value={siteType ?? SITE_TYPES.UNKNOWN}
            onValueChange={onSiteTypeChange}
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("form.siteType")}
              title={t("form.siteType")}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger}
              data-site-type={siteType ?? SITE_TYPES.UNKNOWN}
            >
              <div className="gap-y-density-2 flex items-center gap-x-2">
                <AccountSiteTypeIcon
                  className="text-muted-foreground h-5 w-5"
                  aria-hidden="true"
                />
                <SelectValue placeholder={t("form.siteType")} />
              </div>
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_FORM_SITE_TYPE_OPTIONS.map((siteType) => (
                <SelectItem
                  key={siteType}
                  value={siteType}
                  data-testid={getAccountManagementSiteTypeOptionTestId(
                    siteType,
                  )}
                >
                  {siteType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {continuous && identityFields}
      </AccountFormSection>

      <AccountFormSection
        continuous={continuous}
        id={ACCOUNT_FORM_SECTION_ELEMENT_IDS["account-auth"]}
        contentClassName={
          continuous
            ? authType === AuthTypeEnum.Cookie
              ? "space-y-density-4"
              : "grid gap-4 sm:grid-cols-2"
            : undefined
        }
        title={t("sections.accountAuth.title")}
        defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["account-auth"]}
        open={isAuthSectionOpen}
        onOpenChange={setIsAuthSectionOpen}
        testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth}
      >
        <FormField
          label={
            continuous &&
            !isAuthTypeLocked &&
            !sitePolicy.usesBrowserCookieSession ? (
              <span className="inline-flex items-center gap-1.5">
                {t("siteInfo.authMethod")}
                <Tooltip
                  content={t("siteInfo.cookieWarning")}
                  wrapperClassName="inline-flex"
                  positionStrategy="fixed"
                  className="max-w-[min(22rem,calc(100vw-2rem))]! text-left leading-relaxed font-normal whitespace-normal"
                >
                  <button
                    type="button"
                    aria-label={t("siteInfo.cookieWarning")}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-4 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <HelpHintIcon className="size-4" aria-hidden="true" />
                  </button>
                </Tooltip>
              </span>
            ) : (
              t("siteInfo.authMethod")
            )
          }
          className={
            continuous && authType === AuthTypeEnum.Cookie
              ? "sm:max-w-sm"
              : undefined
          }
          description={
            continuous && authType === AuthTypeEnum.Cookie
              ? undefined
              : isAuthTypeLocked
                ? t("siteInfo.authMethodSelectedForSite", {
                    siteType: sitePolicy.siteTypeLabel,
                  })
                : sitePolicy.usesBrowserCookieSession
                  ? t("siteInfo.browserCookieSession")
                  : continuous
                    ? undefined
                    : t("siteInfo.cookieWarning")
          }
        >
          <Select
            value={authType}
            onValueChange={(value) => onAuthTypeChange(value as AuthTypeEnum)}
            disabled={isDetected || isAuthTypeLocked}
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("siteInfo.authMethod")}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.authTypeTrigger}
              data-auth-type={authType}
            >
              <SelectValue placeholder={t("siteInfo.authMethodPlaceholder")} />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-48">
              <SelectItem value={AuthTypeEnum.AccessToken}>
                <div className="gap-y-density-2 flex items-center gap-x-2">
                  <KeyRound className="h-4 w-4" />
                  <span>{t("siteInfo.authType.accessToken")}</span>
                </div>
              </SelectItem>
              {canUseCookieAuth && (
                <SelectItem value={AuthTypeEnum.Cookie}>
                  <div className="gap-y-density-2 flex items-center gap-x-2">
                    <Cookie className="h-4 w-4" />
                    <span>{t("siteInfo.authType.cookieAuth")}</span>
                  </div>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </FormField>

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

            {autoCreateAccessToken?.enabled &&
              accessToken.trim().length === 0 && (
                <div className="gap-y-density-2 flex flex-col">
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
                        className="text-muted-foreground text-xs"
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
              <p className="text-muted-foreground text-xs">
                {t("form.aimlApiKeyHelp")}
              </p>
            </div>
          </FormField>
        )}

        {canUseSub2ApiRefreshToken && (
          <div className="space-y-density-4 col-span-full">
            <div className="gap-y-density-4 flex w-full items-center justify-between gap-x-4">
              <div className="flex-1">
                <label
                  htmlFor="sub2api-refresh-token-mode"
                  className="text-secondary-foreground text-sm font-medium"
                >
                  {t("form.sub2apiRefreshTokenMode")}
                </label>
                <p className="text-muted-foreground mt-density-1 text-xs">
                  {t("form.sub2apiRefreshTokenModeDesc")}
                </p>
              </div>
              <Switch
                checked={sub2apiUseRefreshToken}
                onChange={onSub2apiUseRefreshTokenChange}
                id="sub2api-refresh-token-mode"
                data-testid={
                  ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenSwitch
                }
              />
            </div>

            {sub2apiUseRefreshToken && (
              <div className="space-y-density-4">
                <Alert
                  variant="warning"
                  title={t("form.sub2apiRefreshTokenWarningTitle")}
                  description={t("form.sub2apiRefreshTokenWarningDesc")}
                />

                <FormField label={t("form.sub2apiRefreshToken")} required>
                  <div className="space-y-density-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onImportSub2apiSession}
                      loading={isImportingSub2apiSession}
                      className="w-full"
                      data-testid={
                        ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiImportSessionButton
                      }
                      leftIcon={<Download className="h-4 w-4" />}
                    >
                      {isImportingSub2apiSession
                        ? t("common:status.importing")
                        : t("form.sub2apiImportRefreshToken")}
                    </Button>
                    <Input
                      type="password"
                      revealable
                      revealLabels={{
                        show: t("form.showRefreshToken"),
                        hide: t("form.hideRefreshToken"),
                      }}
                      value={sub2apiRefreshToken}
                      onChange={(e) =>
                        onSub2apiRefreshTokenChange(e.target.value)
                      }
                      placeholder={t("form.sub2apiRefreshTokenPlaceholder")}
                      leftIcon={<KeyRound className="h-5 w-5" />}
                      data-testid={
                        ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenInput
                      }
                      required
                    />
                  </div>
                </FormField>

                {typeof sub2apiTokenExpiresAt === "number" && (
                  <FormField label={t("form.sub2apiTokenExpiresAt")}>
                    <Input
                      type="text"
                      value={formatLocaleDateTime(
                        sub2apiTokenExpiresAt,
                        t("common:labels.notAvailable"),
                      )}
                      leftIcon={<CalendarDays className="h-5 w-5" />}
                      disabled
                    />
                  </FormField>
                )}
              </div>
            )}
          </div>
        )}

        {authType === AuthTypeEnum.Cookie && (
          <FormField
            className={continuous ? "col-span-full" : undefined}
            label={t("form.cookieAuthSessionCookie")}
            labelAction={cookieFieldActions}
            htmlFor="account-session-cookie"
            description={
              sitePolicy.usesBrowserCookieSession
                ? t("siteInfo.browserCookieSession")
                : undefined
            }
            required={!sitePolicy.usesBrowserCookieSession}
          >
            <div className="space-y-density-2">
              <CookieAuthPermissionRecommendation
                compact
                cookieAuthPermissionsGranted={cookieAuthPermissionsGranted}
                isRequestingCookieAuthPermissions={
                  isRequestingCookieAuthPermissions
                }
                onRequestCookieAuthPermissions={onRequestCookieAuthPermissions}
              />
              {showCookiePermissionWarning && (
                <Alert
                  variant="warning"
                  description={t("messages.importCookiesPermissionDenied")}
                >
                  <div className="pt-density-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onOpenCookiePermissionSettings}
                    >
                      {t("form.cookiePermissionHelpAction")}
                    </Button>
                  </div>
                </Alert>
              )}
              <div
                role="group"
                aria-label={t("form.cookieAuthSessionCookie")}
                className={
                  sitePolicy.supportsCookieValidation
                    ? "border-input bg-card focus-within:ring-ring overflow-hidden rounded-md border focus-within:ring-2"
                    : undefined
                }
              >
                <Textarea
                  id="account-session-cookie"
                  className={
                    sitePolicy.supportsCookieValidation
                      ? "rounded-none border-0 font-mono leading-relaxed focus:ring-0"
                      : "font-mono leading-relaxed"
                  }
                  value={cookieAuthSessionCookie}
                  onChange={(e) =>
                    onCookieAuthSessionCookieChange(e.target.value)
                  }
                  placeholder={t("form.cookieAuthSessionCookiePlaceholder")}
                  rows={2}
                  required={!sitePolicy.usesBrowserCookieSession}
                />
                {sitePolicy.supportsCookieValidation && (
                  <AccountCookieVerification
                    siteType={siteType}
                    siteUrl={siteUrl ?? ""}
                    userId={userId}
                    cookie={cookieAuthSessionCookie}
                    verifiedCookie={cookieRecovery?.verifiedCookie}
                    busy={isImportingCookies}
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
                  />
                )}
              </div>
              <CookieAuthCompatibilityHint
                hasAccessToken={Boolean(accessToken.trim())}
                description={
                  sitePolicy.usesBrowserCookieSession ||
                  sitePolicy.supportsCookieValidation
                    ? undefined
                    : t("form.cookieAuthSessionCookieDesc")
                }
                supportsValidation={sitePolicy.supportsCookieValidation}
                recovery={supportsCookieRecovery}
                recoveryAction={cookieRecoveryAction}
              />
            </div>
          </FormField>
        )}
      </AccountFormSection>

      {!continuous && tagsAndNotes}

      <AccountCheckInSection
        continuous={continuous}
        loginMethodId={draft.login?.methodId}
        loginConfigured={loginConfigured}
        onConfigureLogin={usesLoginCheckIn ? handleConfigureLogin : undefined}
        feedbackSource={{
          accountId: feedbackAccountId,
          snapshot: {
            baseUrl: feedbackBaseUrl,
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
          open={isLoginSectionOpen}
          onOpenChange={setIsLoginSectionOpen}
        />
      )}

      <AccountFormSection
        continuous={continuous}
        id={ACCOUNT_FORM_SECTION_ELEMENT_IDS["balance"]}
        contentClassName={continuous ? "grid gap-4 sm:grid-cols-2" : undefined}
        title={t("sections.balanceAndStats.title")}
        defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN.balance}
        testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionBalance}
      >
        <FormField
          label={t("form.exchangeRate")}
          description={t("form.exchangeRateDesc")}
          error={
            !isValidExchangeRate(exchangeRate) && exchangeRate
              ? t("form.validRateError")
              : undefined
          }
          required
        >
          <Input
            type="number"
            step="any"
            min="0"
            value={exchangeRate}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.exchangeRateInput}
            onChange={(e) => onExchangeRateChange(e.target.value)}
            placeholder={t("form.exchangeRatePlaceholder")}
            leftIcon={<ArrowLeftRight className="h-5 w-5" aria-hidden="true" />}
            rightIcon={
              <span className="dark:text-secondary-foreground text-muted-foreground text-sm">
                CNY
              </span>
            }
            variant={
              !isValidExchangeRate(exchangeRate) && exchangeRate
                ? "error"
                : "default"
            }
            required
          />
        </FormField>

        <FormField
          label={t("form.manualBalanceUsd")}
          description={t("form.manualBalanceUsdDesc")}
          error={
            isManualBalanceUsdInvalid
              ? t("form.manualBalanceUsdError")
              : undefined
          }
        >
          <Input
            type="number"
            step="any"
            min="0"
            value={manualBalanceUsd}
            onChange={(e) => onManualBalanceUsdChange(e.target.value)}
            placeholder={t("form.manualBalanceUsdPlaceholder")}
            leftIcon={<DollarSign className="h-5 w-5" />}
            rightIcon={
              <span className="dark:text-secondary-foreground text-muted-foreground text-sm">
                USD
              </span>
            }
            variant={isManualBalanceUsdInvalid ? "error" : "default"}
          />
        </FormField>

        <div className="gap-y-density-4 flex w-full items-center justify-between gap-x-4">
          <div className="flex-1">
            <label
              htmlFor="exclude-from-total-balance"
              className="text-secondary-foreground text-sm font-medium"
            >
              {t("form.excludeFromTotalBalance")}
            </label>
            <p className="text-muted-foreground mt-density-1 text-xs">
              {t("form.excludeFromTotalBalanceDesc")}
            </p>
          </div>
          <Switch
            checked={excludeFromTotalBalance}
            onChange={onExcludeFromTotalBalanceChange}
            id="exclude-from-total-balance"
          />
        </div>

        <div className="gap-y-density-4 flex w-full items-center justify-between gap-x-4">
          <div className="flex-1">
            <label
              htmlFor="exclude-from-today-income"
              className="text-secondary-foreground text-sm font-medium"
            >
              {t("form.excludeFromTodayIncome")}
            </label>
            <p className="text-muted-foreground mt-density-1 text-xs">
              {t("form.excludeFromTodayIncomeDesc")}
            </p>
          </div>
          <Switch
            checked={excludeFromTodayIncome}
            onChange={onExcludeFromTodayIncomeChange}
            id="exclude-from-today-income"
          />
        </div>
      </AccountFormSection>
      {continuous && tagsAndNotes}
    </AccountFormLayout>
  )
}
