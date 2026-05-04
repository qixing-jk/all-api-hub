import type { TFunction } from "i18next"
import { useEffect, useState } from "react"
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
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { normalizeChannelFilters } from "~/services/managedSites/channelModelFilterRules"
import { modelMetadataService } from "~/services/models/modelMetadata"
import type { ModelMetadata } from "~/services/models/modelMetadata/types"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { isProbeChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedSiteModelSyncPreferences } from "~/types/managedSiteModelSync"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { pushWithinOptionsPage } from "~/utils/navigation"

type UserManagedSiteModelSyncConfig = NonNullable<
  typeof DEFAULT_PREFERENCES.managedSiteModelSync
>

type EditableFilter = ChannelModelFilterRule

/**
 * Unified logger scoped to the Managed Site model sync settings section.
 */
const logger = createLogger("ManagedSiteModelSyncSettings")

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
  const [isSaving, setIsSaving] = useState(false)
  const [channelUpstreamModelOptions, setChannelUpstreamModelOptions] =
    useState<CompactMultiSelectOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  // Convert from persisted user prefs to ManagedSiteModelSyncPreferences format
  const rawPrefs = userPrefs?.managedSiteModelSync ?? userPrefs?.newApiModelSync
  const preferences: ManagedSiteModelSyncPreferences = rawPrefs
    ? {
        enableSync: rawPrefs.enabled,
        intervalMs: rawPrefs.interval,
        concurrency: rawPrefs.concurrency,
        maxRetries: rawPrefs.maxRetries,
        rateLimit: rawPrefs.rateLimit,
        allowedModels: rawPrefs.allowedModels ?? [],
        globalChannelModelFilters: rawPrefs.globalChannelModelFilters ?? [],
      }
    : {
        enableSync: DEFAULT_PREFERENCES.managedSiteModelSync?.enabled ?? false,
        intervalMs:
          DEFAULT_PREFERENCES.managedSiteModelSync?.interval ??
          24 * 60 * 60 * 1000,
        concurrency: DEFAULT_PREFERENCES.managedSiteModelSync?.concurrency ?? 2,
        maxRetries: DEFAULT_PREFERENCES.managedSiteModelSync?.maxRetries ?? 2,
        rateLimit: DEFAULT_PREFERENCES.managedSiteModelSync?.rateLimit ?? {
          requestsPerMinute: 20,
          burst: 5,
        },
        allowedModels:
          DEFAULT_PREFERENCES.managedSiteModelSync?.allowedModels ?? [],
        globalChannelModelFilters:
          DEFAULT_PREFERENCES.managedSiteModelSync?.globalChannelModelFilters ??
          [],
      }

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

        const response = await sendRuntimeMessage({
          action: RuntimeActionIds.ModelSyncGetChannelUpstreamModelOptions,
        })

        if (
          response?.success &&
          Array.isArray(response.data) &&
          response.data.length > 0
        ) {
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
    updates: Partial<ManagedSiteModelSyncPreferences>,
  ) => {
    try {
      setIsSaving(true)

      // Convert to UserPreferences.modelSync format
      const userPrefsUpdate: Partial<UserManagedSiteModelSyncConfig> = {}
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

      const success = await updateNewApiModelSync(userPrefsUpdate)

      if (!success) {
        toast.error(t("settings:messages.saveSettingsFailed"))
        return false
      } else if (!updates.globalChannelModelFilters) {
        // Avoid double toast when saving from the global filters dialog,
        // which already shows a dedicated success message.
        toast.success(t("managedSiteModelSync:messages.success.settingsSaved"))
      }
      return true
    } catch (error) {
      logger.error("Failed to save preferences", error)
      toast.error(t("settings:messages.saveSettingsFailed"))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenGlobalChannelModelFilters = () => {
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
              probeIds: ["text-generation"],
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
            probeIds: ["text-generation"],
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
      const payload = rulesToSave.map((filter) => ({
        ...filter,
        name: filter.name.trim(),
        description: filter.description?.trim() || undefined,
      }))

      const success = await savePreferences({
        globalChannelModelFilters: payload,
      })
      if (!success) {
        return
      }
      setGlobalChannelModelFiltersDraft(rulesToSave)
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
    // Navigate to the ManagedSiteModelSync page
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC}`)
  }

  return (
    <SettingSection
      id="managed-site-model-sync"
      title={t("managedSiteModelSync:settings.title")}
      description={t("managedSiteModelSync:description")}
      onReset={async () => {
        const result = await resetNewApiModelSyncConfig()
        if (result) {
          setIsSaving(false)
        }
        return result
      }}
    >
      <Card padding="none">
        <CardList>
          {/* Enable Auto-Sync */}
          <CardItem
            title={t("managedSiteModelSync:settings.enable")}
            description={t("managedSiteModelSync:settings.enableDesc")}
            rightContent={
              <Switch
                checked={preferences.enableSync}
                onChange={(checked) =>
                  void savePreferences({ enableSync: checked })
                }
                disabled={isSaving}
              />
            }
          />

          {/* Sync Interval */}
          <CardItem
            title={t("managedSiteModelSync:settings.interval")}
            description={t("managedSiteModelSync:settings.intervalDesc")}
            rightContent={
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="720"
                  value={String(preferences.intervalMs / (1000 * 60 * 60))}
                  onChange={(e) => {
                    const hours = parseFloat(e.target.value)
                    if (hours > 0) {
                      void savePreferences({
                        intervalMs: hours * 60 * 60 * 1000,
                      })
                    }
                  }}
                  disabled={isSaving}
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
            title={t("managedSiteModelSync:settings.concurrency")}
            description={t("managedSiteModelSync:settings.concurrencyDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="10"
                value={String(preferences.concurrency)}
                onChange={(e) => {
                  const concurrency = parseInt(e.target.value)
                  if (
                    Number.isFinite(concurrency) &&
                    concurrency >= 1 &&
                    concurrency <= 10
                  ) {
                    void savePreferences({ concurrency })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Max Retries */}
          <CardItem
            title={t("managedSiteModelSync:settings.maxRetries")}
            description={t("managedSiteModelSync:settings.maxRetriesDesc")}
            rightContent={
              <Input
                type="number"
                min="0"
                max="5"
                value={String(preferences.maxRetries)}
                onChange={(e) => {
                  const maxRetries = parseInt(e.target.value)
                  if (
                    Number.isFinite(maxRetries) &&
                    maxRetries >= 0 &&
                    maxRetries <= 5
                  ) {
                    void savePreferences({ maxRetries })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Rate Limit - Requests per Minute */}
          <CardItem
            title={t("managedSiteModelSync:settings.requestsPerMinute")}
            description={t(
              "managedSiteModelSync:settings.requestsPerMinuteDesc",
            )}
            rightContent={
              <Input
                type="number"
                min="5"
                max="120"
                value={String(preferences.rateLimit.requestsPerMinute)}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (Number.isFinite(value) && value >= 5 && value <= 120) {
                    void savePreferences({
                      rateLimit: {
                        ...preferences.rateLimit,
                        requestsPerMinute: value,
                      },
                    })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Rate Limit - Burst */}
          <CardItem
            title={t("managedSiteModelSync:settings.burst")}
            description={t("managedSiteModelSync:settings.burstDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="20"
                value={String(preferences.rateLimit.burst)}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (Number.isFinite(value) && value >= 1 && value <= 20) {
                    void savePreferences({
                      rateLimit: {
                        ...preferences.rateLimit,
                        burst: value,
                      },
                    })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Allowed Models */}
          <CardItem
            title={t("managedSiteModelSync:settings.allowedModels")}
            description={t("managedSiteModelSync:settings.allowedModelsDesc")}
          >
            <div className="w-full space-y-2">
              <CompactMultiSelect
                allowCustom
                options={channelUpstreamModelOptions}
                selected={preferences.allowedModels}
                placeholder={t(
                  "managedSiteModelSync:settings.allowedModelsPlaceholder",
                )}
                onChange={(values) => {
                  void savePreferences({ allowedModels: values })
                }}
                disabled={isSaving || optionsLoading}
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
            title={t("managedSiteModelSync:settings.globalChannelModelFilters")}
            description={t(
              "managedSiteModelSync:settings.globalChannelModelFiltersDesc",
            )}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenGlobalChannelModelFilters}
                disabled={isSaving}
              >
                {t(
                  "managedSiteModelSync:settings.globalChannelModelFiltersButton",
                )}
              </Button>
            }
          />

          {/* View Execution Button */}
          <CardItem
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
              disabled={isSavingGlobalChannelModelFilters}
              loading={isSavingGlobalChannelModelFilters}
            >
              {t("managedSiteChannels:filters.actions.save")}
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
