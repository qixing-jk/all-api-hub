import { CircleCheck, CircleX, Clock, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Badge,
  BodySmall,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Heading4,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { WEBDAV_SYNC_STRATEGIES, type WebDAVSettings } from "~/types/webdav"
import { formatTimestamp } from "~/utils/core/formatters"

import {
  useWebdavAutoSyncSettings,
  type WebDAVAutoSyncSettingsProps,
} from "../hooks/useWebdavAutoSyncSettings"
import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "../searchTargets"

/**
 * Unified logger scoped to WebDAV auto-sync settings UI.
 */
const autoSyncSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavAutoSyncSettings

/** Renders the shared automatic-sync settings for the selected provider. */
export default function WebDAVAutoSyncSettings({
  providerPreview,
  onGistEncryptionPasswordErrorChange,
}: WebDAVAutoSyncSettingsProps = {}) {
  const { t } = useTranslation("importExport")
  const {
    autoSyncEnabled,
    syncInterval,
    syncStrategy,
    setLocalConfig,
    saveSetting,
    saveInterval,
    savingImmediately,
    providerChangePending,
    minimumIntervalSeconds,
    displayedProviderLabel,
    autoSyncEnableDescription,
    isSyncing,
    lastSyncTime,
    lastSyncStatus,
    lastSyncError,
    syncing,
    saveFailed,
    retrySave,
    handleSyncNow,
  } = useWebdavAutoSyncSettings({
    providerPreview,
    onGistEncryptionPasswordErrorChange,
  })

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
    <Card
      id={WEBDAV_AUTO_SYNC_TARGET_IDS.root}
      padding="none"
      role="region"
      aria-label={t("webdav.syncSettings.title")}
    >
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw
              className="size-5 text-sky-600 dark:text-sky-400"
              aria-hidden="true"
            />
            <CardTitle className="m-0 text-base">
              {t("webdav.syncSettings.title")}
            </CardTitle>
          </div>
          <div className="flex max-w-full flex-wrap gap-2">
            <Badge variant={providerChangePending ? "warning" : "outline"}>
              {t("webdav.autoSync.currentProvider", {
                provider: displayedProviderLabel,
              })}
            </Badge>
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent padding="md" className="space-y-4">
        <section className="space-y-3">
          <FormField
            label={t("webdav.autoSync.strategy")}
            description={t("webdav.autoSync.strategyDesc")}
            htmlFor={WEBDAV_AUTO_SYNC_TARGET_IDS.strategy}
            className="mb-0"
          >
            <Select
              value={syncStrategy ?? ""}
              onValueChange={(value) =>
                saveSetting({
                  syncStrategy: value as WebDAVSettings["syncStrategy"],
                })
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

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <Heading4 className="m-0 text-sm">
                {t("webdav.autoSync.title")}
              </Heading4>
              <BodySmall className="m-0">{autoSyncEnableDescription}</BodySmall>
            </div>
            <div
              id={WEBDAV_AUTO_SYNC_TARGET_IDS.enable}
              className="flex shrink-0 items-center gap-2"
            >
              <Switch
                aria-label={t("webdav.autoSync.enable")}
                checked={autoSyncEnabled}
                disabled={providerChangePending}
                onChange={(checked) => saveSetting({ autoSync: checked })}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {autoSyncEnabled
                  ? t("common:status.enabled")
                  : t("common:status.disabled")}
              </span>
            </div>
          </div>

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
                onBlur={saveInterval}
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
          <div className="space-y-1 rounded-md bg-gray-50 p-3 dark:bg-gray-800">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">
                {t("webdav.autoSync.lastSync")}:{" "}
              </span>
              {formatTimestamp(lastSyncTime)}
            </p>
            {lastSyncError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                <span className="font-medium">
                  {t("common:status.error")}:{" "}
                </span>
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
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <BodySmall
              id={WEBDAV_AUTO_SYNC_TARGET_IDS.saveSettings}
              role="status"
              className="m-0 min-w-0 flex-1"
            >
              {savingImmediately
                ? t("common:status.saving")
                : t("webdav.autoSync.autosaveDescription")}
            </BodySmall>

            {saveFailed && (
              <Button onClick={retrySave} variant="secondary" size="sm">
                {t("webdav.retrySave")}
              </Button>
            )}

            <Button
              id={WEBDAV_AUTO_SYNC_TARGET_IDS.syncNow}
              className="ml-auto shrink-0"
              onClick={handleSyncNow}
              disabled={providerChangePending}
              loading={syncing || isSyncing}
              variant="secondary"
              size="sm"
            >
              {syncing || isSyncing
                ? t("webdav.syncing")
                : t("webdav.autoSync.syncNow")}
            </Button>
          </div>
        </ProductAnalyticsScope>
      </CardContent>
    </Card>
  )
}
