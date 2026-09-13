import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import toast from "~/lib/notify"
import { userPreferences } from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  buildWebDavSyncDiagnostics,
  getWebdavSyncStrategyMode,
} from "~/services/productAnalytics/webDavSync"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { sendWebdavAutoSyncMessage } from "~/services/webdav/webdavAutoSyncMessaging"
import {
  CLOUD_SYNC_PROVIDERS,
  WEBDAV_SYNC_STRATEGIES,
  type CloudSyncProvider,
  type WebDAVSettings,
} from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"

import { useCloudSyncSaveQueue } from "./useCloudSyncSaveQueue"

const logger = createLogger("WebDAVAutoSyncSettings")
const autoSyncSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavAutoSyncSettings

/** Allows the shared auto-sync card to preview an unsaved provider selection. */
export interface WebDAVAutoSyncSettingsProps {
  providerPreview?: CloudSyncProvider
  onGistEncryptionPasswordErrorChange?: (error?: string) => void
}

/** Own the saved schedule draft, provider preview guard, and status refresh. */
export function useWebdavAutoSyncSettings({
  providerPreview,
  onGistEncryptionPasswordErrorChange,
}: WebDAVAutoSyncSettingsProps) {
  const { t } = useTranslation("importExport")
  const immediateSave = useCloudSyncSaveQueue()
  const { preferences, updateWebdavAutoSyncSettings, loadPreferences } =
    useUserPreferencesContext()
  const persistedWebdavSettings = preferences.webdav

  const savedConfig = useMemo(
    () => ({
      autoSync: persistedWebdavSettings.autoSync ?? false,
      syncInterval: persistedWebdavSettings.syncInterval ?? 3600,
      syncStrategy:
        persistedWebdavSettings.syncStrategy ?? WEBDAV_SYNC_STRATEGIES.MERGE,
    }),
    [
      persistedWebdavSettings.autoSync,
      persistedWebdavSettings.syncInterval,
      persistedWebdavSettings.syncStrategy,
    ],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    isDirty: autoSyncConfigDirty,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const autoSyncEnabled = localConfig.autoSync
  const syncInterval = localConfig.syncInterval
  const syncStrategy = localConfig.syncStrategy
  const persistedProvider =
    persistedWebdavSettings.provider ?? CLOUD_SYNC_PROVIDERS.WEBDAV
  const displayedProvider = providerPreview ?? persistedProvider
  const providerChangePending = displayedProvider !== persistedProvider
  const isGithubGist = displayedProvider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
  const minimumIntervalSeconds = isGithubGist ? 300 : 60
  const displayedProviderLabel = t(
    isGithubGist ? "webdav.provider.githubGist" : "webdav.provider.webdav",
  )
  const persistedProviderLabel = t(
    persistedProvider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
      ? "webdav.provider.githubGist"
      : "webdav.provider.webdav",
  )
  const autoSyncEnableDescription = t(
    isGithubGist
      ? "webdav.gist.autoSyncEnableDesc"
      : "webdav.autoSync.enableDesc",
  )

  // Status
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(0)
  const [lastSyncStatus, setLastSyncStatus] = useState<
    "success" | "error" | "idle"
  >("idle")
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  // Actions
  const [syncing, setSyncing] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const response = await sendWebdavAutoSyncMessage(
        WebdavAutoSyncMessageTypes.GetStatus,
      )
      if (response.success && response.data) {
        setIsSyncing(response.data.isSyncing)
        setLastSyncTime(response.data.lastSyncTime)
        setLastSyncStatus(response.data.lastSyncStatus)
        setLastSyncError(response.data.lastSyncError)
      }
    } catch (error) {
      logger.error("Failed to load sync status", error)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const ensureGistEncryptionPassword = (
    tracker: ReturnType<typeof startProductAnalyticsAction>,
    settings: WebDAVSettings,
  ) => {
    if (
      settings.provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST &&
      !(settings.backupEncryptionPassword ?? "").trim()
    ) {
      onGistEncryptionPasswordErrorChange?.(
        t("webdav.gist.encryptionPasswordRequired"),
      )
      toast.error(t("webdav.gist.encryptionPasswordRequired"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      return false
    }

    onGistEncryptionPasswordErrorChange?.(undefined)
    return true
  }

  const saveSetting = (
    patch: Pick<
      Partial<WebDAVSettings>,
      "autoSync" | "syncInterval" | "syncStrategy"
    >,
  ) => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateWebDavAutoSyncSettings,
      surfaceId: autoSyncSurface,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    setLocalConfig((previous) => ({ ...previous, ...patch }))
    void immediateSave
      .enqueue(async () => {
        const response = await updateWebdavAutoSyncSettings(patch)
        if (!response.success)
          throw new Error(
            response.error ||
              t("settings:messages.updateFailed", {
                name: t("webdav.autoSync.title"),
              }),
          )
        await loadStatus()
      }, Object.keys(patch)[0])
      .then(() => tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success))
      .catch((error) => {
        toast.error(
          error?.message ||
            t("settings:messages.updateFailed", {
              name: t("webdav.autoSync.title"),
            }),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      })
  }

  const saveInterval = () => {
    const interval = Number.isFinite(syncInterval)
      ? Math.min(86400, Math.max(minimumIntervalSeconds, syncInterval))
      : minimumIntervalSeconds
    if (
      interval !== savedConfig.syncInterval ||
      immediateSave.needsSave("syncInterval")
    )
      saveSetting({ syncInterval: interval })
    else setLocalConfig((previous) => ({ ...previous, syncInterval: interval }))
  }

  const retrySave = () =>
    immediateSave
      .retry()
      .catch((error) =>
        toast.error(
          error?.message ||
            t("settings:messages.updateFailed", {
              name: t("webdav.autoSync.title"),
            }),
        ),
      )

  const handleSyncNow = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncWebDavNow,
      surfaceId: autoSyncSurface,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    setSyncing(true)
    try {
      await immediateSave.flush()
      const current = await userPreferences.getPreferences()
      if (!ensureGistEncryptionPassword(tracker, current.webdav)) return
      const response = await sendWebdavAutoSyncMessage(
        WebdavAutoSyncMessageTypes.SyncNow,
      )

      if (response.success) {
        await loadPreferences()
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: getWebdavSyncStrategyMode(syncStrategy),
            itemCount: 1,
            successCount: 1,
            failureCount: 0,
            skippedCount: 0,
          }),
        })
        await loadStatus()
        toast.success(t("webdav.syncSuccess"))
      } else {
        toast.error(response.error || t("webdav.syncFailed"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: getWebdavSyncStrategyMode(syncStrategy),
            itemCount: 1,
            successCount: 0,
            failureCount: 1,
            skippedCount: 0,
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          }),
        })
      }
    } catch (error: any) {
      logger.error("Failed to trigger WebDAV auto-sync", error)
      toast.error(error?.message || t("webdav.syncFailed"))
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        diagnostics: buildWebDavSyncDiagnostics({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          mode: getWebdavSyncStrategyMode(syncStrategy),
          itemCount: 1,
          successCount: 0,
          failureCount: 1,
          skippedCount: 0,
          error,
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        }),
      })
    } finally {
      setSyncing(false)
    }
  }

  return {
    autoSyncEnabled,
    syncInterval,
    syncStrategy,
    setLocalConfig,
    saveSetting,
    saveInterval,
    savingImmediately: immediateSave.saving,
    providerChangePending,
    minimumIntervalSeconds,
    displayedProviderLabel,
    persistedProviderLabel,
    autoSyncEnableDescription,
    isSyncing,
    lastSyncTime,
    lastSyncStatus,
    lastSyncError,
    syncing,
    saveFailed: immediateSave.failedKeys.some((key) =>
      ["autoSync", "syncInterval", "syncStrategy"].includes(key),
    ),
    retrySave,
    autoSyncConfigDirty,
    handleSyncNow,
  }
}
