import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import { KiloCodeExportGuidance } from "~/components/KiloCodeExportGuidance"
import {
  Alert,
  Button,
  FormField,
  Modal,
  SearchableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import {
  buildKiloCodeApiConfigs,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
  type KiloCodeExportTuple,
} from "~/services/integrations/kiloCodeExport"
import { buildKiloCodeExportOutput } from "~/services/integrations/kiloCodeExportPolicy"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"
import { stripTrailingOpenAIV1 } from "~/utils/core/url"

/**
 * Unified logger scoped to the Kilo Code export dialog for API credential profiles.
 */
const logger = createLogger("KiloCodeProfileExportDialog")
const exportDialogSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesExportDialog
const exportDialogAnalyticsContext = {
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
  surfaceId: exportDialogSurface,
}

const exportTargetOptions = [
  KILO_CODE_EXPORT_TARGETS.KiloV7,
  KILO_CODE_EXPORT_TARGETS.Legacy,
] as const

/** Map the shared export target to the analytics contract's canonical value. */
function getAnalyticsExportTarget(target: KiloCodeExportTarget) {
  switch (target) {
    case KILO_CODE_EXPORT_TARGETS.KiloV7:
      return PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7
    case KILO_CODE_EXPORT_TARGETS.Legacy:
      return PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.Legacy
  }
}

interface KiloCodeProfileExportDialogProps {
  isOpen: boolean
  onClose: () => void
  profile: ApiCredentialProfile
}

/**
 * Modal dialog for exporting a single API credential profile as Kilo Code / Roo Code settings JSON.
 */
export function KiloCodeProfileExportDialog({
  isOpen,
  onClose,
  profile,
}: KiloCodeProfileExportDialogProps) {
  const { t } = useTranslation(["ui", "common"])
  const [modelId, setModelId] = useState("")
  const [modelOptions, setModelOptions] = useState<
    { value: string; label: string }[]
  >([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [exportTarget, setExportTarget] = useState<KiloCodeExportTarget>(
    KILO_CODE_EXPORT_TARGETS.KiloV7,
  )

  useEffect(() => {
    if (!isOpen) return

    setModelId("")
    setModelOptions([])
    setIsLoadingModels(true)
    setExportTarget(KILO_CODE_EXPORT_TARGETS.KiloV7)

    let isMounted = true
    void (async () => {
      try {
        const upstreamBaseUrl = stripTrailingOpenAIV1(profile.baseUrl)
        const modelIds = await fetchOpenAICompatibleModelIds({
          baseUrl: upstreamBaseUrl,
          apiKey: profile.apiKey,
        })
        const normalized = (modelIds || [])
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))

        if (!isMounted) return
        setModelOptions(normalized.map((id) => ({ value: id, label: id })))
        if (normalized.length > 0) {
          setModelId(normalized[0]!)
        }
      } catch (error) {
        logger.warn("Failed to fetch upstream model list", error)
        if (!isMounted) return
        setModelOptions([])
      } finally {
        if (isMounted) {
          setIsLoadingModels(false)
        }
      }
    })()

    return () => {
      isMounted = false
    }
  }, [isOpen, profile.apiKey, profile.baseUrl])

  const { exportTuple, currentApiConfigName } = useMemo(() => {
    const selectedModelId = modelId.trim() || undefined
    const exportTuple: KiloCodeExportTuple = {
      accountId: profile.id,
      siteName: profile.name,
      baseUrl: profile.baseUrl,
      tokenId: 0,
      tokenName: t("common:labels.apiKey"),
      tokenKey: profile.apiKey,
      modelId: selectedModelId,
    }

    const { profileNames } = buildKiloCodeApiConfigs({
      selections: [exportTuple],
    })

    return {
      exportTuple,
      currentApiConfigName: profileNames[0] ?? "",
    }
  }, [modelId, profile.apiKey, profile.baseUrl, profile.id, profile.name, t])

  const canExport = Boolean(currentApiConfigName && modelId.trim())
  const isKiloV7Target = exportTarget === KILO_CODE_EXPORT_TARGETS.KiloV7
  const exportInsights = {
    itemCount: 1,
    modelCount: modelId.trim() ? 1 : 0,
    selectedCount: 1,
    kiloCodeExportTarget: getAnalyticsExportTarget(exportTarget),
  }

  const handleCopyApiConfigs = async () => {
    if (!canExport) {
      toast.error(t("ui:dialog.kiloCode.messages.modelIdRequiredTitle"))
      return
    }
    if (typeof navigator === "undefined") return

    const tracker = startProductAnalyticsAction({
      ...exportDialogAnalyticsContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialExportConfig,
    })

    try {
      const output = buildKiloCodeExportOutput({
        target: exportTarget,
        selections: [exportTuple],
        currentLegacyProfileName: currentApiConfigName,
      })
      await navigator.clipboard.writeText(
        JSON.stringify(output.copyPayload, null, 2),
      )
      toast.success(t("ui:dialog.kiloCode.messages.copiedExportConfig"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: { ...exportInsights, itemCount: output.itemCount },
      })
    } catch {
      toast.error(t("ui:dialog.kiloCode.messages.copyFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: exportInsights,
      })
    }
  }

  const handleDownloadSettings = async () => {
    if (!canExport) {
      toast.error(t("ui:dialog.kiloCode.messages.modelIdRequiredTitle"))
      return
    }

    const tracker = startProductAnalyticsAction({
      ...exportDialogAnalyticsContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialSettingsFile,
    })

    let url: string | null = null
    let link: HTMLAnchorElement | null = null

    try {
      const output = buildKiloCodeExportOutput({
        target: exportTarget,
        selections: [exportTuple],
        currentLegacyProfileName: currentApiConfigName,
      })

      const blob = new Blob([JSON.stringify(output.downloadPayload, null, 2)], {
        type: "application/json",
      })
      url = URL.createObjectURL(blob)
      link = document.createElement("a")
      link.href = url
      link.download = output.filename
      document.body.appendChild(link)
      link.click()

      toast.success(t("ui:dialog.kiloCode.messages.downloadedSettings"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: { ...exportInsights, itemCount: output.itemCount },
      })
    } catch (error) {
      logger.error("Failed to download Kilo Code settings file", error)
      toast.error(t("ui:dialog.kiloCode.messages.downloadFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: exportInsights,
      })
    } finally {
      if (link && document.body.contains(link)) {
        document.body.removeChild(link)
      }
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      header={
        <div className="flex items-center gap-2">
          <KiloCodeIcon
            size="lg"
            className="dark:text-dark-text-tertiary text-gray-500"
          />
          <div className="min-w-0">
            <div className="dark:text-dark-text-primary text-base font-semibold text-gray-900">
              {t("ui:dialog.kiloCode.title")}
            </div>
            <p className="dark:text-dark-text-secondary truncate text-sm text-gray-500">
              {profile.name} · {profile.baseUrl}
            </p>
          </div>
        </div>
      }
      footer={
        <ProductAnalyticsScope
          entrypoint={exportDialogAnalyticsContext.entrypoint}
          featureId={exportDialogAnalyticsContext.featureId}
          surfaceId={exportDialogSurface}
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCopyApiConfigs}
              disabled={!canExport}
            >
              {isKiloV7Target
                ? t("ui:dialog.kiloCode.actions.copyKiloV7Provider")
                : t("ui:dialog.kiloCode.actions.copyLegacyApiConfigs")}
            </Button>
            <Button
              type="button"
              onClick={handleDownloadSettings}
              disabled={!canExport}
            >
              {isKiloV7Target
                ? t("ui:dialog.kiloCode.actions.downloadKiloV7Settings")
                : t("ui:dialog.kiloCode.actions.downloadLegacySettings")}
            </Button>
          </div>
        </ProductAnalyticsScope>
      }
    >
      <div className="space-y-4">
        {!isLoadingModels && modelOptions.length === 0 && (
          <Alert
            variant="info"
            title={t("ui:dialog.kiloCode.messages.noModelsTitle")}
            description={t("ui:dialog.kiloCode.messages.noModelsDescription")}
          />
        )}

        <FormField
          label={t("ui:dialog.kiloCode.labels.exportTarget")}
          htmlFor="kilo-code-export-target"
        >
          <Select
            value={exportTarget}
            onValueChange={(value) => {
              const target = exportTargetOptions.find(
                (candidate) => candidate === value,
              )
              if (target) setExportTarget(target)
            }}
          >
            <SelectTrigger id="kilo-code-export-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KILO_CODE_EXPORT_TARGETS.KiloV7}>
                {t("ui:dialog.kiloCode.targets.kiloV7")}
              </SelectItem>
              <SelectItem value={KILO_CODE_EXPORT_TARGETS.Legacy}>
                {t("ui:dialog.kiloCode.targets.legacy")}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label={t("ui:dialog.kiloCode.labels.modelId")}
          description={t("ui:dialog.kiloCode.descriptions.modelId")}
        >
          <SearchableSelect
            value={modelId}
            onChange={setModelId}
            placeholder={
              isLoadingModels
                ? t("common:status.loading")
                : t("ui:dialog.kiloCode.placeholders.modelId")
            }
            options={modelOptions}
            allowCustomValue
            disabled={isLoadingModels}
          />
        </FormField>

        <KiloCodeExportGuidance target={exportTarget} />

        <Alert
          variant="warning"
          title={t("ui:dialog.kiloCode.warning.title")}
          description={t("ui:dialog.kiloCode.warning.description")}
        />
      </div>
    </Modal>
  )
}
