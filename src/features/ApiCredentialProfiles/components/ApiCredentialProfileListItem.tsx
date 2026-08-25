import type { TFunction } from "i18next"
import {
  CalendarPlus,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  History,
  RefreshCw,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { VerificationHistorySummary } from "~/components/dialogs/VerifyApiDialog/VerificationHistorySummary"
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
  API_CREDENTIAL_TELEMETRY_HEALTH_REASONS,
  API_CREDENTIAL_TELEMETRY_SOURCES,
  type ApiCredentialProfile,
  type ApiCredentialTelemetryBalanceFact,
  type ApiCredentialTelemetryQuotaWindowFact,
  type ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  formatLocaleDateTime,
  formatTokenCount,
  maskSecretForDisplay,
} from "~/utils/core/formatters"
import { formatTelemetryMoney } from "~/utils/core/money"

import {
  type ApiCredentialProfileAssociatedKeyState,
  type ApiCredentialProfileAssociationAvailability,
  type ApiCredentialProfileExportAction,
} from "../contracts"
import {
  API_CREDENTIAL_PROFILES_TEST_IDS,
  getApiCredentialProfileRowTargetId,
  getApiCredentialProfileRowTestId,
} from "../testIds"
import { ApiCredentialProfileKeyAssociations } from "./ApiCredentialProfileKeyAssociations"
import { ApiCredentialProfileRowActions } from "./ApiCredentialProfileRowActions"

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
  focusRequest?: number
  associatedKeyState?: ApiCredentialProfileAssociatedKeyState
  associationAvailability: ApiCredentialProfileAssociationAvailability
  onOpenAssociatedKey?: (associationId: string) => void
  onConfirmAssociatedKey?: (associationId: string) => void
  onUnlinkAssociatedKey?: (associationId: string) => void
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
const TARGET_PROFILE_HIGHLIGHT_DURATION_MS = 5_000

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
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance) {
    return t("apiCredentialProfiles:telemetry.source.deepSeekBalance")
  }
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota) {
    return t("apiCredentialProfiles:telemetry.source.glmQuota")
  }
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.KimiQuota) {
    return t("apiCredentialProfiles:telemetry.source.kimiQuota")
  }
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.KimiOpenPlatformBalance) {
    return t("apiCredentialProfiles:telemetry.source.kimiOpenPlatformBalance")
  }
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

/** Localizes known product-owned health reasons while preserving unknown diagnostics. */
function getTelemetryHealthReason(
  t: TFunction,
  reason: string | undefined,
): string | undefined {
  if (
    reason === API_CREDENTIAL_TELEMETRY_HEALTH_REASONS.InsufficientBalance ||
    reason === "Provider account is unavailable" ||
    reason === "Provider balance is insufficient for API calls"
  ) {
    return t(
      "apiCredentialProfiles:telemetry.healthReasons.insufficientBalance",
    )
  }
  return reason
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
  const facts = snapshot?.facts
  return Boolean(
    snapshot &&
      (facts?.balances?.length ||
        facts?.quota?.windows.length ||
        facts?.usage ||
        facts?.models ||
        Boolean(snapshot.lastError)),
  )
}

/** Formats a canonical money balance without converting its currency. */
function formatProviderBalance(
  balance: ApiCredentialTelemetryBalanceFact,
  t: TFunction,
): string {
  if (balance.unit.kind === "quota") {
    const label =
      balance.unit.code === "usd-equivalent"
        ? t("apiCredentialProfiles:telemetry.balanceSemantics.budgetEquivalent")
        : balance.unit.label
    return `${balance.amount.toLocaleString()} ${label}`
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: balance.unit.currency,
      maximumFractionDigits: 2,
    }).format(balance.amount)
  } catch {
    return `${balance.unit.currency} ${balance.amount.toFixed(2)}`
  }
}

/** Explains whether a displayed monetary figure is spendable cash or a quota equivalent. */
function getBalanceSemanticsLabel(
  balance: ApiCredentialTelemetryBalanceFact,
  t: TFunction,
): string | null {
  if (balance.semantics === "cash") {
    return t("apiCredentialProfiles:telemetry.balanceSemantics.cash")
  }
  if (balance.semantics === "provider-wallet") {
    return t("apiCredentialProfiles:telemetry.balanceSemantics.providerWallet")
  }
  if (balance.semantics === "budget-equivalent") {
    return t(
      "apiCredentialProfiles:telemetry.balanceSemantics.budgetEquivalent",
    )
  }
  return null
}

/** Formats a quota window with its absolute unit when the provider supplies it. */
function formatProviderQuotaWindow(
  window: ApiCredentialTelemetryQuotaWindowFact,
  t: TFunction,
): string {
  const label =
    window.type === "fiveHour"
      ? t("apiCredentialProfiles:telemetry.quotaWindows.fiveHour")
      : window.type === "weekly"
        ? t("apiCredentialProfiles:telemetry.quotaWindows.weekly")
        : t("apiCredentialProfiles:telemetry.quotaWindows.total")
  const percent = `${Math.round(window.remainingPercent)}%`
  if (window.unit.kind === "percent" || window.remaining === undefined) {
    return `${label}: ${percent}`
  }
  const unitLabel =
    window.unit.kind === "quota" && window.unit.code === "glm-credit"
      ? t("apiCredentialProfiles:telemetry.source.glmQuota")
      : window.unit.kind === "quota" && window.unit.code === "usd-equivalent"
        ? t("apiCredentialProfiles:telemetry.balanceSemantics.budgetEquivalent")
        : window.unit.kind === "quota"
          ? t("apiCredentialProfiles:telemetry.quota")
          : ""
  return `${label}: ${window.remaining.toLocaleString()} / ${window.limit?.toLocaleString() ?? "-"} ${unitLabel} (${percent})`
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
  focusRequest,
  associatedKeyState,
  associationAvailability,
  onOpenAssociatedKey,
  onConfirmAssociatedKey,
  onUnlinkAssociatedKey,
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
  const facts = telemetry?.facts
  const hasTelemetryDetails = hasTelemetryDetailData(telemetry)
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(hasTelemetryDetails)
  const previousHasTelemetryDetailsRef = useRef(hasTelemetryDetails)
  const telemetryContentId = useId()
  const [isImportEntryHighlighted, setIsImportEntryHighlighted] =
    useState(false)
  const managedSiteImportButtonRef = useRef<HTMLButtonElement>(null)
  const [isTargetHighlighted, setIsTargetHighlighted] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const rowTargetId = getApiCredentialProfileRowTargetId(profile.id)
  const rowHeadingId = `${rowTargetId}-name`
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
    getTelemetryHealthReason(t, health?.reason) || telemetry?.lastError || "",
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
    if (!focusRequest) {
      return
    }

    const card = cardRef.current
    card?.scrollIntoView?.({ block: "center", inline: "nearest" })
    card?.focus({ preventScroll: true })
    setIsTargetHighlighted(true)

    const timeoutId = window.setTimeout(() => {
      setIsTargetHighlighted(false)
    }, TARGET_PROFILE_HIGHLIGHT_DURATION_MS)

    return () => window.clearTimeout(timeoutId)
  }, [focusRequest])

  useEffect(() => {
    if (!guidedImportEntryRequest) {
      return
    }

    setIsImportEntryHighlighted(true)

    const button = managedSiteImportButtonRef.current
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
      <Card
        ref={cardRef}
        id={rowTargetId}
        data-testid={getApiCredentialProfileRowTestId(profile.id)}
        tabIndex={-1}
        aria-labelledby={rowHeadingId}
        className={cn(
          "transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          isTargetHighlighted &&
            "ring-2 ring-blue-500 ring-offset-2 dark:ring-blue-400",
        )}
      >
        <CardContent padding="md" spacing="sm">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Heading6
                    id={rowHeadingId}
                    className="max-w-full min-w-0 truncate"
                  >
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
                <div className="min-w-0 shrink-0 -translate-y-1">
                  <ApiCredentialProfileKeyAssociations
                    availability={associationAvailability}
                    state={associatedKeyState}
                    onOpenAssociatedKey={onOpenAssociatedKey}
                    onConfirmAssociatedKey={onConfirmAssociatedKey}
                    onUnlinkAssociatedKey={onUnlinkAssociatedKey}
                  />
                </div>
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
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
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
                        <ChevronDown
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
                      leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                    >
                      {isTelemetryRefreshing
                        ? t("apiCredentialProfiles:telemetry.refreshing")
                        : t("apiCredentialProfiles:telemetry.actions.refresh")}
                    </Button>
                  </div>

                  <CollapsibleContent id={telemetryContentId}>
                    <div className="space-y-3 pt-2 text-xs">
                      {facts?.quota?.windows.length ? (
                        <section
                          data-testid={
                            API_CREDENTIAL_PROFILES_TEST_IDS.telemetryQuota
                          }
                        >
                          <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
                            {t("apiCredentialProfiles:telemetry.quota")}
                          </div>
                          <div className="grid gap-1.5 sm:grid-cols-3">
                            {facts.quota.windows.map((window) => (
                              <div
                                className="dark:bg-dark-bg-tertiary/60 rounded-md bg-white px-2 py-1.5 font-medium text-gray-800 dark:text-gray-200"
                                key={window.type}
                              >
                                {formatProviderQuotaWindow(window, t)}
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-4">
                        <section
                          data-testid={
                            API_CREDENTIAL_PROFILES_TEST_IDS.telemetryBalance
                          }
                        >
                          <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
                            {t("apiCredentialProfiles:telemetry.balance")}
                          </div>
                          <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                            {facts?.usage?.unlimited
                              ? t("common:quota.unlimited")
                              : facts?.balances?.length
                                ? facts.balances.map((balance, index) => (
                                    <div
                                      className="flex min-w-0 flex-wrap items-baseline gap-1.5"
                                      key={`${balance.unit.kind === "money" ? balance.unit.currency : balance.unit.code}-${index}`}
                                    >
                                      <span className="dark:text-dark-text-primary font-semibold text-gray-900">
                                        {formatProviderBalance(balance, t)}
                                      </span>
                                      {getBalanceSemanticsLabel(balance, t) ? (
                                        <span className="dark:text-dark-text-tertiary text-[10px] text-gray-500">
                                          {getBalanceSemanticsLabel(balance, t)}
                                        </span>
                                      ) : null}
                                    </div>
                                  ))
                                : missingTelemetryValue}
                          </div>
                        </section>
                        <section className="min-w-0">
                          <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
                            {t("apiCredentialProfiles:telemetry.todayUsage")}
                          </div>
                          <div
                            className="font-semibold text-emerald-600 dark:text-emerald-400"
                            data-testid={
                              API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayUsage
                            }
                          >
                            {facts?.usage?.todayCost !== undefined
                              ? formatTelemetryMoney(
                                  facts.usage.todayCost.value,
                                  currencyType,
                                )
                              : missingTelemetryValue}
                          </div>
                        </section>
                        <section className="min-w-0">
                          <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
                            {t("apiCredentialProfiles:telemetry.todayRequests")}
                          </div>
                          <div
                            className="dark:text-dark-text-primary font-semibold text-gray-900"
                            data-testid={
                              API_CREDENTIAL_PROFILES_TEST_IDS.telemetryTodayRequests
                            }
                          >
                            {facts?.usage?.todayRequests !== undefined
                              ? facts.usage.todayRequests.value.toLocaleString()
                              : missingTelemetryValue}
                          </div>
                        </section>
                        <section className="min-w-0">
                          <div className="dark:text-dark-text-tertiary mb-1 text-gray-500">
                            {t("apiCredentialProfiles:telemetry.models")}
                          </div>
                          <div
                            className="dark:text-dark-text-primary truncate font-semibold text-gray-900"
                            data-testid={
                              API_CREDENTIAL_PROFILES_TEST_IDS.telemetryModels
                            }
                            title={facts?.models?.preview.join(", ")}
                          >
                            {facts?.models
                              ? t(
                                  "apiCredentialProfiles:telemetry.modelCount",
                                  {
                                    count: facts.models.count,
                                  },
                                )
                              : missingTelemetryValue}
                          </div>
                        </section>
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
                      {facts?.usage?.todayTokens ? (
                        <span>
                          {t("apiCredentialProfiles:telemetry.todayTokens")}:{" "}
                          {formatTokenCount(
                            facts.usage.todayTokens.upload +
                              facts.usage.todayTokens.download,
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

              <ApiCredentialProfileRowActions
                profile={profile}
                managedSiteImportButtonRef={managedSiteImportButtonRef}
                managedSiteType={managedSiteType}
                managedSiteLabel={managedSiteLabel}
                isImportEntryHighlighted={isImportEntryHighlighted}
                onCopyBundle={onCopyBundle}
                onExport={onExport}
                onVerify={onVerify}
                onVerifyCliSupport={onVerifyCliSupport}
                onOpenModelManagement={onOpenModelManagement}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </ProductAnalyticsScope>
  )
}
