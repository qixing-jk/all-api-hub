import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { type useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfiles"
import toast from "~/lib/notify"
import { refreshApiCredentialProfileTelemetry } from "~/services/apiCredentialProfiles/telemetry"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionCompleted,
  type ProductAnalyticsActionInsights,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
  type ProductAnalyticsApiType,
  type ProductAnalyticsModeId,
  type ProductAnalyticsSourceKind,
  type ProductAnalyticsStatusKind,
  type ProductAnalyticsTelemetrySource,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { SiteHealthStatus } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES,
  API_CREDENTIAL_TELEMETRY_MODES,
  API_CREDENTIAL_TELEMETRY_SOURCES,
} from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"

type SaveApiCredentialProfileInput = {
  id?: string
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  tagIds: string[]
  notes: string
  sourceUrl?: string
  expiresAt?: number | null
  telemetryConfig?: ApiCredentialTelemetryConfig
}

const logger = createLogger("ApiCredentialProfilesController")
const apiCredentialProfilesFeature =
  PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles
const apiCredentialProfilesDialogSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog
const apiCredentialProfilesRefreshSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions
const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options

const analyticsApiTypeByVerificationApiType: Record<
  ApiVerificationApiType,
  ProductAnalyticsApiType
> = {
  [API_TYPES.OPENAI_COMPATIBLE]: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
  [API_TYPES.OPENAI]: PRODUCT_ANALYTICS_API_TYPES.OpenAi,
  [API_TYPES.ANTHROPIC]: PRODUCT_ANALYTICS_API_TYPES.Anthropic,
  [API_TYPES.GOOGLE]: PRODUCT_ANALYTICS_API_TYPES.Google,
}

const telemetryModeByConfigMode: Record<
  ApiCredentialTelemetryConfig["mode"],
  ProductAnalyticsModeId
> = {
  [API_CREDENTIAL_TELEMETRY_MODES.Auto]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryAuto,
  [API_CREDENTIAL_TELEMETRY_MODES.Disabled]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryDisabled,
  [API_CREDENTIAL_TELEMETRY_MODES.DeepSeekBalance]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryDeepSeekBalance,
  [API_CREDENTIAL_TELEMETRY_MODES.GlmQuota]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryGlmQuota,
  [API_CREDENTIAL_TELEMETRY_MODES.KimiQuota]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryKimiQuota,
  [API_CREDENTIAL_TELEMETRY_MODES.KimiOpenPlatformBalance]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryKimiOpenPlatformBalance,
  [API_CREDENTIAL_TELEMETRY_MODES.OpenCodeGoUsage]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryOpenCodeGoUsage,
  [API_CREDENTIAL_TELEMETRY_MODES.NewApiTokenUsage]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryNewApiTokenUsage,
  [API_CREDENTIAL_TELEMETRY_MODES.Sub2ApiUsage]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetrySub2ApiUsage,
  [API_CREDENTIAL_TELEMETRY_MODES.OpenAiBilling]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryOpenAiBilling,
  [API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint]:
    PRODUCT_ANALYTICS_MODE_IDS.TelemetryCustomReadOnlyEndpoint,
}

const telemetrySourceBySnapshotSource: Partial<
  Record<
    NonNullable<ApiCredentialTelemetrySnapshot["source"]>,
    ProductAnalyticsTelemetrySource
  >
> = {
  [API_CREDENTIAL_TELEMETRY_SOURCES.Models]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.Models,
  [API_CREDENTIAL_TELEMETRY_SOURCES.DeepSeekBalance]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.DeepSeekBalance,
  [API_CREDENTIAL_TELEMETRY_SOURCES.GlmQuota]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.GlmQuota,
  [API_CREDENTIAL_TELEMETRY_SOURCES.KimiQuota]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.KimiQuota,
  [API_CREDENTIAL_TELEMETRY_SOURCES.KimiOpenPlatformBalance]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.KimiOpenPlatformBalance,
  [API_CREDENTIAL_TELEMETRY_SOURCES.OpenCodeGoUsage]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.OpenCodeGoUsage,
  [API_CREDENTIAL_TELEMETRY_SOURCES.OpenAiBilling]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.OpenAiBilling,
  [API_CREDENTIAL_TELEMETRY_SOURCES.NewApiTokenUsage]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
  [API_CREDENTIAL_TELEMETRY_SOURCES.Sub2ApiUsage]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.Sub2ApiUsage,
  [API_CREDENTIAL_TELEMETRY_SOURCES.CustomReadOnlyEndpoint]:
    PRODUCT_ANALYTICS_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
}

const analyticsStatusByHealthStatus: Record<
  SiteHealthStatus,
  ProductAnalyticsStatusKind
> = {
  [SiteHealthStatus.Healthy]: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
  [SiteHealthStatus.Warning]: PRODUCT_ANALYTICS_STATUS_KINDS.Warning,
  [SiteHealthStatus.Error]: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
  [SiteHealthStatus.Unknown]: PRODUCT_ANALYTICS_STATUS_KINDS.Unknown,
}

/**
 * Detects whether a telemetry snapshot includes any usage-facing metrics.
 */
function hasTelemetryUsageData(snapshot: ApiCredentialTelemetrySnapshot) {
  const facts = snapshot.facts
  return Boolean(
    facts?.balances?.length ||
      facts?.quota?.windows?.length ||
      facts?.usage ||
      facts?.models,
  )
}

/**
 * Maps the current UI entrypoint to a coarse, privacy-safe profile creation source.
 */
function getAnalyticsSourceKindForEntrypoint(
  entrypoint: (typeof PRODUCT_ANALYTICS_ENTRYPOINTS)[keyof typeof PRODUCT_ANALYTICS_ENTRYPOINTS],
): ProductAnalyticsSourceKind {
  if (entrypoint === PRODUCT_ANALYTICS_ENTRYPOINTS.Popup) {
    return PRODUCT_ANALYTICS_SOURCE_KINDS.ApiCredentialProfileManualPopup
  }
  return PRODUCT_ANALYTICS_SOURCE_KINDS.ApiCredentialProfileManualOptions
}

/**
 * Builds save completion insights from fixed enums and counts only.
 */
function getApiCredentialProfileSaveAnalyticsInsights(
  input: SaveApiCredentialProfileInput,
  sourceKind: ProductAnalyticsSourceKind,
): ProductAnalyticsActionInsights {
  return {
    apiType: analyticsApiTypeByVerificationApiType[input.apiType],
    sourceKind,
    mode: telemetryModeByConfigMode[
      input.telemetryConfig?.mode ?? API_CREDENTIAL_TELEMETRY_MODES.Auto
    ],
    selectedCount: input.tagIds.length,
    usageDataPresent:
      input.telemetryConfig?.mode ===
      API_CREDENTIAL_TELEMETRY_MODES.CustomReadOnlyEndpoint,
  }
}

/**
 * Converts telemetry snapshot metadata into privacy-safe analytics insights.
 */
function getApiCredentialTelemetryAnalyticsInsights(
  snapshot: ApiCredentialTelemetrySnapshot,
  telemetryConfig?: ApiCredentialTelemetryConfig,
): ProductAnalyticsActionInsights {
  const successCount = Array.isArray(snapshot.attempts)
    ? snapshot.attempts.filter(
        (attempt) =>
          attempt.status === API_CREDENTIAL_TELEMETRY_ATTEMPT_STATUSES.Success,
      ).length
    : undefined
  const failureCount = Array.isArray(snapshot.attempts)
    ? snapshot.attempts.length - (successCount ?? 0)
    : undefined

  return {
    ...(snapshot.source && telemetrySourceBySnapshotSource[snapshot.source]
      ? { telemetrySource: telemetrySourceBySnapshotSource[snapshot.source] }
      : {}),
    mode: telemetryModeByConfigMode[
      telemetryConfig?.mode ?? API_CREDENTIAL_TELEMETRY_MODES.Auto
    ],
    statusKind:
      analyticsStatusByHealthStatus[snapshot.health.status] ??
      PRODUCT_ANALYTICS_STATUS_KINDS.Unknown,
    ...(Array.isArray(snapshot.attempts)
      ? { itemCount: snapshot.attempts.length }
      : {}),
    ...(typeof successCount === "number" ? { successCount } : {}),
    ...(typeof failureCount === "number" ? { failureCount } : {}),
    ...(typeof snapshot.facts?.models?.count === "number"
      ? { modelCount: snapshot.facts.models.count }
      : {}),
    usageDataPresent: hasTelemetryUsageData(snapshot),
  }
}

/** Owns profile persistence and telemetry commands, including feedback and completion. */
export function useApiCredentialProfileCommands({
  createProfile,
  updateProfile,
  deleteProfile,
}: Pick<
  ReturnType<typeof useApiCredentialProfiles>,
  "createProfile" | "updateProfile" | "deleteProfile"
>) {
  const { t } = useTranslation(["apiCredentialProfiles", "messages"])
  const analyticsScope = useProductAnalyticsScope()
  const handleSave = useCallback(
    async (input: SaveApiCredentialProfileInput) => {
      const actionId = input.id
        ? PRODUCT_ANALYTICS_ACTION_IDS.UpdateApiCredentialProfile
        : PRODUCT_ANALYTICS_ACTION_IDS.CreateApiCredentialProfile
      const startedAt = Date.now()
      const entrypoint = analyticsScope.entrypoint ?? optionsEntrypoint
      const insights = getApiCredentialProfileSaveAnalyticsInsights(
        input,
        getAnalyticsSourceKindForEntrypoint(entrypoint),
      )

      try {
        if (input.id) {
          await updateProfile(input.id, {
            name: input.name,
            apiType: input.apiType,
            baseUrl: input.baseUrl,
            apiKey: input.apiKey,
            requestHeaders: input.requestHeaders,
            tagIds: input.tagIds,
            notes: input.notes,
            sourceUrl: input.sourceUrl,
            expiresAt: input.expiresAt,
            telemetryConfig: input.telemetryConfig,
          })
        } else {
          await createProfile({
            name: input.name,
            apiType: input.apiType,
            baseUrl: input.baseUrl,
            apiKey: input.apiKey,
            requestHeaders: input.requestHeaders,
            tagIds: input.tagIds,
            notes: input.notes,
            sourceUrl: input.sourceUrl,
            expiresAt: input.expiresAt,
            telemetryConfig: input.telemetryConfig,
          })
        }
        void trackProductAnalyticsActionCompleted({
          featureId: apiCredentialProfilesFeature,
          actionId,
          surfaceId: apiCredentialProfilesDialogSurface,
          entrypoint,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          durationMs: Date.now() - startedAt,
          insights,
        })
      } catch (error) {
        void trackProductAnalyticsActionCompleted({
          featureId: apiCredentialProfilesFeature,
          actionId,
          surfaceId: apiCredentialProfilesDialogSurface,
          entrypoint,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          durationMs: Date.now() - startedAt,
          insights,
        })
        throw error
      }
    },
    [analyticsScope.entrypoint, createProfile, updateProfile],
  )

  const refreshingTelemetryProfileIdsRef = useRef(new Set<string>())
  const [refreshingTelemetryProfileIds, setRefreshingTelemetryProfileIds] =
    useState<string[]>([])

  const handleRefreshTelemetry = useCallback(
    async (profile: ApiCredentialProfile) => {
      const tracker = startProductAnalyticsAction({
        featureId: apiCredentialProfilesFeature,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshApiCredentialTelemetry,
        surfaceId: apiCredentialProfilesRefreshSurface,
        entrypoint: optionsEntrypoint,
      })

      if (refreshingTelemetryProfileIdsRef.current.has(profile.id)) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
        return
      }

      refreshingTelemetryProfileIdsRef.current.add(profile.id)
      setRefreshingTelemetryProfileIds([
        ...refreshingTelemetryProfileIdsRef.current,
      ])
      try {
        const refreshPromise = refreshApiCredentialProfileTelemetry(profile.id)
        await toast.promise(refreshPromise, {
          loading: t("apiCredentialProfiles:telemetry.messages.refreshing"),
          success: t("apiCredentialProfiles:telemetry.messages.refreshed"),
          error: (error) => {
            logger.warn("Telemetry refresh failed", error)
            return t("apiCredentialProfiles:telemetry.messages.refreshFailed")
          },
        })
        const snapshot = await refreshPromise
        const insights = getApiCredentialTelemetryAnalyticsInsights(
          snapshot,
          profile.telemetryConfig,
        )
        if (snapshot.health.status === SiteHealthStatus.Healthy) {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            insights,
          })
        } else {
          tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            insights,
          })
        }
      } catch (error) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        throw error
      } finally {
        refreshingTelemetryProfileIdsRef.current.delete(profile.id)
        setRefreshingTelemetryProfileIds([
          ...refreshingTelemetryProfileIdsRef.current,
        ])
      }
    },
    [t],
  )

  const [deletingProfile, setDeletingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleRequestDelete = useCallback((profile: ApiCredentialProfile) => {
    setDeletingProfile(profile)
  }, [])

  const closeDeleteDialog = useCallback(() => {
    setDeletingProfile(null)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingProfile) return
    const startedAt = Date.now()
    setIsDeleting(true)
    try {
      const deleted = await deleteProfile(deletingProfile.id)
      if (deleted) {
        toast.success(t("apiCredentialProfiles:messages.deleted"))
        void trackProductAnalyticsActionCompleted({
          featureId: apiCredentialProfilesFeature,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteApiCredentialProfile,
          surfaceId: apiCredentialProfilesRefreshSurface,
          entrypoint: optionsEntrypoint,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          durationMs: Date.now() - startedAt,
        })
      } else {
        toast.error(t("apiCredentialProfiles:messages.deleteFailed"))
        void trackProductAnalyticsActionCompleted({
          featureId: apiCredentialProfilesFeature,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteApiCredentialProfile,
          surfaceId: apiCredentialProfilesRefreshSurface,
          entrypoint: optionsEntrypoint,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          durationMs: Date.now() - startedAt,
        })
      }
      setDeletingProfile(null)
    } catch {
      toast.error(t("apiCredentialProfiles:messages.deleteFailed"))
      void trackProductAnalyticsActionCompleted({
        featureId: apiCredentialProfilesFeature,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteApiCredentialProfile,
        surfaceId: apiCredentialProfilesRefreshSurface,
        entrypoint: optionsEntrypoint,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        durationMs: Date.now() - startedAt,
      })
    } finally {
      setIsDeleting(false)
    }
  }, [deleteProfile, deletingProfile, t])

  return {
    handleSave,
    refreshingTelemetryProfileIds,
    handleRefreshTelemetry,
    deletingProfile,
    isDeleting,
    handleRequestDelete,
    closeDeleteDialog,
    handleConfirmDelete,
  }
}
