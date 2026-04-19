import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
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
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
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
    <Card>
      <CardContent padding="md" spacing="sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Heading6 className="min-w-0 truncate">{profile.name}</Heading6>
              <Badge variant="outline" size="sm">
                {getApiVerificationApiTypeLabel(t, profile.apiType)}
              </Badge>
              {tagNames.map((tag) => (
                <Badge key={tag} variant="secondary" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                  {t("apiCredentialProfiles:list.baseUrl")}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary inline-block max-w-full truncate rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-800 sm:text-xs">
                    {profile.baseUrl}
                  </code>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => onCopyBaseUrl(profile)}
                    aria-label={t("apiCredentialProfiles:actions.copyBaseUrl")}
                    className="shrink-0"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-2">
                <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                  {t("apiCredentialProfiles:list.apiKey")}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary inline-block max-w-full truncate rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-800 sm:text-xs">
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
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>

              <div className="flex min-w-0 items-center gap-2">
                <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                  {t("aiApiVerification:verifyDialog.history.lastVerified")}
                </span>
                <VerificationHistorySummary
                  summary={verificationSummary}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2"
                />
              </div>

              <div className="dark:bg-dark-bg-tertiary/60 rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-gray-800">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${getHealthIndicatorColor(
                        health?.status,
                      )}`}
                      title={healthTitle}
                    />
                    <span className="dark:text-dark-text-secondary text-xs font-medium text-gray-700">
                      {t("apiCredentialProfiles:telemetry.title")}
                    </span>
                    {telemetry?.source ? (
                      <Badge variant="outline" size="sm">
                        {getTelemetrySourceLabel(t, telemetry.source)}
                      </Badge>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="dark:text-dark-text-tertiary dark:hover:text-dark-text-primary inline-flex shrink-0 items-center gap-1 text-[11px] text-gray-500 transition-colors hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => onRefreshTelemetry(profile)}
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

                <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  <div>
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
                  <div>
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
                  <div>
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
                  <div>
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

                <div className="dark:text-dark-text-tertiary mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
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
              <div className="dark:text-dark-text-secondary text-xs text-gray-600">
                {profile.notes}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              aria-label={t("apiCredentialProfiles:actions.copyBundle")}
              size="sm"
              variant="ghost"
              onClick={() => onCopyBundle(profile)}
            >
              <DocumentDuplicateIcon className="h-4 w-4" />
            </IconButton>
            <IconButton
              aria-label={t("apiCredentialProfiles:actions.verifyApi")}
              size="sm"
              variant="ghost"
              onClick={() => onVerify(profile)}
            >
              <WrenchScrewdriverIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </IconButton>
            <IconButton
              aria-label={t("apiCredentialProfiles:actions.verifyCliSupport")}
              size="sm"
              variant="ghost"
              onClick={() => onVerifyCliSupport(profile)}
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
            >
              <CpuChipIcon className="h-4 w-4" />
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label={t("common:actions.export")}
                  size="sm"
                  variant="ghost"
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
              aria-label={t("common:actions.edit")}
              size="sm"
              variant="outline"
              onClick={() => onEdit(profile)}
            >
              <PencilIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
            </IconButton>
            <IconButton
              aria-label={t("common:actions.delete")}
              size="sm"
              variant="destructive"
              onClick={() => onDelete(profile)}
            >
              <TrashIcon className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
