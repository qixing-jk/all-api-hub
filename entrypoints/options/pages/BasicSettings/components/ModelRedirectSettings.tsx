import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { MultiSelect } from "~/components/ui/MultiSelect"
import { Switch } from "~/components/ui/Switch"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ModelRedirectService } from "~/services/modelRedirect"
import { OpenAIService } from "~/services/openai"
import {
  ALL_PRESET_STANDARD_MODELS,
  DEFAULT_OPENAI_CONFIG
} from "~/types/modelRedirect"
import type { OpenAIConfig } from "~/types/modelRedirect"

export default function ModelRedirectSettings() {
  const { t } = useTranslation("modelRedirect")
  const { preferences, updateModelRedirect } = useUserPreferencesContext()
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSavingAIConfig, setIsSavingAIConfig] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const modelRedirect = preferences?.modelRedirect
  const aiConfig = modelRedirect?.aiConfig || DEFAULT_OPENAI_CONFIG

  const [pendingAIConfig, setPendingAIConfig] = useState<OpenAIConfig>({
    ...aiConfig
  })

  useEffect(() => {
    setPendingAIConfig({ ...aiConfig })
  }, [aiConfig])

  const hasUnsavedAIConfigChanges = useMemo(() => {
    return JSON.stringify(pendingAIConfig) !== JSON.stringify(aiConfig)
  }, [pendingAIConfig, aiConfig])

  const modelOptions = ALL_PRESET_STANDARD_MODELS.map((model) => ({
    value: model,
    label: model
  }))

  const handleUpdate = async (updates: Record<string, unknown>) => {
    setIsUpdating(true)
    try {
      const success = await updateModelRedirect(updates)
      if (!success) {
        toast.error(t("messages.updateFailed"))
        return false
      }
      toast.success(t("messages.updateSuccess"))
      return true
    } catch (error) {
      console.error("[ModelRedirectSettings] Failed to update preferences", error)
      toast.error(t("messages.updateFailed"))
      return false
    } finally {
      setIsUpdating(false)
    }
  }

  const restoreOpenAIServiceConfig = (config: OpenAIConfig | undefined) => {
    if (config?.apiKey && config?.endpoint && config?.model) {
      try {
        OpenAIService.getInstance(config)
        return
      } catch (error) {
        console.error(
          "[ModelRedirectSettings] Failed to restore OpenAIService configuration",
          error
        )
      }
    }
    OpenAIService.resetInstance()
  }

  const handleSaveAIConfig = async () => {
    setIsSavingAIConfig(true)
    try {
      const service = OpenAIService.getInstance(pendingAIConfig)
      const normalizedConfig = service.getConfig()
      setPendingAIConfig(normalizedConfig)

      const success = await handleUpdate({
        aiConfig: normalizedConfig
      })

      if (!success) {
        restoreOpenAIServiceConfig(aiConfig)
        setPendingAIConfig({ ...aiConfig })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(t("aiConfig.validationError", { error: message }))
    } finally {
      setIsSavingAIConfig(false)
    }
  }

  const handleTestConnection = async () => {
    if (!pendingAIConfig.apiKey) {
      toast.error(t("messages.apiKeyRequired"))
      return
    }
    if (!pendingAIConfig.endpoint) {
      toast.error(t("messages.endpointRequired"))
      return
    }

    try {
      setIsTesting(true)
      const service = OpenAIService.getInstance(pendingAIConfig)
      const result = await service.testConnection()

      if (result.success) {
        toast.success(t("aiConfig.testSuccess"))
      } else {
        toast.error(t("aiConfig.testFailed", { error: result.error }))
      }
    } catch (error) {
      toast.error(
        t("aiConfig.testFailed", {
          error: error instanceof Error ? error.message : "Unknown error"
        })
      )
    } finally {
      setIsTesting(false)
      if (hasUnsavedAIConfigChanges) {
        restoreOpenAIServiceConfig(aiConfig)
      }
    }
  }

  const handleRegenerateMapping = async () => {
    if (hasUnsavedAIConfigChanges) {
      toast.error(t("messages.aiConfigUnsaved"))
      return
    }

    if (!aiConfig.apiKey || !aiConfig.endpoint || !aiConfig.model) {
      toast.error(t("messages.aiConfigMissing"))
      return
    }

    try {
      setIsRegenerating(true)
      const result = await ModelRedirectService.applyModelRedirect()

      if (result.success) {
        toast.success(
          t("messages.regenerateSuccess", { count: result.updatedChannels })
        )
      } else {
        const errorMessage = result.errors?.join("; ") || "Unknown"
        toast.error(t("messages.regenerateFailed", { error: errorMessage }))
      }
    } catch (error) {
      console.error("Failed to regenerate mapping:", error)
      toast.error(t("messages.regenerateFailed", { error: String(error) }))
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-dark-bg-secondary sm:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
          {t("description")}
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
              {t("enable")}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
              {t("enableDesc")}
            </p>
          </div>
          <Switch
            checked={modelRedirect?.enabled ?? false}
            disabled={isUpdating}
            onChange={async (enabled) => {
              await handleUpdate({ enabled })
            }}
          />
        </div>

        {modelRedirect?.enabled && (
          <>
            {/* AI Configuration Section */}
            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-dark-bg-tertiary">
              <div>
                <h3 className="text-base font-medium text-gray-900 dark:text-dark-text-primary">
                  {t("aiConfig.title")}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
                  {t("aiConfig.description")}
                </p>
              </div>

              {/* API Endpoint */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  {t("aiConfig.endpoint")}
                </label>
                <input
                  type="text"
                  value={pendingAIConfig.endpoint}
                  onChange={(e) =>
                    setPendingAIConfig((prev) => ({
                      ...prev,
                      endpoint: e.target.value
                    }))
                  }
                  placeholder={t("aiConfig.endpointPlaceholder")}
                  disabled={isSavingAIConfig}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-dark-bg-primary dark:text-dark-text-primary"
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
                  {t("aiConfig.endpointDesc")}
                </p>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  {t("aiConfig.apiKey")}
                </label>
                <div className="relative mt-1">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={pendingAIConfig.apiKey}
                    onChange={(e) =>
                      setPendingAIConfig((prev) => ({
                        ...prev,
                        apiKey: e.target.value
                      }))
                    }
                    placeholder={t("aiConfig.apiKeyPlaceholder")}
                    disabled={isSavingAIConfig}
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-dark-bg-primary dark:text-dark-text-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {showApiKey ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
                  {t("aiConfig.apiKeyDesc")}
                </p>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  {t("aiConfig.model")}
                </label>
                <input
                  type="text"
                  value={pendingAIConfig.model}
                  onChange={(e) =>
                    setPendingAIConfig((prev) => ({
                      ...prev,
                      model: e.target.value
                    }))
                  }
                  placeholder={t("aiConfig.modelPlaceholder")}
                  disabled={isSavingAIConfig}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-dark-bg-primary dark:text-dark-text-primary"
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
                  {t("aiConfig.modelDesc")}
                </p>
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  {t("aiConfig.customPrompt")}
                </label>
                <textarea
                  value={pendingAIConfig.customPrompt ?? ""}
                  onChange={(e) => {
                    const value = e.target.value
                    setPendingAIConfig((prev) => ({
                      ...prev,
                      customPrompt: value.length > 0 ? value : undefined
                    }))
                  }}
                  placeholder={t("aiConfig.customPromptPlaceholder")}
                  rows={4}
                  disabled={isSavingAIConfig}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-dark-bg-primary dark:text-dark-text-primary"
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
                  {t("aiConfig.customPromptDesc")}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={
                    isTesting ||
                    !pendingAIConfig.apiKey ||
                    !pendingAIConfig.endpoint ||
                    !pendingAIConfig.model
                  }
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary"
                >
                  {isTesting
                    ? t("aiConfig.testing")
                    : t("aiConfig.testConnection")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveAIConfig}
                  disabled={
                    !hasUnsavedAIConfigChanges || isUpdating || isSavingAIConfig
                  }
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {isSavingAIConfig ? t("aiConfig.saving") : t("aiConfig.save")}
                </button>
                {hasUnsavedAIConfigChanges && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {t("aiConfig.unsavedNotice")}
                  </span>
                )}
              </div>
            </div>

            {/* Mapping Rules Info */}
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200">
                {t("mappingRules.title")}
              </h3>
              <div className="mt-2 space-y-2 text-sm text-blue-800 dark:text-blue-300">
                <div>
                  <span className="font-medium">
                    {t("mappingRules.allowed")}:
                  </span>{" "}
                  {t("mappingRules.allowedList")}
                </div>
                <div>
                  <span className="font-medium">
                    {t("mappingRules.forbidden")}:
                  </span>{" "}
                  {t("mappingRules.forbiddenList")}
                </div>
              </div>
            </div>

            {/* Standard Models Selection */}
            <div>
              <MultiSelect
                label={t("standardModels")}
                options={modelOptions}
                selected={modelRedirect?.standardModels ?? []}
                onChange={(standardModels) => handleUpdate({ standardModels })}
                placeholder={t("standardModelsPlaceholder")}
                disabled={isUpdating}
                allowCustom
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
                {t("standardModelsDesc")}
              </p>
            </div>

            {/* Generate Mappings Button */}
            <div className="pt-4">
              <button
                type="button"
                disabled={
                  isRegenerating ||
                  !aiConfig.apiKey ||
                  !aiConfig.endpoint ||
                  !aiConfig.model ||
                  hasUnsavedAIConfigChanges
                }
                onClick={handleRegenerateMapping}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600">
                {isRegenerating ? t("regenerating") : t("regenerateButton")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
