import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ChevronDownIcon,
  CommandLineIcon,
  CpuChipIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { CalendarPlus, Copy, History, type LucideIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "~/components/icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Heading6,
  IconButton,
} from "~/components/ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
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
import { cn } from "~/lib/utils"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"
import type { ApiVerificationHistorySummary } from "~/services/verification/verificationResultHistory"
import { SiteHealthStatus } from "~/types"
import {
  API_CREDENTIAL_TELEMETRY_SOURCES,
  type ApiCredentialProfile,
  type ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  formatLocaleDateTime,
  formatTokenCount,
  maskSecretForDisplay,
} from "~/utils/core/formatters"
import { formatTelemetryMoney } from "~/utils/core/money"

import {
  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS,
  type ApiCredentialProfileExportAction,
} from "../contracts"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"

interface ApiCredentialProfileListItemProps {
  profile: ApiCredentialProfile
  verificationSummary: ApiVerificationHistorySummary | null
  tagNames: string[]
  visibleKeys: Set<string>
  toggleKeyVisibility: (id: string) => void
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
  guidedImportEntryRequest?: number
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

const COMPACT_AUDIT_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}
const GUIDED_IMPORT_HIGHLIGHT_DURATION_MS = 5_000

interface AuditTimeBadgeProps {
  Icon: LucideIcon
  label: string
  timestamp: number | string | Date | null | undefined
  fallback: string
}

/** Renders one quiet, responsive audit timestamp with full hover details. */
function AuditTimeBadge({
  Icon,
  label,
  timestamp,
  fallback,
}: AuditTimeBadgeProps) {
  const fullLabel = formatLocaleDateTime(timestamp, fallback)

  return (
    <Badge
      variant="outline"
      size="sm"
      className="dark:bg-dark-bg-tertiary/50 dark:text-dark-text-tertiary max-w-full bg-gray-50 font-normal text-gray-500 tabular-nums"
      title={fullLabel}
      aria-label={`${label}: ${fullLabel}`}
    >
      <Icon aria-hidden="true" />
      <span className="truncate">
        {label}{" "}
        {formatLocaleDateTime(timestamp, fallback, COMPACT_AUDIT_TIME_FORMAT)}
      </span>
    </Badge>
  )
}

/**
 * Returns the localized label for the telemetry source shown on the profile card.
 */
function getTelemetrySourceLabel(
  t: TFunction,
  source: ApiCredentialTelemetrySource | undefined,
): string {
  if (!source) return t("apiCredentialProfiles:telemetry.source.notAvailable")
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.Models)
    return t("apiCredentialProfiles:telemetry.source.models")
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling) {
    return t("apiCredentialProfiles:telemetry.source.openaiBilling")
  }
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage) {
    return t("apiCredentialProfiles:telemetry.source.newApiTokenUsage")
  }
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage) {
    return t("apiCredentialProfiles:telemetry.source.sub2apiUsage")
  }
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint) {
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
 * Formats the optional profile expiration as a calendar date.
 */
function formatProfileExpiration(
  timestamp: number | undefined,
  fallback: string,
): string {
  if (!timestamp || timestamp <= 0) return fallback
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return fallback

  try {
    return date.toLocaleDateString()
  } catch {
    return fallback
  }
}

/**
 * Checks whether the card has a concrete metric to show in telemetry details.
 * Explicit zero values are data and must keep the section expanded.
 */
function hasTelemetryDetailData(
  snapshot: ApiCredentialProfile["telemetrySnapshot"],
): boolean {
  return Boolean(
    snapshot &&
      (snapshot.balanceUsd !== undefined ||
        snapshot.todayCostUsd !== undefined ||
        snapshot.todayRequests !== undefined ||
        snapshot.todayTokens !== undefined ||
        snapshot.unlimitedQuota === true ||
        snapshot.models !== undefined),
  )
}

/**
 * Converts a timestamp to the start of its local calendar day for expiry checks.
 */
function getStartOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
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
  guidedImportEntryRequest,
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
  const hasTelemetryDetails = hasTelemetryDetailData(telemetry)
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(hasTelemetryDetails)
  const previousHasTelemetryDetailsRef = useRef(hasTelemetryDetails)
  const telemetryContentId = useId()
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [isImportEntryHighlighted, setIsImportEntryHighlighted] =
    useState(false)
  const exportMenuButtonRef = useRef<HTMLButtonElement>(null)
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
  const notAvailableLabel = t("common:labels.notAvailable")
  const expiresAt = profile.expiresAt
  const expirationDate = formatProfileExpiration(expiresAt, notAvailableLabel)
  const hasExpiration =
    expiresAt !== undefined &&
    expiresAt > 0 &&
    expirationDate !== notAvailableLabel
  const isExpired =
    expiresAt !== undefined &&
    hasExpiration &&
    getStartOfLocalDay(expiresAt) < getStartOfLocalDay(Date.now())
  const expirationStatusLabel = hasExpiration
    ? isExpired
      ? t("apiCredentialProfiles:list.expirationStatus.expired", {
          date: expirationDate,
        })
      : t("apiCredentialProfiles:list.expirationStatus.active", {
          date: expirationDate,
        })
    : t("apiCredentialProfiles:list.expirationStatus.none")

  useEffect(() => {
    if (!guidedImportEntryRequest) {
      return
    }

    setIsExportMenuOpen(true)
    setIsImportEntryHighlighted(true)

    const button = exportMenuButtonRef.current
    button?.scrollIntoView?.({ block: "center", inline: "nearest" })
    button?.focus()

    const timeoutId = window.setTimeout(() => {
      setIsImportEntryHighlighted(false)
    }, GUIDED_IMPORT_HIGHLIGHT_DURATION_MS)

    return () => window.clearTimeout(timeoutId)
  }, [guidedImportEntryRequest])

  useEffect(() => {
    const previouslyHadData = previousHasTelemetryDetailsRef.current
    if (previouslyHadData !== hasTelemetryDetails) {
      setIsTelemetryOpen(hasTelemetryDetails)
      previousHasTelemetryDetailsRef.current = hasTelemetryDetails
    }
  }, [hasTelemetryDetails])

  return (
    <ProductAnalyticsScope
      entrypoint={optionsEntrypoint}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}
      surfaceId={rowActionsSurface}
    >
      <Card>
        <CardContent padding="md" spacing="sm">
          <div className="flex min-w-0 flex-col gap-5">
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
                <Badge
                  variant={isExpired ? "danger" : "outline"}
                  size="sm"
                  className="max-w-full truncate"
                >
                  {expirationStatusLabel}
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
                    {t("apiCredentialProfiles:list.apiKey")}
                  </span>
                  <div className="flex w-full min-w-0 items-center gap-0.5 sm:flex-1">
                    <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary min-w-0 flex-1 truncate rounded bg-gray-100 px-2 py-1 font-mono text-[10px] text-gray-800 sm:text-xs">
                      {visibleKeys.has(profile.id)
                        ? profile.apiKey
                        : maskSecretForDisplay(profile.apiKey)}
                    </code>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleKeyVisibility(profile.id)}
                      data-testid={
                        API_CREDENTIAL_PROFILES_TEST_IDS.showKeyButton
                      }
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
                      data-testid={
                        API_CREDENTIAL_PROFILES_TEST_IDS.copyApiKeyButton
                      }
                      aria-label={t("apiCredentialProfiles:actions.copyApiKey")}
                      className="shrink-0"
                      analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey}
                    >
                      <Copy className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="dark:text-dark-text-tertiary shrink-0 whitespace-nowrap text-gray-500">
                    {t("aiApiVerification:verifyDialog.history.lastVerified")}
                  </span>
                  <VerificationHistorySummary
                    summary={verificationSummary}
                    className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2"
                  />
                </div>

                <Collapsible
                  open={isTelemetryOpen}
                  onOpenChange={setIsTelemetryOpen}
                  className="dark:bg-dark-bg-tertiary/60 flex flex-col rounded-lg border border-gray-100 bg-gray-50 p-2 sm:p-3 dark:border-gray-800"
                  data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="group h-auto min-w-0 flex-1 justify-start gap-2 px-1.5 py-1 text-left"
                        aria-label={t("apiCredentialProfiles:telemetry.title")}
                        aria-expanded={isTelemetryOpen}
                        aria-controls={telemetryContentId}
                        data-testid={
                          API_CREDENTIAL_PROFILES_TEST_IDS.telemetryToggle
                        }
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${getHealthIndicatorColor(
                            health?.status,
                          )}`}
                          title={healthTitle}
                          aria-label={healthTitle}
                          role="img"
                        />
                        <span className="dark:text-dark-text-secondary min-w-0 truncate text-xs font-medium text-gray-700">
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
                        <ChevronDownIcon
                          className={cn(
                            "dark:text-dark-text-tertiary ml-auto h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform",
                            isTelemetryOpen ? "rotate-180" : "rotate-0",
                          )}
                          aria-hidden="true"
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="dark:text-dark-text-tertiary dark:hover:text-dark-text-primary h-auto shrink-0 gap-1 px-1.5 py-1 text-[11px] text-gray-500 hover:text-gray-800"
                      onClick={handleRefreshTelemetry}
                      loading={isTelemetryRefreshing}
                      leftIcon={<ArrowPathIcon className="h-3.5 w-3.5" />}
                    >
                      {isTelemetryRefreshing
                        ? t("apiCredentialProfiles:telemetry.refreshing")
                        : t("apiCredentialProfiles:telemetry.actions.refresh")}
                    </Button>
                  </div>

                  <CollapsibleContent id={telemetryContentId}>
                    <div className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] content-evenly gap-2 pt-2 text-xs sm:grid-cols-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="dark:text-dark-text-tertiary text-gray-500">
                          {t("apiCredentialProfiles:telemetry.balance")}
                        </div>
                        <div
                          className="dark:text-dark-text-primary font-semibold text-gray-900"
                          data-testid={
                            API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance
                          }
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
                          data-testid={
                            API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayUsage
                          }
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
                          data-testid={
                            API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayRequests
                          }
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
                          data-testid={
                            API_CREDENTIAL_PROFILES_TEST_IDS.telemetryModels
                          }
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
                  </CollapsibleContent>
                </Collapsible>
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

            <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                <AuditTimeBadge
                  Icon={CalendarPlus}
                  label={t("apiCredentialProfiles:list.createdAt")}
                  timestamp={profile.createdAt}
                  fallback={notAvailableLabel}
                />
                <AuditTimeBadge
                  Icon={History}
                  label={t("apiCredentialProfiles:list.updatedAt")}
                  timestamp={profile.updatedAt}
                  fallback={notAvailableLabel}
                />
              </div>

              <div
                className="ml-auto flex flex-wrap items-center justify-end gap-2"
                data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.toolbar}
              >
                <IconButton
                  aria-label={t("apiCredentialProfiles:actions.copyBundle")}
                  size="sm"
                  variant="ghost"
                  onClick={() => onCopyBundle(profile)}
                  data-testid={
                    API_CREDENTIAL_PROFILES_TEST_IDS.copyBundleButton
                  }
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
                  data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.editButton}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenUpdateApiCredentialProfileDialog
                  }
                >
                  <PencilIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                </IconButton>
                <IconButton
                  aria-label={t("apiCredentialProfiles:actions.verifyApi")}
                  size="sm"
                  variant="ghost"
                  onClick={() => onVerify(profile)}
                  data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.VerifyApiCredential
                  }
                >
                  <WrenchScrewdriverIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </IconButton>
                <IconButton
                  aria-label={t(
                    "apiCredentialProfiles:actions.verifyCliSupport",
                  )}
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
                  data-testid={
                    API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton
                  }
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
                <DropdownMenu
                  open={isExportMenuOpen}
                  onOpenChange={setIsExportMenuOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      ref={exportMenuButtonRef}
                      aria-label={t("common:actions.export")}
                      size="sm"
                      variant="ghost"
                      className={cn(
                        isImportEntryHighlighted &&
                          "ring-2 ring-emerald-500 ring-offset-2 dark:ring-emerald-400",
                      )}
                      data-guidance-highlight={
                        isImportEntryHighlighted ? "true" : undefined
                      }
                      data-testid={
                        API_CREDENTIAL_PROFILES_TEST_IDS.exportMenuButton
                      }
                      analyticsAction={
                        PRODUCT_ANALYTICS_ACTION_IDS.OpenApiCredentialExportMenu
                      }
                    >
                      <ArrowUpTrayIcon className="h-4 w-4" />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        onExport(
                          profile,
                          API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CherryStudio,
                        )
                      }
                    >
                      <span aria-hidden="true">
                        <CherryIcon className="h-4 w-4" />
                      </span>
                      {t("keyManagement:actions.useInCherry")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid={
                        API_CREDENTIAL_PROFILES_TEST_IDS.exportToCCSwitchMenuItem
                      }
                      onSelect={() =>
                        onExport(
                          profile,
                          API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CCSwitch,
                        )
                      }
                    >
                      <span aria-hidden="true">
                        <CCSwitchIcon size="sm" />
                      </span>
                      {t("keyManagement:actions.exportToCCSwitch")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid={
                        API_CREDENTIAL_PROFILES_TEST_IDS.exportToKiloCodeMenuItem
                      }
                      onSelect={() =>
                        onExport(
                          profile,
                          API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.KiloCode,
                        )
                      }
                    >
                      <span aria-hidden="true">
                        <KiloCodeIcon size="sm" />
                      </span>
                      {t("keyManagement:actions.exportToKiloCode")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      data-testid={
                        API_CREDENTIAL_PROFILES_TEST_IDS.exportToCliProxyMenuItem
                      }
                      onSelect={() =>
                        onExport(
                          profile,
                          API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CliProxy,
                        )
                      }
                    >
                      <span aria-hidden="true">
                        <CliProxyIcon size="sm" />
                      </span>
                      {t("keyManagement:actions.importToCliProxy")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid={
                        API_CREDENTIAL_PROFILES_TEST_IDS.exportToClaudeCodeRouterMenuItem
                      }
                      onSelect={() =>
                        onExport(
                          profile,
                          API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ClaudeCodeRouter,
                        )
                      }
                    >
                      <span aria-hidden="true">
                        <ClaudeCodeRouterIcon size="sm" />
                      </span>
                      {t("keyManagement:actions.importToClaudeCodeRouter")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className={cn(
                        isImportEntryHighlighted &&
                          "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500 ring-inset dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-400",
                      )}
                      data-guidance-highlight={
                        isImportEntryHighlighted ? "true" : undefined
                      }
                      onSelect={() =>
                        onExport(
                          profile,
                          API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ManagedSite,
                        )
                      }
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
                  variant="destructiveGhost"
                  onClick={() => onDelete(profile)}
                  data-testid={
                    API_CREDENTIAL_PROFILES_TEST_IDS.deleteTriggerButton
                  }
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.DeleteApiCredentialProfile
                  }
                >
                  <TrashIcon className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </ProductAnalyticsScope>
  )
}
