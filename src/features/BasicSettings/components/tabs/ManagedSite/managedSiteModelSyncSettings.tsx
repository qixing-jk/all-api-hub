import type { TFunction } from "i18next"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import ChannelFiltersEditor from "~/components/ChannelFiltersEditor"
import type { EditableFilterField } from "~/components/ChannelFiltersEditor"
import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardItem,
  CardList,
  CompactMultiSelect,
  Input,
  Modal,
  Switch,
  WorkflowTransitionButton,
  type CompactMultiSelectOption,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useDeferredPreferenceField } from "~/hooks/useDeferredPreferenceField"
import { normalizeChannelFilters } from "~/services/managedSites/channelModelFilterRules"
import { modelMetadataService } from "~/services/models/modelMetadata"
import type { ModelMetadata } from "~/services/models/modelMetadata/types"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
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
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import {
  DEFAULT_CHANNEL_MODEL_FILTER_PROBE_IDS,
  isProbeChannelModelFilterRule,
} from "~/types/channelModelFilters"
import type { ManagedSiteModelSyncPreferences } from "~/types/managedSiteModelSync"
import type { PartialWithNested } from "~/types/utils"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { getPreferenceWriteFailureMessage } from "~/utils/core/toastHelpers"
import { pushWithinOptionsPage } from "~/utils/navigation"

import { MANAGED_SITE_MODEL_SYNC_CHANNEL_PROCESSING_TIMEOUT_TARGET_ID } from "./managedSiteModelSyncTargetIds"

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
 * Moves a filter one position up or down within the editable filter list.
 */
function moveFilterById(
  filters: EditableFilter[],
  filterId: string,
  direction: "up" | "down",
) {
  const index = filters.findIndex((filter) => filter.id === filterId)
  if (index < 0) {
    return filters
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= filters.length) {
    return filters
  }

  const next = [...filters]
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
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

/**
 * Render the Managed Site Model Sync settings UI and manage its local state and interactions.
 *
 * This component displays controls for enabling auto-sync, adjusting interval, concurrency,
 * retries and rate limits, selecting allowed models (loaded from model metadata), and navigating
 * to the sync execution view. It loads model metadata on mount, persists preference changes via
 * the user preferences context, and shows success/error toasts for save operations.
 * @returns The settings section React element for configuring Managed Site Model Sync.
 */
export default function ManagedSiteModelSyncSettings() {
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
  const [channelUpstreamModelOptions, setChannelUpstreamModelOptions] =
    useState<CompactMultiSelectOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState<string | null>(null)

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
  const [globalChannelModelFiltersDraft, setGlobalChannelModelFiltersDraft] =
    useState<EditableFilter[]>([])
  const [
    isSavingGlobalChannelModelFilters,
    setIsSavingGlobalChannelModelFilters,
  ] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual")

  useEffect(() => {
    let isMounted = true
    const loadChannelUpstreamOptions = async () => {
      try {
        setOptionsLoading(true)
        setOptionsError(null)

        const response = await sendModelSyncMessage(
          ModelSyncMessageTypes.GetChannelUpstreamModelOptions,
        )

        if (response?.success && Array.isArray(response.data)) {
          if (isMounted) {
            setChannelUpstreamModelOptions(buildOptionsFromIds(response.data))
          }
          return
        }

        await modelMetadataService.initialize()
        const models = modelMetadataService.getAllMetadata()
        if (isMounted) {
          setChannelUpstreamModelOptions(buildModelOptions(models))
        }
      } catch (error: any) {
        logger.error("Failed to load allowed model options", error)
        if (isMounted) {
          setOptionsError(error?.message || "Unknown error")
          setChannelUpstreamModelOptions([])
        }
      } finally {
        if (isMounted) {
          setOptionsLoading(false)
        }
      }
    }

    void loadChannelUpstreamOptions()

    return () => {
      isMounted = false
    }
  }, [])

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
    setGlobalChannelModelFiltersDraft(currentFilters)
    try {
      setJsonText(JSON.stringify(currentFilters, null, 2))
    } catch {
      setJsonText("")
    }
    setViewMode("visual")
    setIsGlobalChannelModelFiltersDialogOpen(true)
  }

  const handleCloseGlobalChannelModelFilters = () => {
    if (isSavingGlobalChannelModelFilters) {
      return
    }
    setIsGlobalChannelModelFiltersDialogOpen(false)
  }

  const handleGlobalFilterFieldChange = (
    id: string,
    field: EditableFilterField,
    value: any,
  ) => {
    setGlobalChannelModelFiltersDraft((prev) =>
      prev.map((filter) => {
        if (filter.id !== id) {
          return filter
        }

        if (field === "kind") {
          if (value === "probe") {
            return {
              id: filter.id,
              name: filter.name,
              description: filter.description,
              kind: "probe",
              probeIds: [...DEFAULT_CHANNEL_MODEL_FILTER_PROBE_IDS],
              match: "all",
              action: filter.action,
              enabled: filter.enabled,
              createdAt: filter.createdAt,
              updatedAt: Date.now(),
            }
          }

          return {
            id: filter.id,
            name: filter.name,
            description: filter.description,
            kind: "pattern",
            pattern: "",
            isRegex: false,
            action: filter.action,
            enabled: filter.enabled,
            createdAt: filter.createdAt,
            updatedAt: Date.now(),
          }
        }

        return {
          ...filter,
          [field]: value,
          updatedAt: Date.now(),
        }
      }),
    )
  }

  const handleAddGlobalFilter = (kind: "pattern" | "probe" = "pattern") => {
    const now = Date.now()
    const base = {
      id: safeRandomUUID("global-channel-filter"),
      name: "",
      action: "include" as const,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      description: "",
    }
    const newFilter: EditableFilter =
      kind === "probe"
        ? {
            ...base,
            kind: "probe",
            probeIds: [...DEFAULT_CHANNEL_MODEL_FILTER_PROBE_IDS],
            match: "all",
          }
        : {
            ...base,
            kind: "pattern",
            pattern: "",
            isRegex: false,
          }
    setGlobalChannelModelFiltersDraft((prev) => [...prev, newFilter])
  }

  const handleRemoveGlobalFilter = (id: string) => {
    setGlobalChannelModelFiltersDraft((prev) =>
      prev.filter((filter) => filter.id !== id),
    )
  }

  const handleMoveGlobalFilter = (id: string, direction: "up" | "down") => {
    setGlobalChannelModelFiltersDraft((prev) =>
      moveFilterById(prev, id, direction),
    )
  }

  const validateGlobalChannelModelFilters = (
    rules: EditableFilter[],
  ): string | undefined => {
    for (const filter of rules) {
      const name = filter.name.trim()

      if (!name) {
        return t("managedSiteChannels:filters.messages.validationName")
      }

      if (isProbeChannelModelFilterRule(filter)) {
        if (filter.probeIds.length === 0) {
          return t("managedSiteChannels:filters.messages.validationProbeIds")
        }
        continue
      }

      const pattern = filter.pattern.trim()
      if (!pattern) {
        return t("managedSiteChannels:filters.messages.validationPattern")
      }

      if (filter.isRegex) {
        try {
          new RegExp(pattern)
        } catch (error) {
          return t("managedSiteChannels:filters.messages.validationRegex", {
            error: getErrorMessage(error),
          })
        }
      }
    }

    return undefined
  }

  const handleSaveGlobalChannelModelFilters = async () => {
    let rulesToSave: EditableFilter[]

    if (viewMode === "json") {
      try {
        rulesToSave = parseJsonGlobalChannelModelFilters(t, jsonText)
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

  return (
    <SettingSection
      id="managed-site-model-sync"
      title={t("managedSiteModelSync:settings.title")}
      description={t("managedSiteModelSync:description")}
      onReset={async () => {
        const tracker = startSettingsAnalyticsAction(
          PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteModelSyncSettings,
        )
        const result = await resetNewApiModelSyncConfig()
        tracker.complete(
          result.ok
            ? PRODUCT_ANALYTICS_RESULTS.Success
            : PRODUCT_ANALYTICS_RESULTS.Failure,
        )
        return result
      }}
    >
      <Card padding="none">
        <CardList>
          {/* Enable Auto-Sync */}
          <CardItem
            id="managed-site-model-sync-enable"
            title={t("managedSiteModelSync:settings.enable")}
            description={t("managedSiteModelSync:settings.enableDesc")}
            rightContent={
              <Switch
                checked={preferences.enableSync}
                onChange={(checked) =>
                  void savePreferences({ enableSync: checked })
                }
              />
            }
          />

          {/* Sync Interval */}
          <CardItem
            id="managed-site-model-sync-interval"
            title={t("managedSiteModelSync:settings.interval")}
            description={t("managedSiteModelSync:settings.intervalDesc")}
            rightContent={
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="720"
                  step="any"
                  value={intervalHoursField.draft}
                  onChange={(event) =>
                    intervalHoursField.setDraft(event.target.value)
                  }
                  onBlur={() => void intervalHoursField.commit()}
                  onKeyDown={intervalHoursField.handleKeyDown}
                  placeholder={String(
                    preferences.intervalMs / (1000 * 60 * 60),
                  )}
                  aria-label={t("managedSiteModelSync:settings.interval")}
                  disabled={intervalHoursField.isCommitting}
                  className="w-24"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t("managedSiteModelSync:settings.intervalUnit")}
                </span>
              </div>
            }
          />

          {/* Concurrency */}
          <CardItem
            id="managed-site-model-sync-concurrency"
            title={t("managedSiteModelSync:settings.concurrency")}
            description={t("managedSiteModelSync:settings.concurrencyDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="10"
                step="1"
                value={concurrencyField.draft}
                onChange={(event) =>
                  concurrencyField.setDraft(event.target.value)
                }
                onBlur={() => void concurrencyField.commit()}
                onKeyDown={concurrencyField.handleKeyDown}
                placeholder={String(preferences.concurrency)}
                aria-label={t("managedSiteModelSync:settings.concurrency")}
                disabled={concurrencyField.isCommitting}
                className="w-24"
              />
            }
          />

          {/* Max Retries */}
          <CardItem
            id="managed-site-model-sync-max-retries"
            title={t("managedSiteModelSync:settings.maxRetries")}
            description={t("managedSiteModelSync:settings.maxRetriesDesc")}
            rightContent={
              <Input
                type="number"
                min="0"
                max="5"
                step="1"
                value={maxRetriesField.draft}
                onChange={(event) =>
                  maxRetriesField.setDraft(event.target.value)
                }
                onBlur={() => void maxRetriesField.commit()}
                onKeyDown={maxRetriesField.handleKeyDown}
                placeholder={String(preferences.maxRetries)}
                aria-label={t("managedSiteModelSync:settings.maxRetries")}
                disabled={maxRetriesField.isCommitting}
                className="w-24"
              />
            }
          />

          {/* Per-Channel Timeout */}
          <CardItem
            id={MANAGED_SITE_MODEL_SYNC_CHANNEL_PROCESSING_TIMEOUT_TARGET_ID}
            title={t("managedSiteModelSync:settings.channelProcessingTimeout")}
            description={t(
              "managedSiteModelSync:settings.channelProcessingTimeoutDesc",
            )}
            rightContent={
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max={String(CHANNEL_PROCESSING_TIMEOUT_MAX_SECONDS)}
                  step="1"
                  value={channelProcessingTimeoutField.draft}
                  onChange={(event) =>
                    channelProcessingTimeoutField.setDraft(event.target.value)
                  }
                  onBlur={() => void channelProcessingTimeoutField.commit()}
                  onKeyDown={channelProcessingTimeoutField.handleKeyDown}
                  placeholder={String(preferences.channelProcessingTimeout)}
                  aria-label={t(
                    "managedSiteModelSync:settings.channelProcessingTimeout",
                  )}
                  disabled={channelProcessingTimeoutField.isCommitting}
                  className="w-24"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t(
                    "managedSiteModelSync:settings.channelProcessingTimeoutUnit",
                  )}
                </span>
              </div>
            }
          />

          {/* Rate Limit - Requests per Minute */}
          <CardItem
            id="managed-site-model-sync-requests-per-minute"
            title={t("managedSiteModelSync:settings.requestsPerMinute")}
            description={t(
              "managedSiteModelSync:settings.requestsPerMinuteDesc",
            )}
            rightContent={
              <Input
                type="number"
                min="5"
                max="120"
                step="1"
                value={requestsPerMinuteField.draft}
                onChange={(event) =>
                  requestsPerMinuteField.setDraft(event.target.value)
                }
                onBlur={() => void requestsPerMinuteField.commit()}
                onKeyDown={requestsPerMinuteField.handleKeyDown}
                placeholder={String(preferences.rateLimit.requestsPerMinute)}
                aria-label={t(
                  "managedSiteModelSync:settings.requestsPerMinute",
                )}
                disabled={requestsPerMinuteField.isCommitting}
                className="w-24"
              />
            }
          />

          {/* Rate Limit - Burst */}
          <CardItem
            id="managed-site-model-sync-burst"
            title={t("managedSiteModelSync:settings.burst")}
            description={t("managedSiteModelSync:settings.burstDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="20"
                step="1"
                value={burstField.draft}
                onChange={(event) => burstField.setDraft(event.target.value)}
                onBlur={() => void burstField.commit()}
                onKeyDown={burstField.handleKeyDown}
                placeholder={String(preferences.rateLimit.burst)}
                aria-label={t("managedSiteModelSync:settings.burst")}
                disabled={burstField.isCommitting}
                className="w-24"
              />
            }
          />

          {/* Allowed Models */}
          <CardItem
            id="managed-site-model-sync-allowed-models"
            title={t("managedSiteModelSync:settings.allowedModels")}
            description={t("managedSiteModelSync:settings.allowedModelsDesc")}
          >
            <div className="w-full space-y-2">
              <CompactMultiSelect
                allowCustom
                options={channelUpstreamModelOptions}
                selected={preferences.allowedModels}
                size="default"
                placeholder={t(
                  "managedSiteModelSync:settings.allowedModelsPlaceholder",
                )}
                onChange={(values) => {
                  void savePreferences({ allowedModels: values })
                }}
                disabled={optionsLoading}
              />
              {optionsLoading ? (
                <p className="text-xs text-gray-500">
                  {t("managedSiteModelSync:settings.allowedModelsLoading")}
                </p>
              ) : optionsError ? (
                <p className="text-xs text-red-500">
                  {t("managedSiteModelSync:settings.allowedModelsLoadFailed", {
                    error: optionsError,
                  })}
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("managedSiteModelSync:settings.allowedModelsHint")}
                </p>
              )}
            </div>
          </CardItem>

          {/* Global Filters */}
          <CardItem
            id="managed-site-model-sync-global-channel-model-filters"
            title={t("managedSiteModelSync:settings.globalChannelModelFilters")}
            description={t(
              "managedSiteModelSync:settings.globalChannelModelFiltersDesc",
            )}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenGlobalChannelModelFilters}
              >
                {t(
                  "managedSiteModelSync:settings.globalChannelModelFiltersButton",
                )}
              </Button>
            }
          />

          {/* View Execution Button */}
          <CardItem
            id="managed-site-model-sync-view-execution"
            title={t("managedSiteModelSync:settings.viewExecution")}
            description={t("managedSiteModelSync:settings.viewExecutionDesc")}
            rightContent={
              <WorkflowTransitionButton
                onClick={handleNavigateToExecution}
                variant="default"
                size="sm"
                className="flex items-center gap-2"
              >
                <span>
                  {t("managedSiteModelSync:settings.viewExecutionButton")}
                </span>
              </WorkflowTransitionButton>
            }
          />
        </CardList>
      </Card>

      <Modal
        isOpen={isGlobalChannelModelFiltersDialogOpen}
        onClose={handleCloseGlobalChannelModelFilters}
        size="lg"
        panelClassName="max-h-[85vh]"
        header={
          <div>
            <p className="text-base font-semibold">
              {t(
                "managedSiteModelSync:settings.globalChannelModelFiltersDialogTitle",
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              {t(
                "managedSiteModelSync:settings.globalChannelModelFiltersDialogSubtitle",
              )}
            </p>
          </div>
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseGlobalChannelModelFilters}
              disabled={isSavingGlobalChannelModelFilters}
            >
              {t("managedSiteChannels:filters.actions.cancel")}
            </Button>
            <Button
              onClick={handleSaveGlobalChannelModelFilters}
              loading={isSavingGlobalChannelModelFilters}
            >
              {isSavingGlobalChannelModelFilters
                ? t("common:status.saving")
                : t("managedSiteChannels:filters.actions.save")}
            </Button>
          </div>
        }
      >
        <ChannelFiltersEditor
          filters={globalChannelModelFiltersDraft}
          viewMode={viewMode}
          jsonText={jsonText}
          isLoading={false}
          onAddFilter={handleAddGlobalFilter}
          onMoveFilter={handleMoveGlobalFilter}
          onRemoveFilter={handleRemoveGlobalFilter}
          onFieldChange={handleGlobalFilterFieldChange}
          onClickViewVisual={() => {
            if (viewMode === "visual") return
            try {
              const parsed = jsonText.trim()
                ? parseJsonGlobalChannelModelFilters(t, jsonText)
                : []
              setGlobalChannelModelFiltersDraft(parsed)
              setViewMode("visual")
            } catch (error) {
              toast.error(
                t("managedSiteChannels:filters.messages.jsonInvalid", {
                  error: getErrorMessage(error),
                }),
              )
            }
          }}
          onClickViewJson={() => {
            if (viewMode === "json") return
            try {
              setJsonText(
                JSON.stringify(globalChannelModelFiltersDraft, null, 2),
              )
            } catch {
              setJsonText("")
            }
            setViewMode("json")
          }}
          onChangeJsonText={setJsonText}
        />
      </Modal>
    </SettingSection>
  )
}

/**
 * Parses JSON text into strongly typed global channel model filters.
 * @param t Translation helper for user-facing validation errors.
 * @param rawJson Raw JSON string entered by the user.
 * @returns Parsed filters array guaranteeing id/name/pattern fields.
 * @throws {Error} When JSON is invalid or missing required fields.
 */
function parseJsonGlobalChannelModelFilters(
  t: TFunction,
  rawJson: string,
): EditableFilter[] {
  const trimmed = rawJson.trim()
  if (!trimmed) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }

  if (!Array.isArray(parsed)) {
    throw new Error(t("managedSiteChannels:filters.messages.jsonArrayRequired"))
  }

  parsed.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(
        t("managedSiteChannels:filters.messages.jsonItemNotObject", { index }),
      )
    }
  })

  return normalizeChannelFilters(parsed as any[], {
    idPrefix: "global-channel-filter",
  })
}

/**
 * Builds sorted multi-select options from an array of model metadata.
 * @param metadata Array of model metadata objects to convert into select options.
 * @returns Options consumable by compact multi-select inputs.
 */
function buildModelOptions(
  metadata: ModelMetadata[],
): CompactMultiSelectOption[] {
  const options = metadata.map((model) => ({
    label: model.id,
    value: model.id,
  }))
  return options.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Converts plain model ID strings into sorted compact multi-select options.
 * @param modelIds Array of model identifiers returned from remote APIs.
 * @returns Options list sorted alphabetically by label.
 */
function buildOptionsFromIds(modelIds: string[]): CompactMultiSelectOption[] {
  const options = modelIds
    .map((model) => model.trim())
    .filter(Boolean)
    .map((model) => ({
      label: model,
      value: model,
    }))

  return options.sort((a, b) => a.label.localeCompare(b.label))
}
