import { CircleCheck, CircleX, Clock, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Badge,
  BodySmall,
  Button,
  Card,
  CardAction,
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
  useWebdavAutoSyncSettings,
  type WebDAVAutoSyncSettingsProps,
} from "~/features/ImportExport/cloudSync/useWebdavAutoSyncSettings"
import { WEBDAV_AUTO_SYNC_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { WEBDAV_SYNC_STRATEGIES, type WebDAVSettings } from "~/types/webdav"
import { formatTimestamp } from "~/utils/core/formatters"

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
        <div className="flex items-center gap-x-2 gap-y-density-2">
          <RefreshCw
            className="size-5 text-theme-600 dark:text-theme-400"
            aria-hidden="true"
          />
          <CardTitle className="m-0 text-base">
            {t("webdav.syncSettings.title")}
          </CardTitle>
        </div>
        <CardAction className="flex max-w-full flex-wrap gap-x-2 gap-y-density-2">
          <Badge variant={providerChangePending ? "warning" : "outline"}>
            {t("webdav.autoSync.currentProvider", {
              provider: displayedProviderLabel,
            })}
          </Badge>
          {getStatusBadge()}
        </CardAction>
      </CardHeader>
      <CardContent padding="md" className="space-y-density-4">
        <section className="space-y-density-3">
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

        <section className="space-y-density-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-density-3">
            <div className="min-w-0 flex-1 space-y-density-1">
              <Heading4 className="m-0 text-sm">
                {t("webdav.autoSync.title")}
              </Heading4>
              <BodySmall className="m-0">{autoSyncEnableDescription}</BodySmall>
            </div>
            <div
              id={WEBDAV_AUTO_SYNC_TARGET_IDS.enable}
              className="flex shrink-0 items-center gap-x-2 gap-y-density-2"
            >
              <Switch
                aria-label={t("webdav.autoSync.enable")}
                checked={autoSyncEnabled}
                disabled={providerChangePending}
                onChange={(checked) => saveSetting({ autoSync: checked })}
              />
              <span className="text-sm text-secondary-foreground">
                {autoSyncEnabled
                  ? t("common:status.enabled")
                  : t("common:status.disabled")}
              </span>
            </div>
          </div>

          {autoSyncEnabled && (
            <FormField
              htmlFor={WEBDAV_AUTO_SYNC_TARGET_IDS.interval}
              disabled={providerChangePending}
              label={t("webdav.autoSync.interval")}
              description={t("webdav.autoSync.intervalDesc")}
            >
              {(control) => (
                <>
                  <Input
                    {...control}
                    type="number"
                    min={minimumIntervalSeconds}
                    max={86400}
                    step={60}
                    value={syncInterval}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        syncInterval: Number(e.target.value),
                      }))
                    }
                    onBlur={saveInterval}
                    placeholder="3600"
                  />
                  <p className="mt-density-1 text-xs text-muted-foreground">
                    {t("webdav.autoSync.intervalHint", {
                      minutes: Math.floor(syncInterval / 60),
                    })}
                  </p>
                </>
              )}
            </FormField>
          )}
        </section>

        {/* Status information */}
        {lastSyncTime > 0 && (
          <div className="space-y-density-1 rounded-md bg-surface-subtle px-3 py-density-3 dark:bg-card">
            <p className="text-sm text-secondary-foreground">
              <span className="font-medium">
                {t("webdav.autoSync.lastSync")}:{" "}
              </span>
              {formatTimestamp(lastSyncTime)}
            </p>
            {lastSyncError && (
              <p className="mt-density-1 text-sm text-destructive-text">
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-density-3 border-t border-border pt-density-4">
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
