import { useTranslation } from "react-i18next"

import { FormField, Input, Switch } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"

import type { FormData } from "../hooks/useTokenForm"

interface QuotaSettingsProps {
  unlimitedQuota: boolean
  quota: string
  handleSwitchChange: (field: keyof FormData) => (checked: boolean) => void
  handleInputChange: (
    field: keyof FormData
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
}

export function QuotaSettings({
  unlimitedQuota,
  quota,
  handleSwitchChange,
  handleInputChange,
  error
}: QuotaSettingsProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
          {t("dialog.quotaSettings")}
        </label>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500 dark:text-dark-text-tertiary">
            {t("dialog.unlimitedQuota")}
          </span>
          <Switch
            checked={unlimitedQuota}
            onChange={handleSwitchChange("unlimitedQuota")}
            className={`${
              unlimitedQuota
                ? "bg-blue-600"
                : "bg-gray-200 dark:bg-dark-bg-tertiary"
            } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}>
            <span
              className={`${
                unlimitedQuota ? "translate-x-6" : "translate-x-1"
              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>
      </div>

      {!unlimitedQuota && (
        <div>
          <FormField
            label={t("dialog.quotaSettingsLabel")}
            htmlFor="quotaInput"
            error={error}
            description={t("dialog.quotaRate", {
              rate: UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR.toLocaleString()
            })}>
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
