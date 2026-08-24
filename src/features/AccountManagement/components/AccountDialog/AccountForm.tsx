import {
  CalendarDays,
  Cookie,
  DollarSign,
  Download,
  Globe2,
  KeyRound,
  Ticket,
  User,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "~/components/ui"
import { CHECK_IN_SELECTION_STATUSES } from "~/constants/checkIn"
import { ACCOUNT_SITE_TYPES, SITE_TYPES } from "~/constants/siteType"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/AccountFormSection"
import { ACCOUNT_FORM_MOBILE_DEFAULT_OPEN } from "~/features/AccountManagement/components/AccountDialog/accountFormSections"
import {
  CookieAuthPermissionRecommendation,
  type CookieAuthPermissionRecommendationProps,
} from "~/features/AccountManagement/components/AccountDialog/CookieAuthPermissionRecommendation"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import type { AccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSiteTypeOptionTestId,
} from "~/features/AccountManagement/testIds"
import { isValidExchangeRate } from "~/services/accounts/accountOperations"
import { inspectAccountCheckIn } from "~/services/checkin/autoCheckin/inspection"
import { AuthTypeEnum, type CheckInConfig, type Tag } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"

const ACCOUNT_FORM_SITE_TYPE_OPTIONS = ACCOUNT_SITE_TYPES.filter(
  (siteType) => siteType !== SITE_TYPES.UNKNOWN,
)

type AccountFormPresentationSitePolicy = Pick<
  AccountDialogSitePolicy,
  | "siteTypeLabel"
  | "forceAccessTokenAuth"
  | "allowCookieAuthSession"
  | "allowBuiltInCheckInDetection"
  | "allowSub2ApiRefreshTokenState"
  | "requireUsername"
  | "requireUserId"
>

interface AccountFormProps {
  draft: AccountDialogDraft
  sitePolicy: AccountFormPresentationSitePolicy
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
  onCheckInChange: (value: CheckInConfig) => void
}

/**
 * Account form body used inside the account dialog for creating/editing accounts.
 */
export default function AccountForm({
  draft,
  sitePolicy,
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
  onCheckInChange,
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
  const checkInInspection = inspectAccountCheckIn({
    config: checkIn,
    siteType,
  })
  const isAuthTypeLocked = sitePolicy.forceAccessTokenAuth
  const canUseCookieAuth = sitePolicy.allowCookieAuthSession
  const canUseBuiltInCheckInDetection =
    sitePolicy.allowBuiltInCheckInDetection &&
    checkInInspection.selectionState.status ===
      CHECK_IN_SELECTION_STATUSES.Selected
  const showBuiltInAutoCheckIn = canUseBuiltInCheckInDetection
  const canUseSub2ApiRefreshToken = sitePolicy.allowSub2ApiRefreshTokenState
  const isOpenRouterManagementKey = siteType === SITE_TYPES.OPENROUTER

  return (
    <div className="space-y-3">
      <AccountFormSection
        title={t("sections.siteInfo.title")}
        defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["site-info"]}
        testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo}
      >
        <FormField label={t("form.siteName")} required>
          <Input
            type="text"
            value={siteName}
            onChange={(e) => onSiteNameChange(e.target.value)}
            placeholder="example.com"
            leftIcon={<Globe2 className="h-5 w-5" />}
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
              <div className="flex items-center gap-2">
                <Globe2 className="text-muted-foreground h-5 w-5" />
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
      </AccountFormSection>

      <AccountFormSection
        title={t("sections.accountAuth.title")}
        defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["account-auth"]}
        testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionAuth}
      >
        <FormField
          label={t("siteInfo.authMethod")}
          description={
            isAuthTypeLocked
              ? t("siteInfo.authMethodSelectedForSite", {
                  siteType: sitePolicy.siteTypeLabel,
                })
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
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  <span>{t("siteInfo.authType.accessToken")}</span>
                </div>
              </SelectItem>
              {canUseCookieAuth && (
                <SelectItem value={AuthTypeEnum.Cookie}>
                  <div className="flex items-center gap-2">
                    <Cookie className="h-4 w-4" />
                    <span>{t("siteInfo.authType.cookieAuth")}</span>
                  </div>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label={t("form.username")}
          required={sitePolicy.requireUsername}
        >
          <Input
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder={t("form.username")}
            leftIcon={<User className="h-5 w-5" />}
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
            leftIcon={<span className="font-mono text-sm">#</span>}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput}
            required={sitePolicy.requireUserId}
          />
        </FormField>

        {authType === AuthTypeEnum.AccessToken && (
          <>
            <FormField
              label={
                isOpenRouterManagementKey
                  ? t("form.openrouterManagementKey")
                  : t("form.accessToken")
              }
              required
            >
              <Input
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
                placeholder={
                  isOpenRouterManagementKey
                    ? t("form.openrouterManagementKey")
                    : t("form.accessToken")
                }
                leftIcon={<KeyRound className="h-5 w-5" />}
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput}
                required
              />
            </FormField>
            {isOpenRouterManagementKey &&
              (!isDetected || accessToken.trim().length === 0) && (
                <Alert
                  variant="info"
                  title={t("form.openrouterManagementKeyGuidanceTitle")}
                  description={t("form.openrouterManagementKeyGuidance")}
                />
              )}
          </>
        )}

        {canUseSub2ApiRefreshToken && (
          <div className="space-y-4">
            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex-1">
                <label
                  htmlFor="sub2api-refresh-token-mode"
                  className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
                >
                  {t("form.sub2apiRefreshTokenMode")}
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
                className={`${
                  sub2apiUseRefreshToken ? "bg-green-600" : "bg-gray-200"
                } focus:ring-green-500`}
              />
            </div>

            {sub2apiUseRefreshToken && (
              <div className="space-y-4">
                <Alert
                  variant="info"
                  title={t("form.sub2apiRefreshTokenWarningTitle")}
                  description={t("form.sub2apiRefreshTokenWarningDesc")}
                />

                <FormField label={t("form.sub2apiRefreshToken")} required>
                  <div className="space-y-2">
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
            label={t("form.cookieAuthSessionCookie")}
            description={t("form.cookieAuthSessionCookieDesc")}
            required
          >
            <div className="space-y-2">
              <CookieAuthPermissionRecommendation
                cookieAuthPermissionsGranted={cookieAuthPermissionsGranted}
                isRequestingCookieAuthPermissions={
                  isRequestingCookieAuthPermissions
                }
                onRequestCookieAuthPermissions={onRequestCookieAuthPermissions}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onImportCookieAuthSessionCookie}
                loading={isImportingCookies}
                leftIcon={<Download className="h-4 w-4" />}
                className="w-full"
              >
                {isImportingCookies
                  ? t("messages.importCookiesLoading")
                  : t("form.importCookieAuthSessionCookie")}
              </Button>
              {showCookiePermissionWarning && (
                <Alert
                  variant="warning"
                  description={t("messages.importCookiesPermissionDenied")}
                >
                  <div className="pt-1">
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
                value={cookieAuthSessionCookie}
                onChange={(e) =>
                  onCookieAuthSessionCookieChange(e.target.value)
                }
                placeholder={t("form.cookieAuthSessionCookiePlaceholder")}
                rows={2}
                required
              />
            </div>
          </FormField>
        )}
      </AccountFormSection>

      <AccountFormSection
        title={t("sections.tagsAndNotes.title")}
        description={t("sections.tagsAndNotes.description")}
        defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["tags-notes"]}
        testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionTagsNotes}
      >
        <FormField
          label={t("form.tags")}
          description={t("form.tagsDescription")}
        >
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

      <AccountFormSection
        title={t("sections.checkInConfig.title")}
        defaultOpen={ACCOUNT_FORM_MOBILE_DEFAULT_OPEN["check-in"]}
        testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionCheckIn}
      >
        <div className="space-y-1">
          <p className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
            {t("form.checkInStatus")}
          </p>
          {canUseBuiltInCheckInDetection ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("form.checkInStatusDesc")}
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("form.checkInStatusUnsupported", {
                siteType,
              })}
            </p>
          )}
        </div>

        {showBuiltInAutoCheckIn && (
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex-1">
              <label
                htmlFor="auto-checkin-enabled"
                className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
              >
                {t("form.autoCheckInEnabled")}
              </label>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("form.autoCheckInEnabledDesc")}
              </p>
            </div>
            <Switch
              checked={checkIn.automaticExecutionEnabled}
              onChange={(automaticExecutionEnabled) =>
                onCheckInChange({ ...checkIn, automaticExecutionEnabled })
              }
              id="auto-checkin-enabled"
              className={`${
                checkIn.automaticExecutionEnabled
                  ? "bg-green-600"
                  : "bg-gray-200"
              } focus:ring-green-500`}
            />
          </div>
        )}

        <FormField
          label={t("form.customCheckInUrl")}
          description={t("form.customCheckInDesc")}
        >
          <Input
            type="url"
            id="custom-checkin-url"
            value={checkIn.customCheckIn?.url ?? ""}
            onChange={(e) =>
              onCheckInChange({
                ...checkIn,
                customCheckIn: {
                  ...(checkIn.customCheckIn ?? {
                    openRedeemWithCheckIn: true,
                  }),
                  url: e.target.value,
                },
              })
            }
            placeholder="https://cdk.example.com/"
            leftIcon={<CalendarDays className="h-5 w-5" />}
          />
        </FormField>

        {checkIn.customCheckIn?.url && (
          <div className="flex w-full items-center justify-between gap-4">
            <label
              htmlFor="open-redeem-with-checkin"
              className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
            >
              {t("form.openRedeemWithCheckIn")}
            </label>
            <Switch
              checked={checkIn.customCheckIn?.openRedeemWithCheckIn ?? true}
              onChange={(openRedeemWithCheckIn) =>
                onCheckInChange({
                  ...checkIn,
                  customCheckIn: {
                    ...(checkIn.customCheckIn ?? { url: "" }),
                    openRedeemWithCheckIn,
                  },
                })
              }
              id="open-redeem-with-checkin"
              className={`${
                checkIn.customCheckIn?.openRedeemWithCheckIn ?? true
                  ? "bg-green-600"
                  : "bg-gray-200"
              } focus:ring-green-500`}
            />
          </div>
        )}

        <FormField
          label={t("form.customRedeemUrl")}
          description={t("form.customRedeemUrlDesc")}
        >
          <Input
            type="text"
            id="custom-redeem-url"
            value={checkIn.customCheckIn?.redeemUrl ?? ""}
            onChange={(e) =>
              onCheckInChange({
                ...checkIn,
                customCheckIn: {
                  ...(checkIn.customCheckIn ?? { url: "" }),
                  redeemUrl: e.target.value,
                },
              })
            }
            placeholder="https://example.com/console/topup"
            leftIcon={<Ticket className="h-5 w-5" />}
          />
        </FormField>
      </AccountFormSection>

      <AccountFormSection
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
            leftIcon={<DollarSign className="h-5 w-5" />}
            rightIcon={
              <span className="dark:text-dark-text-secondary text-sm text-gray-500">
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
              <span className="dark:text-dark-text-secondary text-sm text-gray-500">
                USD
              </span>
            }
            variant={isManualBalanceUsdInvalid ? "error" : "default"}
          />
        </FormField>

        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex-1">
            <label
              htmlFor="exclude-from-total-balance"
              className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
            >
              {t("form.excludeFromTotalBalance")}
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("form.excludeFromTotalBalanceDesc")}
            </p>
          </div>
          <Switch
            checked={excludeFromTotalBalance}
            onChange={onExcludeFromTotalBalanceChange}
            id="exclude-from-total-balance"
            className={`${
              excludeFromTotalBalance ? "bg-green-600" : "bg-gray-200"
            } focus:ring-green-500`}
          />
        </div>

        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex-1">
            <label
              htmlFor="exclude-from-today-income"
              className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
            >
              {t("form.excludeFromTodayIncome")}
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("form.excludeFromTodayIncomeDesc")}
            </p>
          </div>
          <Switch
            checked={excludeFromTodayIncome}
            onChange={onExcludeFromTodayIncomeChange}
            id="exclude-from-today-income"
            className={`${
              excludeFromTodayIncome ? "bg-green-600" : "bg-gray-200"
            } focus:ring-green-500`}
          />
        </div>
      </AccountFormSection>
    </div>
  )
}
