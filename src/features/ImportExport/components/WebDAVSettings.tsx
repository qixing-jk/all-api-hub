import {
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

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
  IconButton,
  Input,
  Label,
  Switch,
} from "~/components/ui"
import { accountStorage } from "~/services/accounts/accountStorage"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
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
  testWebdavConnection,
  uploadBackup,
} from "~/services/webdav/webdavService"
import {
  isWebdavSyncDataSelectionEmpty,
  resolveWebdavSyncDataSelection,
  WEBDAV_SYNC_DATA_KEYS,
  type WebDAVSyncDataKey,
  type WebDAVSyncDataSelection,
} from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"

import {
  BACKUP_VERSION,
  importFromBackupObject,
  type BackupFullV2,
} from "../utils"
import { WebDAVDecryptPasswordModal } from "./WebDAVDecryptPasswordModal"

/**
 * Unified logger scoped to WebDAV settings and backup import/export actions.
 */
const logger = createLogger("WebDAVSettings")

const WEBDAV_SYNC_DATA_INPUT_IDS: Record<WebDAVSyncDataKey, string> = {
  accounts: "webdavSyncDataAccounts",
  bookmarks: "webdavSyncDataBookmarks",
  apiCredentialProfiles: "webdavSyncDataApiCredentialProfiles",
  preferences: "webdavSyncDataPreferences",
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
  // 配置表单
  const [webdavUrl, setWebdavUrl] = useState("")
  const [webdavUsername, setWebdavUsername] = useState("")
  const [webdavPassword, setWebdavPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  const [syncDataSelection, setSyncDataSelection] =
    useState<WebDAVSyncDataSelection>(() =>
      resolveWebdavSyncDataSelection(null),
    )

  const [backupEncryptionEnabled, setBackupEncryptionEnabled] = useState(false)
  const [backupEncryptionPassword, setBackupEncryptionPassword] = useState("")
  const [showBackupEncryptionPassword, setShowBackupEncryptionPassword] =
    useState(false)

  const [decryptDialogOpen, setDecryptDialogOpen] = useState(false)
  const [decrypting, setDecrypting] = useState(false)
  const [decryptPassword, setDecryptPassword] = useState("")
  const [saveDecryptPassword, setSaveDecryptPassword] = useState(true)
  const [pendingEnvelope, setPendingEnvelope] =
    useState<EncryptedWebdavBackupEnvelopeV1 | null>(null)

  // 独立的动作状态，避免互相影响
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const webdavConfigFilled = useMemo(
    () => Boolean(webdavUrl && webdavUsername && webdavPassword),
    [webdavUrl, webdavUsername, webdavPassword],
  )

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
    setSyncDataSelection((previousSelection) => ({
      ...previousSelection,
      [key]: checked === true,
    }))
  }

  const ensureSyncDataSelected = () => {
    if (!isWebdavSyncDataSelectionEmpty(syncDataSelection)) {
      return true
    }

    toast.error(t("webdav.syncData.selectionRequired"))
    return false
  }

  // 初始加载
  useEffect(() => {
    ;(async () => {
      const prefs = await userPreferences.getPreferences()
      setWebdavUrl(prefs.webdav.url ?? "")
      setWebdavUsername(prefs.webdav.username ?? "")
      setWebdavPassword(prefs.webdav.password ?? "")

      setBackupEncryptionEnabled(Boolean(prefs.webdav.backupEncryptionEnabled))
      setBackupEncryptionPassword(prefs.webdav.backupEncryptionPassword ?? "")
      setSyncDataSelection(
        resolveWebdavSyncDataSelection(prefs.webdav.syncData),
      )
    })()
  }, [])

  const webdavConfig = {
    url: webdavUrl,
    username: webdavUsername,
    password: webdavPassword,
    backupEncryptionEnabled,
    backupEncryptionPassword,
    syncData: syncDataSelection,
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      await userPreferences.updateWebdavSettings(webdavConfig)
      toast.success(t("settings:messages.updateSuccess"))
    } catch (e) {
      logger.error("Failed to save WebDAV settings", e)
      toast.error(t("settings:messages.saveSettingsFailed"))
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      await userPreferences.updateWebdavSettings(webdavConfig)
      await testWebdavConnection(webdavConfig)
      toast.success(t("webdav.testSuccess"))
    } catch (e: any) {
      logger.error("WebDAV connection test failed", e)
      toast.error(e?.message || t("webdav.testFailed"))
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
  const handleUploadBackup = async () => {
    setUploading(true)
    try {
      if (!ensureSyncDataSelected()) {
        return
      }

      await userPreferences.updateWebdavSettings(webdavConfig)
      const [
        accountData,
        tagStore,
        preferencesData,
        channelConfigs,
        apiCredentialProfiles,
      ] = await Promise.all([
        accountStorage.exportData(),
        tagStorage.exportTagStore(),
        userPreferences.exportPreferences(),
        channelConfigStorage.exportConfigs(),
        apiCredentialProfilesStorage.exportConfig(),
      ])
      const exportData: BackupFullV2 = {
        version: BACKUP_VERSION,
        timestamp: Date.now(),
        accounts: accountData,
        tagStore,
        preferences: preferencesData,
        channelConfigs,
        apiCredentialProfiles,
      }

      let remoteBackup: any | null = null

      try {
        const remoteContent = await downloadBackup(webdavConfig, {
          prepareForWrite: true,
        })
        remoteBackup = JSON.parse(remoteContent)
      } catch (error: any) {
        if (!isWebdavFileNotFoundError(error)) {
          throw error
        }
      }

      const payload = mergeWebdavBackupPayloadBySelection({
        backup: exportData,
        selection: syncDataSelection,
        remoteBackup,
      })

      await uploadBackup(JSON.stringify(payload, null, 2), webdavConfig)
      toast.success(t("export.dataExported"))
    } catch (e: any) {
      logger.error("Failed to upload backup to WebDAV", e)
      toast.error(e?.message || t("export.exportFailed"))
    } finally {
      setUploading(false)
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
    setDownloading(true)
    try {
      if (!ensureSyncDataSelected()) {
        return
      }

      await userPreferences.updateWebdavSettings(webdavConfig)
      const raw = await downloadBackupRaw(webdavConfig)
      const envelope = tryParseEncryptedWebdavBackupEnvelope(raw)

      let content = raw
      if (envelope) {
        const pwd = (backupEncryptionPassword || "").trim()
        if (!pwd) {
          toast.error(t("webdav.encryption.decryptPrompt"))
          setPendingEnvelope(envelope)
          setDecryptPassword("")
          setDecryptDialogOpen(true)
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
          return
        }
      }

      const data = JSON.parse(content)
      const result = await handleImportWithSelection(data)
      if (result.allImported) {
        toast.success(t("importExport:import.importSuccess"))
      }
    } catch (e: any) {
      logger.error("Failed to download/import WebDAV backup", e)
      toast.error(e?.message || t("importExport:import.downloadImportFailed"))
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
    const pwd = decryptPassword.trim()

    setDecrypting(true)
    try {
      if (!ensureSyncDataSelected()) {
        return
      }

      const content = await decryptWebdavBackupEnvelope({
        envelope: pendingEnvelope,
        password: pwd,
      })

      const data = JSON.parse(content)
      const result = await handleImportWithSelection(data)
      if (result.allImported) {
        toast.success(t("importExport:import.importSuccess"))
      }

      if (saveDecryptPassword) {
        await userPreferences.updateWebdavSettings({
          backupEncryptionPassword: pwd,
        })
        setBackupEncryptionPassword(pwd)
      }

      setDecryptDialogOpen(false)
      setPendingEnvelope(null)
    } catch (e: any) {
      logger.error("Failed to decrypt/import WebDAV backup", e)
      toast.error(e?.message || t("webdav.encryption.decryptFailed"))
    } finally {
      setDecrypting(false)
    }
  }

  return (
    <>
      <Card padding="none">
        <CardHeader>
          <div className="mb-1 flex items-center space-x-2">
            <ArrowPathIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <CardTitle className="mb-0">{t("webdav.title")}</CardTitle>
          </div>
          <CardDescription>{t("webdav.configDesc")}</CardDescription>
        </CardHeader>

        <CardContent padding="md" className="space-y-4">
          <Alert
            variant="info"
            title={t("webdav.restorePolicy.title")}
            description={t("webdav.restorePolicy.description")}
          />

          {/* 配置表单 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <FormField label={t("webdav.webdavUrl")}>
                <Input
                  id="webdavUrl"
                  title={t("webdav.webdavUrl")}
                  type="url"
                  placeholder={t("webdav.webdavUrlExample")}
                  value={webdavUrl}
                  onChange={(e) => setWebdavUrl(e.target.value)}
                />
              </FormField>
            </div>

            <FormField label={t("webdav.username")}>
              <Input
                id="webdavUsername"
                title={t("webdav.username")}
                type="text"
                placeholder={t("webdav.username")}
                value={webdavUsername}
                onChange={(e) => setWebdavUsername(e.target.value)}
              />
            </FormField>

            <FormField label={t("webdav.password")}>
              <div className="relative">
                <Input
                  id="webdavPassword"
                  title={t("webdav.password")}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("webdav.password")}
                  value={webdavPassword}
                  onChange={(e) => setWebdavPassword(e.target.value)}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword
                          ? t("webdav.hidePassword")
                          : t("webdav.showPassword")
                      }
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </IconButton>
                  }
                />
              </div>
            </FormField>
          </div>

          <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-800">
            <div className="space-y-1">
              <Heading4 className="m-0">{t("webdav.syncData.title")}</Heading4>
              <BodySmall className="m-0">
                {t("webdav.syncData.description")}
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

          <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Heading4 className="m-0">
                  {t("webdav.encryption.title")}
                </Heading4>
                <BodySmall className="m-0">
                  {t("webdav.encryption.enableDesc")}
                </BodySmall>
              </div>
              <Switch
                checked={backupEncryptionEnabled}
                onChange={setBackupEncryptionEnabled}
              />
            </div>

            <div className="mt-3">
              <FormField
                label={t("webdav.encryption.password")}
                description={t("webdav.encryption.passwordDesc")}
              >
                <Input
                  id="backupEncryptionPassword"
                  title={t("webdav.encryption.password")}
                  type={showBackupEncryptionPassword ? "text" : "password"}
                  placeholder={t("webdav.encryption.passwordPlaceholder")}
                  value={backupEncryptionPassword}
                  onChange={(e) => setBackupEncryptionPassword(e.target.value)}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setShowBackupEncryptionPassword(
                          !showBackupEncryptionPassword,
                        )
                      }
                      aria-label={
                        showBackupEncryptionPassword
                          ? t("webdav.hidePassword")
                          : t("webdav.showPassword")
                      }
                    >
                      {showBackupEncryptionPassword ? (
                        <EyeSlashIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </IconButton>
                  }
                />
              </FormField>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 保存配置 */}
            <Button
              onClick={handleSaveConfig}
              disabled={saving}
              loading={saving}
              variant="default"
              size="sm"
              bleed
            >
              {saving ? t("common:status.saving") : t("webdav.saveConfig")}
            </Button>

            {/* 测试连接 */}
            <Button
              onClick={handleTestConnection}
              disabled={testing || !webdavConfigFilled}
              loading={testing}
              variant="secondary"
              size="sm"
              bleed
            >
              {testing
                ? t("common:status.testing")
                : t("webdav.testConnection")}
            </Button>

            {/* 上传备份 */}
            <Button
              onClick={handleUploadBackup}
              disabled={uploading || !webdavConfigFilled}
              loading={uploading}
              variant="success"
              size="sm"
              bleed
            >
              {uploading
                ? t("common:status.uploading")
                : t("webdav.uploadBackup")}
            </Button>

            {/* 下载并导入 */}
            <Button
              onClick={handleDownloadAndImport}
              disabled={downloading || !webdavConfigFilled}
              loading={downloading}
              variant="default"
              size="sm"
              bleed
            >
              {downloading
                ? t("common:status.processing")
                : t("webdav.downloadImport")}
            </Button>
          </div>
        </CardContent>
      </Card>

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
