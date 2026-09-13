import { useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { ensureLegacyChannelConfigMigrationReady } from "~/services/managedSites/legacyChannelConfigMigration"
import { userPreferences } from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
} from "~/services/productAnalytics/contracts"
import { buildWebDavSyncDiagnostics } from "~/services/productAnalytics/webDavSync"
import { tagStorage } from "~/services/tags/tagStorage"
import {
  createCloudSyncBackup,
  downloadCloudSyncBackup,
  uploadCloudSyncBackup,
} from "~/services/webdav/cloudSyncService"
import { isGithubGistWritableMissingError } from "~/services/webdav/githubGistService"
import { mergeWebdavBackupPayloadBySelection } from "~/services/webdav/webdavSelectiveSync"
import {
  downloadBackup,
  isWebdavFileNotFoundError,
  parseWebdavBackupJson,
} from "~/services/webdav/webdavService"
import {
  CLOUD_SYNC_PROVIDERS,
  DEFAULT_WEBDAV_SYNC_DATA_SELECTION,
  type WebDAVSyncDataSelection,
} from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"
import { t as translate } from "~/utils/i18n/core"

import {
  getWebdavAnalyticsErrorCategory,
  getWebdavAnalyticsFailureStage,
  PersistWebdavConfigError,
  webDavAnalyticsContext,
} from "../components/webDavAnalytics"
import { getPersistWebdavConfigErrorMessage } from "../components/webdavPreferenceFeedback"
import {
  BACKUP_VERSION,
  getImportExportErrorMessage,
  type BackupFullV2,
} from "../utils"
import type { WebdavConfigState } from "./useWebdavConfig"

const logger = createLogger("WebDAVSettings")
class ExistingWebdavBackupMalformedError extends Error {
  constructor(cause?: unknown) {
    super("Existing WebDAV backup is malformed", { cause })
    this.name = "ExistingWebdavBackupMalformedError"
  }
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

/** Own upload, first-Gist creation, and confirmed remote backup rebuilds. */
export function useWebdavBackupUpload(config: WebdavConfigState) {
  const { t } = useTranslation("importExport")
  const {
    provider,
    githubGist,
    githubGistId,
    preferences,
    setLocalConfig,
    syncDataSelection,
    ensureSyncDataSelected,
    ensureGistEncryptionPassword,
    webdavConfig,
    persistWebdavConfig,
  } = config
  const [uploading, setUploading] = useState(false)
  const [rebuildDialogOpen, setRebuildDialogOpen] = useState(false)
  const [rebuildPending, setRebuildPending] = useState(false)
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
  }) => {
    const tracker = startProductAnalyticsAction(
      webDavAnalyticsContext(PRODUCT_ANALYTICS_ACTION_IDS.UploadWebDavBackup),
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
        userPreferences.exportPreferencesForBackup(),
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
        provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST && !githubGistId

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
            (provider !== CLOUD_SYNC_PROVIDERS.WEBDAV ||
              !isWebdavFileNotFoundError(error)) &&
            !(
              provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST &&
              isGithubGistWritableMissingError(error)
            )
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

  const handleConfirmRebuildBackup = async () => {
    setRebuildPending(true)
    try {
      await uploadWebdavBackup({ forceFullRebuild: true })
    } finally {
      setRebuildPending(false)
      setRebuildDialogOpen(false)
    }
  }

  return {
    uploading,
    rebuildDialogOpen,
    setRebuildDialogOpen,
    rebuildPending,
    uploadWebdavBackup,
    handleConfirmRebuildBackup,
  }
}
