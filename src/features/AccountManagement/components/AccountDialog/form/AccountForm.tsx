import {
  ArrowLeftRight,
  Building2,
  CalendarDays,
  CircleHelp,
  Cookie,
  DollarSign,
  Download,
  Hash,
  KeyRound,
} from "lucide-react"
import {
  useEffect,
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
} from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import {
  Alert,
  Button,
  FormField,
  Input,
  Label,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "~/components/ui"
import {
  ACCOUNT_LOGIN_METHODS,
  isAccountLoginProvider,
} from "~/constants/accountLogin"
import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { ACCOUNT_SITE_TYPES, SITE_TYPES } from "~/constants/siteType"
import { AccountCheckInSection } from "~/features/AccountManagement/components/AccountDialog/checkin/AccountCheckInSection"
import { AccountFormLayout } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormLayout"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormSection"
import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_ELEMENT_IDS,
  type AccountFormSectionId,
} from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import {
  CookieAuthPermissionRecommendation,
  type CookieAuthPermissionRecommendationProps,
} from "~/features/AccountManagement/components/AccountDialog/form/CookieAuthPermissionRecommendation"
import type { AccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
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
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSiteTypeOptionTestId,
} from "~/features/AccountManagement/testIds"
import { normalizePasswordCredentials } from "~/services/accountLogin/passwordCredentials"
import type { LoginProviderClaimConflict } from "~/services/accountLogin/providerClaims"
import { isValidExchangeRate } from "~/services/accounts/editing/accountFormValidation"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
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
  | "allowSub2ApiRefreshTokenState"
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
  isManualBalanceUsdInvalid: boolean
  showAccessToken: boolean
  isImportingCookies: boolean
  showCookiePermissionWarning: boolean
  isImportingSub2apiSession: boolean
  onSiteNameChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onUserIdChange: (value: string) => void
  onAccessTokenChange: (value: string) => void
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
  onOpenCookiePermissionSettings: () => void
  cookieAuthPermissionsGranted?: CookieAuthPermissionRecommendationProps["cookieAuthPermissionsGranted"]
  isRequestingCookieAuthPermissions?: boolean
  onRequestCookieAuthPermissions?: () => void
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
  isManualBalanceUsdInvalid,
  showAccessToken,
  isImportingCookies,
  showCookiePermissionWarning,
  isImportingSub2apiSession,
  onSiteNameChange,
  onUsernameChange,
  onUserIdChange,
  onAccessTokenChange,
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
  onOpenCookiePermissionSettings,
  cookieAuthPermissionsGranted,
  isRequestingCookieAuthPermissions,
  onRequestCookieAuthPermissions,
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
    checkIn,
    siteType,
  } = draft
  const isAuthTypeLocked = sitePolicy.forceAccessTokenAuth
  const canUseCookieAuth = sitePolicy.allowCookieAuthSession
  const canUseSub2ApiRefreshToken = sitePolicy.allowSub2ApiRefreshTokenState
  const credentialPresentation = sitePolicy.accessTokenPresentation
  const accessTokenLabel = t(
    credentialPresentation.accessTokenLabelKey ?? "form.accessToken",
  )
  const accessTokenInputRef = useRef<HTMLInputElement>(null)
  const loginMethodRef = useRef<HTMLButtonElement>(null)
  const clearLoginHighlightRef = useRef<(() => void) | undefined>(undefined)
  const [isLoginSectionOpen, setIsLoginSectionOpen] = useState(true)
  const [loginFocusRequested, setLoginFocusRequested] = useState(false)
  const usesAccountLogin =
    resolveSelectedCheckInMethod({ config: checkIn, siteType, siteUrl }) ===
    AUTO_CHECKIN_METHOD_IDS.AgentRouterLoginCheckIn
  const loginConfigured =
    !!draft.login &&
    (draft.login.methodId === ACCOUNT_LOGIN_METHODS.Password
      ? !!normalizePasswordCredentials(draft.login.credentials)
      : isAccountLoginProvider(draft.login.methodId))
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
    </>
  )

  const cookieImportAction = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onImportCookieAuthSessionCookie}
      loading={isImportingCookies}
      leftIcon={<Download className="h-4 w-4" />}
      className={continuous ? "shrink-0" : "w-full"}
    >
      {isImportingCookies
        ? t("messages.importCookiesLoading")
        : t("form.importCookieAuthSessionCookie")}
    </Button>
  )

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

  return (
    <AccountFormLayout
      continuous={continuous}
      focusSection={focusSection}
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
                    <CircleHelp className="size-4" aria-hidden="true" />
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
            <FormField label={accessTokenLabel} required>
              <Input
                ref={accessTokenInputRef}
                type="password"
                revealable
                revealed={showAccessToken}
                onRevealedChange={onShowAccessTokenChange}
                revealLabels={{
                  show: t("form.showAccessToken"),
                  hide: t("form.hideAccessToken"),
                }}
                value={accessToken}
                onChange={(e) => onAccessTokenChange(e.target.value)}
                placeholder={accessTokenLabel}
                leftIcon={<KeyRound className="h-5 w-5" />}
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput}
                required
              />
            </FormField>
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
            {credentialPresentation.accessTokenGuidanceKey &&
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
            label={continuous ? undefined : t("form.cookieAuthSessionCookie")}
            htmlFor="account-session-cookie"
            description={
              sitePolicy.usesBrowserCookieSession
                ? t("siteInfo.browserCookieSession")
                : t("form.cookieAuthSessionCookieDesc")
            }
            required={!sitePolicy.usesBrowserCookieSession}
          >
            {continuous && (
              <div className="gap-y-density-2 flex flex-wrap items-center justify-between gap-x-3">
                <Label
                  htmlFor="account-session-cookie"
                  required={!sitePolicy.usesBrowserCookieSession}
                >
                  {t("form.cookieAuthSessionCookie")}
                </Label>
                {cookieImportAction}
              </div>
            )}
            <div className="space-y-density-2">
              <CookieAuthPermissionRecommendation
                inlineAction={continuous}
                cookieAuthPermissionsGranted={cookieAuthPermissionsGranted}
                isRequestingCookieAuthPermissions={
                  isRequestingCookieAuthPermissions
                }
                onRequestCookieAuthPermissions={onRequestCookieAuthPermissions}
              />
              {!continuous && cookieImportAction}
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
              <Textarea
                id="account-session-cookie"
                className={continuous ? "font-mono" : undefined}
                value={cookieAuthSessionCookie}
                onChange={(e) =>
                  onCookieAuthSessionCookieChange(e.target.value)
                }
                placeholder={t("form.cookieAuthSessionCookiePlaceholder")}
                rows={2}
                required={!sitePolicy.usesBrowserCookieSession}
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
        onConfigureLogin={
          usesAccountLogin
            ? () => {
                setIsLoginSectionOpen(true)
                setLoginFocusRequested(true)
              }
            : undefined
        }
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
        draft.login?.methodId === ACCOUNT_LOGIN_METHODS.Password &&
        !loginConfigured && (
          <Notice tone="warning" description={t("login.incompleteHidden")} />
        )}

      {usesAccountLogin && (
        <AccountLoginSection
          continuous={continuous}
          siteUrl={siteUrl}
          passwordIdentity={
            getAccountSiteDefinition(draft.siteType)?.accountLogin
              ?.passwordIdentity
          }
          login={draft.login}
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
