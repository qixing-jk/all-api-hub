import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import toast from "~/lib/notify"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { testCloudSyncConnection } from "~/services/webdav/cloudSyncService"
import { sendWebdavAutoSyncMessage } from "~/services/webdav/webdavAutoSyncMessaging"
import type { DeepPartial } from "~/types/utils"
import {
  CLOUD_SYNC_PROVIDERS,
  isWebdavSyncDataSelectionEmpty,
  resolveWebdavSyncDataSelection,
  WEBDAV_SYNC_DATA_KEYS,
  WEBDAV_SYNC_STRATEGIES,
  type CloudSyncProvider,
  type WebDAVSettings,
  type WebDAVSyncDataKey,
} from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"

import {
  getWebdavAnalyticsErrorCategory,
  getWebdavAnalyticsFailureStage,
  PersistWebdavConfigError,
  webDavAnalyticsContext,
} from "../components/webDavAnalytics"
import { getPersistWebdavConfigErrorMessage } from "../components/webdavPreferenceFeedback"
import {
  getCloudSyncProviderForTarget,
  WEBDAV_TARGET_IDS,
} from "../searchTargets"
import { useCloudSyncSaveQueue } from "./useCloudSyncSaveQueue"

const logger = createLogger("WebDAVSettings")
const WEBDAV_SYNC_DATA_INPUT_IDS: Record<WebDAVSyncDataKey, string> = {
  accounts: WEBDAV_TARGET_IDS.syncDataAccounts,
  bookmarks: WEBDAV_TARGET_IDS.syncDataBookmarks,
  apiCredentialProfiles: WEBDAV_TARGET_IDS.syncDataApiCredentialProfiles,
  preferences: WEBDAV_TARGET_IDS.syncDataPreferences,
}

/**
 * Resolve the localized label for a selectable WebDAV sync data section.
 */
function getWebdavSyncDataLabel(t: TFunction, key: WebDAVSyncDataKey) {
  switch (key) {
    case "accounts":
      return t("importExport:webdav.syncData.accounts")
    case "bookmarks":
      return t("importExport:webdav.syncData.bookmarks")
    case "apiCredentialProfiles":
      return t("importExport:webdav.syncData.apiCredentialProfiles")
    case "preferences":
      return t("importExport:webdav.syncData.preferences")
  }
}

interface WebdavConfigOptions {
  onProviderDraftChange?: (provider: CloudSyncProvider) => void
  gistEncryptionPasswordError?: string
  onGistEncryptionPasswordErrorChange?: (error?: string) => void
}
/** Own the editable provider draft, validation, and guarded persistence. */
export function useWebdavConfig({
  onProviderDraftChange,
  gistEncryptionPasswordError: externalGistEncryptionPasswordError,
  onGistEncryptionPasswordErrorChange,
}: WebdavConfigOptions) {
  const { t } = useTranslation("importExport")
  const { preferences, updateWebdavSettings, loadPreferences } =
    useUserPreferencesContext()
  const immediateSave = useCloudSyncSaveQueue()
  const { enqueue } = immediateSave
  const latestVersion = useRef(preferences.lastUpdated)
  // Queue state can render before context publishes a successful write.
  // Accept changed snapshots, including timestamps after a clock correction.
  useEffect(() => {
    latestVersion.current = preferences.lastUpdated
  }, [preferences.lastUpdated])
  const persistedWebdavSettings = preferences.webdav

  const savedConfig = useMemo(
    () => ({
      provider: persistedWebdavSettings.provider ?? CLOUD_SYNC_PROVIDERS.WEBDAV,
      url: persistedWebdavSettings.url ?? "",
      username: persistedWebdavSettings.username ?? "",
      password: persistedWebdavSettings.password ?? "",
      githubGist: {
        token: persistedWebdavSettings.githubGist?.token ?? "",
        gistId: persistedWebdavSettings.githubGist?.gistId ?? "",
        gistUrl: persistedWebdavSettings.githubGist?.gistUrl ?? "",
      },
      syncData: resolveWebdavSyncDataSelection(
        persistedWebdavSettings.syncData,
      ),
      backupEncryptionEnabled: Boolean(
        persistedWebdavSettings.backupEncryptionEnabled,
      ),
      backupEncryptionPassword:
        persistedWebdavSettings.backupEncryptionPassword ?? "",
    }),
    [
      persistedWebdavSettings.backupEncryptionEnabled,
      persistedWebdavSettings.backupEncryptionPassword,
      persistedWebdavSettings.githubGist,
      persistedWebdavSettings.provider,
      persistedWebdavSettings.password,
      persistedWebdavSettings.syncData,
      persistedWebdavSettings.url,
      persistedWebdavSettings.username,
    ],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    isDirty: webdavConfigDirty,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const webdavUrl = localConfig.url
  const webdavUsername = localConfig.username
  const webdavPassword = localConfig.password
  const provider = localConfig.provider
  const githubGist = localConfig.githubGist
  const githubGistToken = githubGist.token
  const githubGistId = githubGist.gistId
  const syncDataSelection = localConfig.syncData
  const backupEncryptionEnabled = localConfig.backupEncryptionEnabled
  const backupEncryptionPassword = localConfig.backupEncryptionPassword

  useEffect(() => {
    onProviderDraftChange?.(provider)
  }, [onProviderDraftChange, provider])

  const [
    localGistEncryptionPasswordError,
    setLocalGistEncryptionPasswordError,
  ] = useState<string>()
  const gistEncryptionPasswordError =
    externalGistEncryptionPasswordError ?? localGistEncryptionPasswordError
  const setGistEncryptionPasswordError = useCallback(
    (error?: string) => {
      setLocalGistEncryptionPasswordError(error)
      onGistEncryptionPasswordErrorChange?.(error)
    },
    [onGistEncryptionPasswordErrorChange],
  )

  // 独立的动作状态，避免互相影响
  const [testing, setTesting] = useState(false)

  const webdavConfigFilled = useMemo(
    () =>
      provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
        ? Boolean(githubGistToken && githubGistId)
        : Boolean(webdavUrl && webdavUsername && webdavPassword),
    [
      githubGistId,
      githubGistToken,
      provider,
      webdavPassword,
      webdavUrl,
      webdavUsername,
    ],
  )
  const uploadConfigFilled =
    provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
      ? Boolean(githubGistToken)
      : webdavConfigFilled

  const syncDataOptions = useMemo(
    () =>
      WEBDAV_SYNC_DATA_KEYS.map((key) => ({
        key,
        id: WEBDAV_SYNC_DATA_INPUT_IDS[key],
        label: getWebdavSyncDataLabel(t, key),
      })),
    [t],
  )

  /** Serialize a field patch and retain its persisted version until context catches up. */
  const saveImmediateSettings = useCallback(
    (patch: DeepPartial<WebDAVSettings>) => {
      const tracker = startProductAnalyticsAction(
        webDavAnalyticsContext(PRODUCT_ANALYTICS_ACTION_IDS.UpdateWebDavConfig),
      )
      void enqueue(
        async () => {
          const result = await updateWebdavSettings(patch).catch((error) => {
            throw new PersistWebdavConfigError(error)
          })
          if (!result.ok)
            throw new PersistWebdavConfigError(undefined, {
              failure: result.reason,
            })
          latestVersion.current = result.preferences.lastUpdated
          await sendWebdavAutoSyncMessage(WebdavAutoSyncMessageTypes.Setup)
        },
        patch.syncData
          ? `syncData.${Object.keys(patch.syncData)[0]}`
          : patch.githubGist
            ? `githubGist.${Object.keys(patch.githubGist)[0]}`
            : Object.keys(patch)[0],
      )
        .then(() => tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success))
        .catch((error) => {
          logger.error("Failed to save WebDAV settings", error)
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: getWebdavAnalyticsErrorCategory(error),
            insights: { failureStage: getWebdavAnalyticsFailureStage(error) },
          })
          toast.error(
            getPersistWebdavConfigErrorMessage(
              error instanceof PersistWebdavConfigError
                ? error
                : new PersistWebdavConfigError(error),
              t,
            ),
          )
        })
    },
    [enqueue, updateWebdavSettings, t],
  )

  /** Save only the changed selection while updating its local checkbox immediately. */
  const updateSyncDataSelection = (
    key: WebDAVSyncDataKey,
    checked: boolean | "indeterminate",
  ) => {
    saveImmediateSettings({ syncData: { [key]: checked === true } })
    setLocalConfig((previousConfig) => ({
      ...previousConfig,
      syncData: {
        ...previousConfig.syncData,
        [key]: checked === true,
      },
    }))
  }

  const ensureSyncDataSelected = () => {
    if (!isWebdavSyncDataSelectionEmpty(syncDataSelection)) {
      return true
    }

    toast.error(t("webdav.syncData.selectionRequired"))
    return false
  }

  const ensureGistEncryptionPassword = () => {
    if (
      provider !== CLOUD_SYNC_PROVIDERS.GITHUB_GIST ||
      backupEncryptionPassword.trim()
    ) {
      setGistEncryptionPasswordError(undefined)
      return true
    }

    setGistEncryptionPasswordError(t("webdav.gist.encryptionPasswordRequired"))
    toast.error(t("webdav.gist.encryptionPasswordRequired"))
    return false
  }

  const webdavConfig = {
    provider,
    url: webdavUrl,
    username: webdavUsername,
    password: webdavPassword,
    backupEncryptionEnabled:
      provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
        ? true
        : backupEncryptionEnabled,
    backupEncryptionPassword,
    syncData: syncDataSelection,
    githubGist,
    autoSync: persistedWebdavSettings.autoSync ?? false,
    syncInterval: persistedWebdavSettings.syncInterval ?? 3600,
    syncStrategy:
      persistedWebdavSettings.syncStrategy ?? WEBDAV_SYNC_STRATEGIES.MERGE,
  }
  const webdavConfigForSave: Partial<WebDAVSettings> =
    provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST ||
    persistedWebdavSettings.provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
      ? {
          ...localConfig,
          backupEncryptionEnabled: webdavConfig.backupEncryptionEnabled,
        }
      : {
          url: webdavUrl,
          username: webdavUsername,
          password: webdavPassword,
          backupEncryptionEnabled,
          backupEncryptionPassword,
          syncData: syncDataSelection,
        }

  /** Reveal provider controls without changing the saved provider during search navigation. */
  const previewProvider = useCallback(
    (nextProvider: CloudSyncProvider) => {
      setGistEncryptionPasswordError(undefined)
      setLocalConfig((previousConfig) => ({
        ...previousConfig,
        provider: nextProvider,
      }))
    },
    [setGistEncryptionPasswordError, setLocalConfig],
  )

  /** Persist an explicit provider choice after immediately revealing its controls. */
  const handleProviderChange = (nextProvider: CloudSyncProvider) => {
    previewProvider(nextProvider)
    saveImmediateSettings({
      provider: nextProvider,
    })
  }

  useEffect(() => {
    const revealSearchTarget = () => {
      const params = new URLSearchParams(window.location.search)
      const targetProvider = getCloudSyncProviderForTarget(
        params.get("highlight") ?? params.get("anchor"),
      )
      if (targetProvider) previewProvider(targetProvider)
    }
    revealSearchTarget()
    window.addEventListener("popstate", revealSearchTarget)
    window.addEventListener("hashchange", revealSearchTarget)
    return () => {
      window.removeEventListener("popstate", revealSearchTarget)
      window.removeEventListener("hashchange", revealSearchTarget)
    }
  }, [previewProvider])

  /** Wait for queued field retries before saving a draft with optimistic version checking. */
  const persistWebdavConfig = async (
    updates: Partial<WebDAVSettings> = webdavConfigForSave,
    options?: {
      expectedLastUpdated?: number
      force?: boolean
    },
  ) => {
    await immediateSave.retry()
    if (
      !options?.force &&
      updates === webdavConfigForSave &&
      !webdavConfigDirty
    ) {
      return
    }

    let result
    try {
      result = await updateWebdavSettings(updates, {
        expectedLastUpdated:
          options?.expectedLastUpdated ?? latestVersion.current,
      })
    } catch (error) {
      throw new PersistWebdavConfigError(error)
    }
    if (!result.ok) {
      throw new PersistWebdavConfigError(undefined, {
        failure: result.reason,
      })
    }

    // Provider/credential changes must take effect for an already-running
    // background alarm without waiting for the next service-worker restart.
    try {
      const setupResult = await sendWebdavAutoSyncMessage(
        WebdavAutoSyncMessageTypes.Setup,
      )
      if (!setupResult.success) {
        logger.warn("Failed to refresh cloud sync schedule after settings save")
      }
    } catch (error) {
      logger.warn(
        "Failed to refresh cloud sync schedule after settings save",
        error,
      )
    }

    return result
  }

  /** Persist only the blurred field, including clears, while retrying prior failed writes. */
  const saveConnectionField = (
    field:
      | "url"
      | "username"
      | "password"
      | "backupEncryptionPassword"
      | "token"
      | "gistId",
    value: string,
  ) => {
    const isGistField = field === "token" || field === "gistId"
    const savedValue = isGistField
      ? savedConfig.githubGist[field]
      : savedConfig[field]
    if (
      value === savedValue &&
      !immediateSave.needsSave(isGistField ? `githubGist.${field}` : field)
    )
      return
    saveImmediateSettings(
      isGistField ? { githubGist: { [field]: value } } : { [field]: value },
    )
  }

  const setEncryptionEnabled = (enabled: boolean) => {
    setLocalConfig((previous) => ({
      ...previous,
      backupEncryptionEnabled: enabled,
    }))
    saveImmediateSettings({ backupEncryptionEnabled: enabled })
  }

  /** Retry failed field patches and keep localized feedback when another attempt fails. */
  const retrySave = () =>
    immediateSave.retry().catch((error) => {
      toast.error(
        getPersistWebdavConfigErrorMessage(
          error instanceof PersistWebdavConfigError
            ? error
            : new PersistWebdavConfigError(error),
          t,
        ),
      )
    })

  /** Flush the current configuration before testing the selected remote provider. */
  const handleTestConnection = async () => {
    const tracker = startProductAnalyticsAction(
      webDavAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.VerifyWebDavConnection,
      ),
    )

    if (!ensureGistEncryptionPassword()) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: {
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
        },
      })
      return
    }

    setTesting(true)
    try {
      await persistWebdavConfig()
      const remote = await testCloudSyncConnection(webdavConfig)
      if (
        provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST &&
        remote &&
        typeof remote === "object" &&
        "htmlUrl" in remote
      ) {
        setLocalConfig((previousConfig) => ({
          ...previousConfig,
          githubGist: {
            ...previousConfig.githubGist,
            gistUrl: typeof remote.htmlUrl === "string" ? remote.htmlUrl : "",
          },
        }))
      }
      toast.success(
        t(
          provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
            ? "webdav.gist.testSuccess"
            : "webdav.testSuccess",
        ),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (e: any) {
      logger.error("WebDAV connection test failed", e)
      toast.error(
        e instanceof PersistWebdavConfigError
          ? getPersistWebdavConfigErrorMessage(e, t)
          : e?.message ||
              t(
                provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                  ? "webdav.gist.testFailed"
                  : "webdav.testFailed",
              ),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: getWebdavAnalyticsErrorCategory(e),
        insights: {
          failureStage: getWebdavAnalyticsFailureStage(e),
        },
      })
    } finally {
      setTesting(false)
    }
  }

  return {
    preferences,
    loadPreferences,
    localConfig,
    setLocalConfig,
    provider,
    githubGist,
    githubGistToken,
    githubGistId,
    webdavUrl,
    webdavUsername,
    webdavPassword,
    syncDataSelection,
    backupEncryptionEnabled,
    backupEncryptionPassword,
    gistEncryptionPasswordError,
    setGistEncryptionPasswordError,
    saveFailed: immediateSave.failedKeys.some(
      (key) => !["autoSync", "syncInterval", "syncStrategy"].includes(key),
    ),
    retrySave,
    saveConnectionField,
    setEncryptionEnabled,
    savingImmediately: immediateSave.saving,
    testing,
    webdavConfigDirty,
    webdavConfigFilled,
    uploadConfigFilled,
    syncDataOptions,
    updateSyncDataSelection,
    ensureSyncDataSelected,
    ensureGistEncryptionPassword,
    webdavConfig,
    persistWebdavConfig,
    handleProviderChange,
    handleTestConnection,
  }
}

export type WebdavConfigState = ReturnType<typeof useWebdavConfig>
