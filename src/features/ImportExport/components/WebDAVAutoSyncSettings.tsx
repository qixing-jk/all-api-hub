import { CircleCheck, CircleX, Clock, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { OPTIONS_CAPABILITY_ICONS } from "~/components/icons/optionsPageIcons"
import {
  Alert,
  Badge,
  BodySmall,
  Button,
  FormField,
  Heading4,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import toast from "~/lib/notify"
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
import { formatTimestamp } from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"

import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "../searchTargets"

/**
 * Unified logger scoped to WebDAV auto-sync settings UI.
 */
const logger = createLogger("WebDAVAutoSyncSettings")
const autoSyncSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavAutoSyncSettings
const WebdavSyncIcon = OPTIONS_CAPABILITY_ICONS.webdavSync

/**
 * Automatic sync configuration card: toggles schedule and strategy, and shows status/actions.
 */
/** Allows the shared auto-sync card to preview an unsaved provider selection. */
interface WebDAVAutoSyncSettingsProps {
  providerPreview?: CloudSyncProvider
  onGistEncryptionPasswordErrorChange?: (error?: string) => void
}

/** Renders the shared automatic-sync settings for the selected provider. */
export default function WebDAVAutoSyncSettings({
  providerPreview,
  onGistEncryptionPasswordErrorChange,
}: WebDAVAutoSyncSettingsProps = {}) {
  const { t } = useTranslation("importExport")
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
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const autoSyncEnabled = localConfig.autoSync
  const syncInterval = localConfig.syncInterval
  const syncStrategy =
    localConfig.syncStrategy as WebDAVSettings["syncStrategy"]
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
  const autoSyncEnableDescriptionKey = isGithubGist
    ? "webdav.gist.autoSyncEnableDesc"
    : "webdav.autoSync.enableDesc"

  // Status
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(0)
  const [lastSyncStatus, setLastSyncStatus] = useState<
    "success" | "error" | "idle"
  >("idle")
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)

  // Actions
  const [syncing, setSyncing] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

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

  const handleSaveSettings = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateWebDavAutoSyncSettings,
      surfaceId: autoSyncSurface,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    if (
      isGithubGist &&
      !(persistedWebdavSettings.backupEncryptionPassword ?? "").trim()
    ) {
      onGistEncryptionPasswordErrorChange?.(
        t("webdav.gist.encryptionPasswordRequired"),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      return
    }

    onGistEncryptionPasswordErrorChange?.(undefined)
    setSavingSettings(true)
    try {
      const normalizedSyncInterval = Number.isFinite(syncInterval)
        ? Math.max(minimumIntervalSeconds, syncInterval)
        : minimumIntervalSeconds
      const response = await updateWebdavAutoSyncSettings(
        {
          autoSync: autoSyncEnabled,
          syncInterval: normalizedSyncInterval,
          syncStrategy,
        },
        {
          expectedLastUpdated,
        },
      )

      if (response.success) {
        toast.success(
          t("settings:messages.updateSuccess", {
            name: t("webdav.autoSync.title"),
          }),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        await loadStatus()
      } else {
        toast.error(
          response.error ||
            t("settings:messages.updateFailed", {
              name: t("webdav.autoSync.title"),
            }),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      }
    } catch (error: any) {
      logger.error("Failed to update auto-sync settings", error)
      toast.error(
        error?.message ||
          t("settings:messages.updateFailed", {
            name: t("webdav.autoSync.title"),
          }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSyncNow = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncWebDavNow,
      surfaceId: autoSyncSurface,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    setSyncing(true)
    try {
      if (
        isGithubGist &&
        !(persistedWebdavSettings.backupEncryptionPassword ?? "").trim()
      ) {
        onGistEncryptionPasswordErrorChange?.(
          t("webdav.gist.encryptionPasswordRequired"),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        })
        return
      }

      onGistEncryptionPasswordErrorChange?.(undefined)
      const response = await sendWebdavAutoSyncMessage(
        WebdavAutoSyncMessageTypes.SyncNow,
      )

      if (response.success) {
        await loadPreferences()
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: getWebdavSyncStrategyMode(savedConfig.syncStrategy),
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
            mode: getWebdavSyncStrategyMode(savedConfig.syncStrategy),
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
          mode: getWebdavSyncStrategyMode(savedConfig.syncStrategy),
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

  const getStatusBadge = () => {
    if (isSyncing) {
      return (
        <Badge variant="info">
          <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
          {t("webdav.syncing")}
        </Badge>
      )
    }

    if (lastSyncStatus === "success") {
      return (
        <Badge variant="success">
          <CircleCheck className="mr-1 h-3 w-3" />
          {t("webdav.syncSuccess")}
        </Badge>
      )
    }

    if (lastSyncStatus === "error") {
      return (
        <Badge variant="danger">
          <CircleX className="mr-1 h-3 w-3" />
          {t("webdav.syncError")}
        </Badge>
      )
    }

    return (
      <Badge variant="secondary">
        <Clock className="mr-1 h-3 w-3" />
        {t("webdav.notSynced")}
      </Badge>
    )
  }

  return (
    <section id={WEBDAV_AUTO_SYNC_TARGET_IDS.root} className="space-y-4">
      {providerChangePending && (
        <Alert
          compact
          variant="warning"
          title={t("webdav.autoSync.providerSwitchPendingTitle")}
          description={t("webdav.autoSync.providerSwitchPending", {
            from: persistedProviderLabel,
            to: displayedProviderLabel,
          })}
        />
      )}

      <section className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <div className="space-y-1">
          <Heading4 className="m-0">{t("webdav.autoSync.strategy")}</Heading4>
          <p className="m-0 text-sm text-gray-600 dark:text-gray-400">
            {t("webdav.autoSync.strategyDesc")}
          </p>
        </div>
        <FormField label={t("webdav.autoSync.strategy")} className="mb-0">
          <Select
            value={syncStrategy ?? ""}
            onValueChange={(value) =>
              setLocalConfig((prev) => ({
                ...prev,
                syncStrategy: value as WebDAVSettings["syncStrategy"],
              }))
            }
          >
            <SelectTrigger
              id={WEBDAV_AUTO_SYNC_TARGET_IDS.strategy}
              disabled={providerChangePending}
            >
              <SelectValue placeholder={t("webdav.autoSync.strategy")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WEBDAV_SYNC_STRATEGIES.MERGE}>
                {t("webdav.autoSync.strategyMerge")}
              </SelectItem>
              <SelectItem value={WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY}>
                {t("webdav.autoSync.strategyLocalFirst")}
              </SelectItem>
              <SelectItem value={WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY}>
                {t("webdav.autoSync.strategyRemoteFirst")}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <WebdavSyncIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              <Heading4 className="m-0">{t("webdav.autoSync.title")}</Heading4>
            </div>
            <BodySmall className="m-0">
              {t(autoSyncEnableDescriptionKey)}
            </BodySmall>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Badge variant={providerChangePending ? "warning" : "outline"}>
              {t("webdav.autoSync.currentProvider", {
                provider: displayedProviderLabel,
              })}
            </Badge>
            {getStatusBadge()}
          </div>
        </div>

        <FormField label={t("webdav.autoSync.enable")}>
          <div
            id={WEBDAV_AUTO_SYNC_TARGET_IDS.enable}
            className="flex items-center gap-2"
          >
            <Switch
              checked={autoSyncEnabled}
              disabled={providerChangePending}
              onChange={(checked) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  autoSync: checked,
                }))
              }
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {autoSyncEnabled
                ? t("common:status.enabled")
                : t("common:status.disabled")}
            </span>
          </div>
        </FormField>

        {autoSyncEnabled && (
          <FormField
            label={t("webdav.autoSync.interval")}
            description={t("webdav.autoSync.intervalDesc")}
          >
            <Input
              id={WEBDAV_AUTO_SYNC_TARGET_IDS.interval}
              type="number"
              min={minimumIntervalSeconds}
              max={86400}
              step={60}
              value={syncInterval}
              disabled={providerChangePending}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  syncInterval: Number(e.target.value),
                }))
              }
              placeholder="3600"
            />
            <p className="mt-1 text-xs text-gray-500">
              {t("webdav.autoSync.intervalHint", {
                minutes: Math.floor(syncInterval / 60),
              })}
            </p>
          </FormField>
        )}
      </section>

      {/* Status information */}
      {lastSyncTime > 0 && (
        <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-800">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">
              {t("webdav.autoSync.lastSync")}:{" "}
            </span>
            {formatTimestamp(lastSyncTime)}
          </p>
          {lastSyncError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              <span className="font-medium">{t("common:status.error")}: </span>
              {lastSyncError}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync}
        surfaceId={autoSyncSurface}
      >
        <div className="flex flex-wrap gap-3">
          {autoSyncConfigDirty && (
            <Alert
              compact
              variant="warning"
              description={t("webdav.autoSync.actionState.unsaved")}
              className="basis-full"
            />
          )}

          <Button
            id={WEBDAV_AUTO_SYNC_TARGET_IDS.saveSettings}
            onClick={handleSaveSettings}
            disabled={providerChangePending}
            loading={savingSettings}
            variant="secondary"
            size="sm"
            className="flex-1"
          >
            {savingSettings
              ? t("common:status.saving")
              : t("webdav.autoSync.saveSettings")}
          </Button>

          <Button
            id={WEBDAV_AUTO_SYNC_TARGET_IDS.syncNow}
            onClick={handleSyncNow}
            disabled={providerChangePending}
            loading={syncing || isSyncing}
            variant="secondary"
            size="sm"
            className="flex-1"
          >
            {syncing || isSyncing
              ? t("webdav.syncing")
              : t("webdav.autoSync.syncNow")}
          </Button>
        </div>
      </ProductAnalyticsScope>
    </section>
  )
}
