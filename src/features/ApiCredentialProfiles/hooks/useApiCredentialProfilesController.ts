import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { refreshApiCredentialProfileTelemetry } from "~/services/apiCredentialProfiles/telemetry"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionCompleted,
  type ProductAnalyticsActionInsights,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
  type ProductAnalyticsStatusKind,
  type ProductAnalyticsTelemetrySource,
} from "~/services/productAnalytics/events"
import { tagStorage } from "~/services/tags/tagStorage"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import {
  createProfileVerificationHistoryTarget,
  serializeVerificationHistoryTarget,
  useVerificationResultHistorySummaries,
} from "~/services/verification/verificationResultHistory"
import type { Tag } from "~/types"
import { SiteHealthStatus } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryConfig,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import { onRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"
import { openModelsPage } from "~/utils/navigation"

import type { ApiCredentialProfileExportAction } from "../components/ApiCredentialProfileListItem"
import { createExportAccount, createExportToken } from "../utils/exportShims"
import { useApiCredentialProfiles } from "./useApiCredentialProfiles"

type SaveApiCredentialProfileInput = {
  id?: string
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  tagIds: string[]
  notes: string
  telemetryConfig?: ApiCredentialTelemetryConfig
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

const telemetrySourceBySnapshotSource: Partial<
  Record<
    NonNullable<ApiCredentialTelemetrySnapshot["source"]>,
    ProductAnalyticsTelemetrySource
  >
> = {
  models: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.Models,
  openaiBilling: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.OpenAiBilling,
  newApiTokenUsage: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
  sub2apiUsage: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.Sub2ApiUsage,
  customReadOnlyEndpoint:
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
  return (
    snapshot.balanceUsd !== undefined ||
    snapshot.todayCostUsd !== undefined ||
    snapshot.todayRequests !== undefined ||
    snapshot.todayTokens !== undefined ||
    snapshot.unlimitedQuota === true ||
    snapshot.totalUsedUsd !== undefined ||
    snapshot.totalGrantedUsd !== undefined ||
    snapshot.totalAvailableUsd !== undefined ||
    snapshot.expiresAt !== undefined
  )
}

/**
 * Converts telemetry snapshot metadata into privacy-safe analytics insights.
 */
function getApiCredentialTelemetryAnalyticsInsights(
  snapshot: ApiCredentialTelemetrySnapshot,
): ProductAnalyticsActionInsights {
  return {
    ...(snapshot.source && telemetrySourceBySnapshotSource[snapshot.source]
      ? { telemetrySource: telemetrySourceBySnapshotSource[snapshot.source] }
      : {}),
    statusKind:
      analyticsStatusByHealthStatus[snapshot.health.status] ??
      PRODUCT_ANALYTICS_STATUS_KINDS.Unknown,
    ...(Array.isArray(snapshot.attempts)
      ? { itemCount: snapshot.attempts.length }
      : {}),
    ...(typeof snapshot.models?.count === "number"
      ? { modelCount: snapshot.models.count }
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
  const {
    managedSiteType,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    cliProxyBaseUrl,
    cliProxyManagementKey,
  } = useUserPreferencesContext()
  const { openWithCredentials } = useChannelDialog()

  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)

  const { profiles, isLoading, createProfile, updateProfile, deleteProfile } =
    useApiCredentialProfiles()
  const profileVerificationTargets = useMemo(
    () =>
      profiles.flatMap((profile) => {
        const target = createProfileVerificationHistoryTarget(profile.id)
        return target ? [target] : []
      }),
    [profiles],
  )
  const { summariesByKey: verificationSummariesByKey } =
    useVerificationResultHistorySummaries(profileVerificationTargets)

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

  const openAddDialog = useCallback(() => {
    setEditingProfile(null)
    setIsEditorOpen(true)
  }, [])

  const openEditDialog = useCallback((profile: ApiCredentialProfile) => {
    setEditingProfile(profile)
    setIsEditorOpen(true)
  }, [])

  const handleSave = useCallback(
    async (input: SaveApiCredentialProfileInput) => {
      const actionId = input.id
        ? PRODUCT_ANALYTICS_ACTION_IDS.UpdateApiCredentialProfile
        : PRODUCT_ANALYTICS_ACTION_IDS.CreateApiCredentialProfile
      const startedAt = Date.now()

      try {
        if (input.id) {
          await updateProfile(input.id, {
            name: input.name,
            apiType: input.apiType,
            baseUrl: input.baseUrl,
            apiKey: input.apiKey,
            tagIds: input.tagIds,
            notes: input.notes,
            telemetryConfig: input.telemetryConfig,
          })
        } else {
          await createProfile({
            name: input.name,
            apiType: input.apiType,
            baseUrl: input.baseUrl,
            apiKey: input.apiKey,
            tagIds: input.tagIds,
            notes: input.notes,
            telemetryConfig: input.telemetryConfig,
          })
        }
        void trackProductAnalyticsActionCompleted({
          featureId: apiCredentialProfilesFeature,
          actionId,
          surfaceId: apiCredentialProfilesDialogSurface,
          entrypoint: optionsEntrypoint,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          durationMs: Date.now() - startedAt,
        })
      } catch (error) {
        void trackProductAnalyticsActionCompleted({
          featureId: apiCredentialProfilesFeature,
          actionId,
          surfaceId: apiCredentialProfilesDialogSurface,
          entrypoint: optionsEntrypoint,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          durationMs: Date.now() - startedAt,
        })
        throw error
      }
    },
    [createProfile, updateProfile],
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
    (profile: ApiCredentialProfile) => {
      void copyToClipboard(
        profile.baseUrl,
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

  const [ccSwitchProfile, setCCSwitchProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [kiloCodeProfile, setKiloCodeProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [cliProxyProfile, setCliProxyProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [claudeCodeRouterProfile, setClaudeCodeRouterProfile] =
    useState<ApiCredentialProfile | null>(null)

  const handleExport = useCallback(
    (
      profile: ApiCredentialProfile,
      action: ApiCredentialProfileExportAction,
    ) => {
      if (action === "cherryStudio") {
        const tracker = startProductAnalyticsAction({
          featureId: apiCredentialProfilesFeature,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCherryStudio,
          surfaceId: apiCredentialProfilesRefreshSurface,
          entrypoint: optionsEntrypoint,
        })

        try {
          OpenInCherryStudio(
            createExportAccount(profile),
            createExportToken(profile),
          )
          void tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        } catch (error) {
          void tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          })
          throw error
        }
        return
      }

      if (action === "ccSwitch") {
        setCCSwitchProfile(profile)
        return
      }

      if (action === "kiloCode") {
        setKiloCodeProfile(profile)
        return
      }

      if (action === "cliProxy") {
        if (!cliProxyBaseUrl?.trim() || !cliProxyManagementKey?.trim()) {
          showResultToast({
            success: false,
            message: t("messages:cliproxy.configMissing"),
          })
          return
        }
        setCliProxyProfile(profile)
        return
      }

      if (action === "claudeCodeRouter") {
        if (!claudeCodeRouterBaseUrl?.trim()) {
          showResultToast({
            success: false,
            message: t("messages:claudeCodeRouter.configMissing"),
          })
          return
        }
        setClaudeCodeRouterProfile(profile)
        return
      }

      if (action === "managedSite") {
        const tracker = startProductAnalyticsAction({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
          surfaceId: apiCredentialProfilesRefreshSurface,
          entrypoint: optionsEntrypoint,
        })

        void openWithCredentials(
          {
            name: profile.name,
            baseUrl: profile.baseUrl,
            apiKey: profile.apiKey,
          },
          (result) => {
            showResultToast(result)
          },
        )
          .then((result) =>
            tracker.complete(
              result?.opened || result?.deferred
                ? PRODUCT_ANALYTICS_RESULTS.Success
                : PRODUCT_ANALYTICS_RESULTS.Skipped,
            ),
          )
          .catch((error) => {
            void tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            })
            showResultToast({
              success: false,
              message: t("messages:errors.operation.failed", {
                error: getErrorMessage(error, t("messages:errors.unknown")),
              }),
            })
            logger.warn(
              "Failed to complete managed site import analytics.",
              error,
            )
          })
      }
    },
    [
      claudeCodeRouterBaseUrl,
      cliProxyBaseUrl,
      cliProxyManagementKey,
      openWithCredentials,
      t,
    ],
  )

  const handleRefreshTelemetry = useCallback(
    async (profile: ApiCredentialProfile) => {
      const tracker = startProductAnalyticsAction({
        featureId: apiCredentialProfilesFeature,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshApiCredentialTelemetry,
        surfaceId: apiCredentialProfilesRefreshSurface,
        entrypoint: optionsEntrypoint,
      })

      if (refreshingTelemetryProfileIdsRef.current.has(profile.id)) {
        await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
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
        const insights = getApiCredentialTelemetryAnalyticsInsights(snapshot)
        if (snapshot.health.status === SiteHealthStatus.Healthy) {
          await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
            insights,
          })
        } else {
          await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            insights,
          })
        }
      } catch (error) {
        await tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
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
    openAddDialog,
    openEditDialog,
    handleSave,

    verifyingProfile,
    setVerifyingProfile,
    cliVerifyingProfile,
    setCliVerifyingProfile,
    refreshingTelemetryProfileIds,
    handleRefreshTelemetry,

    ccSwitchProfile,
    setCCSwitchProfile,
    kiloCodeProfile,
    setKiloCodeProfile,
    cliProxyProfile,
    setCliProxyProfile,
    claudeCodeRouterProfile,
    setClaudeCodeRouterProfile,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,

    handleCopyBaseUrl,
    handleCopyApiKey,
    handleCopyBundle,
    handleOpenModelManagement,
    getProfileVerificationSummary,
    handleExport,

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
