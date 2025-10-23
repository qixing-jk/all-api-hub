import { Switch } from "@headlessui/react"
import {
  CurrencyDollarIcon,
  EyeIcon,
  EyeSlashIcon,
  GlobeAltIcon,
  KeyIcon,
  PencilSquareIcon,
  UserIcon
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { FormField, IconButton, Input, Select, Textarea } from "~/components/ui"
import { SITE_TITLE_RULES } from "~/constants/siteType"
import { isValidExchangeRate } from "~/services/accountOperations"
import { AuthTypeEnum, type CheckInConfig } from "~/types"

interface AccountFormProps {
  authType: AuthTypeEnum
  siteName: string
  username: string
  userId: string
  accessToken: string
  exchangeRate: string
  showAccessToken: boolean
  notes: string
  onSiteNameChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onUserIdChange: (value: string) => void
  onAccessTokenChange: (value: string) => void
  onExchangeRateChange: (value: string) => void
  onToggleShowAccessToken: () => void
  onNotesChange: (value: string) => void
  siteType: string
  onSiteTypeChange: (value: string) => void
  checkIn: CheckInConfig
  onCheckInChange: (value: CheckInConfig) => void
}

export default function AccountForm({
  authType,
  siteName,
  username,
  userId,
  accessToken,
  exchangeRate,
  showAccessToken,
  notes,
  onSiteNameChange,
  onUsernameChange,
  onUserIdChange,
  onAccessTokenChange,
  onExchangeRateChange,
  onToggleShowAccessToken,
  onNotesChange,
  siteType,
  onSiteTypeChange,
  checkIn,
  onCheckInChange
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
        <Select
          value={siteType}
          onChange={(e) => onSiteTypeChange(e.target.value)}
          leftIcon={<GlobeAltIcon className="h-5 w-5" />}
          placeholder={t("form.siteType")}
          aria-label={t("form.siteType")}
          title={t("form.siteType")}>
          {SITE_TITLE_RULES.map((rule) => (
            <option key={rule.name} value={rule.name}>
              {rule.name}
            </option>
          ))}
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
                aria-label={t("form.toggleAccessTokenVisibility")}>
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

      {/* 充值金额比例 */}
      <FormField
        label={t("form.exchangeRate")}
        description={t("form.exchangeRateDesc")}
        error={
          !isValidExchangeRate(exchangeRate) && exchangeRate
            ? t("form.validRateError")
            : undefined
        }
        required>
        <Input
          type="number"
          step="0.01"
          min="0.1"
          max="100"
          value={exchangeRate}
          onChange={(e) => onExchangeRateChange(e.target.value)}
          placeholder={t("form.exchangeRatePlaceholder")}
          leftIcon={<CurrencyDollarIcon className="h-5 w-5" />}
          rightIcon={
            <span className="text-sm text-gray-500 dark:text-dark-text-secondary">
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
      <div className="w-full flex items-center justify-between">
        <label
          htmlFor="supports-check-in"
          className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
          {t("form.checkInStatus")}
        </label>
        <Switch
          checked={checkIn.enableDetection}
          onChange={(enableDetection) =>
            onCheckInChange({ ...checkIn, enableDetection })
          }
          id="supports-check-in"
          className={`${
            checkIn.enableDetection ? "bg-green-600" : "bg-gray-200"
          } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2`}>
          <span
            className={`${
              checkIn.enableDetection ? "translate-x-6" : "translate-x-1"
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
          />
        </Switch>
      </div>

      {/* Custom Check-in URL */}
      <FormField
        label={t("form.customCheckInUrl")}
        description={t("form.customCheckInDesc")}>
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

      {/* 备注 */}
      <FormField label={t("form.notes")}>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <PencilSquareIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>
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
