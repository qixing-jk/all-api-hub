import { useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
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
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { buildWebDavSyncDiagnostics } from "~/services/productAnalytics/webDavSync"
import { downloadCloudSyncBackup } from "~/services/webdav/cloudSyncService"
import {
  decryptWebdavBackupEnvelope,
  tryParseEncryptedWebdavBackupEnvelope,
  type EncryptedWebdavBackupEnvelopeV1,
} from "~/services/webdav/webdavBackupEncryption"
import { buildWebdavImportPayloadBySelection } from "~/services/webdav/webdavSelectiveSync"
import {
  downloadBackupRaw,
  parseWebdavBackupJson,
} from "~/services/webdav/webdavService"
import { CLOUD_SYNC_PROVIDERS } from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"
import { applyPreferenceLanguage } from "~/utils/i18n/applyPreferenceLanguage"
import { changePageLanguage } from "~/utils/i18n/pageLanguage"

import {
  getWebdavAnalyticsErrorCategory,
  getWebdavAnalyticsFailureStage,
  PersistWebdavConfigError,
  webDavAnalyticsContext,
} from "../components/webDavAnalytics"
import { getPersistWebdavConfigErrorMessage } from "../components/webdavPreferenceFeedback"
import { getImportExportErrorMessage, importFromBackupObject } from "../utils"
import type { WebdavConfigState } from "./useWebdavConfig"

const logger = createLogger("WebDAVSettings")
/** Own download/import and optional password recovery without mixing upload state. */
export function useWebdavBackupImport(config: WebdavConfigState) {
  const { t } = useTranslation("importExport")
  const {
    provider,
    loadPreferences,
    setLocalConfig,
    syncDataSelection,
    backupEncryptionPassword,
    ensureSyncDataSelected,
    ensureGistEncryptionPassword,
    webdavConfig,
    persistWebdavConfig,
  } = config
  const [downloading, setDownloading] = useState(false)
  const [decryptDialogOpen, setDecryptDialogOpen] = useState(false)
  const [decrypting, setDecrypting] = useState(false)
  const [decryptPassword, setDecryptPassword] = useState("")
  const [saveDecryptPassword, setSaveDecryptPassword] = useState(true)
  const [pendingEnvelope, setPendingEnvelope] =
    useState<EncryptedWebdavBackupEnvelopeV1 | null>(null)
  const handleImportWithSelection = async (rawBackup: any) => {
    const payload = await buildWebdavImportPayloadBySelection({
      rawBackup,
      selection: syncDataSelection,
    })

    return await importFromBackupObject(payload, {
      preserveWebdav: true,
    })
  }

  const promptForDecryption = (
    envelope: EncryptedWebdavBackupEnvelopeV1,
    password: string,
    tracker: ReturnType<typeof startProductAnalyticsAction>,
  ) => {
    toast.error(t("webdav.encryption.decryptPrompt"))
    setPendingEnvelope(envelope)
    setDecryptPassword(password)
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

    if (!ensureGistEncryptionPassword()) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: {
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
        },
      })
      return
    }

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
          promptForDecryption(envelope, "", tracker)
          return
        }

        try {
          content = await decryptWebdavBackupEnvelope({
            envelope,
            password: pwd,
          })
        } catch {
          promptForDecryption(envelope, pwd, tracker)
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

  return {
    downloading,
    decryptDialogOpen,
    setDecryptDialogOpen,
    decrypting,
    decryptPassword,
    setDecryptPassword,
    saveDecryptPassword,
    setSaveDecryptPassword,
    handleDownloadAndImport,
    handleDecryptAndImport,
  }
}
