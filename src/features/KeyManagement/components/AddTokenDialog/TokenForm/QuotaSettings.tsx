import { useTranslation } from "react-i18next"

import { FormField, Input, Switch } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"

import type { FormData } from "../hooks/useTokenForm"

interface QuotaSettingsProps {
  unlimitedQuota: boolean
  quota: string
  handleSwitchChange: (field: keyof FormData) => (checked: boolean) => void
  handleInputChange: (
    field: keyof FormData,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
}

/**
 * Handles unlimited toggle and quota numeric input for token creation.
 * @param props Component props container including handlers and validation.
 * @param props.unlimitedQuota Whether the token has no quota limit.
 * @param props.quota Current quota value as string.
 * @param props.handleSwitchChange Toggle handler for the unlimited switch.
 * @param props.handleInputChange Change handler for quota input.
 * @param props.error Optional validation error message.
 * @returns JSX block containing switch and optional quota input.
 */
export function QuotaSettings({
  unlimitedQuota,
  quota,
  handleSwitchChange,
  handleInputChange,
  error,
}: QuotaSettingsProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
          {t("dialog.quotaSettings")}
        </label>
        <div className="flex items-center space-x-2">
          <span className="dark:text-dark-text-tertiary text-sm text-gray-500">
            {t("dialog.unlimitedQuota")}
          </span>
          <Switch
            checked={unlimitedQuota}
            onChange={handleSwitchChange("unlimitedQuota")}
            className={`${
              unlimitedQuota
                ? "bg-blue-600"
                : "dark:bg-dark-bg-tertiary bg-gray-200"
            } focus:ring-blue-500`}
          />
        </div>
      </div>

      {!unlimitedQuota && (
        <div>
          <FormField
            label={t("dialog.quotaSettingsLabel")}
            htmlFor="quotaInput"
            error={error}
            description={t("dialog.quotaRate", {
              rate: UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR.toLocaleString(),
            })}
          >
            <Input
              id="quotaInput"
              type="number"
              step="0.01"
              min="0"
              value={quota}
              onChange={handleInputChange("quota")}
              placeholder={t("dialog.quotaPlaceholder")}
            />
          </FormField>
        </div>
      )}
    </div>
  )
}
