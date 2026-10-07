import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useChannelFilterEditor } from "~/hooks/useChannelFilterEditor"
import { useDeferredPreferenceField } from "~/hooks/useDeferredPreferenceField"
import toast from "~/lib/notify"
import { normalizeChannelFilters } from "~/services/managedSites/channelModelFilterRules"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
} from "~/services/productAnalytics/contracts"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedSiteModelSyncPreferences } from "~/types/managedSiteModelSync"
import type { PartialWithNested } from "~/types/utils"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/feedback/preferenceFeedback"
import { pushWithinOptionsPage } from "~/utils/navigation"
import { matchesDefaultSettings } from "~/utils/preferences/matchesDefaultSettings"

import { useChannelUpstreamModelOptions } from "./useChannelUpstreamModelOptions"

type UserManagedSiteModelSyncConfig = NonNullable<
  typeof DEFAULT_PREFERENCES.managedSiteModelSync
>

type ManagedSiteModelSyncPreferenceUpdate = PartialWithNested<
  ManagedSiteModelSyncPreferences,
  "rateLimit"
>

type UserManagedSiteModelSyncConfigUpdate = PartialWithNested<
  UserManagedSiteModelSyncConfig,
  "rateLimit"
>

type EditableFilter = ChannelModelFilterRule

type NumericInputCommitOptions = {
  persistedValue: number
  min: number
  max: number
  allowDecimal?: boolean
  createUpdate: (value: number) => ManagedSiteModelSyncPreferenceUpdate
}

/**
 * Unified logger scoped to the Managed Site model sync settings section.
 */
const logger = createLogger("ManagedSiteModelSyncSettings")

const MODEL_SYNC_SETTINGS_ANALYTICS_CONTEXT = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

const CHANNEL_PROCESSING_TIMEOUT_MAX_SECONDS = 43_200
const DEFAULT_MODEL_SYNC_PREFERENCES = DEFAULT_PREFERENCES.managedSiteModelSync!

/**
 * Starts an analytics span for model-sync settings actions using fixed enums.
 */
function startSettingsAnalyticsAction(actionId: ProductAnalyticsActionId) {
  return startProductAnalyticsAction({
    ...MODEL_SYNC_SETTINGS_ANALYTICS_CONTEXT,
    actionId,
  })
}

/** Composes deferred preference drafts, filter editing, and model-sync settings commands. */
export function useManagedSiteModelSyncSettingsViewModel() {
  const { t } = useTranslation([
    "managedSiteModelSync",
    "settings",
    "managedSiteChannels",
    "common",
  ])
  const {
    preferences: userPrefs,
    updateNewApiModelSync,
    resetNewApiModelSyncConfig,
  } = useUserPreferencesContext()
  const { channelUpstreamModelOptions, optionsLoading, optionsError } =
    useChannelUpstreamModelOptions()

  // Convert from persisted user prefs to ManagedSiteModelSyncPreferences format
  const rawPrefs = userPrefs?.managedSiteModelSync ?? userPrefs?.newApiModelSync
  const preferences = useMemo<ManagedSiteModelSyncPreferences>(
    () =>
      rawPrefs
        ? {
            enableSync: rawPrefs.enabled,
            intervalMs: rawPrefs.interval,
            concurrency: rawPrefs.concurrency,
            maxRetries: rawPrefs.maxRetries,
            channelProcessingTimeout: rawPrefs.channelProcessingTimeout ?? 0,
            rateLimit: rawPrefs.rateLimit,
            allowedModels: rawPrefs.allowedModels ?? [],
            globalChannelModelFilters: rawPrefs.globalChannelModelFilters ?? [],
          }
        : {
            enableSync: DEFAULT_MODEL_SYNC_PREFERENCES.enabled,
            intervalMs: DEFAULT_MODEL_SYNC_PREFERENCES.interval,
            concurrency: DEFAULT_MODEL_SYNC_PREFERENCES.concurrency,
            maxRetries: DEFAULT_MODEL_SYNC_PREFERENCES.maxRetries,
            channelProcessingTimeout:
              DEFAULT_MODEL_SYNC_PREFERENCES.channelProcessingTimeout,
            rateLimit: DEFAULT_MODEL_SYNC_PREFERENCES.rateLimit,
            allowedModels: DEFAULT_MODEL_SYNC_PREFERENCES.allowedModels,
            globalChannelModelFilters:
              DEFAULT_MODEL_SYNC_PREFERENCES.globalChannelModelFilters,
          },
    [rawPrefs],
  )
  const [
    isGlobalChannelModelFiltersDialogOpen,
    setIsGlobalChannelModelFiltersDialogOpen,
  ] = useState(false)
  const {
    filters: globalChannelModelFiltersDraft,
    setFilters: setGlobalChannelModelFiltersDraft,
    jsonText,
    setJsonText,
    viewMode,
    resetEditor,
    showVisual,
    showJson,
    handleFieldChange: handleGlobalFilterFieldChange,
    handleAddFilter: handleAddGlobalFilter,
    handleRemoveFilter: handleRemoveGlobalFilter,
    handleMoveFilter: handleMoveGlobalFilter,
    validateFilters: validateGlobalChannelModelFilters,
    parseJsonFilters,
  } = useChannelFilterEditor("global-channel-filter")
  const [
    isSavingGlobalChannelModelFilters,
    setIsSavingGlobalChannelModelFilters,
  ] = useState(false)

  const savePreferences = async (
    updates: ManagedSiteModelSyncPreferenceUpdate,
  ) => {
    const isGlobalFiltersUpdate =
      updates.globalChannelModelFilters !== undefined
    const tracker = startSettingsAnalyticsAction(
      isGlobalFiltersUpdate
        ? PRODUCT_ANALYTICS_ACTION_IDS.SaveManagedSiteChannelModelFilters
        : PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteModelSyncSettings,
    )

    try {
      // Convert to UserPreferences.modelSync format
      const userPrefsUpdate: UserManagedSiteModelSyncConfigUpdate = {}
      if (updates.enableSync !== undefined) {
        userPrefsUpdate.enabled = updates.enableSync
      }
      if (updates.intervalMs !== undefined) {
        userPrefsUpdate.interval = updates.intervalMs
      }
      if (updates.concurrency !== undefined) {
        userPrefsUpdate.concurrency = updates.concurrency
      }
      if (updates.maxRetries !== undefined) {
        userPrefsUpdate.maxRetries = updates.maxRetries
      }
      if (updates.channelProcessingTimeout !== undefined) {
        userPrefsUpdate.channelProcessingTimeout =
          updates.channelProcessingTimeout
      }
      if (updates.rateLimit !== undefined) {
        userPrefsUpdate.rateLimit = updates.rateLimit
      }
      if (updates.allowedModels !== undefined) {
        userPrefsUpdate.allowedModels = updates.allowedModels
      }
      if (updates.globalChannelModelFilters !== undefined) {
        userPrefsUpdate.globalChannelModelFilters =
          updates.globalChannelModelFilters
      }

      const writeResult = await updateNewApiModelSync(userPrefsUpdate)

      if (!writeResult.ok) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure)
        toast.error(
          getPreferenceWriteFailureMessage(writeResult.reason, {
            fallback: t("settings:messages.saveSettingsFailed"),
          }),
        )
        return false
      } else if (!updates.globalChannelModelFilters) {
        // Avoid double toast when saving from the global filters dialog,
        // which already shows a dedicated success message.
        toast.success(t("managedSiteModelSync:messages.success.settingsSaved"))
      }
      if (isGlobalFiltersUpdate) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            editorMode:
              viewMode === "json"
                ? PRODUCT_ANALYTICS_EDITOR_MODES.Json
                : PRODUCT_ANALYTICS_EDITOR_MODES.Visual,
          },
        })
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      }
      return true
    } catch (error) {
      logger.error("Failed to save preferences", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure)
      toast.error(t("settings:messages.saveSettingsFailed"))
      return false
    }
  }

  const commitNumericInput = async (
    draft: string,
    {
      persistedValue,
      min,
      max,
      allowDecimal = false,
      createUpdate,
    }: NumericInputCommitOptions,
  ) => {
    const nextValue = Number(draft)
    const isValid =
      draft.trim() !== "" &&
      Number.isFinite(nextValue) &&
      (allowDecimal || Number.isInteger(nextValue)) &&
      nextValue >= min &&
      nextValue <= max

    if (!isValid) {
      toast.error(
        t("managedSiteModelSync:messages.error.invalidSettingValue", {
          min,
          max,
        }),
      )
      return { ok: false }
    }
    if (nextValue === persistedValue) {
      return { ok: true, value: String(persistedValue) }
    }

    const saved = await savePreferences(createUpdate(nextValue))
    return { ok: saved, value: String(nextValue) }
  }

  const savedVersion = userPrefs?.lastUpdated ?? 0
  const intervalHoursField = useDeferredPreferenceField({
    savedValue: String(preferences.intervalMs / (1000 * 60 * 60)),
    savedVersion,
    onCommit: (draft) =>
      commitNumericInput(draft, {
        persistedValue: preferences.intervalMs / (1000 * 60 * 60),
        min: 1,
        max: 720,
        allowDecimal: true,
        createUpdate: (hours) => ({
          intervalMs: hours * 60 * 60 * 1000,
        }),
      }),
  })
  const concurrencyField = useDeferredPreferenceField({
    savedValue: String(preferences.concurrency),
    savedVersion,
    onCommit: (draft) =>
      commitNumericInput(draft, {
        persistedValue: preferences.concurrency,
        min: 1,
        max: 10,
        createUpdate: (concurrency) => ({ concurrency }),
      }),
  })
  const maxRetriesField = useDeferredPreferenceField({
    savedValue: String(preferences.maxRetries),
    savedVersion,
    onCommit: (draft) =>
      commitNumericInput(draft, {
        persistedValue: preferences.maxRetries,
        min: 0,
        max: 5,
        createUpdate: (maxRetries) => ({ maxRetries }),
      }),
  })
  const channelProcessingTimeoutField = useDeferredPreferenceField({
    savedValue: String(preferences.channelProcessingTimeout),
    savedVersion,
    onCommit: (draft) =>
      commitNumericInput(draft, {
        persistedValue: preferences.channelProcessingTimeout,
        min: 0,
        max: CHANNEL_PROCESSING_TIMEOUT_MAX_SECONDS,
        createUpdate: (channelProcessingTimeout) => ({
          channelProcessingTimeout,
        }),
      }),
  })
  const requestsPerMinuteField = useDeferredPreferenceField({
    savedValue: String(preferences.rateLimit.requestsPerMinute),
    savedVersion,
    onCommit: (draft) =>
      commitNumericInput(draft, {
        persistedValue: preferences.rateLimit.requestsPerMinute,
        min: 5,
        max: 120,
        createUpdate: (requestsPerMinute) => ({
          rateLimit: { requestsPerMinute },
        }),
      }),
  })
  const burstField = useDeferredPreferenceField({
    savedValue: String(preferences.rateLimit.burst),
    savedVersion,
    onCommit: (draft) =>
      commitNumericInput(draft, {
        persistedValue: preferences.rateLimit.burst,
        min: 1,
        max: 20,
        createUpdate: (burst) => ({
          rateLimit: { burst },
        }),
      }),
  })

  const handleOpenGlobalChannelModelFilters = () => {
    startSettingsAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelFilters,
    ).complete(PRODUCT_ANALYTICS_RESULTS.Success)

    const currentFilters = preferences.globalChannelModelFilters ?? []
    resetEditor(currentFilters)
    setIsGlobalChannelModelFiltersDialogOpen(true)
  }

  const handleCloseGlobalChannelModelFilters = () => {
    if (isSavingGlobalChannelModelFilters) {
      return
    }
    setIsGlobalChannelModelFiltersDialogOpen(false)
  }

  const handleSaveGlobalChannelModelFilters = async () => {
    let rulesToSave: EditableFilter[]

    if (viewMode === "json") {
      try {
        rulesToSave = parseJsonFilters(jsonText)
      } catch (error) {
        toast.error(
          t("managedSiteChannels:filters.messages.jsonInvalid", {
            error: getErrorMessage(error),
          }),
        )
        return
      }
    } else {
      rulesToSave = globalChannelModelFiltersDraft
    }

    const validationError = validateGlobalChannelModelFilters(rulesToSave)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSavingGlobalChannelModelFilters(true)

    try {
      const payload = normalizeChannelFilters(
        rulesToSave.map((filter) => ({
          ...filter,
          name: filter.name.trim(),
          description: filter.description?.trim() || undefined,
        })),
        {
          idPrefix: "global-channel-filter",
        },
      )

      const saved = await savePreferences({
        globalChannelModelFilters: payload,
      })
      if (!saved) {
        return
      }
      setGlobalChannelModelFiltersDraft(payload)
      toast.success(t("managedSiteChannels:filters.messages.saved"))
      setIsGlobalChannelModelFiltersDialogOpen(false)
    } catch (error) {
      toast.error(
        t("managedSiteChannels:filters.messages.saveFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsSavingGlobalChannelModelFilters(false)
    }
  }

  const handleNavigateToExecution = () => {
    startSettingsAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelModelSync,
    ).complete(PRODUCT_ANALYTICS_RESULTS.Success)

    // Navigate to the ManagedSiteModelSync page
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC}`)
  }

  const resetDisabled =
    matchesDefaultSettings(rawPrefs, DEFAULT_MODEL_SYNC_PREFERENCES) &&
    ![
      intervalHoursField,
      concurrencyField,
      maxRetriesField,
      channelProcessingTimeoutField,
      requestsPerMinuteField,
      burstField,
    ].some((field) => field.isDirty) &&
    matchesDefaultSettings(
      globalChannelModelFiltersDraft,
      DEFAULT_MODEL_SYNC_PREFERENCES.globalChannelModelFilters,
    )

  const handleReset = async () => {
    const tracker = startSettingsAnalyticsAction(
      PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteModelSyncSettings,
    )
    const result = await resetNewApiModelSyncConfig()
    if (result.ok) {
      const defaults = DEFAULT_MODEL_SYNC_PREFERENCES
      intervalHoursField.setDraft(String(defaults.interval / (60 * 60 * 1000)))
      concurrencyField.setDraft(String(defaults.concurrency))
      maxRetriesField.setDraft(String(defaults.maxRetries))
      channelProcessingTimeoutField.setDraft(
        String(defaults.channelProcessingTimeout),
      )
      requestsPerMinuteField.setDraft(
        String(defaults.rateLimit.requestsPerMinute),
      )
      burstField.setDraft(String(defaults.rateLimit.burst))
      setGlobalChannelModelFiltersDraft(defaults.globalChannelModelFilters)
    }
    tracker.complete(
      result.ok
        ? PRODUCT_ANALYTICS_RESULTS.Success
        : PRODUCT_ANALYTICS_RESULTS.Failure,
    )
    return result
  }

  return {
    channelProcessingTimeoutMaxSeconds: CHANNEL_PROCESSING_TIMEOUT_MAX_SECONDS,
    channelUpstreamModelOptions,
    optionsLoading,
    optionsError,
    preferences,
    isGlobalChannelModelFiltersDialogOpen,
    globalChannelModelFiltersDraft,
    jsonText,
    setJsonText,
    viewMode,
    showVisual,
    showJson,
    handleGlobalFilterFieldChange,
    handleAddGlobalFilter,
    handleRemoveGlobalFilter,
    handleMoveGlobalFilter,
    isSavingGlobalChannelModelFilters,
    savePreferences,
    intervalHoursField,
    concurrencyField,
    maxRetriesField,
    channelProcessingTimeoutField,
    requestsPerMinuteField,
    burstField,
    handleOpenGlobalChannelModelFilters,
    handleCloseGlobalChannelModelFilters,
    handleSaveGlobalChannelModelFilters,
    handleNavigateToExecution,
    resetDisabled,
    handleReset,
  }
}
