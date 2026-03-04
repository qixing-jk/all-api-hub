import { useTranslation } from "react-i18next"

import { CompactMultiSelect, Switch } from "~/components/ui"

import type { FormData } from "../hooks/useTokenForm"

interface ModelLimitsProps {
  modelLimitsEnabled: boolean
  modelLimits: string[]
  availableModels: string[]
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  handleModelLimitsChange: (values: string[]) => void
}

/**
 * Section toggling and configuring per-model allow lists for a token.
 * @param props Component props container.
 * @param props.modelLimitsEnabled Whether per-model limits are enabled.
 * @param props.modelLimits Selected model allow list.
 * @param props.availableModels All available models to choose from.
 * @param props.setFormData Setter to update the form state.
 * @param props.handleModelLimitsChange Change handler for model selections.
 * @returns Toggle with optional multi-select for model limits.
 */
export function ModelLimits({
  modelLimitsEnabled,
  modelLimits,
  availableModels,
  setFormData,
  handleModelLimitsChange,
}: ModelLimitsProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
          {t("dialog.modelLimits")}
        </label>
        <Switch
          checked={modelLimitsEnabled}
          onChange={(enabled) => {
            setFormData((prev) => ({
              ...prev,
              modelLimitsEnabled: enabled,
              modelLimits: enabled ? prev.modelLimits : [],
            }))
          }}
          className={`${
            modelLimitsEnabled
              ? "bg-blue-600"
              : "dark:bg-dark-bg-tertiary bg-gray-200"
          } focus:ring-blue-500`}
        />
      </div>

      {modelLimitsEnabled && (
        <div>
          <CompactMultiSelect
            options={availableModels.map((model) => ({
              value: model,
              label: model,
            }))}
            selected={modelLimits}
            onChange={handleModelLimitsChange}
            placeholder={t("dialog.selectModels")}
            label={t("dialog.availableModels")}
          />
          <p className="dark:text-dark-text-tertiary mt-1 text-xs text-gray-500">
            {t("dialog.modelSelectHint", { count: modelLimits.length })}
          </p>
        </div>
      )}
    </div>
  )
}
