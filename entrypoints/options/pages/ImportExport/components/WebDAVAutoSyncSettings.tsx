import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import { WEBDAV_SYNC_STRATEGIES, WebDAVSettings } from "~/types/webdav"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { formatTimestamp } from "~/utils/formatters"

export default function WebDAVAutoSyncSettings() {
  const { t } = useTranslation("importExport")

  // Auto-sync settings
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [syncInterval, setSyncInterval] = useState(3600)
  const [syncStrategy, setSyncStrategy] = useState<
    WebDAVSettings["syncStrategy"]
  >(WEBDAV_SYNC_STRATEGIES.MERGE)

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

  // Load initial settings
  useEffect(() => {
    loadSettings()
    loadStatus()
  }, [])

  const loadSettings = async () => {
    try {
      const { userPreferences } = await import("~/services/userPreferences")
      const prefs = await userPreferences.getPreferences()
      setAutoSyncEnabled(prefs.webdav.autoSync ?? false)
      setSyncInterval(prefs.webdav.syncInterval ?? 3600)
      setSyncStrategy(prefs.webdav.syncStrategy ?? WEBDAV_SYNC_STRATEGIES.MERGE)
    } catch (error) {
      console.error("Failed to load auto-sync settings:", error)
    }
  }

  const loadStatus = async () => {
    try {
      const response = await sendRuntimeMessage({
        action: "webdavAutoSync:getStatus",
      })
      if (response.success && response.data) {
        setIsSyncing(response.data.isSyncing)
        setLastSyncTime(response.data.lastSyncTime)
        setLastSyncStatus(response.data.lastSyncStatus)
        setLastSyncError(response.data.lastSyncError)
      }
    } catch (error) {
      console.error("Failed to load sync status:", error)
    }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const response = await sendRuntimeMessage({
        action: "webdavAutoSync:updateSettings",
        settings: {
          autoSync: autoSyncEnabled,
          syncInterval: syncInterval,
          syncStrategy: syncStrategy,
        },
      })

      if (response.success) {
        toast.success(t("settings:messages.updateSuccess"))
        await loadStatus()
      } else {
        toast.error(response.error || t("settings:messages.updateFailed"))
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || t("settings:messages.updateFailed"))
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const response = await sendRuntimeMessage({
        action: "webdavAutoSync:syncNow",
      })

      if (response.success) {
        toast.success(response.message || t("webdav.syncSuccess"))
        await loadStatus()
      } else {
        toast.error(response.message || t("webdav.syncFailed"))
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error?.message || t("webdav.syncFailed"))
    } finally {
      setSyncing(false)
    }
  }

  const getStatusBadge = () => {
    if (isSyncing) {
      return (
        <Badge variant="info">
          <ArrowPathIcon className="mr-1 h-3 w-3 animate-spin" />
          {t("webdav.syncing")}
        </Badge>
      )
    }

    if (lastSyncStatus === "success") {
      return (
        <Badge variant="success">
          <CheckCircleIcon className="mr-1 h-3 w-3" />
          {t("webdav.syncSuccess")}
        </Badge>
      )
    }

    if (lastSyncStatus === "error") {
      return (
        <Badge variant="danger">
          <XCircleIcon className="mr-1 h-3 w-3" />
          {t("webdav.syncError")}
        </Badge>
      )
    }

    return (
      <Badge variant="secondary">
        <ClockIcon className="mr-1 h-3 w-3" />
        {t("webdav.notSynced")}
      </Badge>
    )
  }

  return (
    <Card padding="none">
      <CardHeader>
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ArrowPathIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="mb-0">{t("webdav.autoSync.title")}</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>{t("webdav.autoSync.description")}</CardDescription>
      </CardHeader>

      <CardContent padding="md" className="space-y-4">
        {/* Auto-sync toggle */}
        <FormField
          label={t("webdav.autoSync.enable")}
          description={t("webdav.autoSync.enableDesc")}
        >
          <div className="flex items-center gap-2">
            <Switch checked={autoSyncEnabled} onChange={setAutoSyncEnabled} />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {autoSyncEnabled ? t("common:enabled") : t("common:disabled")}
            </span>
          </div>
        </FormField>

        {autoSyncEnabled && (
          <>
            {/* Sync interval */}
            <FormField
              label={t("webdav.autoSync.interval")}
              description={t("webdav.autoSync.intervalDesc")}
            >
              <Input
                type="number"
                min={60}
                max={86400}
                step={60}
                value={syncInterval}
                onChange={(e) => setSyncInterval(Number(e.target.value))}
                placeholder="3600"
              />
              <p className="mt-1 text-xs text-gray-500">
                {t("webdav.autoSync.intervalHint", {
                  minutes: Math.floor(syncInterval / 60),
                })}
              </p>
            </FormField>

            {/* Sync strategy */}
            <FormField
              label={t("webdav.autoSync.strategy")}
              description={t("webdav.autoSync.strategyDesc")}
            >
              <Select
                value={syncStrategy ?? ""}
                onValueChange={(value) =>
                  setSyncStrategy(value as WebDAVSettings["syncStrategy"])
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("webdav.autoSync.strategy") ?? ""}
                  />
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
          </>
        )}

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
                <span className="font-medium">{t("common:error")}: </span>
                {lastSyncError}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            loading={savingSettings}
            variant="default"
            size="sm"
            className="flex-1"
          >
            {savingSettings
              ? t("common:status.saving")
              : t("webdav.autoSync.saveSettings")}
          </Button>

          <Button
            onClick={handleSyncNow}
            disabled={syncing || isSyncing}
            loading={syncing || isSyncing}
            variant="success"
            size="sm"
            className="flex-1"
          >
            {syncing || isSyncing
              ? t("webdav.syncing")
              : t("webdav.autoSync.syncNow")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
