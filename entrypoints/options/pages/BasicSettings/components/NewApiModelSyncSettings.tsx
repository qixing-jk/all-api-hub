import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline"
import { Plus, Settings2, Trash2 } from "lucide-react"
import { nanoid } from "nanoid"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardItem,
  CardList,
  Input,
  Label,
  Modal,
  MultiSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  type MultiSelectOption,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { modelMetadataService } from "~/services/modelMetadata"
import type { ModelMetadata } from "~/services/modelMetadata/types"
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { NewApiModelSyncPreferences } from "~/types/newApiModelSync"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { navigateWithinOptionsPage } from "~/utils/navigation"

type UserNewApiModelSyncConfig = NonNullable<
  typeof DEFAULT_PREFERENCES.newApiModelSync
>

/**
 * Render the New API Model Sync settings UI and manage its local state and interactions.
 *
 * This component displays controls for enabling auto-sync, adjusting interval, concurrency,
 * retries and rate limits, selecting allowed models (loaded from model metadata), and navigating
 * to the sync execution view. It loads model metadata on mount, persists preference changes via
 * the user preferences context, and shows success/error toasts for save operations.
 *
 * @returns The settings section React element for configuring New API Model Sync.
 */
type EditableFilter = ChannelModelFilterRule

export default function NewApiModelSyncSettings() {
  const { t } = useTranslation([
    "newApiModelSync",
    "settings",
    "newApiChannels",
    "common",
  ])
  const {
    preferences: userPrefs,
    updateNewApiModelSync,
    resetNewApiModelSyncConfig,
  } = useUserPreferencesContext()
  const [isSaving, setIsSaving] = useState(false)
  const [channelUpstreamModelOptions, setChannelUpstreamModelOptions] =
    useState<MultiSelectOption[]>([])
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  // Convert from UserPreferences.newApiModelSync to NewApiModelSyncPreferences format
  const rawPrefs = userPrefs?.newApiModelSync
  const preferences: NewApiModelSyncPreferences = rawPrefs
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
        enableSync: DEFAULT_PREFERENCES.newApiModelSync?.enabled ?? false,
        intervalMs:
          DEFAULT_PREFERENCES.newApiModelSync?.interval ?? 24 * 60 * 60 * 1000,
        concurrency: DEFAULT_PREFERENCES.newApiModelSync?.concurrency ?? 2,
        maxRetries: DEFAULT_PREFERENCES.newApiModelSync?.maxRetries ?? 2,
        rateLimit: DEFAULT_PREFERENCES.newApiModelSync?.rateLimit ?? {
          requestsPerMinute: 20,
          burst: 5,
        },
        allowedModels: DEFAULT_PREFERENCES.newApiModelSync?.allowedModels ?? [],
        globalChannelModelFilters:
          DEFAULT_PREFERENCES.newApiModelSync?.globalChannelModelFilters ?? [],
      }

  const [
    isglobalChannelModelFiltersDialogOpen,
    setIsglobalChannelModelFiltersDialogOpen,
  ] = useState(false)
  const [globalChannelModelFiltersDraft, setglobalChannelModelFiltersDraft] =
    useState<EditableFilter[]>([])
  const [
    isSavingglobalChannelModelFilters,
    setIsSavingglobalChannelModelFilters,
  ] = useState(false)

  useEffect(() => {
    let isMounted = true
    const loadChannelUpstreamOptions = async () => {
      try {
        setOptionsLoading(true)
        setOptionsError(null)

        const response = await sendRuntimeMessage({
          action: "newApiModelSync:getChannelUpstreamModelOptions",
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
        console.error("Failed to load allowed model options", error)
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
    updates: Partial<NewApiModelSyncPreferences>,
  ) => {
    try {
      setIsSaving(true)

      // Convert to UserPreferences.newApiModelSync format
      const userPrefsUpdate: Partial<UserNewApiModelSyncConfig> = {}
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
      } else if (!updates.globalChannelModelFilters) {
        // Avoid double toast when saving from the global filters dialog,
        // which already shows a dedicated success message.
        toast.success(t("newApiModelSync:messages.success.settingsSaved"))
      }
    } catch (error) {
      console.error("Failed to save preferences:", error)
      toast.error(t("settings:messages.saveSettingsFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpenglobalChannelModelFilters = () => {
    setglobalChannelModelFiltersDraft(
      preferences.globalChannelModelFilters ?? [],
    )
    setIsglobalChannelModelFiltersDialogOpen(true)
  }

  const handleCloseglobalChannelModelFilters = () => {
    if (isSavingglobalChannelModelFilters) {
      return
    }
    setIsglobalChannelModelFiltersDialogOpen(false)
  }

  const handleGlobalFilterFieldChange = (
    id: string,
    field: keyof EditableFilter,
    value: any,
  ) => {
    setglobalChannelModelFiltersDraft((prev) =>
      prev.map((filter) =>
        filter.id === id
          ? {
              ...filter,
              [field]: value,
              updatedAt: Date.now(),
            }
          : filter,
      ),
    )
  }

  const handleAddGlobalFilter = () => {
    const now = Date.now()
    const newFilter: EditableFilter = {
      id: nanoid(),
      name: "",
      pattern: "",
      isRegex: false,
      action: "include",
      enabled: true,
      createdAt: now,
      updatedAt: now,
      description: "",
    }
    setglobalChannelModelFiltersDraft((prev) => [...prev, newFilter])
  }

  const handleRemoveGlobalFilter = (id: string) => {
    setglobalChannelModelFiltersDraft((prev) =>
      prev.filter((filter) => filter.id !== id),
    )
  }

  const validateglobalChannelModelFilters = () => {
    for (const filter of globalChannelModelFiltersDraft) {
      const name = filter.name.trim()
      const pattern = filter.pattern.trim()

      if (!name) {
        return t("newApiChannels:filters.messages.validationName")
      }

      if (!pattern) {
        return t("newApiChannels:filters.messages.validationPattern")
      }

      if (filter.isRegex) {
        try {
          new RegExp(pattern)
        } catch (error) {
          return t("newApiChannels:filters.messages.validationRegex", {
            error: getErrorMessage(error),
          })
        }
      }
    }

    return undefined as string | undefined
  }

  const handleSaveglobalChannelModelFilters = async () => {
    const validationError = validateglobalChannelModelFilters()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSavingglobalChannelModelFilters(true)

    try {
      const payload = globalChannelModelFiltersDraft.map((filter) => ({
        ...filter,
        name: filter.name.trim(),
        pattern: filter.pattern.trim(),
        description: filter.description?.trim() || undefined,
      }))

      await savePreferences({ globalChannelModelFilters: payload })
      toast.success(t("newApiChannels:filters.messages.saved"))
      setIsglobalChannelModelFiltersDialogOpen(false)
    } catch (error) {
      toast.error(
        t("newApiChannels:filters.messages.saveFailed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsSavingglobalChannelModelFilters(false)
    }
  }

  const handleNavigateToExecution = () => {
    // Navigate to the NewApiModelSync page
    navigateWithinOptionsPage("#newApiModelSync")
  }

  return (
    <SettingSection
      id="new-api-model-sync"
      title={t("newApiModelSync:settings.title")}
      description={t("newApiModelSync:description")}
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
            title={t("newApiModelSync:settings.enable")}
            description={t("newApiModelSync:settings.enableDesc")}
            rightContent={
              <Switch
                checked={preferences.enableSync}
                onChange={(checked) => savePreferences({ enableSync: checked })}
                disabled={isSaving}
              />
            }
          />

          {/* Sync Interval */}
          <CardItem
            title={t("newApiModelSync:settings.interval")}
            description={t("newApiModelSync:settings.intervalDesc")}
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
                      savePreferences({
                        intervalMs: hours * 60 * 60 * 1000,
                      })
                    }
                  }}
                  disabled={isSaving}
                  className="w-24"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t("newApiModelSync:settings.intervalUnit")}
                </span>
              </div>
            }
          />

          {/* Concurrency */}
          <CardItem
            title={t("newApiModelSync:settings.concurrency")}
            description={t("newApiModelSync:settings.concurrencyDesc")}
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
                    savePreferences({ concurrency })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Max Retries */}
          <CardItem
            title={t("newApiModelSync:settings.maxRetries")}
            description={t("newApiModelSync:settings.maxRetriesDesc")}
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
                    savePreferences({ maxRetries })
                  }
                }}
                disabled={isSaving}
                className="w-24"
              />
            }
          />

          {/* Rate Limit - Requests per Minute */}
          <CardItem
            title={t("newApiModelSync:settings.requestsPerMinute")}
            description={t("newApiModelSync:settings.requestsPerMinuteDesc")}
            rightContent={
              <Input
                type="number"
                min="5"
                max="120"
                value={String(preferences.rateLimit.requestsPerMinute)}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (Number.isFinite(value) && value >= 5 && value <= 120) {
                    savePreferences({
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
            title={t("newApiModelSync:settings.burst")}
            description={t("newApiModelSync:settings.burstDesc")}
            rightContent={
              <Input
                type="number"
                min="1"
                max="20"
                value={String(preferences.rateLimit.burst)}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (Number.isFinite(value) && value >= 1 && value <= 20) {
                    savePreferences({
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
            title={t("newApiModelSync:settings.allowedModels")}
            description={t("newApiModelSync:settings.allowedModelsDesc")}
          >
            <div className="w-full space-y-2">
              <MultiSelect
                allowCustom
                options={channelUpstreamModelOptions}
                selected={preferences.allowedModels}
                placeholder={t(
                  "newApiModelSync:settings.allowedModelsPlaceholder",
                )}
                onChange={(values) => {
                  void savePreferences({ allowedModels: values })
                }}
                disabled={isSaving || optionsLoading}
              />
              {optionsLoading ? (
                <p className="text-xs text-gray-500">
                  {t("newApiModelSync:settings.allowedModelsLoading")}
                </p>
              ) : optionsError ? (
                <p className="text-xs text-red-500">
                  {t("newApiModelSync:settings.allowedModelsLoadFailed", {
                    error: optionsError,
                  })}
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("newApiModelSync:settings.allowedModelsHint")}
                </p>
              )}
            </div>
          </CardItem>

          {/* Global Filters */}
          <CardItem
            title={t("newApiModelSync:settings.globalChannelModelFilters")}
            description={t(
              "newApiModelSync:settings.globalChannelModelFiltersDesc",
            )}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenglobalChannelModelFilters}
                disabled={isSaving}
              >
                {t("newApiModelSync:settings.globalChannelModelFiltersButton")}
              </Button>
            }
          />

          {/* View Execution Button */}
          <CardItem
            title={t("newApiModelSync:settings.viewExecution")}
            description={t("newApiModelSync:settings.viewExecutionDesc")}
            rightContent={
              <Button
                onClick={handleNavigateToExecution}
                variant="default"
                size="sm"
                className="flex items-center gap-2"
                rightIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
              >
                <span>{t("newApiModelSync:settings.viewExecutionButton")}</span>
              </Button>
            }
          />
        </CardList>
      </Card>

      <Modal
        isOpen={isglobalChannelModelFiltersDialogOpen}
        onClose={handleCloseglobalChannelModelFilters}
        size="lg"
        panelClassName="max-h-[85vh]"
        header={
          <div>
            <p className="text-base font-semibold">
              {t(
                "newApiModelSync:settings.globalChannelModelFiltersDialogTitle",
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              {t(
                "newApiModelSync:settings.globalChannelModelFiltersDialogSubtitle",
              )}
            </p>
          </div>
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCloseglobalChannelModelFilters}
              disabled={isSavingglobalChannelModelFilters}
            >
              {t("newApiChannels:filters.actions.cancel")}
            </Button>
            <Button
              onClick={handleSaveglobalChannelModelFilters}
              disabled={isSavingglobalChannelModelFilters}
              loading={isSavingglobalChannelModelFilters}
            >
              {t("newApiChannels:filters.actions.save")}
            </Button>
          </div>
        }
      >
        {globalChannelModelFiltersDraft.length === 0 ? (
          <div className="text-center">
            <div className="bg-muted mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
              <Settings2 className="text-muted-foreground h-5 w-5" />
            </div>
            <p className="text-base font-semibold">
              {t("newApiChannels:filters.empty.title")}
            </p>
            <p className="text-muted-foreground mb-6 text-sm">
              {t("newApiChannels:filters.empty.description")}
            </p>
            <Button onClick={handleAddGlobalFilter}>
              {t("newApiChannels:filters.addRule")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {globalChannelModelFiltersDraft.map((filter) => (
              <div
                key={filter.id}
                className="border-border space-y-5 rounded-lg border p-5"
              >
                <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>{t("newApiChannels:filters.labels.name")}</Label>
                    <Input
                      value={filter.name}
                      onChange={(event) =>
                        handleGlobalFilterFieldChange(
                          filter.id,
                          "name",
                          event.target.value,
                        )
                      }
                      placeholder={
                        t("newApiChannels:filters.placeholders.name") ?? ""
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("newApiChannels:filters.labels.enabled")}</Label>
                    <div className="border-input flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        {filter.enabled
                          ? t("common:status.enabled", "Enabled")
                          : t("common:status.disabled", "Disabled")}
                      </span>
                      <Switch
                        id={`global-filter-enabled-${filter.id}`}
                        checked={filter.enabled}
                        onChange={(value: boolean) =>
                          handleGlobalFilterFieldChange(
                            filter.id,
                            "enabled",
                            value,
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleRemoveGlobalFilter(filter.id)}
                      aria-label={
                        t("newApiChannels:filters.labels.delete") ?? "Delete"
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Label>
                        {t("newApiChannels:filters.labels.pattern")}
                      </Label>
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <span>{t("newApiChannels:filters.labels.regex")}</span>
                        <Switch
                          size={"sm"}
                          id={`global-filter-regex-${filter.id}`}
                          checked={filter.isRegex}
                          onChange={(value: boolean) =>
                            handleGlobalFilterFieldChange(
                              filter.id,
                              "isRegex",
                              value,
                            )
                          }
                        />
                      </div>
                    </div>
                    <Input
                      value={filter.pattern}
                      onChange={(event) =>
                        handleGlobalFilterFieldChange(
                          filter.id,
                          "pattern",
                          event.target.value,
                        )
                      }
                      placeholder={
                        t("newApiChannels:filters.placeholders.pattern") ?? ""
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      {filter.isRegex
                        ? t("newApiChannels:filters.hints.regex")
                        : t("newApiChannels:filters.hints.substring")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("newApiChannels:filters.labels.action")}</Label>
                    <Select
                      value={filter.action}
                      onValueChange={(value: "include" | "exclude") =>
                        handleGlobalFilterFieldChange(
                          filter.id,
                          "action",
                          value,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="include">
                          {t("newApiChannels:filters.actionOptions.include")}
                        </SelectItem>
                        <SelectItem value="exclude">
                          {t("newApiChannels:filters.actionOptions.exclude")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>
                    {t("newApiChannels:filters.labels.description")}
                  </Label>
                  <Textarea
                    value={filter.description ?? ""}
                    onChange={(event) =>
                      handleGlobalFilterFieldChange(
                        filter.id,
                        "description",
                        event.target.value,
                      )
                    }
                    placeholder={
                      t("newApiChannels:filters.placeholders.description") ?? ""
                    }
                    rows={3}
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={handleAddGlobalFilter}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("newApiChannels:filters.addRule")}
            </Button>
          </div>
        )}
      </Modal>
    </SettingSection>
  )
}

/**
 * Builds sorted multi-select options from an array of model metadata.
 *
 * @param metadata - Array of model metadata objects to convert into select options
 * @returns An array of MultiSelectOption objects with `label` and `value` set to each model's `id`, sorted by `label`
 */
function buildModelOptions(metadata: ModelMetadata[]): MultiSelectOption[] {
  const options = metadata.map((model) => ({
    label: model.id,
    value: model.id,
  }))
  return options.sort((a, b) => a.label.localeCompare(b.label))
}

function buildOptionsFromIds(modelIds: string[]): MultiSelectOption[] {
  const options = modelIds
    .map((model) => model.trim())
    .filter(Boolean)
    .map((model) => ({
      label: model,
      value: model,
    }))

  return options.sort((a, b) => a.label.localeCompare(b.label))
}
