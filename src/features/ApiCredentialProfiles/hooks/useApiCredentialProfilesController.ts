import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import toast from "~/lib/notify"
import { refreshApiCredentialProfileTelemetry } from "~/services/apiCredentialProfiles/telemetry"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
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
import { tagStorage } from "~/services/tags/tagStorage"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import {
  createProfileVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
  useLatestProfileVerificationSummaries,
} from "~/services/verification/verificationResultHistory"
import type { Tag } from "~/types"
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
import { onRuntimeMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { openModelsPage } from "~/utils/navigation"

import { useApiCredentialProfileExportSession } from "./useApiCredentialProfileExportSession"
import { useApiCredentialProfiles } from "./useApiCredentialProfiles"

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

type ApiCredentialProfileAddPrefill = {
  name?: string
  baseUrl?: string
  apiKeyCreateUrl?: string
  apiKeyCreateHint?: string
}

/**
 * Normalizes add-dialog prefill fields before they reach controlled inputs or links.
 */
function normalizeApiCredentialProfileAddPrefill(
  value: unknown,
): ApiCredentialProfileAddPrefill | null {
  if (typeof value !== "object" || value === null) return null

  const record = value as Record<string, unknown>
  const name = trimOptionalString(record.name)
  const baseUrl = trimOptionalString(record.baseUrl)
  const apiKeyCreateUrl = normalizeOptionalHttpUrl(record.apiKeyCreateUrl)
  const apiKeyCreateHint = trimOptionalString(record.apiKeyCreateHint)

  const prefill = {
    ...(name ? { name } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKeyCreateUrl ? { apiKeyCreateUrl } : {}),
    ...(apiKeyCreateHint ? { apiKeyCreateHint } : {}),
  }

  return Object.keys(prefill).length > 0 ? prefill : null
}

/**
 * Trims optional string input and omits empty or non-string values.
 */
function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Returns an HTTP(S) URL string when the optional input is safe to render.
 */
function normalizeOptionalHttpUrl(value: unknown): string | undefined {
  const trimmed = trimOptionalString(value)
  if (!trimmed) return undefined

  try {
    const url = new URL(trimmed)
    return url.protocol === "http:" || url.protocol === "https:"
      ? trimmed
      : undefined
  } catch {
    return undefined
  }
}

type RuntimeBroadcastMessage = {
  type?: (typeof RuntimeMessageTypes)[keyof typeof RuntimeMessageTypes]
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

/**
 * Controller hook for managing API credential profiles, including CRUD operations,
 */
export function useApiCredentialProfilesController() {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
    "messages",
    "settings",
  ])
  const { managedSiteType } = useUserPreferencesContext()
  const analyticsScope = useProductAnalyticsScope()

  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)

  const { profiles, isLoading, createProfile, updateProfile, deleteProfile } =
    useApiCredentialProfiles()
  const { summariesByKey: verificationSummariesByKey } =
    useLatestProfileVerificationSummaries(profiles.map((profile) => profile.id))

  const [tags, setTags] = useState<Tag[]>([])

  const loadTags = useCallback(async () => {
    try {
      setTags(await tagStorage.listTags())
    } catch {
      setTags([])
    }
  }, [])

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  useEffect(() => {
    return onRuntimeMessage((message: RuntimeBroadcastMessage) => {
      if (message.type === RuntimeMessageTypes.TAG_STORE_UPDATE) {
        void loadTags()
      }
    })
  }, [loadTags])

  const createTag = useCallback(
    async (name: string) => {
      const created = await tagStorage.createTag(name)
      await loadTags()
      return created
    },
    [loadTags],
  )

  const renameTag = useCallback(
    async (tagId: string, name: string) => {
      const updated = await tagStorage.renameTag(tagId, name)
      await loadTags()
      return updated
    },
    [loadTags],
  )

  const deleteTag = useCallback(
    async (tagId: string) => {
      const result = await tagStorage.deleteTag(tagId)
      await loadTags()
      return result
    },
    [loadTags],
  )

  const tagNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const tag of tags) {
      map.set(tag.id, tag.name)
    }
    return map
  }, [tags])

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

  const toggleKeyVisibility = useCallback((id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingProfile, setEditingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [addPrefill, setAddPrefill] =
    useState<ApiCredentialProfileAddPrefill | null>(null)

  const openAddDialog = useCallback(
    (prefill?: ApiCredentialProfileAddPrefill | null | unknown) => {
      setEditingProfile(null)
      setAddPrefill(normalizeApiCredentialProfileAddPrefill(prefill))
      setIsEditorOpen(true)
    },
    [],
  )

  const openEditDialog = useCallback((profile: ApiCredentialProfile) => {
    setEditingProfile(profile)
    setAddPrefill(null)
    setIsEditorOpen(true)
  }, [])

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

  const copyToClipboard = useCallback(
    async (value: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(value)
        toast.success(successMessage)
      } catch {
        toast.error(t("apiCredentialProfiles:messages.copyFailed"))
      }
    },
    [t],
  )

  const handleCopyBaseUrl = useCallback(
    (baseUrl: string) => {
      void copyToClipboard(
        baseUrl,
        t("apiCredentialProfiles:messages.baseUrlCopied"),
      )
    },
    [copyToClipboard, t],
  )

  const handleCopyApiKey = useCallback(
    (profile: ApiCredentialProfile) => {
      void copyToClipboard(
        profile.apiKey,
        t("apiCredentialProfiles:messages.apiKeyCopied"),
      )
    },
    [copyToClipboard, t],
  )

  const handleCopyBundle = useCallback(
    (profile: ApiCredentialProfile) => {
      const content = `BASE_URL=${profile.baseUrl}\nAPI_KEY=${profile.apiKey}`
      void copyToClipboard(
        content,
        t("apiCredentialProfiles:messages.bundleCopied"),
      )
    },
    [copyToClipboard, t],
  )

  const handleOpenModelManagement = useCallback(
    (profile: ApiCredentialProfile) => {
      void openModelsPage({ profileId: profile.id })
    },
    [],
  )

  const getProfileVerificationSummary = useCallback(
    (profileId: string) => {
      const target = createProfileVerificationHistoryTarget(profileId)
      return target
        ? verificationSummariesByKey[
            serializeVerificationHistoryTarget(target)
          ] ?? null
        : null
    },
    [verificationSummariesByKey],
  )

  const [verifyingProfile, setVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [cliVerifyingProfile, setCliVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const refreshingTelemetryProfileIdsRef = useRef(new Set<string>())
  const [refreshingTelemetryProfileIds, setRefreshingTelemetryProfileIds] =
    useState<string[]>([])

  const exportSession = useApiCredentialProfileExportSession()

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
    ...exportSession,
    profiles,
    isLoading,

    tags,
    tagNameById,
    createTag,
    renameTag,
    deleteTag,

    visibleKeys,
    toggleKeyVisibility,

    managedSiteType,
    managedSiteLabel,

    isEditorOpen,
    setIsEditorOpen,
    editingProfile,
    addPrefill,
    openAddDialog,
    openEditDialog,
    handleSave,

    verifyingProfile,
    setVerifyingProfile,
    cliVerifyingProfile,
    setCliVerifyingProfile,
    refreshingTelemetryProfileIds,
    handleRefreshTelemetry,

    handleCopyBaseUrl,
    handleCopyApiKey,
    handleCopyBundle,
    handleOpenModelManagement,
    getProfileVerificationSummary,

    deletingProfile,
    isDeleting,
    handleRequestDelete,
    closeDeleteDialog,
    handleConfirmDelete,
  }
}

export type ApiCredentialProfilesController = ReturnType<
  typeof useApiCredentialProfilesController
>
