import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import { KiloCodeDefaultModelSelect } from "~/components/KiloCodeDefaultModelSelect"
import { KiloCodeExportGuidance } from "~/components/KiloCodeExportGuidance"
import { KILO_CODE_EXPORT_TEST_IDS } from "~/components/kiloCodeExportTestIds"
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
import {
  getKiloCodeApiConfigProfileNames,
  KILO_CODE_EXPORT_TARGET_OPTIONS,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
  type KiloCodeLegacySelection,
  type KiloCodeRuntimeKeyExportInput,
} from "~/services/integrations/kiloCodeExport"
import { getKiloCodeExportAnalyticsTarget } from "~/services/integrations/kiloCodeExportAnalytics"
import { buildKiloCodeExportOutput } from "~/services/integrations/kiloCodeExportPolicy"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"

import {
  KILO_CODE_MODEL_STATUSES,
  useKiloCodeProfileModelDiscovery,
} from "./useKiloCodeProfileModelDiscovery"

/** Unified logger scoped to the Kilo Code export dialog for API credential profiles. */
const logger = createLogger("KiloCodeProfileExportDialog")
const exportDialogSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesExportDialog
const exportDialogAnalyticsContext = {
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
  surfaceId: exportDialogSurface,
}

interface KiloCodeProfileExportDialogProps {
  isOpen: boolean
  onClose: () => void
  profile: ApiCredentialProfile
}

/** Modal dialog for exporting a single API credential profile as Kilo Code settings JSON. */
export function KiloCodeProfileExportDialog({
  isOpen,
  onClose,
  profile,
}: KiloCodeProfileExportDialogProps) {
  const { t } = useTranslation(["ui", "common"])
  const selectionId = `profile:${profile.id}`
  const runtimeKey = useMemo<KiloCodeRuntimeKeyExportInput>(
    () => ({
      accountId: profile.id,
      siteName: profile.name,
      baseUrl: profile.baseUrl,
      tokenId: 0,
      tokenName: t("common:labels.apiKey"),
      tokenKey: profile.apiKey,
    }),
    [profile.apiKey, profile.baseUrl, profile.id, profile.name, t],
  )
  const {
    invalidProfile,
    legacyModelId,
    loadModels,
    modelIds,
    modelStatus,
    preparedV7ModelIds,
    removeManualModel,
    selectLegacyModel,
    selectV7Model,
    v7DefaultModelId,
    v7ManualModelId,
    v7Selection,
    validV7Default,
  } = useKiloCodeProfileModelDiscovery({
    isOpen,
    profileName: profile.name,
    runtimeKey,
    selectionId,
  })
  const [exportTarget, setExportTarget] = useState<KiloCodeExportTarget>(
    KILO_CODE_EXPORT_TARGETS.KiloV7,
  )
  const [isDownloadTooLarge, setIsDownloadTooLarge] = useState(false)
  const pendingRetryFocusRef = useRef(false)
  const pendingRemoveFocusRef = useRef(false)
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const v7ModelSelectorRef = useRef<HTMLButtonElement>(null)
  const legacyModelSelectorRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    pendingRetryFocusRef.current = false
    pendingRemoveFocusRef.current = false
    if (!isOpen) return
    setExportTarget(KILO_CODE_EXPORT_TARGETS.KiloV7)
    setIsDownloadTooLarge(false)
  }, [isOpen, runtimeKey])

  const legacySelection = useMemo<KiloCodeLegacySelection>(
    () => ({ ...runtimeKey, legacyModelId: legacyModelId.trim() || undefined }),
    [legacyModelId, runtimeKey],
  )
  const currentLegacyProfileName = useMemo(() => {
    const profileNames = getKiloCodeApiConfigProfileNames({
      selections: [legacySelection],
    })
    return profileNames[0] ?? ""
  }, [legacySelection])
  const legacyModelOptions = useMemo(
    () => modelIds.map((id) => ({ value: id, label: id })),
    [modelIds],
  )

  const isKiloV7Target = exportTarget === KILO_CODE_EXPORT_TARGETS.KiloV7
  const isLoadingModels = modelStatus === KILO_CODE_MODEL_STATUSES.Loading
  const showModelRecovery =
    !invalidProfile &&
    (modelStatus === KILO_CODE_MODEL_STATUSES.Error ||
      (modelStatus === KILO_CODE_MODEL_STATUSES.Loaded &&
        modelIds.length === 0))
  const canExport =
    !invalidProfile &&
    (isKiloV7Target
      ? Boolean(validV7Default)
      : Boolean(currentLegacyProfileName && legacyModelId.trim()))
  const fallbackExportInsights = {
    itemCount: 1,
    modelCount: isKiloV7Target ? preparedV7ModelIds.length : 1,
    selectedCount: 1,
    kiloCodeExportTarget: getKiloCodeExportAnalyticsTarget(exportTarget),
  }

  useEffect(() => {
    if (
      !pendingRetryFocusRef.current ||
      modelStatus === KILO_CODE_MODEL_STATUSES.Loading
    ) {
      return
    }

    pendingRetryFocusRef.current = false
    if (modelStatus === KILO_CODE_MODEL_STATUSES.Error) {
      retryButtonRef.current?.focus()
      return
    }
    const activeModelSelector = isKiloV7Target
      ? v7ModelSelectorRef.current
      : legacyModelSelectorRef.current
    activeModelSelector?.focus()
  }, [isKiloV7Target, modelStatus])

  useEffect(() => {
    if (!pendingRemoveFocusRef.current || v7ManualModelId.trim()) return
    pendingRemoveFocusRef.current = false
    v7ModelSelectorRef.current?.focus()
  }, [v7ManualModelId])

  const handleRetryModels = () => {
    pendingRetryFocusRef.current = true
    setIsDownloadTooLarge(false)
    void loadModels()
  }

  const handleV7ModelChange = (value: string) => {
    selectV7Model(value)
    setIsDownloadTooLarge(false)
  }

  const handleRemoveManualModel = () => {
    pendingRemoveFocusRef.current = true
    removeManualModel()
    setIsDownloadTooLarge(false)
  }

  const buildCurrentExportOutput = useCallback(() => {
    if (invalidProfile) {
      throw new Error("The profile is invalid")
    }
    if (isKiloV7Target) {
      if (!validV7Default) {
        throw new Error("A valid V7 default model is required")
      }
      return buildKiloCodeExportOutput({
        target: KILO_CODE_EXPORT_TARGETS.KiloV7,
        selections: [v7Selection],
        defaultModel: validV7Default,
      })
    }

    return buildKiloCodeExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: [legacySelection],
      currentLegacyProfileName,
    })
  }, [
    currentLegacyProfileName,
    invalidProfile,
    isKiloV7Target,
    legacySelection,
    v7Selection,
    validV7Default,
  ])

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
    let actionInsights = fallbackExportInsights

    try {
      const output = buildCurrentExportOutput()
      actionInsights = {
        ...fallbackExportInsights,
        itemCount: output.itemCount,
        modelCount: output.modelCount,
      }
      await navigator.clipboard.writeText(
        JSON.stringify(output.copyPayload, null, 2),
      )
      toast.success(t("ui:dialog.kiloCode.messages.copiedExportConfig"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: actionInsights,
      })
    } catch {
      toast.error(t("ui:dialog.kiloCode.messages.copyFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: actionInsights,
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
    let actionInsights = fallbackExportInsights
    let url: string | null = null
    let link: HTMLAnchorElement | null = null
    setIsDownloadTooLarge(false)

    try {
      const output = buildCurrentExportOutput()
      actionInsights = {
        ...fallbackExportInsights,
        itemCount: output.itemCount,
        modelCount: output.modelCount,
      }

      if (output.isDownloadTooLarge) {
        setIsDownloadTooLarge(true)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: actionInsights,
        })
        return
      }

      const blob = new Blob([output.downloadJson], {
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
        insights: actionInsights,
      })
    } catch (error) {
      logger.error("Failed to download Kilo Code settings file", error)
      toast.error(t("ui:dialog.kiloCode.messages.downloadFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: actionInsights,
      })
    } finally {
      if (link && document.body.contains(link)) {
        document.body.removeChild(link)
      }
      if (url) URL.revokeObjectURL(url)
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
        {invalidProfile ? (
          <Alert
            variant="destructive"
            title={t("ui:dialog.kiloCode.messages.invalidProfile")}
          />
        ) : null}

        {showModelRecovery ? (
          <Alert
            variant={
              modelStatus === KILO_CODE_MODEL_STATUSES.Error
                ? "destructive"
                : "info"
            }
            title={
              modelStatus === KILO_CODE_MODEL_STATUSES.Error
                ? t("ui:dialog.kiloCode.messages.loadModelsFailed")
                : t("ui:dialog.kiloCode.messages.noModelsTitle")
            }
            description={t("ui:dialog.kiloCode.messages.noModelsDescription")}
          >
            <Button
              ref={retryButtonRef}
              type="button"
              variant="outline"
              onClick={handleRetryModels}
            >
              {t("ui:dialog.kiloCode.actions.retryModels")}
            </Button>
          </Alert>
        ) : null}

        {isDownloadTooLarge ? (
          <Alert
            variant="warning"
            title={t("ui:dialog.kiloCode.warning.title")}
            description={t(
              "ui:dialog.kiloCode.messages.settingsFileTooLargeSingle",
            )}
          />
        ) : null}

        <FormField
          label={t("ui:dialog.kiloCode.labels.exportTarget")}
          htmlFor="kilo-code-export-target"
        >
          <Select
            value={exportTarget}
            onValueChange={(value) => {
              const target = KILO_CODE_EXPORT_TARGET_OPTIONS.find(
                (candidate) => candidate === value,
              )
              if (target) {
                setExportTarget(target)
                setIsDownloadTooLarge(false)
              }
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

        {isKiloV7Target ? (
          <FormField
            label={t("ui:dialog.kiloCode.labels.defaultModel")}
            description={t("ui:dialog.kiloCode.descriptions.modelId")}
          >
            <KiloCodeDefaultModelSelect
              ref={v7ModelSelectorRef}
              aria-label={t("ui:dialog.kiloCode.labels.defaultModel")}
              value={validV7Default?.modelId ?? v7DefaultModelId}
              modelIds={preparedV7ModelIds}
              onChange={handleV7ModelChange}
              placeholder={
                isLoadingModels
                  ? t("common:status.loading")
                  : t("ui:dialog.kiloCode.placeholders.modelId")
              }
              allowCustomValue
              disabled={isLoadingModels}
            />
          </FormField>
        ) : (
          <FormField
            label={t("ui:dialog.kiloCode.labels.legacyModelId")}
            description={t("ui:dialog.kiloCode.descriptions.modelId")}
          >
            <SearchableSelect
              ref={legacyModelSelectorRef}
              aria-label={t("ui:dialog.kiloCode.labels.legacyModelId")}
              value={legacyModelId}
              onChange={(value) => {
                selectLegacyModel(value)
                setIsDownloadTooLarge(false)
              }}
              placeholder={
                isLoadingModels
                  ? t("common:status.loading")
                  : t("ui:dialog.kiloCode.placeholders.modelId")
              }
              options={legacyModelOptions}
              allowCustomValue
              disabled={isLoadingModels}
            />
          </FormField>
        )}

        {isKiloV7Target && v7ManualModelId.trim() ? (
          <div className="dark:border-dark-bg-tertiary flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{v7ManualModelId}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid={KILO_CODE_EXPORT_TEST_IDS.removeManualModel}
              onClick={handleRemoveManualModel}
            >
              {t("ui:dialog.kiloCode.actions.removeManualModel")}
            </Button>
          </div>
        ) : null}

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
