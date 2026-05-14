import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CommandLineIcon,
  CpuChipIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"

import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "~/components/icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { Badge, Card, CardContent, Heading6, IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import type { ManagedSiteType } from "~/constants/siteType"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { SiteHealthStatus } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { formatLocaleDateTime, formatTokenCount } from "~/utils/core/formatters"
import { formatTelemetryMoney } from "~/utils/core/money"

/**
 * Formats a secret for display (masked by default, revealable per-profile).
 */
function formatSecret(
  secret: string,
  id: string,
  visibleIds: Set<string>,
): string {
  if (visibleIds.has(id)) return secret
  if (secret.length < 12) return "******"
  return `${secret.substring(0, 8)}${"*".repeat(16)}${secret.substring(
    secret.length - 4,
  )}`
}

export type ApiCredentialProfileExportAction =
  | "cherryStudio"
  | "ccSwitch"
  | "kiloCode"
  | "cliProxy"
  | "claudeCodeRouter"
  | "managedSite"

interface ApiCredentialProfileListItemProps {
  profile: ApiCredentialProfile
  verificationSummary: ApiVerificationHistorySummary | null
  tagNames: string[]
  visibleKeys: Set<string>
  toggleKeyVisibility: (id: string) => void
  onCopyBaseUrl: (profile: ApiCredentialProfile) => void
  onCopyApiKey: (profile: ApiCredentialProfile) => void
  onCopyBundle: (profile: ApiCredentialProfile) => void
  onOpenModelManagement: (profile: ApiCredentialProfile) => void
  onVerify: (profile: ApiCredentialProfile) => void
  onVerifyCliSupport: (profile: ApiCredentialProfile) => void
  onRefreshTelemetry: (profile: ApiCredentialProfile) => void
  onEdit: (profile: ApiCredentialProfile) => void
  onDelete: (profile: ApiCredentialProfile) => void
  onExport: (
    profile: ApiCredentialProfile,
    action: ApiCredentialProfileExportAction,
  ) => void
  isTelemetryRefreshing: boolean
  managedSiteType: ManagedSiteType
  managedSiteLabel: string
}

/**
 * Maps telemetry health to the small status indicator color.
 */
function getHealthIndicatorColor(status: SiteHealthStatus | undefined): string {
  if (status === SiteHealthStatus.Healthy) return "bg-green-500"
  if (status === SiteHealthStatus.Warning) return "bg-yellow-500"
  if (status === SiteHealthStatus.Error) return "bg-red-500"
  return "bg-gray-400"
}

/**
 * Returns the localized label for the telemetry source shown on the profile card.
 */
function getTelemetrySourceLabel(
  t: TFunction,
  source: string | undefined,
): string {
  if (!source) return t("apiCredentialProfiles:telemetry.source.notAvailable")
  if (source === "models")
    return t("apiCredentialProfiles:telemetry.source.models")
  if (source === "openaiBilling") {
    return t("apiCredentialProfiles:telemetry.source.openaiBilling")
  }
  if (source === "newApiTokenUsage") {
    return t("apiCredentialProfiles:telemetry.source.newApiTokenUsage")
  }
  if (source === "sub2apiUsage") {
    return t("apiCredentialProfiles:telemetry.source.sub2apiUsage")
  }
  if (source === "customReadOnlyEndpoint") {
    return t("apiCredentialProfiles:telemetry.source.customReadOnlyEndpoint")
  }
  return source
}

/**
 * Returns a localized label for telemetry health states.
 */
function getHealthStatusLabel(
  t: TFunction,
  status: SiteHealthStatus | undefined,
): string {
  if (status === SiteHealthStatus.Healthy)
    return t("account:healthStatus.healthy")
  if (status === SiteHealthStatus.Warning)
    return t("account:healthStatus.warning")
  if (status === SiteHealthStatus.Error) return t("account:healthStatus.error")
  return t("account:healthStatus.unknown")
}

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const rowActionsSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions

/**
 * Renders a single profile row/card with copy, verify, export, edit, delete actions.
 */
export function ApiCredentialProfileListItem({
  profile,
  verificationSummary,
  tagNames,
  visibleKeys,
  toggleKeyVisibility,
  onCopyBaseUrl,
  onCopyApiKey,
  onCopyBundle,
  onOpenModelManagement,
  onVerify,
  onVerifyCliSupport,
  onRefreshTelemetry,
  onEdit,
  onDelete,
  onExport,
  isTelemetryRefreshing,
  managedSiteType,
  managedSiteLabel,
}: ApiCredentialProfileListItemProps) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "keyManagement",
    "common",
    "account",
  ])
  const { currencyType } = useUserPreferencesContext()
  const telemetry = profile.telemetrySnapshot
  const handleRefreshTelemetry = () => {
    onRefreshTelemetry(profile)
  }
  const missingTelemetryValue = telemetry
    ? t("apiCredentialProfiles:telemetry.notProvided")
    : "-"
  const health = telemetry?.health
  const healthTitle = [
    t("apiCredentialProfiles:telemetry.health"),
    getHealthStatusLabel(t, health?.status),
    health?.reason || telemetry?.lastError || "",
  ]
    .filter(Boolean)
    .join(": ")

  return (
    <ProductAnalyticsScope
      entrypoint={optionsEntrypoint}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}
      surfaceId={rowActionsSurface}
    >
      <Card>
        <CardContent padding="md" spacing="sm">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-stretch sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Heading6 className="max-w-full min-w-0 truncate">
                  {profile.name}
                </Heading6>
                <Badge
                  variant="outline"
                  size="sm"
                  className="max-w-full truncate"
                >
                  {getApiVerificationApiTypeLabel(t, profile.apiType)}
                </Badge>
                {tagNames.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    size="sm"
                    className="max-w-full truncate"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-1 flex-col gap-2 text-xs">
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                    {t("apiCredentialProfiles:list.baseUrl")}
                  </span>
                  <div className="flex w-full min-w-0 items-center gap-0.5 sm:flex-1">
                    <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary min-w-0 flex-1 truncate rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-800 sm:text-xs">
                      {profile.baseUrl}
                    </code>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => onCopyBaseUrl(profile)}
                      aria-label={t(
                        "apiCredentialProfiles:actions.copyBaseUrl",
                      )}
                      className="shrink-0"
                      analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.CopyBaseUrl}
                    >
                      <Copy className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                    {t("apiCredentialProfiles:list.apiKey")}
                  </span>
                  <div className="flex w-full min-w-0 items-center gap-0.5 sm:flex-1">
                    <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary min-w-0 flex-1 truncate rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-800 sm:text-xs">
                      {formatSecret(profile.apiKey, profile.id, visibleKeys)}
                    </code>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleKeyVisibility(profile.id)}
                      aria-label={
                        visibleKeys.has(profile.id)
                          ? t("keyManagement:actions.hideKey")
                          : t("keyManagement:actions.showKey")
                      }
                      className="shrink-0"
                      analyticsAction={
                        PRODUCT_ANALYTICS_ACTION_IDS.ToggleApiCredentialKeyVisibility
                      }
                    >
                      {visibleKeys.has(profile.id) ? (
                        <EyeSlashIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => onCopyApiKey(profile)}
                      aria-label={t("apiCredentialProfiles:actions.copyApiKey")}
                      className="shrink-0"
                      analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey}
                    >
                      <Copy className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                    {t("aiApiVerification:verifyDialog.history.lastVerified")}
                  </span>
                  <VerificationHistorySummary
                    summary={verificationSummary}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2"
                  />
                </div>

                <div className="dark:bg-dark-bg-tertiary/60 flex flex-1 flex-col rounded-lg border border-gray-100 bg-gray-50 p-2 sm:p-3 dark:border-gray-800">
                  <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${getHealthIndicatorColor(
                          health?.status,
                        )}`}
                        title={healthTitle}
                        aria-label={healthTitle}
                        role="img"
                      />
                      <span className="dark:text-dark-text-secondary text-xs font-medium text-gray-700">
                        {t("apiCredentialProfiles:telemetry.title")}
                      </span>
                      {telemetry?.source ? (
                        <Badge
                          variant="outline"
                          size="sm"
                          className="max-w-full truncate"
                        >
                          {getTelemetrySourceLabel(t, telemetry.source)}
                        </Badge>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="dark:text-dark-text-tertiary dark:hover:text-dark-text-primary inline-flex shrink-0 items-center gap-1 text-[11px] text-gray-500 transition-colors hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleRefreshTelemetry}
                      disabled={isTelemetryRefreshing}
                      aria-label={t(
                        "apiCredentialProfiles:telemetry.actions.refresh",
                      )}
                    >
                      <ArrowPathIcon
                        className={`h-3.5 w-3.5 ${
                          isTelemetryRefreshing ? "animate-spin" : ""
                        }`}
                      />
                      {isTelemetryRefreshing
                        ? t("apiCredentialProfiles:telemetry.refreshing")
                        : t("apiCredentialProfiles:telemetry.actions.refresh")}
                    </button>
                  </div>

                  <div className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] content-evenly gap-2 text-xs sm:grid-cols-4">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="dark:text-dark-text-tertiary text-gray-500">
                        {t("apiCredentialProfiles:telemetry.balance")}
                      </div>
                      <div
                        className="dark:text-dark-text-primary font-semibold text-gray-900"
                        data-testid="api-credential-telemetry-balance"
                      >
                        {telemetry?.unlimitedQuota
                          ? t("common:quota.unlimited")
                          : telemetry?.balanceUsd !== undefined
                            ? formatTelemetryMoney(
                                telemetry.balanceUsd,
                                currencyType,
                              )
                            : missingTelemetryValue}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="dark:text-dark-text-tertiary text-gray-500">
                        {t("apiCredentialProfiles:telemetry.todayUsage")}
                      </div>
                      <div
                        className="font-semibold text-emerald-600 dark:text-emerald-400"
                        data-testid="api-credential-telemetry-today-usage"
                      >
                        {telemetry?.todayCostUsd !== undefined
                          ? formatTelemetryMoney(
                              telemetry.todayCostUsd,
                              currencyType,
                            )
                          : missingTelemetryValue}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="dark:text-dark-text-tertiary text-gray-500">
                        {t("apiCredentialProfiles:telemetry.todayRequests")}
                      </div>
                      <div
                        className="dark:text-dark-text-primary font-semibold text-gray-900"
                        data-testid="api-credential-telemetry-today-requests"
                      >
                        {typeof telemetry?.todayRequests === "number"
                          ? telemetry.todayRequests.toLocaleString()
                          : missingTelemetryValue}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="dark:text-dark-text-tertiary text-gray-500">
                        {t("apiCredentialProfiles:telemetry.models")}
                      </div>
                      <div
                        className="dark:text-dark-text-primary truncate font-semibold text-gray-900"
                        data-testid="api-credential-telemetry-models"
                        title={telemetry?.models?.preview.join(", ")}
                      >
                        {telemetry?.models
                          ? t("apiCredentialProfiles:telemetry.modelCount", {
                              count: telemetry.models.count,
                            })
                          : missingTelemetryValue}
                      </div>
                    </div>
                  </div>

                  <div className="dark:text-dark-text-tertiary mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs text-gray-500">
                    <span>
                      {t("apiCredentialProfiles:telemetry.lastSync")}:{" "}
                      {formatLocaleDateTime(
                        telemetry?.lastSyncTime,
                        t("common:labels.notAvailable"),
                      )}
                    </span>
                    {telemetry?.todayTokens ? (
                      <span>
                        {t("apiCredentialProfiles:telemetry.todayTokens")}:{" "}
                        {formatTokenCount(
                          telemetry.todayTokens.upload +
                            telemetry.todayTokens.download,
                        )}
                      </span>
                    ) : null}
                    {telemetry?.lastError ? (
                      <span className="text-amber-600 dark:text-amber-300">
                        {telemetry.lastError}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {profile.notes?.trim() ? (
                <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-tertiary/40 dark:text-dark-text-secondary border-l-2 border-blue-200 bg-blue-50/60 px-3 py-2 text-xs text-gray-600">
                  <div className="mb-1 text-[11px] font-medium tracking-wide text-blue-600 dark:text-blue-300">
                    {t("apiCredentialProfiles:dialog.fields.notes")}
                  </div>
                  <div className="max-h-24 overflow-y-auto leading-relaxed break-words whitespace-pre-wrap">
                    {profile.notes.trim()}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:justify-start">
              <IconButton
                aria-label={t("apiCredentialProfiles:actions.copyBundle")}
                size="sm"
                variant="ghost"
                onClick={() => onCopyBundle(profile)}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle
                }
              >
                <Copy className="h-4 w-4" />
              </IconButton>
              <IconButton
                aria-label={t("common:actions.edit")}
                size="sm"
                variant="ghost"
                onClick={() => onEdit(profile)}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.UpdateApiCredentialProfile
                }
              >
                <PencilIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              </IconButton>
              <IconButton
                aria-label={t("apiCredentialProfiles:actions.verifyApi")}
                size="sm"
                variant="ghost"
                onClick={() => onVerify(profile)}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.VerifyApiCredential
                }
              >
                <WrenchScrewdriverIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </IconButton>
              <IconButton
                aria-label={t("apiCredentialProfiles:actions.verifyCliSupport")}
                size="sm"
                variant="ghost"
                onClick={() => onVerifyCliSupport(profile)}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.VerifyApiCredentialCliSupport
                }
              >
                <CommandLineIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </IconButton>
              <IconButton
                aria-label={t(
                  "apiCredentialProfiles:actions.openModelManagement",
                )}
                size="sm"
                variant="ghost"
                onClick={() => onOpenModelManagement(profile)}
                analyticsAction={{
                  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
                  actionId:
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenApiCredentialModelManagement,
                  surfaceId: rowActionsSurface,
                  entrypoint: optionsEntrypoint,
                }}
              >
                <CpuChipIcon className="h-4 w-4" />
              </IconButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    aria-label={t("common:actions.export")}
                    size="sm"
                    variant="ghost"
                    analyticsAction={
                      PRODUCT_ANALYTICS_ACTION_IDS.OpenApiCredentialExportMenu
                    }
                  >
                    <ArrowUpTrayIcon className="h-4 w-4" />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => onExport(profile, "cherryStudio")}
                  >
                    <span aria-hidden="true">
                      <CherryIcon className="h-4 w-4" />
                    </span>
                    {t("keyManagement:actions.useInCherry")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onExport(profile, "ccSwitch")}
                  >
                    <span aria-hidden="true">
                      <CCSwitchIcon size="sm" />
                    </span>
                    {t("keyManagement:actions.exportToCCSwitch")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onExport(profile, "kiloCode")}
                  >
                    <span aria-hidden="true">
                      <KiloCodeIcon size="sm" />
                    </span>
                    {t("keyManagement:actions.exportToKiloCode")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => onExport(profile, "cliProxy")}
                  >
                    <span aria-hidden="true">
                      <CliProxyIcon size="sm" />
                    </span>
                    {t("keyManagement:actions.importToCliProxy")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onExport(profile, "claudeCodeRouter")}
                  >
                    <span aria-hidden="true">
                      <ClaudeCodeRouterIcon size="sm" />
                    </span>
                    {t("keyManagement:actions.importToClaudeCodeRouter")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => onExport(profile, "managedSite")}
                  >
                    <span aria-hidden="true">
                      <ManagedSiteIcon siteType={managedSiteType} size="sm" />
                    </span>
                    {t("keyManagement:actions.importToManagedSite", {
                      site: managedSiteLabel,
                    })}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <IconButton
                aria-label={t("common:actions.delete")}
                size="sm"
                variant="destructive"
                onClick={() => onDelete(profile)}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.DeleteApiCredentialProfile
                }
              >
                <TrashIcon className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        </CardContent>
      </Card>
    </ProductAnalyticsScope>
  )
}
