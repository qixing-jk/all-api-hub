import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useSafeExportAction } from "~/features/CredentialExport/useSafeExportAction"
import {
  resolveKiloCodeAccountExportOutput,
  type KiloCodeAccountExportSelection,
  type KiloCodeAccountSecretSource,
} from "~/features/KiloCodeExport/kiloCodeAccountExport"
import { type useKiloCodeAccountModelDiscovery } from "~/features/KiloCodeExport/useKiloCodeAccountModelDiscovery"
import toast from "~/lib/notify"
import {
  getKiloCodeApiConfigProfileNames,
  KILO_CODE_EXPORT_FILENAMES,
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
} from "~/services/integrations/kiloCode/kiloCodeExport"
import { getKiloCodeExportAnalyticsTarget } from "~/services/integrations/kiloCode/kiloCodeExportAnalytics"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { getErrorMessage } from "~/utils/core/error"

const kiloCodeAccountExportAnalyticsContext = {
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountTokenKiloCodeExportDialog,
}

/** Compare resolver inputs by identity without serializing credential fields. */
function haveMatchingSecretSourceIdentities(
  previous: ReadonlyMap<string, KiloCodeAccountSecretSource>,
  current: ReadonlyMap<string, KiloCodeAccountSecretSource>,
) {
  if (previous.size !== current.size) return false

  for (const [selectionId, previousSource] of previous) {
    const currentSource = current.get(selectionId)
    if (!currentSource || currentSource.cacheKey !== previousSource.cacheKey) {
      return false
    }
  }

  return true
}

/** Keep pending exports tied to the account and key objects selected by the user. */
function haveMatchingSelectionSnapshots(
  previous: readonly KiloCodeAccountExportSelection[],
  current: readonly KiloCodeAccountExportSelection[],
) {
  return (
    previous.length === current.length &&
    previous.every((item, index) => {
      const next = current[index]
      if (!next) return false
      return (
        item.selectionId === next.selectionId &&
        item.sourceSnapshots.every(
          (snapshot, offset) => snapshot === next.sourceSnapshots[offset],
        )
      )
    })
  )
}

/** Resolve exports against the current source snapshot and commit only current user actions. */
export function useKiloCodeExportActions({
  isOpen,
  onClose,
  exportTarget,
  accountExportSelections,
  selectedSiteIds,
  modelDiscovery,
}: {
  isOpen: boolean
  onClose: () => void
  exportTarget: KiloCodeExportTarget
  accountExportSelections: KiloCodeAccountExportSelection[]
  selectedSiteIds: string[]
  modelDiscovery: ReturnType<typeof useKiloCodeAccountModelDiscovery>
}) {
  const { t } = useTranslation(["ui", "common", "messages"])
  const {
    invalidSelection,
    legacySelections,
    preparedCatalog,
    v7DefaultModel,
    v7Selections,
  } = modelDiscovery
  const [currentApiConfigName, setCurrentApiConfigName] = useState("")
  const [isDownloadTooLarge, setIsDownloadTooLarge] = useState(false)
  useEffect(() => {
    if (!isOpen) {
      setCurrentApiConfigName("")
      setIsDownloadTooLarge(false)
    }
  }, [isOpen])
  const secretSourcesBySelectionId = useMemo(
    () =>
      new Map(
        accountExportSelections.map((selection) => [
          selection.selectionId,
          selection.credential,
        ]),
      ),
    [accountExportSelections],
  )
  const previousSecretSourcesBySelectionIdRef = useRef(
    secretSourcesBySelectionId,
  )
  const previousSelectionSnapshotsRef = useRef(accountExportSelections)

  const profileNames = useMemo(
    () => getKiloCodeApiConfigProfileNames({ selections: legacySelections }),
    [legacySelections],
  )

  useEffect(() => {
    if (profileNames.length === 0) {
      setCurrentApiConfigName("")
      return
    }
    const [firstProfileName] = profileNames
    if (
      firstProfileName !== undefined &&
      (!currentApiConfigName || !profileNames.includes(currentApiConfigName))
    ) {
      setCurrentApiConfigName(firstProfileName)
    }
  }, [currentApiConfigName, profileNames])

  const effectiveCurrentApiConfigName =
    currentApiConfigName || profileNames[0] || ""
  const isKiloV7Export = exportTarget === KILO_CODE_EXPORT_TARGETS.KiloV7
  const exportActionSignature = useMemo(
    () =>
      JSON.stringify(
        isKiloV7Export
          ? {
              defaultModel: v7DefaultModel,
              selections: v7Selections.map((selection) => ({
                selectionId: selection.selectionId,
                accountId: selection.accountId,
                siteName: selection.siteName,
                baseUrl: selection.baseUrl,
                tokenId: selection.tokenId,
                tokenName: selection.tokenName,
                providerName: selection.providerName ?? "",
                protocol: selection.protocol,
                discoveredModelIds: selection.discoveredModelIds,
                manualModelId: selection.manualModelId ?? "",
              })),
            }
          : {
              currentLegacyProfileName: effectiveCurrentApiConfigName,
              selections: legacySelections.map((selection) => ({
                selectionId: selection.selectionId,
                accountId: selection.accountId,
                siteName: selection.siteName,
                baseUrl: selection.baseUrl,
                tokenId: selection.tokenId,
                tokenName: selection.tokenName,
                legacyModelId: selection.legacyModelId ?? "",
              })),
            },
      ),
    [
      effectiveCurrentApiConfigName,
      isKiloV7Export,
      legacySelections,
      v7DefaultModel,
      v7Selections,
    ],
  )

  const safeExportActionSignature = useMemo(
    () => JSON.stringify({ exportTarget, exportActionSignature }),
    [exportActionSignature, exportTarget],
  )
  const {
    begin: beginExportAction,
    invalidate: invalidateExportAction,
    isRunning: isExporting,
  } = useSafeExportAction({
    isOpen,
    signature: safeExportActionSignature,
  })

  const invalidateAndClose = useCallback(() => {
    invalidateExportAction()
    onClose()
  }, [invalidateExportAction, onClose])

  useEffect(() => {
    setIsDownloadTooLarge(false)
  }, [exportActionSignature])

  useEffect(() => {
    const previous = previousSecretSourcesBySelectionIdRef.current
    const previousSnapshots = previousSelectionSnapshotsRef.current
    previousSecretSourcesBySelectionIdRef.current = secretSourcesBySelectionId
    previousSelectionSnapshotsRef.current = accountExportSelections
    if (
      !haveMatchingSecretSourceIdentities(
        previous,
        secretSourcesBySelectionId,
      ) ||
      !haveMatchingSelectionSnapshots(
        previousSnapshots,
        accountExportSelections,
      )
    ) {
      invalidateExportAction()
    }
  }, [
    invalidateExportAction,
    secretSourcesBySelectionId,
    accountExportSelections,
  ])
  const missingModelIdCount = isKiloV7Export
    ? v7Selections.filter(
        (selection) =>
          !selection.discoveredModelIds.length &&
          !selection.manualModelId?.trim(),
      ).length
    : legacySelections.filter((selection) => !selection.legacyModelId?.trim())
        .length
  const hasExportableProfiles =
    accountExportSelections.length > 0 &&
    v7Selections.length === accountExportSelections.length &&
    legacySelections.length === accountExportSelections.length
  const canExportV7 = Boolean(
    hasExportableProfiles &&
      !invalidSelection &&
      preparedCatalog?.providers.length === v7Selections.length &&
      v7DefaultModel,
  )
  const canExportLegacy = Boolean(
    hasExportableProfiles &&
      !invalidSelection &&
      effectiveCurrentApiConfigName &&
      legacySelections.every((selection) => selection.legacyModelId?.trim()),
  )
  const canExport = isKiloV7Export ? canExportV7 : canExportLegacy
  const legacyFilename = KILO_CODE_EXPORT_FILENAMES.Legacy
  const selectionSummary = t("ui:dialog.kiloCode.descriptions.selectedSites", {
    sites: selectedSiteIds.length,
    keys: accountExportSelections.length,
  })
  const exportInsights = {
    itemCount: accountExportSelections.length,
    modelCount: isKiloV7Export
      ? preparedCatalog?.modelCount ?? 0
      : legacySelections.filter((selection) => selection.legacyModelId?.trim())
          .length,
    selectedCount: selectedSiteIds.length,
    kiloCodeExportTarget: getKiloCodeExportAnalyticsTarget(exportTarget),
  }
  const buildCurrentExportOutput = useCallback(() => {
    if (isKiloV7Export) {
      if (!v7DefaultModel) {
        throw new Error("A valid V7 default model is required")
      }
      return resolveKiloCodeAccountExportOutput({
        target: KILO_CODE_EXPORT_TARGETS.KiloV7,
        selections: v7Selections,
        secretSourcesBySelectionId,
        defaultModel: v7DefaultModel,
      })
    }

    return resolveKiloCodeAccountExportOutput({
      target: KILO_CODE_EXPORT_TARGETS.Legacy,
      selections: legacySelections,
      secretSourcesBySelectionId,
      currentLegacyProfileName: effectiveCurrentApiConfigName,
    })
  }, [
    effectiveCurrentApiConfigName,
    isKiloV7Export,
    legacySelections,
    secretSourcesBySelectionId,
    v7DefaultModel,
    v7Selections,
  ])

  const handleCopyApiConfigs = async () => {
    if (!canExport) return
    const action = beginExportAction()
    if (!action) return

    const tracker = startProductAnalyticsAction({
      ...kiloCodeAccountExportAnalyticsContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyKiloCodeAccountExportConfig,
    })

    let actionInsights = exportInsights
    try {
      if (typeof navigator === "undefined") {
        throw new Error(t("ui:dialog.kiloCode.messages.copyFailed"))
      }

      const output = await buildCurrentExportOutput()
      if (!action.isCurrent()) {
        return
      }
      actionInsights = {
        ...exportInsights,
        itemCount: output.itemCount,
        modelCount: output.modelCount,
      }
      await navigator.clipboard.writeText(
        JSON.stringify(output.copyPayload, null, 2),
      )
      if (!action.isCurrent()) {
        return
      }
      toast.success(t("ui:dialog.kiloCode.messages.copiedExportConfig"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: actionInsights,
      })
    } catch (error) {
      if (!action.isCurrent()) {
        return
      }
      toast.error(
        getErrorMessage(error, t("ui:dialog.kiloCode.messages.copyFailed")),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: actionInsights,
      })
    } finally {
      action.finish()
    }
  }

  const handleDownloadSettings = async () => {
    if (!canExport) return
    const action = beginExportAction()
    if (!action) return

    const tracker = startProductAnalyticsAction({
      ...kiloCodeAccountExportAnalyticsContext,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportKiloCodeAccountSettingsFile,
    })

    let url: string | null = null
    let link: HTMLAnchorElement | null = null
    let actionInsights = exportInsights
    setIsDownloadTooLarge(false)

    try {
      const output = await buildCurrentExportOutput()
      if (!action.isCurrent()) {
        return
      }
      actionInsights = {
        ...exportInsights,
        itemCount: output.itemCount,
        modelCount: output.modelCount,
      }

      if (output.isDownloadTooLarge) {
        if (!action.isCurrent()) {
          return
        }
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
      if (!action.isCurrent()) {
        return
      }
      url = URL.createObjectURL(blob)
      link = document.createElement("a")
      link.href = url
      link.download = output.filename
      document.body.appendChild(link)
      if (!action.isCurrent()) {
        return
      }
      link.click()

      if (!action.isCurrent()) {
        return
      }
      toast.success(t("ui:dialog.kiloCode.messages.downloadedSettings"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: actionInsights,
      })
    } catch (error) {
      if (!action.isCurrent()) {
        return
      }
      toast.error(
        getErrorMessage(error, t("ui:dialog.kiloCode.messages.downloadFailed")),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: actionInsights,
      })
    } finally {
      if (link && document.body.contains(link)) {
        document.body.removeChild(link)
      }
      if (url) {
        URL.revokeObjectURL(url)
      }
      action.finish()
    }
  }

  const clearDownloadError = useCallback(() => setIsDownloadTooLarge(false), [])
  return {
    profileNames,
    effectiveCurrentApiConfigName,
    setCurrentApiConfigName,
    isKiloV7Export,
    isExporting,
    canExport,
    missingModelIdCount,
    hasExportableProfiles,
    legacyFilename,
    selectionSummary,
    isDownloadTooLarge,
    invalidateAndClose,
    handleCopyApiConfigs,
    handleDownloadSettings,
    clearDownloadError,
  }
}
