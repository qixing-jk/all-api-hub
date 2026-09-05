import type { TFunction } from "i18next"
import { useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { OPTIONS_CAPABILITY_ICONS } from "~/components/icons/optionsPageIcons"
import {
  Alert,
  BodySmall,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  Heading4,
  Input,
  Label,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { ensureLegacyChannelConfigMigrationReady } from "~/services/managedSites/legacyChannelConfigMigration"
import { userPreferences } from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { buildWebDavSyncDiagnostics } from "~/services/productAnalytics/webDavSync"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { tagStorage } from "~/services/tags/tagStorage"
import {
  createCloudSyncBackup,
  downloadCloudSyncBackup,
  testCloudSyncConnection,
  uploadCloudSyncBackup,
} from "~/services/webdav/cloudSyncService"
import { sendWebdavAutoSyncMessage } from "~/services/webdav/webdavAutoSyncMessaging"
import {
  decryptWebdavBackupEnvelope,
  tryParseEncryptedWebdavBackupEnvelope,
  type EncryptedWebdavBackupEnvelopeV1,
} from "~/services/webdav/webdavBackupEncryption"
import {
  buildWebdavImportPayloadBySelection,
  mergeWebdavBackupPayloadBySelection,
} from "~/services/webdav/webdavSelectiveSync"
import {
  downloadBackup,
  downloadBackupRaw,
  isWebdavFileNotFoundError,
  parseWebdavBackupJson,
} from "~/services/webdav/webdavService"
import {
  CLOUD_SYNC_PROVIDERS,
  DEFAULT_WEBDAV_SYNC_DATA_SELECTION,
  isWebdavSyncDataSelectionEmpty,
  resolveWebdavSyncDataSelection,
  WEBDAV_SYNC_DATA_KEYS,
  type WebDAVSettings,
  type WebDAVSyncDataKey,
  type WebDAVSyncDataSelection,
} from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/core/toastHelpers"
import { applyPreferenceLanguage } from "~/utils/i18n/applyPreferenceLanguage"
import { t as translate } from "~/utils/i18n/core"
import { changePageLanguage } from "~/utils/i18n/pageLanguage"

import { WEBDAV_TARGET_IDS } from "../searchTargets"
import { IMPORT_EXPORT_TEST_IDS } from "../testIds"
import {
  BACKUP_VERSION,
  getImportExportErrorMessage,
  importFromBackupObject,
  type BackupFullV2,
} from "../utils"
import {
  getWebdavAnalyticsErrorCategory,
  getWebdavAnalyticsFailureStage,
  PersistWebdavConfigError,
  webDavAnalyticsContext,
  webDavSettingsSurface,
} from "./webDavAnalytics"
import { WebDAVDecryptPasswordModal } from "./WebDAVDecryptPasswordModal"

/**
 * Unified logger scoped to WebDAV settings and backup import/export actions.
 */
const logger = createLogger("WebDAVSettings")
const WebdavSyncIcon = OPTIONS_CAPABILITY_ICONS.webdavSync

/** Keep manual UI flows compatible with older preference test doubles. */
async function exportPreferencesForBackup() {
  if (typeof userPreferences.exportPreferencesForBackup === "function") {
    return userPreferences.exportPreferencesForBackup()
  }
  return userPreferences.exportPreferences()
}

const WEBDAV_SYNC_DATA_INPUT_IDS: Record<WebDAVSyncDataKey, string> = {
  accounts: WEBDAV_TARGET_IDS.syncDataAccounts,
  bookmarks: WEBDAV_TARGET_IDS.syncDataBookmarks,
  apiCredentialProfiles: WEBDAV_TARGET_IDS.syncDataApiCredentialProfiles,
  preferences: WEBDAV_TARGET_IDS.syncDataPreferences,
}

class ExistingWebdavBackupMalformedError extends Error {
  constructor(cause?: unknown) {
    super("Existing WebDAV backup is malformed", { cause })
    this.name = "ExistingWebdavBackupMalformedError"
    ;(this as Error & { cause?: unknown }).cause = cause
  }
}

const getPersistWebdavConfigErrorMessage = (error: unknown, t: TFunction) => {
  if (error instanceof PersistWebdavConfigError && error.preferenceFailure) {
    return getPreferenceWriteFailureMessage(error.preferenceFailure, {
      fallback: t("settings:messages.saveSettingsFailed"),
    })
  }

  return t("settings:messages.saveSettingsFailed")
}

class WebdavRebuildConfirmationRequired extends Error {
  constructor() {
    super("WebDAV backup rebuild confirmation is required")
    this.name = "WebdavRebuildConfirmationRequired"
  }
}

/** Detects the stable malformed-backup error emitted by WebDAV backup parsing. */
function isInvalidWebdavBackupError(error: unknown) {
  return (
    error instanceof Error &&
    error.message === translate("messages:webdav.invalidBackupJson")
  )
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

/**
 * WebDAV backup configuration card handling save/test/upload/download actions.
 */
export default function WebDAVSettings() {
  const { t } = useTranslation("importExport")
  const { preferences, updateWebdavSettings, loadPreferences } =
    useUserPreferencesContext()
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
  const provider = localConfig.provider ?? CLOUD_SYNC_PROVIDERS.WEBDAV
  const githubGist = localConfig.githubGist ?? {
    token: "",
    gistId: "",
    gistUrl: "",
  }
  const githubGistToken = githubGist.token
  const githubGistId = githubGist.gistId
  const syncDataSelection = localConfig.syncData
  const backupEncryptionEnabled = localConfig.backupEncryptionEnabled
  const backupEncryptionPassword = localConfig.backupEncryptionPassword

  const [decryptDialogOpen, setDecryptDialogOpen] = useState(false)
  const [decrypting, setDecrypting] = useState(false)
  const [decryptPassword, setDecryptPassword] = useState("")
  const [saveDecryptPassword, setSaveDecryptPassword] = useState(true)
  const [pendingEnvelope, setPendingEnvelope] =
    useState<EncryptedWebdavBackupEnvelopeV1 | null>(null)
  const [rebuildDialogOpen, setRebuildDialogOpen] = useState(false)
  const [rebuildPending, setRebuildPending] = useState(false)

  // 独立的动作状态，避免互相影响
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)

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
  const gistCreateReady =
    provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST &&
    Boolean(githubGistToken && backupEncryptionPassword)

  const syncDataOptions = useMemo(
    () =>
      WEBDAV_SYNC_DATA_KEYS.map((key) => ({
        key,
        id: WEBDAV_SYNC_DATA_INPUT_IDS[key],
        label: getWebdavSyncDataLabel(t, key),
      })),
    [t],
  )

  const updateSyncDataSelection = (
    key: WebDAVSyncDataKey,
    checked: boolean | "indeterminate",
  ) => {
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
      persistedWebdavSettings.syncStrategy ??
      ("merge" as WebDAVSettings["syncStrategy"]),
  }
  const webdavConfigForSave: Partial<WebDAVSettings> =
    provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST ||
    persistedWebdavSettings.provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
      ? webdavConfig
      : {
          url: webdavUrl,
          username: webdavUsername,
          password: webdavPassword,
          backupEncryptionEnabled,
          backupEncryptionPassword,
          syncData: syncDataSelection,
        }

  const handleProviderChange = (nextProvider: string) => {
    setLocalConfig((previousConfig) => ({
      ...previousConfig,
      provider: nextProvider as NonNullable<WebDAVSettings["provider"]>,
      ...(nextProvider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
        ? { backupEncryptionEnabled: true }
        : {}),
    }))
  }

  const persistWebdavConfig = async (
    updates: Partial<WebDAVSettings> = webdavConfigForSave,
    options?: {
      expectedLastUpdated?: number
      force?: boolean
    },
  ) => {
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
          options?.expectedLastUpdated ?? preferences.lastUpdated,
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

  const handleSaveConfig = async () => {
    const tracker = startProductAnalyticsAction(
      webDavAnalyticsContext(PRODUCT_ANALYTICS_ACTION_IDS.UpdateWebDavConfig),
    )

    setSaving(true)
    try {
      await persistWebdavConfig(webdavConfigForSave, { force: true })
      toast.success(
        t("settings:messages.updateSuccess", {
          name: t(
            provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
              ? "webdav.gist.title"
              : "webdav.title",
          ),
        }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (e) {
      logger.error("Failed to save WebDAV settings", e)
      toast.error(
        e instanceof PersistWebdavConfigError
          ? getPersistWebdavConfigErrorMessage(e, t)
          : t("settings:messages.updateFailed", {
              name: t(
                provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                  ? "webdav.gist.title"
                  : "webdav.title",
              ),
            }),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: getWebdavAnalyticsErrorCategory(e),
        insights: {
          failureStage: getWebdavAnalyticsFailureStage(e),
        },
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    const tracker = startProductAnalyticsAction(
      webDavAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.VerifyWebDavConnection,
      ),
    )

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

  /**
   * Export a full backup (accounts + preferences + channel configs) and upload it
   * to WebDAV.
   *
   * Notes:
   * - The upload service may apply password-based encryption depending on the
   *   current WebDAV encryption settings.
   */
  const uploadWebdavBackup = async (options?: {
    forceFullRebuild?: boolean
    createGist?: boolean
  }) => {
    const tracker = startProductAnalyticsAction(
      webDavAnalyticsContext(PRODUCT_ANALYTICS_ACTION_IDS.UploadWebDavBackup),
    )

    setUploading(true)
    try {
      if (!ensureSyncDataSelected()) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          },
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
            itemCount: 0,
            successCount: 0,
            failureCount: 1,
            skippedCount: 0,
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.MissingSelection,
          }),
        })
        return
      }

      const persistedConfigResult = await persistWebdavConfig()
      const selectionForUpload: WebDAVSyncDataSelection =
        options?.forceFullRebuild
          ? DEFAULT_WEBDAV_SYNC_DATA_SELECTION
          : syncDataSelection
      await ensureLegacyChannelConfigMigrationReady({ bypassBackoff: true })
      const [
        accountData,
        tagStore,
        preferencesData,
        featureGuidance,
        channelConfigs,
        apiCredentialProfiles,
      ] = await Promise.all([
        accountDataTransfer.exportData(),
        tagStorage.exportTagStore(),
        exportPreferencesForBackup(),
        featureGuidanceState.getState(),
        channelConfigStorage.exportConfigs(),
        apiCredentialProfilesStorage.exportConfig(),
      ])
      const exportData: BackupFullV2 = {
        version: BACKUP_VERSION,
        timestamp: Date.now(),
        accounts: accountData,
        tagStore,
        preferences: preferencesData,
        featureGuidance,
        channelConfigs,
        apiCredentialProfiles,
      }

      let remoteBackup: any | null = null
      let remoteRevision: string | undefined

      const shouldCreateGist =
        provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST &&
        (options?.createGist ?? !githubGistId)

      if (!options?.forceFullRebuild && !shouldCreateGist) {
        try {
          const remoteResult =
            provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
              ? await downloadCloudSyncBackup(webdavConfig)
              : {
                  content: await downloadBackup(webdavConfig, {
                    prepareForWrite: true,
                  }),
                  remote: undefined,
                }
          const remoteContent = remoteResult.content
          remoteRevision = remoteResult.remote?.revision
          try {
            remoteBackup = parseWebdavBackupJson(remoteContent, {
              requireBackupShape: true,
            })
          } catch (error) {
            if (isInvalidWebdavBackupError(error)) {
              throw new ExistingWebdavBackupMalformedError(error)
            }

            throw error
          }
        } catch (error: any) {
          if (
            provider !== CLOUD_SYNC_PROVIDERS.WEBDAV ||
            !isWebdavFileNotFoundError(error)
          ) {
            if (error instanceof ExistingWebdavBackupMalformedError) {
              logger.warn(
                "Existing WebDAV backup is malformed; awaiting rebuild confirmation",
                error,
              )
              setRebuildDialogOpen(true)
              throw new WebdavRebuildConfirmationRequired()
            } else {
              throw error
            }
          }
        }
      }

      const payload = mergeWebdavBackupPayloadBySelection({
        backup: exportData,
        selection: selectionForUpload,
        remoteBackup,
      })

      const serializedPayload = JSON.stringify(payload, null, 2)
      if (shouldCreateGist) {
        const remote = await createCloudSyncBackup(
          serializedPayload,
          webdavConfig,
        )
        setLocalConfig((previousConfig) => ({
          ...previousConfig,
          githubGist: {
            ...previousConfig.githubGist,
            gistId:
              "gistId" in remote && typeof remote.gistId === "string"
                ? remote.gistId
                : previousConfig.githubGist?.gistId ?? "",
            gistUrl: remote.htmlUrl ?? "",
          },
        }))
        await persistWebdavConfig(
          {
            githubGist: {
              ...githubGist,
              gistId: remote.gistId ?? githubGistId,
              gistUrl: remote.htmlUrl ?? githubGist.gistUrl,
            },
          },
          {
            force: true,
            expectedLastUpdated: persistedConfigResult?.ok
              ? persistedConfigResult.preferences.lastUpdated
              : preferences.lastUpdated,
          },
        )
      } else {
        await uploadCloudSyncBackup(
          serializedPayload,
          webdavConfig,
          remoteRevision,
        )
      }
      toast.success(
        t(
          provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
            ? "webdav.gist.uploadSuccess"
            : "webdav.uploadSuccess",
        ),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        diagnostics: buildWebDavSyncDiagnostics({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
          itemCount: 1,
          successCount: 1,
          failureCount: 0,
          skippedCount: 0,
        }),
      })
    } catch (e: any) {
      if (e instanceof WebdavRebuildConfirmationRequired) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
            itemCount: 1,
            successCount: 0,
            failureCount: 0,
            skippedCount: 1,
          }),
        })
        return
      }

      logger.error("Failed to upload backup to WebDAV", e)
      toast.error(
        e instanceof PersistWebdavConfigError
          ? getPersistWebdavConfigErrorMessage(e, t)
          : getImportExportErrorMessage(e) ||
              e?.message ||
              t(
                provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                  ? "webdav.gist.uploadFailed"
                  : "webdav.uploadFailed",
              ),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: getWebdavAnalyticsErrorCategory(e),
        insights: {
          failureStage: getWebdavAnalyticsFailureStage(e),
        },
        diagnostics: buildWebDavSyncDiagnostics({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
          itemCount: 1,
          successCount: 0,
          failureCount: 1,
          skippedCount: 0,
          error: e,
          errorCategory: getWebdavAnalyticsErrorCategory(e),
          failureStage: getWebdavAnalyticsFailureStage(e),
        }),
      })
    } finally {
      setUploading(false)
    }
  }

  const handleUploadBackup = async () => {
    await uploadWebdavBackup()
  }

  const handleCreateGist = async () => {
    await uploadWebdavBackup({ createGist: true })
  }

  const handleConfirmRebuildBackup = async () => {
    setRebuildPending(true)
    try {
      await uploadWebdavBackup({ forceFullRebuild: true })
    } finally {
      setRebuildPending(false)
      setRebuildDialogOpen(false)
    }
  }

  const handleImportWithSelection = async (rawBackup: any) => {
    const payload = await buildWebdavImportPayloadBySelection({
      rawBackup,
      selection: syncDataSelection,
    })

    return await importFromBackupObject(payload, {
      preserveWebdav: true,
    })
  }

  /**
   * Download the remote backup file from WebDAV and import it into local storage.
   *
   * If the downloaded file is an encrypted envelope:
   * - First attempt to decrypt using the stored WebDAV encryption password.
   * - If missing/incorrect, prompt the user with a retry modal.
   */
  const handleDownloadAndImport = async () => {
    const tracker = startProductAnalyticsAction(
      webDavAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.DownloadImportWebDavBackup,
      ),
    )

    setDownloading(true)
    try {
      if (!ensureSyncDataSelected()) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          },
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
            itemCount: 0,
            successCount: 0,
            failureCount: 1,
            skippedCount: 0,
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.MissingSelection,
          }),
        })
        return
      }

      await persistWebdavConfig()
      const raw =
        provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
          ? (await downloadCloudSyncBackup(webdavConfig)).content
          : await downloadBackupRaw(webdavConfig)
      const envelope = tryParseEncryptedWebdavBackupEnvelope(raw)

      let content = raw
      if (envelope) {
        const pwd = (backupEncryptionPassword || "").trim()
        if (!pwd) {
          toast.error(t("webdav.encryption.decryptPrompt"))
          setPendingEnvelope(envelope)
          setDecryptPassword("")
          setDecryptDialogOpen(true)
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            diagnostics: buildWebDavSyncDiagnostics({
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
              retryAttempted: true,
              retryCount: 1,
              itemCount: 1,
              successCount: 0,
              failureCount: 0,
              skippedCount: 1,
            }),
          })
          return
        }

        try {
          content = await decryptWebdavBackupEnvelope({
            envelope,
            password: pwd,
          })
        } catch {
          toast.error(t("webdav.encryption.decryptPrompt"))
          setPendingEnvelope(envelope)
          setDecryptPassword(pwd)
          setDecryptDialogOpen(true)
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
            diagnostics: buildWebDavSyncDiagnostics({
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
              retryAttempted: true,
              retryCount: 1,
              itemCount: 1,
              successCount: 0,
              failureCount: 0,
              skippedCount: 1,
            }),
          })
          return
        }
      }

      const data = parseWebdavBackupJson(content, {
        requireBackupShape: true,
      })
      const result = await handleImportWithSelection(data)
      if (result.allImported || result.sections?.preferences) {
        await loadPreferences()
        await applyPreferenceLanguage(
          await userPreferences.getLanguage(),
          changePageLanguage,
        )
      }
      if (result.allImported) {
        toast.success(t("importExport:import.importSuccess"))
      }
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        diagnostics: buildWebDavSyncDiagnostics({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
          itemCount: 1,
          successCount: 1,
          failureCount: 0,
          skippedCount: 0,
        }),
      })
    } catch (e: any) {
      logger.error("Failed to download/import WebDAV backup", e)
      toast.error(
        e instanceof PersistWebdavConfigError
          ? getPersistWebdavConfigErrorMessage(e, t)
          : getImportExportErrorMessage(e) ||
              e?.message ||
              t("importExport:import.downloadImportFailed"),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: getWebdavAnalyticsErrorCategory(e),
        insights: {
          failureStage: getWebdavAnalyticsFailureStage(e),
        },
        diagnostics: buildWebDavSyncDiagnostics({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
          itemCount: 1,
          successCount: 0,
          failureCount: 1,
          skippedCount: 0,
          error: e,
          errorCategory: getWebdavAnalyticsErrorCategory(e),
          failureStage: getWebdavAnalyticsFailureStage(e),
        }),
      })
    } finally {
      setDownloading(false)
    }
  }

  /**
   * Retry decrypting an encrypted WebDAV backup with a user-provided password.
   *
   * On success:
   * - Imports the decrypted backup.
   * - Optionally persists the password into WebDAV settings if the user opted-in.
   */
  const handleDecryptAndImport = async () => {
    if (!pendingEnvelope) return
    const tracker = startProductAnalyticsAction(
      webDavAnalyticsContext(
        PRODUCT_ANALYTICS_ACTION_IDS.DecryptImportWebDavBackup,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavDecryptPasswordDialog,
      ),
    )
    const pwd = decryptPassword.trim()

    setDecrypting(true)
    let decryptCompleted = false
    try {
      if (!ensureSyncDataSelected()) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          },
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
            itemCount: 0,
            successCount: 0,
            failureCount: 1,
            skippedCount: 0,
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.MissingSelection,
          }),
        })
        return
      }

      const content = await decryptWebdavBackupEnvelope({
        envelope: pendingEnvelope,
        password: pwd,
      })
      decryptCompleted = true

      const data = parseWebdavBackupJson(content, {
        requireBackupShape: true,
      })
      const result = await handleImportWithSelection(data)
      let importedPreferencesLastUpdated: number | null = null
      let decryptPasswordPersistFailed = false
      let decryptPasswordPersistError: unknown

      if (result.allImported || result.sections?.preferences) {
        const refreshedPreferences = await userPreferences.getPreferences()
        importedPreferencesLastUpdated = refreshedPreferences.lastUpdated
        await loadPreferences()
        await applyPreferenceLanguage(
          await userPreferences.getLanguage(),
          changePageLanguage,
        )
      }

      if (saveDecryptPassword) {
        try {
          await persistWebdavConfig(
            {
              backupEncryptionPassword: pwd,
            },
            importedPreferencesLastUpdated === null
              ? undefined
              : {
                  expectedLastUpdated: importedPreferencesLastUpdated,
                },
          )
          setLocalConfig((prev) => ({
            ...prev,
            backupEncryptionPassword: pwd,
          }))
        } catch (error) {
          logger.error("Failed to persist WebDAV decrypt password", error)
          toast.error(getPersistWebdavConfigErrorMessage(error, t))
          decryptPasswordPersistFailed = true
          decryptPasswordPersistError = error
        }
      }

      if (result.allImported) {
        toast.success(t("importExport:import.importSuccess"))
      }

      setDecryptDialogOpen(false)
      setPendingEnvelope(null)
      if (decryptPasswordPersistFailed) {
        const persistErrorCategory = decryptPasswordPersistError
          ? getWebdavAnalyticsErrorCategory(decryptPasswordPersistError)
          : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: persistErrorCategory,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          },
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
            itemCount: 1,
            successCount: 0,
            failureCount: 1,
            skippedCount: 0,
            error: decryptPasswordPersistError,
            errorCategory: persistErrorCategory,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.StorageWriteFailed,
          }),
        })
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          diagnostics: buildWebDavSyncDiagnostics({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
            itemCount: 1,
            successCount: 1,
            failureCount: 0,
            skippedCount: 0,
          }),
        })
      }
    } catch (e: any) {
      logger.error("Failed to decrypt/import WebDAV backup", e)
      toast.error(
        getImportExportErrorMessage(e) ||
          e?.message ||
          t("webdav.encryption.decryptFailed"),
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: decryptCompleted
          ? getWebdavAnalyticsErrorCategory(e)
          : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: {
          failureStage: decryptCompleted
            ? getWebdavAnalyticsFailureStage(e)
            : PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
        },
        diagnostics: buildWebDavSyncDiagnostics({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
          itemCount: 1,
          successCount: 0,
          failureCount: 1,
          skippedCount: 0,
          error: e,
          errorCategory: decryptCompleted
            ? getWebdavAnalyticsErrorCategory(e)
            : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          failureStage: decryptCompleted
            ? getWebdavAnalyticsFailureStage(e)
            : PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
        }),
      })
    } finally {
      setDecrypting(false)
    }
  }

  return (
    <>
      <Card id={WEBDAV_TARGET_IDS.root} padding="none">
        <CardHeader>
          <div className="mb-1 flex items-center space-x-2">
            <WebdavSyncIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <CardTitle className="mb-0">
              {t(
                provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                  ? "webdav.gist.title"
                  : "webdav.title",
              )}
            </CardTitle>
          </div>
          <CardDescription>
            {t(
              provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                ? "webdav.gist.configDesc"
                : "webdav.configDesc",
            )}
          </CardDescription>
        </CardHeader>

        <CardContent padding="md" className="space-y-4">
          <Alert
            id={WEBDAV_TARGET_IDS.restorePolicy}
            variant="info"
            title={t("webdav.restorePolicy.title")}
            description={t(
              provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                ? "webdav.gist.restorePolicyDescription"
                : "webdav.restorePolicy.description",
            )}
          />

          {/* 配置表单 */}
          <div className="space-y-4">
            <FormField label={t("webdav.provider.label")}>
              <Select value={provider} onValueChange={handleProviderChange}>
                <SelectTrigger id={WEBDAV_TARGET_IDS.provider}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CLOUD_SYNC_PROVIDERS.WEBDAV}>
                    {t("webdav.provider.webdav")}
                  </SelectItem>
                  <SelectItem value={CLOUD_SYNC_PROVIDERS.GITHUB_GIST}>
                    {t("webdav.provider.githubGist")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            {provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  label={t("webdav.gist.token")}
                  description={t("webdav.gist.tokenDesc")}
                >
                  <Input
                    id={WEBDAV_TARGET_IDS.gistToken}
                    title={t("webdav.gist.token")}
                    type="password"
                    revealable
                    revealLabels={{
                      show: t("webdav.showPassword"),
                      hide: t("webdav.hidePassword"),
                    }}
                    placeholder={t("webdav.gist.tokenPlaceholder")}
                    value={githubGistToken}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        githubGist: {
                          ...prev.githubGist,
                          token: e.target.value,
                        },
                      }))
                    }
                  />
                </FormField>

                <FormField
                  label={t("webdav.gist.id")}
                  description={t("webdav.gist.idDesc")}
                >
                  <Input
                    id={WEBDAV_TARGET_IDS.gistId}
                    title={t("webdav.gist.id")}
                    type="text"
                    placeholder={t("webdav.gist.idPlaceholder")}
                    value={githubGistId}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        githubGist: {
                          ...prev.githubGist,
                          gistId: e.target.value,
                        },
                      }))
                    }
                  />
                </FormField>

                <Alert
                  className="md:col-span-2"
                  variant="info"
                  title={t("webdav.gist.secretTitle")}
                  description={t("webdav.gist.secretDescription")}
                />

                <FormField
                  label={t("webdav.gist.encryptionPassword")}
                  description={t("webdav.gist.encryptionPasswordDesc")}
                >
                  <Input
                    id={WEBDAV_TARGET_IDS.encryptionPassword}
                    title={t("webdav.gist.encryptionPassword")}
                    type="password"
                    revealable
                    revealLabels={{
                      show: t("webdav.showPassword"),
                      hide: t("webdav.hidePassword"),
                    }}
                    placeholder={t("webdav.gist.encryptionPasswordPlaceholder")}
                    value={backupEncryptionPassword}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        backupEncryptionEnabled: true,
                        backupEncryptionPassword: e.target.value,
                      }))
                    }
                  />
                </FormField>

                {githubGist.gistUrl && (
                  <BodySmall className="m-0 md:col-span-2">
                    <a
                      id={WEBDAV_TARGET_IDS.gistUrl}
                      href={githubGist.gistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-600 underline dark:text-sky-400"
                    >
                      {t("webdav.gist.openLink")}
                    </a>
                  </BodySmall>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <FormField label={t("webdav.webdavUrl")}>
                    <Input
                      id={WEBDAV_TARGET_IDS.url}
                      title={t("webdav.webdavUrl")}
                      type="url"
                      placeholder={t("webdav.webdavUrlExample")}
                      value={webdavUrl}
                      onChange={(e) =>
                        setLocalConfig((prev) => ({
                          ...prev,
                          url: e.target.value,
                        }))
                      }
                    />
                  </FormField>
                </div>

                <FormField label={t("webdav.username")}>
                  <Input
                    id={WEBDAV_TARGET_IDS.username}
                    title={t("webdav.username")}
                    type="text"
                    placeholder={t("webdav.username")}
                    value={webdavUsername}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        username: e.target.value,
                      }))
                    }
                  />
                </FormField>

                <FormField label={t("webdav.password")}>
                  <div className="relative">
                    <Input
                      id={WEBDAV_TARGET_IDS.password}
                      title={t("webdav.password")}
                      type="password"
                      revealable
                      revealLabels={{
                        show: t("webdav.showPassword"),
                        hide: t("webdav.hidePassword"),
                      }}
                      placeholder={t("webdav.password")}
                      value={webdavPassword}
                      onChange={(e) =>
                        setLocalConfig((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                    />
                  </div>
                </FormField>
              </div>
            )}
          </div>

          <div
            id={WEBDAV_TARGET_IDS.syncData}
            className="rounded-md bg-gray-50 p-3 dark:bg-gray-800"
          >
            <div className="space-y-1">
              <Heading4 className="m-0">{t("webdav.syncData.title")}</Heading4>
              <BodySmall className="m-0">
                {t(
                  provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                    ? "webdav.gist.syncDataDescription"
                    : "webdav.syncData.description",
                )}
              </BodySmall>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {syncDataOptions.map((option) => (
                <div key={option.key} className="flex items-center gap-2">
                  <Checkbox
                    id={option.id}
                    checked={syncDataSelection[option.key]}
                    onCheckedChange={(checked) =>
                      updateSyncDataSelection(option.key, checked)
                    }
                  />
                  <Label htmlFor={option.id}>{option.label}</Label>
                </div>
              ))}
            </div>

            {isWebdavSyncDataSelectionEmpty(syncDataSelection) && (
              <BodySmall className="mt-2 mb-0 text-red-600 dark:text-red-400">
                {t("webdav.syncData.selectionRequired")}
              </BodySmall>
            )}
          </div>

          {provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST ? (
            <Alert
              id={WEBDAV_TARGET_IDS.encryption}
              variant="success"
              title={t("webdav.gist.encryptionTitle")}
              description={t("webdav.gist.encryptionDescription")}
            />
          ) : (
            <div
              id={WEBDAV_TARGET_IDS.encryption}
              className="rounded-md bg-gray-50 p-3 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  id={WEBDAV_TARGET_IDS.encryptionEnable}
                  className="space-y-1"
                >
                  <Heading4 className="m-0">
                    {t("webdav.encryption.title")}
                  </Heading4>
                  <BodySmall className="m-0">
                    {t("webdav.encryption.enableDesc")}
                  </BodySmall>
                </div>
                <Switch
                  checked={backupEncryptionEnabled}
                  onChange={(checked) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      backupEncryptionEnabled: checked,
                    }))
                  }
                />
              </div>

              <div className="mt-3">
                <FormField
                  label={t("webdav.encryption.password")}
                  description={t("webdav.encryption.passwordDesc")}
                >
                  <Input
                    id={WEBDAV_TARGET_IDS.encryptionPassword}
                    title={t("webdav.encryption.password")}
                    type="password"
                    revealable
                    revealLabels={{
                      show: t("webdav.showPassword"),
                      hide: t("webdav.hidePassword"),
                    }}
                    placeholder={t("webdav.encryption.passwordPlaceholder")}
                    value={backupEncryptionPassword}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        backupEncryptionPassword: e.target.value,
                      }))
                    }
                  />
                </FormField>
              </div>
            </div>
          )}

          <ProductAnalyticsScope
            entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync}
            surfaceId={webDavSettingsSurface}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Alert
                compact
                variant={webdavConfigDirty ? "warning" : "info"}
                description={t(
                  webdavConfigDirty
                    ? provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                      ? "webdav.gist.actionStateUnsaved"
                      : "webdav.actionState.unsaved"
                    : provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                      ? "webdav.gist.actionStateSaved"
                      : "webdav.actionState.saved",
                )}
                className="sm:col-span-2 lg:col-span-4"
              />

              {/* 保存配置 */}
              <Button
                id={WEBDAV_TARGET_IDS.saveConfig}
                onClick={handleSaveConfig}
                loading={saving}
                variant="default"
                size="sm"
                bleed
              >
                {saving ? t("common:status.saving") : t("webdav.saveConfig")}
              </Button>

              {/* 测试连接 */}
              <Button
                id={WEBDAV_TARGET_IDS.testConnection}
                onClick={handleTestConnection}
                disabled={!webdavConfigFilled}
                loading={testing}
                variant="secondary"
                size="sm"
                bleed
              >
                {testing
                  ? t("common:status.testing")
                  : t(
                      webdavConfigDirty
                        ? "webdav.testConnectionWithSave"
                        : "webdav.testConnection",
                    )}
              </Button>

              {provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST &&
                !githubGistId && (
                  <Button
                    id={WEBDAV_TARGET_IDS.createGist}
                    onClick={handleCreateGist}
                    disabled={!gistCreateReady}
                    loading={uploading}
                    variant="success"
                    size="sm"
                    bleed
                  >
                    {uploading
                      ? t("common:status.uploading")
                      : t("webdav.gist.create")}
                  </Button>
                )}

              {/* 上传备份 */}
              <Button
                id={WEBDAV_TARGET_IDS.uploadBackup}
                data-testid={IMPORT_EXPORT_TEST_IDS.webdavUploadBackupButton}
                onClick={handleUploadBackup}
                disabled={!webdavConfigFilled}
                loading={uploading}
                variant="success"
                size="sm"
                bleed
              >
                {uploading
                  ? t("common:status.uploading")
                  : t(
                      webdavConfigDirty
                        ? provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                          ? "webdav.gist.uploadWithSave"
                          : "webdav.uploadBackupWithSave"
                        : provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                          ? "webdav.gist.upload"
                          : "webdav.uploadBackup",
                    )}
              </Button>

              {/* 下载并导入 */}
              <Button
                id={WEBDAV_TARGET_IDS.downloadImport}
                data-testid={IMPORT_EXPORT_TEST_IDS.webdavDownloadImportButton}
                onClick={handleDownloadAndImport}
                disabled={!webdavConfigFilled}
                loading={downloading}
                variant="default"
                size="sm"
                bleed
              >
                {downloading
                  ? t("common:status.processing")
                  : t(
                      webdavConfigDirty
                        ? provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                          ? "webdav.gist.downloadImportWithSave"
                          : "webdav.downloadImportWithSave"
                        : provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                          ? "webdav.gist.downloadImport"
                          : "webdav.downloadImport",
                    )}
              </Button>
            </div>
          </ProductAnalyticsScope>
        </CardContent>
      </Card>

      <Modal
        isOpen={rebuildDialogOpen}
        onClose={() => {
          if (uploading || rebuildPending) return
          setRebuildDialogOpen(false)
        }}
        size="md"
        header={
          <div className="space-y-1">
            <Heading4 className="m-0">
              {t("webdav.rebuildDialog.title")}
            </Heading4>
            <BodySmall className="m-0">
              {t("webdav.rebuildDialog.description")}
            </BodySmall>
          </div>
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRebuildDialogOpen(false)}
              disabled={uploading || rebuildPending}
            >
              {t("webdav.rebuildDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmRebuildBackup}
              loading={uploading || rebuildPending}
            >
              {rebuildPending
                ? t("common:status.processing")
                : uploading
                  ? t("common:status.uploading")
                  : t("webdav.rebuildDialog.confirm")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Alert
            variant="warning"
            title={t("webdav.rebuildDialog.warningTitle")}
            description={t("webdav.rebuildDialog.warningDescription")}
          />
          <BodySmall className="m-0">
            {t("webdav.rebuildDialog.fullSelectionNote")}
          </BodySmall>
        </div>
      </Modal>

      <WebDAVDecryptPasswordModal
        isOpen={decryptDialogOpen}
        decrypting={decrypting}
        password={decryptPassword}
        onPasswordChange={setDecryptPassword}
        savePassword={saveDecryptPassword}
        onSavePasswordChange={setSaveDecryptPassword}
        onClose={() => setDecryptDialogOpen(false)}
        onDecryptAndImport={handleDecryptAndImport}
      />
    </>
  )
}
