import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Button, Card, CardContent, CompactMultiSelect } from "~/components/ui"
import { Switch } from "~/components/ui/Switch"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { getApiService } from "~/services/apiService"
import { hasValidManagedSiteConfig } from "~/services/managedSiteService"
import { ModelRedirectService } from "~/services/modelRedirect"
import { AuthTypeEnum } from "~/types"
import { ALL_PRESET_STANDARD_MODELS } from "~/types/managedSiteModelRedirect"
import { createLogger } from "~/utils/logger"
import { getManagedSiteAdminConfig } from "~/utils/managedSite"

import { ClearModelRedirectMappingsDialog } from "./ClearModelRedirectMappingsDialog"

/**
 * Unified logger scoped to the Basic Settings model redirect section.
 */
const logger = createLogger("ModelRedirectSettings")

/**
 * Configures model redirect feature: enable toggle, model list, regeneration.
 * @returns Model redirect settings panel.
 */
export default function ModelRedirectSettings() {
  const { t } = useTranslation("modelRedirect")
  const { preferences, updateModelRedirect, resetModelRedirectConfig } =
    useUserPreferencesContext()
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isBulkClearOpen, setIsBulkClearOpen] = useState(false)

  const modelRedirect = preferences?.modelRedirect

  const [modelList, setModelList] = useState(ALL_PRESET_STANDARD_MODELS)

  useEffect(() => {
    /**
     * Fetches available standard models when New API configuration exists.
     */
    async function getModelList() {
      if (!preferences) {
        return
      }

      if (!hasValidManagedSiteConfig(preferences)) {
        return
      }

      const managedConfig = getManagedSiteAdminConfig(preferences)
      if (!managedConfig) {
        return
      }

      return await getApiService(
        preferences.managedSiteType,
      ).fetchAccountAvailableModels({
        baseUrl: managedConfig.baseUrl,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: managedConfig.userId,
          accessToken: managedConfig.adminToken,
        },
      })
    }

    ;(async () => {
      const modelList = await getModelList()
      setModelList(modelList ?? ALL_PRESET_STANDARD_MODELS)
    })()
  }, [preferences])

  const handleUpdate = async (updates: Record<string, unknown>) => {
    try {
      setIsUpdating(true)
      const success = await updateModelRedirect(updates)
      if (!success) {
        toast.error(t("messages.updateFailed"))
        return
      }
      toast.success(t("messages.updateSuccess"))
    } catch (error) {
      logger.error("Failed to update preferences", error)
      toast.error(t("messages.updateFailed"))
    } finally {
      setIsUpdating(false)
    }
  }

  const handleRegenerateMapping = async () => {
    try {
      setIsRegenerating(true)
      const result = await ModelRedirectService.applyModelRedirect()

      if (result.success) {
        toast.success(t("messages.regenerateSuccess"))
      } else {
        const errorMessage = result.errors?.join("; ") || "Unknown"
        toast.error(t("messages.regenerateFailed", { error: errorMessage }))
      }
    } catch (error) {
      logger.error("Failed to regenerate mapping", error)
      toast.error(t("messages.regenerateFailed", { error: String(error) }))
    } finally {
      setIsRegenerating(false)
    }
  }

  const canUseManagedSiteAdmin = Boolean(
    preferences && hasValidManagedSiteConfig(preferences),
  )

  return (
    <SettingSection
      id="managed-site-model-redirect"
      title={t("title")}
      description={t("description")}
      onReset={resetModelRedirectConfig}
    >
      <Card>
        <CardContent>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="dark:text-dark-text-primary text-sm font-medium text-gray-700">
                {t("enable")}
              </p>
              <p className="dark:text-dark-text-secondary mt-1 text-sm text-gray-500">
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
              <div>
                <CompactMultiSelect
                  label={t("standardModels")}
                  options={modelList.map((model) => ({
                    value: model,
                    label: model,
                  }))}
                  selected={modelRedirect?.standardModels ?? []}
                  onChange={(standardModels) =>
                    handleUpdate({ standardModels })
                  }
                  placeholder={t("standardModelsPlaceholder")}
                  disabled={isUpdating}
                  allowCustom
                />
                <p className="dark:text-dark-text-secondary mt-1 text-sm text-gray-500">
                  {t("standardModelsDesc")}
                </p>
              </div>

              <div>
                <Button
                  type="button"
                  disabled={isRegenerating}
                  loading={isRegenerating}
                  onClick={handleRegenerateMapping}
                  variant="default"
                >
                  {isRegenerating ? t("regenerating") : t("regenerateButton")}
                </Button>
              </div>
            </>
          )}

          <div className="pt-2">
            <Button
              type="button"
              variant="destructive"
              disabled={!canUseManagedSiteAdmin}
              onClick={() => setIsBulkClearOpen(true)}
            >
              {t("bulkClear.action")}
            </Button>
            <p className="dark:text-dark-text-secondary mt-1 text-sm text-gray-500">
              {t("bulkClear.actionDesc")}
            </p>
          </div>
        </CardContent>
      </Card>

      <ClearModelRedirectMappingsDialog
        isOpen={isBulkClearOpen}
        onClose={() => setIsBulkClearOpen(false)}
      />
    </SettingSection>
  )
}
