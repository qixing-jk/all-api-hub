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
  LEGACY_INSUFFICIENT_BALANCE_REASONS,
  type ApiCredentialProfile,
  type ApiCredentialTelemetrySource,
} from "~/types/apiCredentialProfiles"
import {
  formatLocaleDateTime,
  maskSecretForDisplay,
} from "~/utils/core/formatters"

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
import {
  ApiCredentialProfileTelemetryDetails,
  hasApiCredentialTelemetryDetailData,
} from "./ApiCredentialProfileTelemetryDetails"

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
  if (status === SiteHealthStatus.Healthy) return "bg-success"
  if (status === SiteHealthStatus.Warning) return "bg-warning"
  if (status === SiteHealthStatus.Error) return "bg-destructive"
  return "bg-surface-inverse-muted"
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
      className="dark:bg-secondary/50 bg-surface-subtle text-muted-foreground max-w-full font-normal tabular-nums"
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
  if (source === API_CREDENTIAL_TELEMETRY_SOURCES.OpenCodeGoUsage) {
    return t("apiCredentialProfiles:telemetry.source.openCodeGoUsage")
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
    (reason !== undefined &&
      LEGACY_INSUFFICIENT_BALANCE_REASONS.includes(reason))
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
  const telemetry = profile.telemetrySnapshot
  const hasTelemetryDetails = hasApiCredentialTelemetryDetailData(telemetry)
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
          "focus-visible:ring-ring transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          isTargetHighlighted &&
            "ring-theme-500 dark:ring-theme-400 ring-2 ring-offset-2",
        )}
      >
        <CardContent padding="md" spacing="sm">
          <div className="gap-density-5 flex min-w-0 flex-col">
            <div className="gap-density-2 flex min-w-0 flex-1 flex-col">
              <div className="gap-x-density-3 gap-y-density-2 flex min-w-0 flex-wrap items-start justify-between">
                <div className="gap-density-2 flex min-w-0 flex-1 flex-wrap items-center">
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

              <div className="gap-density-2 flex flex-1 flex-col text-xs">
                <div className="gap-density-1 sm:gap-density-2 flex min-w-0 flex-col sm:flex-row sm:items-center">
                  <span className="text-muted-foreground shrink-0 whitespace-nowrap">
                    {t("apiCredentialProfiles:list.apiKey")}
                  </span>
                  <div className="flex w-full min-w-0 items-center gap-0.5 sm:flex-1">
                    <code className="dark:bg-secondary bg-muted text-secondary-foreground py-density-1 min-w-0 flex-1 truncate rounded px-2 font-mono text-[10px] sm:text-xs">
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

                <div className="gap-density-1-5 sm:gap-density-2 flex min-w-0 flex-wrap items-center">
                  <span className="text-muted-foreground shrink-0 whitespace-nowrap">
                    {t("aiApiVerification:verifyDialog.history.lastVerified")}
                  </span>
                  <VerificationHistorySummary
                    summary={verificationSummary}
                    className="gap-density-1-5 sm:gap-density-2 flex min-w-0 flex-wrap items-center"
                  />
                </div>

                <Collapsible
                  open={isTelemetryOpen}
                  onOpenChange={setIsTelemetryOpen}
                  className="dark:bg-secondary/60 border-border-subtle bg-surface-subtle py-density-2 sm:py-density-3 flex flex-col rounded-lg border px-2 sm:px-3"
                  data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.telemetryPanel}
                >
                  <div className="gap-density-2 flex min-w-0 items-center justify-between">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="group gap-density-2 py-density-1 h-auto min-h-0 min-w-0 flex-1 justify-start px-1.5 text-left"
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
                        <span className="text-secondary-foreground min-w-0 truncate text-xs font-medium">
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
                            "text-muted-foreground ml-auto h-3.5 w-3.5 shrink-0 transition-transform",
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
                      className="dark:hover:text-foreground text-muted-foreground hover:text-secondary-foreground gap-density-1 py-density-1 h-auto min-h-0 shrink-0 px-1.5 text-[11px]"
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
                    <ApiCredentialProfileTelemetryDetails
                      snapshot={telemetry}
                      missingTelemetryValue={missingTelemetryValue}
                    />
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {profile.notes?.trim() ? (
                <div className="dark:border-border dark:bg-secondary/40 dark:text-secondary-foreground border-theme-200 bg-theme-50/60 text-muted-foreground py-density-2 border-l-2 px-3 text-xs">
                  <div className="text-theme-600 dark:text-theme-300 mb-density-1 text-[11px] font-medium tracking-wide">
                    {t("apiCredentialProfiles:dialog.fields.notes")}
                  </div>
                  <div className="max-h-24 overflow-y-auto leading-relaxed break-words whitespace-pre-wrap">
                    {profile.notes.trim()}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="gap-x-density-4 gap-y-density-2 flex w-full min-w-0 flex-wrap items-center justify-between">
              <div className="gap-density-1-5 sm:gap-density-2 flex min-w-0 flex-wrap items-center">
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
