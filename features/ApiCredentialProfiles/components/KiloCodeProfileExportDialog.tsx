import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import {
  Alert,
  Button,
  FormField,
  Modal,
  SearchableSelect,
} from "~/components/ui"
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import {
  buildKiloCodeApiConfigs,
  buildKiloCodeSettingsFile,
} from "~/services/integrations/kiloCodeExport"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/logger"
import { stripTrailingOpenAIV1 } from "~/utils/url"

/**
 * Unified logger scoped to the Kilo Code export dialog for API credential profiles.
 */
const logger = createLogger("KiloCodeProfileExportDialog")

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

  const filename = "kilo-code-settings.json"

  useEffect(() => {
    if (!isOpen) return

    setModelId("")
    setModelOptions([])
    setIsLoadingModels(true)

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

  const { apiConfigs, currentApiConfigName } = useMemo(() => {
    const selectedModelId = modelId.trim() || undefined

    const { apiConfigs, profileNames } = buildKiloCodeApiConfigs({
      selections: [
        {
          accountId: profile.id,
          siteName: profile.name,
          baseUrl: profile.baseUrl,
          tokenId: 0,
          tokenName: t("common:labels.apiKey"),
          tokenKey: profile.apiKey,
          modelId: selectedModelId,
        },
      ],
    })

    return {
      apiConfigs,
      currentApiConfigName: profileNames[0] ?? "",
    }
  }, [modelId, profile.apiKey, profile.baseUrl, profile.id, profile.name, t])

  const canExport = Boolean(currentApiConfigName && modelId.trim())

  const handleCopyApiConfigs = async () => {
    if (!canExport) {
      toast.error(t("ui:dialog.kiloCode.messages.modelIdRequiredTitle"))
      return
    }
    if (typeof navigator === "undefined") return

    try {
      await navigator.clipboard.writeText(JSON.stringify(apiConfigs, null, 2))
      toast.success(t("ui:dialog.kiloCode.messages.copiedApiConfigs"))
    } catch {
      toast.error(t("ui:dialog.kiloCode.messages.copyFailed"))
    }
  }

  const handleDownloadSettings = async () => {
    if (!canExport) {
      toast.error(t("ui:dialog.kiloCode.messages.modelIdRequiredTitle"))
      return
    }

    let url: string | null = null
    let link: HTMLAnchorElement | null = null

    try {
      const payload = buildKiloCodeSettingsFile({
        currentApiConfigName,
        apiConfigs,
      })

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      })
      url = URL.createObjectURL(blob)
      link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()

      toast.success(t("ui:dialog.kiloCode.messages.downloadedSettings"))
    } catch (error) {
      logger.error("Failed to download Kilo Code settings file", error)
      toast.error(t("ui:dialog.kiloCode.messages.downloadFailed"))
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
            {t("ui:dialog.kiloCode.actions.copyApiConfigs")}
          </Button>
          <Button
            type="button"
            onClick={handleDownloadSettings}
            disabled={!canExport}
          >
            {t("ui:dialog.kiloCode.actions.downloadSettings")}
          </Button>
        </div>
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

        <Alert
          variant="warning"
          title={t("ui:dialog.kiloCode.warning.title")}
          description={t("ui:dialog.kiloCode.warning.description")}
        />
      </div>
    </Modal>
  )
}
