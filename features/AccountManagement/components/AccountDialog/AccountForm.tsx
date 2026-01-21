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
import { useTranslation } from "react-i18next"

import {
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
import { SITE_TITLE_RULES } from "~/constants/siteType"
import { TagPicker } from "~/features/AccountManagement/components/TagPicker"
import { isValidExchangeRate } from "~/services/accountOperations"
import { AuthTypeEnum, type CheckInConfig, type Tag } from "~/types"

interface AccountFormProps {
  authType: AuthTypeEnum
  siteName: string
  username: string
  userId: string
  accessToken: string
  exchangeRate: string
  manualBalanceUsd: string
  showAccessToken: boolean
  notes: string
  selectedTagIds: string[]
  cookieAuthSessionCookie: string
  isImportingCookies: boolean
  onSiteNameChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onUserIdChange: (value: string) => void
  onAccessTokenChange: (value: string) => void
  onExchangeRateChange: (value: string) => void
  onManualBalanceUsdChange: (value: string) => void
  onToggleShowAccessToken: () => void
  onNotesChange: (value: string) => void
  onSelectedTagIdsChange: (value: string[]) => void
  onCookieAuthSessionCookieChange: (value: string) => void
  onImportCookieAuthSessionCookie: () => void
  tags: Tag[]
  tagCountsById?: Record<string, number>
  createTag: (name: string) => Promise<Tag>
  renameTag: (tagId: string, name: string) => Promise<Tag>
  deleteTag: (tagId: string) => Promise<{ updatedAccounts: number }>
  siteType: string
  onSiteTypeChange: (value: string) => void
  checkIn: CheckInConfig
  onCheckInChange: (value: CheckInConfig) => void
}

/**
 * Account form body used inside the account dialog for creating/editing accounts.
 * @param props Component props configuring every field and handler.
 * @param props.authType Selected authentication type controlling visible fields.
 * @param props.siteName Current site name value.
 * @param props.username Account username.
 * @param props.userId Numeric user id string.
 * @param props.accessToken Access token string for auth.
 * @param props.exchangeRate Top-up exchange rate value.
 * @param props.showAccessToken Whether the token input is visible.
 * @param props.notes User-provided notes.
 * @param props.selectedTagIds Selected tag ids.
 * @param props.onSiteNameChange Handler to update site name.
 * @param props.onUsernameChange Handler to update username.
 * @param props.onUserIdChange Handler to update user id.
 * @param props.onAccessTokenChange Handler to update access token.
 * @param props.onExchangeRateChange Handler to update exchange rate.
 * @param props.onToggleShowAccessToken Toggles token visibility.
 * @param props.onNotesChange Handler to update notes.
 * @param props.onSelectedTagIdsChange Handler to update tag id selection.
 * @param props.cookieAuthSessionCookie Cookie value used for cookie-based auth.
 * @param props.isImportingCookies Whether cookie import is in progress.
 * @param props.onCookieAuthSessionCookieChange Handler to update cookie value.
 * @param props.onImportCookieAuthSessionCookie Handler to trigger cookie import.
 * @param props.tags Tags available from the global tag store.
 * @param props.tagCountsById Optional usage counts keyed by tag id.
 * @param props.createTag Creates a new global tag.
 * @param props.renameTag Renames a global tag.
 * @param props.deleteTag Deletes a global tag (removes from all accounts).
 * @param props.siteType Selected site type identifier.
 * @param props.onSiteTypeChange Handler when site type changes.
 * @param props.checkIn Check-in configuration payload.
 * @param props.onCheckInChange Handler when check-in config changes.
 */
export default function AccountForm({
  authType,
  siteName,
  username,
  userId,
  accessToken,
  exchangeRate,
  manualBalanceUsd,
  showAccessToken,
  notes,
  selectedTagIds,
  cookieAuthSessionCookie,
  isImportingCookies,
  onSiteNameChange,
  onUsernameChange,
  onUserIdChange,
  onAccessTokenChange,
  onExchangeRateChange,
  onManualBalanceUsdChange,
  onToggleShowAccessToken,
  onNotesChange,
  onSelectedTagIdsChange,
  onCookieAuthSessionCookieChange,
  onImportCookieAuthSessionCookie,
  tags,
  tagCountsById,
  createTag,
  renameTag,
  deleteTag,
  siteType,
  onSiteTypeChange,
  checkIn,
  onCheckInChange,
}: AccountFormProps) {
  const { t } = useTranslation("accountDialog")

  return (
    <>
      {/* 网站名称 */}
      <FormField label={t("form.siteName")} required>
        <Input
          type="text"
          value={siteName}
          onChange={(e) => onSiteNameChange(e.target.value)}
          placeholder="example.com"
          leftIcon={<GlobeAltIcon className="h-5 w-5" />}
          required
        />
      </FormField>

      {/* 站点类型 */}
      <FormField label={t("form.siteType")}>
        <Select value={siteType ?? ""} onValueChange={onSiteTypeChange}>
          <SelectTrigger
            className="w-full"
            aria-label={t("form.siteType")}
            title={t("form.siteType")}
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

      {/* 用户名 */}
      <FormField label={t("form.username")} required>
        <Input
          type="text"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder={t("form.username")}
          leftIcon={<UserIcon className="h-5 w-5" />}
          required
        />
      </FormField>

      {/* 用户 ID */}
      <FormField label={t("form.userId")} required>
        <Input
          type="number"
          value={userId}
          onChange={(e) => onUserIdChange(e.target.value)}
          placeholder={t("form.userIdNumber")}
          leftIcon={<span className="font-mono text-sm">#</span>}
          required
        />
      </FormField>

      {/* 访问令牌 */}
      {authType === AuthTypeEnum.AccessToken && (
        <FormField label={t("form.accessToken")} required>
          <Input
            type={showAccessToken ? "text" : "password"}
            value={accessToken}
            onChange={(e) => onAccessTokenChange(e.target.value)}
            placeholder={t("form.accessToken")}
            leftIcon={<KeyIcon className="h-5 w-5" />}
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

      {/* Cookie Auth Session Cookie */}
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
            <Textarea
              value={cookieAuthSessionCookie}
              onChange={(e) => onCookieAuthSessionCookieChange(e.target.value)}
              placeholder={t("form.cookieAuthSessionCookiePlaceholder")}
              rows={2}
            />
          </div>
        </FormField>
      )}

      {/* 充值金额比例 */}
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
          manualBalanceUsd.trim() &&
          (!Number.isFinite(Number.parseFloat(manualBalanceUsd)) ||
            Number.parseFloat(manualBalanceUsd) < 0)
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
          variant={
            manualBalanceUsd.trim() &&
            (!Number.isFinite(Number.parseFloat(manualBalanceUsd)) ||
              Number.parseFloat(manualBalanceUsd) < 0)
              ? "error"
              : "default"
          }
        />
      </FormField>

      {/* 签到功能开关 */}
      <div className="flex w-full items-center justify-between">
        <label
          htmlFor="supports-check-in"
          className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
        >
          {t("form.checkInStatus")}
        </label>
        <Switch
          checked={checkIn.enableDetection}
          onChange={(enableDetection) =>
            onCheckInChange({
              ...checkIn,
              enableDetection,
              autoCheckInEnabled:
                enableDetection && checkIn.autoCheckInEnabled !== false
                  ? checkIn.autoCheckInEnabled ?? true
                  : checkIn.autoCheckInEnabled,
            })
          }
          id="supports-check-in"
          className={`${
            checkIn.enableDetection ? "bg-green-600" : "bg-gray-200"
          } focus:ring-green-500`}
        />
      </div>

      {/* 自动签到开关 */}
      {checkIn.enableDetection && (
        <div className="flex w-full items-center justify-between">
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

      {/* Custom Check-in URL */}
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
                ...(checkIn.customCheckIn ?? { openRedeemWithCheckIn: true }),
                url: e.target.value,
              },
            })
          }
          placeholder="https://cdk.example.com/"
          leftIcon={<CalendarDaysIcon className="h-5 w-5" />}
        />
      </FormField>

      {/* Open Redeem with Check-in Toggle - Only shown when custom check-in URL is set */}
      {checkIn.customCheckIn?.url && (
        <div className="flex w-full items-center justify-between">
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

      {/* Custom Redeem Url */}
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

      {/* 标签 */}
      <FormField label={t("form.tags")} description={t("form.tagsDescription")}>
        <TagPicker
          tags={tags}
          tagCountsById={tagCountsById}
          selectedTagIds={selectedTagIds}
          onSelectedTagIdsChange={onSelectedTagIdsChange}
          onCreateTag={createTag}
          onRenameTag={renameTag}
          onDeleteTag={deleteTag}
          placeholder={t("form.tagsPlaceholder")}
        />
      </FormField>

      {/* 备注 */}
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
    </>
  )
}
