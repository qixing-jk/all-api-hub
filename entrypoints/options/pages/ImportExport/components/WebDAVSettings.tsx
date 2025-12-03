import {
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  IconButton,
  Input,
} from "~/components/ui"
import { accountStorage } from "~/services/accountStorage"
import { channelConfigStorage } from "~/services/channelConfigStorage"
import { userPreferences } from "~/services/userPreferences"
import {
  downloadBackup,
  testWebdavConnection,
  uploadBackup,
} from "~/services/webdav/webdavService"

import {
  BACKUP_VERSION,
  importFromBackupObject,
  type BackupFullV2,
} from "../utils"

export default function WebDAVSettings() {
  const { t } = useTranslation("importExport")
  // 配置表单
  const [webdavUrl, setWebdavUrl] = useState("")
  const [webdavUsername, setWebdavUsername] = useState("")
  const [webdavPassword, setWebdavPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  // 独立的动作状态，避免互相影响
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const webdavConfigFilled = useMemo(
    () => Boolean(webdavUrl && webdavUsername && webdavPassword),
    [webdavUrl, webdavUsername, webdavPassword],
  )

  // 初始加载
  useEffect(() => {
    ;(async () => {
      const prefs = await userPreferences.getPreferences()
      setWebdavUrl(prefs.webdav.url ?? "")
      setWebdavUsername(prefs.webdav.username ?? "")
      setWebdavPassword(prefs.webdav.password ?? "")
    })()
  }, [])

  return (
    <Card padding="none">
      <CardHeader>
        <div className="mb-1 flex items-center space-x-2">
          <ArrowPathIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <CardTitle className="mb-0">{t("webdav.title")}</CardTitle>
        </div>
        <CardDescription>{t("webdav.configDesc")}</CardDescription>
      </CardHeader>

      <CardContent padding="md" className="space-y-4">
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
                      showPassword ? "Hide password" : "Show password"
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 保存配置 */}
          <Button
            onClick={async () => {
              setSaving(true)
              try {
                await userPreferences.updateWebdavSettings({
                  url: webdavUrl,
                  username: webdavUsername,
                  password: webdavPassword,
                })
                toast.success(t("settings:messages.updateSuccess"))
              } catch (e) {
                console.error(e)
                toast.error(t("settings:messages.saveSettingsFailed"))
              } finally {
                setSaving(false)
              }
            }}
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
            onClick={async () => {
              setTesting(true)
              try {
                await userPreferences.updateWebdavSettings({
                  url: webdavUrl,
                  username: webdavUsername,
                  password: webdavPassword,
                })
                await testWebdavConnection({
                  url: webdavUrl,
                  username: webdavUsername,
                  password: webdavPassword,
                })
                toast.success(t("settings:messages.updateSuccess"))
              } catch (e: any) {
                console.error(e)
                toast.error(e?.message || t("settings:messages.updateFailed"))
              } finally {
                setTesting(false)
              }
            }}
            disabled={testing || !webdavConfigFilled}
            loading={testing}
            variant="secondary"
            size="sm"
            bleed
          >
            {testing ? t("common:status.testing") : t("webdav.testConnection")}
          </Button>

          {/* 上传备份 */}
          <Button
            onClick={async () => {
              setUploading(true)
              try {
                const [accountData, preferencesData, channelConfigs] =
                  await Promise.all([
                    accountStorage.exportData(),
                    userPreferences.exportPreferences(),
                    channelConfigStorage.exportConfigs(),
                  ])
                const exportData: BackupFullV2 = {
                  version: BACKUP_VERSION,
                  timestamp: Date.now(),
                  accounts: accountData,
                  preferences: preferencesData,
                  channelConfigs,
                }
                await uploadBackup(JSON.stringify(exportData, null, 2), {
                  url: webdavUrl,
                  username: webdavUsername,
                  password: webdavPassword,
                })
                toast.success(t("export.dataExported"))
              } catch (e: any) {
                console.error(e)
                toast.error(e?.message || t("export.exportFailed"))
              } finally {
                setUploading(false)
              }
            }}
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
            onClick={async () => {
              setDownloading(true)
              try {
                const content = await downloadBackup({
                  url: webdavUrl,
                  username: webdavUsername,
                  password: webdavPassword,
                })
                const data = JSON.parse(content)
                const result = await importFromBackupObject(data)
                if (result.allImported) {
                  toast.success(t("importExport:import.importSuccess"))
                }
              } catch (e: any) {
                console.error(e)
                toast.error(
                  e?.message || t("importExport:import.downloadImportFailed"),
                )
              } finally {
                setDownloading(false)
              }
            }}
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
  )
}
