import {
  CurrencyDollarIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
  KeyIcon,
  UserIcon,
} from "@heroicons/react/24/outline"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  FormField,
  IconButton,
  Input,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "~/components/ui"
import { SITE_TITLE_RULES } from "~/constants/siteType"
import { isValidExchangeRate } from "~/services/accountOperations"
import { AuthTypeEnum, type CheckInConfig } from "~/types"

interface AccountFormProps {
  authType: AuthTypeEnum
  siteName: string
  username: string
  userId: string
  accessToken: string
  cookieAuthSessionCookie: string
  exchangeRate: string
  showAccessToken: boolean
  notes: string
  tags: string[]
  onSiteNameChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onUserIdChange: (value: string) => void
  onAccessTokenChange: (value: string) => void
  onCookieAuthSessionCookieChange: (value: string) => void
  onExchangeRateChange: (value: string) => void
  onToggleShowAccessToken: () => void
  onNotesChange: (value: string) => void
  onTagsChange: (value: string[]) => void
  availableTags: string[]
  tagCounts?: Record<string, number>
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
 * @param props.cookieAuthSessionCookie Cookie-auth session cookie header value.
 * @param props.exchangeRate Top-up exchange rate value.
 * @param props.showAccessToken Whether the token input is visible.
 * @param props.notes User-provided notes.
 * @param props.tags Selected tag values.
 * @param props.onSiteNameChange Handler to update site name.
 * @param props.onUsernameChange Handler to update username.
 * @param props.onUserIdChange Handler to update user id.
 * @param props.onAccessTokenChange Handler to update access token.
 * @param props.onCookieAuthSessionCookieChange Handler to update cookie-auth session cookie header.
 * @param props.onExchangeRateChange Handler to update exchange rate.
 * @param props.onToggleShowAccessToken Toggles token visibility.
 * @param props.onNotesChange Handler to update notes.
 * @param props.onTagsChange Handler to update tags selection.
 * @param props.availableTags Tags available from other accounts.
 * @param props.tagCounts Optional counts associated with tags.
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
  cookieAuthSessionCookie,
  exchangeRate,
  showAccessToken,
  notes,
  tags,
  onSiteNameChange,
  onUsernameChange,
  onUserIdChange,
  onAccessTokenChange,
  onCookieAuthSessionCookieChange,
  onExchangeRateChange,
  onToggleShowAccessToken,
  onNotesChange,
  onTagsChange,
  availableTags,
  tagCounts,
  siteType,
  onSiteTypeChange,
  checkIn,
  onCheckInChange,
}: AccountFormProps) {
  const { t } = useTranslation("accountDialog")
  const tagOptions = useMemo(() => {
    const uniqueTags = Array.from(new Set(availableTags.concat(tags))).filter(
      Boolean,
    )

    return uniqueTags.map((tag) => {
      const count = tagCounts?.[tag] ?? 0
      const label = count > 0 ? `${tag} (${count})` : tag
      return { value: tag, label }
    })
  }, [availableTags, tags, tagCounts])

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

      {authType === AuthTypeEnum.Cookie && (
        <FormField label={t("form.cookieAuthSessionCookie")} required>
          <Textarea
            value={cookieAuthSessionCookie}
            onChange={(e) => onCookieAuthSessionCookieChange(e.target.value)}
            placeholder={t("form.cookieAuthSessionCookiePlaceholder")}
            className="min-h-[96px]"
          />
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

      {/* Custom Check-in URL */}
      <FormField
        label={t("form.customCheckInUrl")}
        description={t("form.customCheckInDesc")}
      >
        <Input
          type="url"
          id="custom-checkin-url"
          value={checkIn.customCheckInUrl}
          onChange={(e) =>
            onCheckInChange({ ...checkIn, customCheckInUrl: e.target.value })
          }
          placeholder="https://example.com/api/checkin"
          leftIcon={<GlobeAltIcon className="h-5 w-5" />}
        />
      </FormField>

      {/* Open Redeem with Check-in Toggle - Only shown when custom check-in URL is set */}
      {checkIn.customCheckInUrl && (
        <div className="flex w-full items-center justify-between">
          <label
            htmlFor="open-redeem-with-checkin"
            className="dark:text-dark-text-secondary text-sm font-medium text-gray-700"
          >
            {t("form.openRedeemWithCheckIn")}
          </label>
          <Switch
            checked={checkIn.openRedeemWithCheckIn ?? true}
            onChange={(openRedeemWithCheckIn) =>
              onCheckInChange({ ...checkIn, openRedeemWithCheckIn })
            }
            id="open-redeem-with-checkin"
            className={`${
              checkIn.openRedeemWithCheckIn ?? true
                ? "bg-green-600"
                : "bg-gray-200"
            } focus:ring-green-500`}
          />
        </div>
      )}

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

      {/* Custom Redeem Url */}
      <FormField
        label={t("form.customRedeemUrl")}
        description={t("form.customRedeemUrlDesc")}
      >
        <Input
          type="text"
          id="custom-redeem-url"
          value={checkIn.customRedeemUrl || ""}
          onChange={(e) =>
            onCheckInChange({ ...checkIn, customRedeemUrl: e.target.value })
          }
          placeholder="https://example.com/console/topup"
          leftIcon={<GlobeAltIcon className="h-5 w-5" />}
        />
      </FormField>

      {/* 标签 */}
      <FormField label={t("form.tags")} description={t("form.tagsDescription")}>
        <MultiSelect
          options={tagOptions}
          selected={tags}
          onChange={onTagsChange}
          placeholder={t("form.tagsPlaceholder")}
          allowCustom
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
