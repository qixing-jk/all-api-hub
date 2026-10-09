import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ActionGroup, Modal } from "~/components/ui"
import { Button } from "~/components/ui/button"
import { Switch } from "~/components/ui/Switch"
import {
  fetchChannelFilterSettings,
  saveChannelFilters,
  type ChannelFilterStorageIdentity,
} from "~/features/ManagedSiteChannels/filters/channelFilters"
import { MANAGED_SITE_CHANNELS_TEST_IDS } from "~/features/ManagedSiteChannels/testIds"
import ChannelFiltersEditor from "~/features/ManagedSiteModelSync/filters/ChannelFiltersEditor"
import { useChannelFilterEditor } from "~/features/ManagedSiteModelSync/filters/useChannelFilterEditor"
import toast from "~/lib/notify"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { normalizeChannelFilters } from "~/services/managedSites/channelModelFilterRules"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { getErrorMessage } from "~/utils/core/error"

export interface ChannelFilterTarget {
  name: string
  type: number | string
  resourceRef?: ManagedUpstreamResourceRef
}

interface ChannelFilterDialogProps {
  channel: ChannelFilterTarget | null
  open: boolean
  onClose: () => void
}

type EditableFilter = ChannelModelFilterRule

/**
 * Builds the storage identity used when channel filters have a resource ref.
 */
function getChannelFilterStorageIdentity(
  channel: ChannelFilterTarget,
): ChannelFilterStorageIdentity {
  if (!channel.resourceRef) {
    throw new Error("Channel resource reference is unavailable")
  }

  return {
    resourceRef: channel.resourceRef,
  }
}

/**
 * Dialog for editing channel model filters via visual builder or raw JSON input.
 */
export default function ChannelFilterDialog({
  channel,
  open,
  onClose,
}: ChannelFilterDialogProps) {
  const { t } = useTranslation("managedSiteChannels")
  const {
    filters,
    setFilters,
    jsonText,
    setJsonText,
    viewMode,
    resetEditor,
    handleFieldChange,
    handleAddFilter,
    handleRemoveFilter,
    handleMoveFilter,
    validateFilters,
    parseJsonFilters,
    showVisual,
    showJson,
  } = useChannelFilterEditor("channel-filter")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [modelSyncExcluded, setModelSyncExcluded] = useState(false)
  const [loadedModelSyncExcluded, setLoadedModelSyncExcluded] = useState(false)
  const sessionRef = useRef(0)
  const onCloseRef = useRef(onClose)
  const exclusionId = useId()

  // Parent presentation updates may replace callbacks without starting a new edit.
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const session = ++sessionRef.current
    resetEditor([], "")
    setModelSyncExcluded(false)
    setLoadedModelSyncExcluded(false)
    setIsSaving(false)
    setIsLoading(Boolean(open && channel))
    if (open && channel) {
      void (async () => {
        try {
          const settings = await fetchChannelFilterSettings(
            getChannelFilterStorageIdentity(channel),
          )
          if (session !== sessionRef.current) return
          resetEditor(settings.filters)
          setModelSyncExcluded(settings.modelSyncExcluded)
          setLoadedModelSyncExcluded(settings.modelSyncExcluded)
        } catch (error) {
          if (session !== sessionRef.current) return
          toast.error(
            t("filters.messages.loadFailed", { error: getErrorMessage(error) }),
          )
          onCloseRef.current()
        } finally {
          if (session === sessionRef.current) setIsLoading(false)
        }
      })()
    }
    return () => {
      sessionRef.current = session + 1
    }
  }, [channel, open, resetEditor, t])

  if (!channel) {
    return null
  }
  const probeRulesSupported = Boolean(
    channel.resourceRef &&
      getSiteTypeCapabilities(
        channel.resourceRef.managedSiteType,
      ).managedSites?.models?.resolveVerificationProtocol?.(channel.type),
  )

  const handleSave = async () => {
    if (isLoading || isSaving || !open) return
    const session = sessionRef.current
    const editorMode =
      viewMode === "json"
        ? PRODUCT_ANALYTICS_EDITOR_MODES.Json
        : PRODUCT_ANALYTICS_EDITOR_MODES.Visual
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SaveManagedSiteChannelModelFilters,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelFilterDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    let rulesToSave: EditableFilter[]

    if (viewMode === "json") {
      try {
        rulesToSave = parseJsonFilters(jsonText)
      } catch (error) {
        toast.error(
          t("filters.messages.jsonInvalid", { error: getErrorMessage(error) }),
        )
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            editorMode,
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Parse,
          },
        })
        return
      }
    } else {
      rulesToSave = filters
    }

    const validationError = validateFilters(rulesToSave)
    if (validationError) {
      toast.error(validationError)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: {
          editorMode,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          itemCount: rulesToSave.length,
        },
      })
      return
    }
    setIsSaving(true)
    try {
      const payload = normalizeChannelFilters(
        rulesToSave.map((filter) => ({
          ...filter,
          name: filter.name.trim(),
          description: filter.description?.trim() || undefined,
        })),
        {
          idPrefix: "channel-filter",
        },
      )
      await saveChannelFilters(
        getChannelFilterStorageIdentity(channel),
        payload,
        modelSyncExcluded === loadedModelSyncExcluded
          ? {}
          : { modelSyncExcluded },
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        insights: {
          editorMode,
          itemCount: payload.length,
        },
      })
      if (session !== sessionRef.current) return
      setFilters(payload)
      setJsonText(JSON.stringify(payload, null, 2))
      toast.success(t("filters.messages.saved"))
      onClose()
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          editorMode,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          itemCount: rulesToSave.length,
        },
      })
      if (session === sessionRef.current) {
        toast.error(
          t("filters.messages.saveFailed", { error: getErrorMessage(error) }),
        )
      }
    } finally {
      if (session === sessionRef.current) setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (!isSaving) onClose()
      }}
      showCloseButton={!isSaving}
      closeOnEsc={!isSaving}
      closeOnBackdropClick={!isSaving}
      size="lg"
      panelClassName="max-h-[85vh]"
      header={
        <div>
          <p className="text-base font-semibold">{t("filters.title")}</p>
          <p className="text-muted-foreground text-sm">
            {t("filters.subtitle", { channel: channel.name })}
          </p>
        </div>
      }
      footer={
        <ActionGroup>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            {t("filters.actions.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            loading={isSaving}
            disabled={isLoading || isSaving}
            data-testid={
              MANAGED_SITE_CHANNELS_TEST_IDS.channelFiltersSaveButton
            }
          >
            {isSaving ? t("common:status.saving") : t("filters.actions.save")}
          </Button>
        </ActionGroup>
      }
    >
      <fieldset
        disabled={isLoading || isSaving}
        aria-busy={isLoading || isSaving}
        className="space-y-density-4 min-w-0"
      >
        <div className="gap-y-density-2 flex items-start justify-between gap-x-4">
          <div className="space-y-density-1">
            <label htmlFor={exclusionId} className="text-sm font-medium">
              {t("managedSiteModelSync:execution.exclusions.title")}
            </label>
            <p
              id={`${exclusionId}-help`}
              className="text-muted-foreground text-sm"
            >
              {t("filters.modelSyncExclusionHelp")}
            </p>
          </div>
          <Switch
            id={exclusionId}
            aria-describedby={`${exclusionId}-help`}
            checked={modelSyncExcluded}
            onChange={setModelSyncExcluded}
            disabled={isLoading || isSaving}
          />
        </div>
        <ChannelFiltersEditor
          filters={filters}
          viewMode={viewMode}
          jsonText={jsonText}
          isLoading={isLoading}
          probeRulesSupported={probeRulesSupported}
          probeRulesUnsupportedMessage={t(
            "filters.hints.unsupportedChannelType",
          )}
          onAddFilter={handleAddFilter}
          onMoveFilter={handleMoveFilter}
          onRemoveFilter={handleRemoveFilter}
          onFieldChange={handleFieldChange}
          onClickViewVisual={showVisual}
          onClickViewJson={showJson}
          onChangeJsonText={setJsonText}
          testIds={{
            viewJsonButton:
              MANAGED_SITE_CHANNELS_TEST_IDS.channelFiltersViewJsonButton,
            jsonEditor: MANAGED_SITE_CHANNELS_TEST_IDS.channelFiltersJsonEditor,
          }}
        />
      </fieldset>
    </Modal>
  )
}
