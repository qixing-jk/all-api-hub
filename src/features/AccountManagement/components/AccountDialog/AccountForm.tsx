import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  CurrencyDollarIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
  KeyIcon,
  TicketIcon,
  UserIcon,
} from "@heroicons/react/24/outline"
import { Cookie } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  FormField,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "~/components/ui"
import { SITE_TITLE_RULES, SUB2API, UNKNOWN_SITE } from "~/constants/siteType"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/AccountFormSection"
import { ACCOUNT_FORM_MOBILE_DEFAULT_OPEN } from "~/features/AccountManagement/components/AccountDialog/accountFormSections"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { isValidExchangeRate } from "~/services/accounts/accountOperations"
import { AuthTypeEnum, type CheckInConfig, type Tag } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"

interface AccountFormProps {
  draft: AccountDialogDraft
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
  onToggleShowAccessToken: () => void
  onNotesChange: (value: string) => void
  onSelectedTagIdsChange: (value: string[]) => void
  onExcludeFromTotalBalanceChange: (value: boolean) => void
  onCookieAuthSessionCookieChange: (value: string) => void
  onImportCookieAuthSessionCookie: () => void
  onOpenCookiePermissionSettings: () => void
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
  onToggleShowAccessToken,
  onNotesChange,
  onSelectedTagIdsChange,
  onExcludeFromTotalBalanceChange,
  onCookieAuthSessionCookieChange,
  onImportCookieAuthSessionCookie,
  onOpenCookiePermissionSettings,
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
  const { t } = useTranslation("accountDialog")
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
    cookieAuthSessionCookie,
    sub2apiUseRefreshToken,
    sub2apiRefreshToken,
    sub2apiTokenExpiresAt,
    checkIn,
    siteType,
  } = draft
  const isSub2Api = siteType === SUB2API
  const [showSub2apiRefreshToken, setShowSub2apiRefreshToken] = useState(false)

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
            leftIcon={<GlobeAltIcon className="h-5 w-5" />}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.siteNameInput}
            required
          />
        </FormField>

        <FormField label={t("form.siteType")}>
          <Select
            value={siteType ?? UNKNOWN_SITE}
            onValueChange={onSiteTypeChange}
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("form.siteType")}
              title={t("form.siteType")}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger}
              data-site-type={siteType ?? UNKNOWN_SITE}
            >
              <div className="flex items-center gap-2">
                <GlobeAltIcon className="text-muted-foreground h-5 w-5" />
                <SelectValue placeholder={t("form.siteType")} />
              </div>
            </SelectTrigger>
            <SelectContent>
              {SITE_TITLE_RULES.map((rule) => (
                <SelectItem key={rule.name} value={rule.name}>
                  {rule.name}
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
            isSub2Api
              ? t("siteInfo.sub2apiAuthOnly")
              : t("siteInfo.cookieWarning")
          }
        >
          <Select
            value={authType}
            onValueChange={(value) => onAuthTypeChange(value as AuthTypeEnum)}
            disabled={isDetected || isSub2Api}
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
                  <KeyIcon className="h-4 w-4" />
                  <span>{t("siteInfo.authType.accessToken")}</span>
                </div>
              </SelectItem>
              {!isSub2Api && (
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

        <FormField label={t("form.username")} required>
          <Input
            type="text"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder={t("form.username")}
            leftIcon={<UserIcon className="h-5 w-5" />}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.usernameInput}
            required
          />
        </FormField>

        <FormField label={t("form.userId")} required>
          <Input
            type="number"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
            placeholder={t("form.userIdNumber")}
            leftIcon={<span className="font-mono text-sm">#</span>}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.userIdInput}
            required
          />
        </FormField>

        {authType === AuthTypeEnum.AccessToken && (
          <FormField label={t("form.accessToken")} required>
            <Input
              type={showAccessToken ? "text" : "password"}
              value={accessToken}
              onChange={(e) => onAccessTokenChange(e.target.value)}
              placeholder={t("form.accessToken")}
              leftIcon={<KeyIcon className="h-5 w-5" />}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput}
              rightIcon={
                <IconButton
                  type="button"
                  onClick={onToggleShowAccessToken}
                  variant="ghost"
                  size="sm"
                  aria-label={t("form.toggleAccessTokenVisibility")}
                >
                  {showAccessToken ? (
                    <EyeSlashIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </IconButton>
              }
              required
            />
          </FormField>
        )}

        {isSub2Api && (
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
                      disabled={isImportingSub2apiSession}
                      loading={isImportingSub2apiSession}
                      className="w-full"
                      data-testid={
                        ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiImportSessionButton
                      }
                      leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                    >
                      {t("form.sub2apiImportRefreshToken")}
                    </Button>
                    <Input
                      type={showSub2apiRefreshToken ? "text" : "password"}
                      value={sub2apiRefreshToken}
                      onChange={(e) =>
                        onSub2apiRefreshTokenChange(e.target.value)
                      }
                      placeholder={t("form.sub2apiRefreshTokenPlaceholder")}
                      leftIcon={<KeyIcon className="h-5 w-5" />}
                      data-testid={
                        ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenInput
                      }
                      rightIcon={
                        <IconButton
                          type="button"
                          onClick={() =>
                            setShowSub2apiRefreshToken(!showSub2apiRefreshToken)
                          }
                          variant="ghost"
                          size="sm"
                          aria-label={t("form.toggleRefreshTokenVisibility")}
                        >
                          {showSub2apiRefreshToken ? (
                            <EyeSlashIcon className="h-4 w-4" />
                          ) : (
                            <EyeIcon className="h-4 w-4" />
                          )}
                        </IconButton>
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
                      leftIcon={<CalendarDaysIcon className="h-5 w-5" />}
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onImportCookieAuthSessionCookie}
                disabled={isImportingCookies}
                className="w-full"
              >
                <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
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
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex-1">
            <label
              htmlFor="supports-check-in"
              className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
            >
              {t("form.checkInStatus")}
            </label>
            {isSub2Api && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t("form.sub2apiCheckInUnsupported")}
              </p>
            )}
          </div>
          <Switch
            checked={checkIn.enableDetection}
            onChange={(enableDetection) =>
              onCheckInChange({
                ...checkIn,
                enableDetection,
                // When detection turns on, default auto check-in to true unless
                // the user has explicitly disabled it with false; turning
                // detection off leaves the last preference untouched.
                autoCheckInEnabled:
                  enableDetection && checkIn.autoCheckInEnabled !== false
                    ? checkIn.autoCheckInEnabled ?? true
                    : checkIn.autoCheckInEnabled,
              })
            }
            id="supports-check-in"
            disabled={isSub2Api}
            className={`${
              checkIn.enableDetection ? "bg-green-600" : "bg-gray-200"
            } focus:ring-green-500`}
          />
        </div>

        {checkIn.enableDetection && (
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
              checked={checkIn.autoCheckInEnabled !== false}
              onChange={(autoCheckInEnabled) =>
                onCheckInChange({ ...checkIn, autoCheckInEnabled })
              }
              id="auto-checkin-enabled"
              className={`${
                checkIn.autoCheckInEnabled !== false
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
            leftIcon={<CalendarDaysIcon className="h-5 w-5" />}
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
            leftIcon={<TicketIcon className="h-5 w-5" />}
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
            leftIcon={<CurrencyDollarIcon className="h-5 w-5" />}
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
            leftIcon={<CurrencyDollarIcon className="h-5 w-5" />}
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
      </AccountFormSection>
    </div>
  )
}
