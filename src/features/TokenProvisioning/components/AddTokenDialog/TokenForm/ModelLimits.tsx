import { useTranslation } from "react-i18next"

import { CompactMultiSelect, Switch } from "~/components/ui"

import type { FormData } from "../hooks/useTokenForm"

interface ModelLimitsProps {
  modelLimitsEnabled: boolean
  modelLimits: string[]
  availableModels: string[]
  isLoading: boolean
  loadErrorMessage: string | null
  setFormData: React.Dispatch<React.SetStateAction<FormData>>
  handleModelLimitsChange: (values: string[]) => void
  onRequestModels: () => Promise<boolean>
}

/**
 * Section toggling and configuring per-model allow lists for a token.
 * @param props Component props container.
 * @param props.modelLimitsEnabled Whether per-model limits are enabled.
 * @param props.modelLimits Selected model allow list.
 * @param props.availableModels All available models to choose from.
 * @param props.isLoading Whether model discovery is in progress.
 * @param props.loadErrorMessage Scoped model-discovery failure guidance.
 * @param props.setFormData Setter to update the form state.
 * @param props.handleModelLimitsChange Change handler for model selections.
 * @param props.onRequestModels Requests the optional model list on demand.
 * @returns Toggle with optional multi-select for model limits.
 */
export function ModelLimits({
  modelLimitsEnabled,
  modelLimits,
  availableModels,
  isLoading,
  loadErrorMessage,
  setFormData,
  handleModelLimitsChange,
  onRequestModels,
}: ModelLimitsProps) {
  const { t } = useTranslation("keyManagement")
  const modelOptions = Array.from(new Set([...modelLimits, ...availableModels]))

  return (
    <div className="space-y-3" aria-busy={isLoading}>
      <div className="flex items-center justify-between">
        <label className="dark:text-dark-text-secondary text-sm font-medium text-gray-700">
          {t("dialog.modelLimits")}
        </label>
        <Switch
          checked={modelLimitsEnabled}
          disabled={isLoading}
          aria-label={t("dialog.modelLimits")}
          onChange={(enabled) => {
            setFormData((prev) => ({
              ...prev,
              modelLimitsEnabled: enabled,
              modelLimits: enabled ? prev.modelLimits : [],
            }))
            if (enabled) void onRequestModels()
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
            options={modelOptions.map((model) => ({
              value: model,
              label: model,
            }))}
            selected={modelLimits}
            onChange={handleModelLimitsChange}
            size="default"
            placeholder={t("dialog.selectModels")}
            label={t("dialog.availableModels")}
          />
          <p className="dark:text-dark-text-tertiary mt-1 text-xs text-gray-500">
            {t("dialog.modelSelectHint", { count: modelLimits.length })}
          </p>
        </div>
      )}
      {isLoading ? (
        <p
          aria-live="polite"
          className="dark:text-dark-text-tertiary text-xs text-gray-500"
        >
          {t("common:status.loadingField", {
            field: t("dialog.availableModels"),
          })}
        </p>
      ) : null}
      {loadErrorMessage ? (
        <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
          {loadErrorMessage}
        </p>
      ) : null}
    </div>
  )
}
