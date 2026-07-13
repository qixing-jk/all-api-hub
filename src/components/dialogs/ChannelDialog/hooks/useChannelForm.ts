import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  CHANNEL_DIALOG_MUTATION_RESULTS,
  type ChannelDialogMutationResult,
} from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import { mergeUniqueOptions } from "~/components/dialogs/ChannelDialog/utils/selectOptions"
import type { CompactMultiSelectOption } from "~/components/ui"
import { DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS } from "~/constants/claudeCodeHub"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  ManagedUpstreamResourceDraftsCapability,
  ManagedUpstreamResourceItemsCapability,
} from "~/services/apiAdapters/contracts/managedUpstreamResources"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import {
  getManagedSiteConfigMissingMessage,
  hasUsableManagedSiteChannelKey,
} from "~/services/managedSites/utils/managedSite"
import type {
  ChannelFormData,
  ManagedSiteChannel,
  UpdateChannelPayload,
} from "~/types/managedSite"
import type {
  ManagedUpstreamResourceDetail,
  ManagedUpstreamResourceFieldDescriptor,
  ManagedUpstreamResourceRef,
} from "~/types/managedUpstreamResource"
import { getManagedUpstreamResourceRefKey } from "~/types/managedUpstreamResource"
import type { OctopusOutboundType } from "~/types/octopus"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to channel dialog form state and submissions.
 */
const logger = createLogger("ChannelFormHook")

const createDefaultChannelGroupOptions = (): CompactMultiSelectOption[] =>
  DEFAULT_CHANNEL_FIELDS.groups.map((group) => ({
    label: group,
    value: group,
  }))

export interface UseChannelFormProps {
  mode: DialogMode
  channel: ManagedSiteChannel | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: (response: any) => void
  onMutationOutcome?: (outcome: {
    mode: DialogMode
    result: ChannelDialogMutationResult
    siteType: string
  }) => void
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
  resourceEdit?: ChannelResourceEditContext | null
}

export type ChannelResourceEditContext = {
  config: unknown
  ref: ManagedUpstreamResourceRef
  capabilities: {
    items: Pick<
      ManagedUpstreamResourceItemsCapability<unknown, unknown, ChannelFormData>,
      "getDetail" | "update"
    >
    drafts: Pick<
      ManagedUpstreamResourceDraftsCapability<unknown, ChannelFormData>,
      "prepareEditDraft" | "describeFields" | "validateDraft"
    >
  }
}

/**
 * Manages Channel dialog form state, remote group/model loading, and submissions.
 * Abstracts validation, payload building, and success handling for add/edit flows.
 * @param props Dialog mode, current channel, dialog lifecycle callbacks, and defaults.
 * @param props.mode Dialog mode (add or edit).
 * @param props.channel Channel instance being edited, if any.
 * @param props.isOpen Whether the dialog is currently visible.
 * @param props.onClose Close callback triggered after saving or cancel.
 * @param props.onSuccess Success callback invoked with the saved channel.
 * @param props.onMutationOutcome Optional opt-in callback invoked after real save success or failure.
 * @param props.initialValues Prefilled form values supplied externally.
 * @param props.initialModels Prefilled model list for the multiselect.
 * @param props.initialGroups Prefilled group list for the multiselect.
 * @param props.resourceEdit Resource-backed edit context for loading and updating the selected item.
 * @returns Binding helpers plus UI/loading flags for the form consumer.
 */
export function useChannelForm({
  mode,
  channel,
  isOpen,
  onClose,
  onSuccess,
  onMutationOutcome,
  initialValues,
  initialModels,
  initialGroups,
  resourceEdit,
}: UseChannelFormProps) {
  const { t } = useTranslation([
    "channelDialog",
    "messages",
    "managedSiteChannels",
  ])

  const normalizeChannelGroups = (group: string | null | undefined) => {
    const groups = group?.trim()
      ? group
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : []

    return groups.length > 0 ? groups : [...DEFAULT_CHANNEL_FIELDS.groups]
  }

  const applyManagedSiteDefaults = useCallback(
    (data: ChannelFormData, siteType: string): ChannelFormData => {
      if (
        siteType === SITE_TYPES.CLAUDE_CODE_HUB &&
        mode === DIALOG_MODES.ADD &&
        !initialValues?.type
      ) {
        return {
          ...data,
          type: DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.type,
          weight: DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS.weight,
        }
      }

      return data
    },
    [initialValues?.type, mode],
  )

  const buildInitialFormData = useCallback(
    (): ChannelFormData => ({
      name: initialValues?.name ?? "",
      type: initialValues?.type ?? DEFAULT_CHANNEL_FIELDS.type,
      key: initialValues?.key ?? "",
      base_url: initialValues?.base_url ?? "",
      models: initialValues?.models ? [...initialValues.models] : [],
      groups:
        initialValues?.groups && initialValues.groups.length > 0
          ? [...initialValues.groups]
          : [...DEFAULT_CHANNEL_FIELDS.groups],
      priority: initialValues?.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
      weight: initialValues?.weight ?? DEFAULT_CHANNEL_FIELDS.weight,
      status: initialValues?.status ?? DEFAULT_CHANNEL_FIELDS.status,
    }),
    [initialValues],
  )

  // Form state
  const [formData, setFormData] = useState<ChannelFormData>(() =>
    buildInitialFormData(),
  )

  // UI state
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingGroups, setIsLoadingGroups] = useState(false)
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [managedSiteType, setManagedSiteType] = useState<string | null>(null)
  const [availableGroups, setAvailableGroups] = useState<
    CompactMultiSelectOption[]
  >([])
  const [availableModels, setAvailableModels] = useState<
    CompactMultiSelectOption[]
  >([])
  const [resourceDetail, setResourceDetail] =
    useState<ManagedUpstreamResourceDetail<unknown> | null>(null)
  const [resourceFieldDescriptors, setResourceFieldDescriptors] = useState<
    ManagedUpstreamResourceFieldDescriptor[] | null
  >(null)
  const [resourceEditLoadError, setResourceEditLoadError] =
    useState<Error | null>(null)
  const [isLoadingResourceEdit, setIsLoadingResourceEdit] = useState(false)
  const [resourceEditLoadAttempt, setResourceEditLoadAttempt] = useState(0)
  const [resourceEditLoadRefKey, setResourceEditLoadRefKey] = useState<
    string | null
  >(null)
  const activeResourceEditRefKey = resourceEdit
    ? getManagedUpstreamResourceRefKey(resourceEdit.ref)
    : null

  const loadManagedSiteType = useCallback(async () => {
    const service = await getManagedSiteService()
    setManagedSiteType(service.siteType)
    return service
  }, [])

  // Load groups and model suggestions on mount
  useEffect(() => {
    if (isOpen) {
      void (async () => {
        const service = await loadManagedSiteType()
        await loadGroups(service)
        await loadModels()
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialValues, initialModels, initialGroups, loadManagedSiteType])

  // Load form data when dialog opens
  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false

    if ((mode === DIALOG_MODES.EDIT || mode === DIALOG_MODES.VIEW) && channel) {
      setFormData({
        name: channel.name,
        type: channel.type,
        key: channel.key,
        base_url: channel.base_url || "",
        models: channel.models ? channel.models.split(",") : [],
        groups: normalizeChannelGroups(channel.group),
        priority: channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
        weight: channel.weight ?? DEFAULT_CHANNEL_FIELDS.weight,
        status: channel.status ?? DEFAULT_CHANNEL_FIELDS.status,
      })
    } else {
      void (async () => {
        const service = await loadManagedSiteType()
        if (cancelled) return
        setFormData(
          applyManagedSiteDefaults(buildInitialFormData(), service.siteType),
        )
      })()
    }

    return () => {
      cancelled = true
    }
  }, [
    isOpen,
    mode,
    channel,
    buildInitialFormData,
    loadManagedSiteType,
    applyManagedSiteDefaults,
  ])

  useEffect(() => {
    if (!isOpen || mode !== DIALOG_MODES.EDIT || !resourceEdit) {
      setResourceDetail(null)
      setResourceFieldDescriptors(null)
      setResourceEditLoadError(null)
      setIsLoadingResourceEdit(false)
      setResourceEditLoadRefKey(null)
      return
    }

    let cancelled = false
    const loadRefKey = getManagedUpstreamResourceRefKey(resourceEdit.ref)
    setResourceDetail(null)
    setResourceFieldDescriptors(null)
    setResourceEditLoadError(null)
    setIsLoadingResourceEdit(true)
    setResourceEditLoadRefKey(null)

    void (async () => {
      try {
        const detail = await resourceEdit.capabilities.items.getDetail(
          resourceEdit.config,
          resourceEdit.ref,
        )
        if (cancelled) {
          return
        }

        const descriptors = resourceEdit.capabilities.drafts.describeFields({
          mode: "edit",
          detail,
        })
        const draft = resourceEdit.capabilities.drafts.prepareEditDraft(detail)

        setResourceDetail(detail)
        setResourceFieldDescriptors(descriptors)
        setResourceEditLoadRefKey(loadRefKey)
        setFormData(draft)
      } catch (error) {
        if (!cancelled) {
          const normalizedError =
            error instanceof Error ? error : new Error(String(error ?? ""))
          setResourceEditLoadError(normalizedError)
          logger.error("Failed to load channel detail", normalizedError)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingResourceEdit(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, mode, resourceEdit, resourceEditLoadAttempt])

  const retryResourceEditLoad = useCallback(() => {
    setResourceEditLoadAttempt((attempt) => attempt + 1)
  }, [])

  const resetForm = useCallback(() => {
    setFormData(buildInitialFormData())
  }, [buildInitialFormData])

  const loadGroups = async (
    serviceOverride?: Awaited<ReturnType<typeof getManagedSiteService>>,
  ) => {
    setIsLoadingGroups(true)
    try {
      const service = serviceOverride ?? (await loadManagedSiteType())
      if (service.siteType === SITE_TYPES.AXON_HUB) {
        setAvailableGroups([])
        return
      }
      if (service.siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
        const fallback = createDefaultChannelGroupOptions()
        const preselectedGroups = (
          initialValues?.groups ??
          initialGroups ??
          []
        ).map((value) => ({ label: value, value }))
        setAvailableGroups(mergeUniqueOptions(fallback, preselectedGroups))
        return
      }
      const hasConfig = await service.checkValidConfig()
      const preselectedGroups = (
        initialValues?.groups ??
        initialGroups ??
        []
      ).map((value) => ({ label: value, value }))

      if (!hasConfig) {
        logger.warn("No valid managed-site configuration")
        const fallback = createDefaultChannelGroupOptions()
        setAvailableGroups(mergeUniqueOptions(fallback, preselectedGroups))
        return
      }

      const config = await service.getConfig()
      if (!config) {
        setAvailableGroups(
          mergeUniqueOptions(
            createDefaultChannelGroupOptions(),
            preselectedGroups,
          ),
        )
        return
      }

      const groupsData = await service.fetchSiteUserGroups(config)

      let groupOptions = groupsData.map((group) => ({
        label: group,
        value: group,
      }))

      const defaultGroupOptions = createDefaultChannelGroupOptions()
      for (const defaultGroupOption of defaultGroupOptions) {
        if (
          !groupOptions.some(
            (option) => option.value === defaultGroupOption.value,
          )
        ) {
          groupOptions.push(defaultGroupOption)
        }
      }

      groupOptions = mergeUniqueOptions(groupOptions, preselectedGroups)
      setAvailableGroups(groupOptions)
    } catch (error) {
      logger.error("Failed to load groups", error)
      const fallback = createDefaultChannelGroupOptions()
      const preselectedGroups = (
        initialValues?.groups ??
        initialGroups ??
        []
      ).map((value) => ({ label: value, value }))
      setAvailableGroups(mergeUniqueOptions(fallback, preselectedGroups))
    } finally {
      setIsLoadingGroups(false)
    }
  }

  const loadModels = async () => {
    setIsLoadingModels(true)
    try {
      const preselectedModels = (
        initialValues?.models ??
        initialModels ??
        []
      ).map((value) => ({
        label: value,
        value,
      }))

      setAvailableModels(preselectedModels)
    } catch (error) {
      logger.error("Failed to load models", error)
      const preselectedModels = (
        initialValues?.models ??
        initialModels ??
        []
      ).map((value) => ({
        label: value,
        value,
      }))
      setAvailableModels(preselectedModels)
    } finally {
      setIsLoadingModels(false)
    }
  }

  const updateField = <K extends keyof ChannelFormData>(
    field: K,
    value: ChannelFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleTypeChange = (
    newType: ChannelType | OctopusOutboundType | string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      type: newType,
      priority: prev.priority,
      weight: prev.weight,
    }))
  }

  const isKeyFieldRequired = mode === DIALOG_MODES.ADD
  const isResourceBackedEdit =
    mode === DIALOG_MODES.EDIT && Boolean(resourceEdit)
  const requiresRealClaudeCodeHubKey =
    managedSiteType === SITE_TYPES.CLAUDE_CODE_HUB && mode === DIALOG_MODES.ADD

  const isBaseUrlRequired =
    managedSiteType === SITE_TYPES.AXON_HUB ||
    managedSiteType === SITE_TYPES.CLAUDE_CODE_HUB ||
    formData.type === ChannelType.VolcEngine ||
    formData.type === ChannelType.SunoAPI

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (mode === DIALOG_MODES.VIEW) {
      return
    }

    // Validation
    if (!formData.name.trim()) {
      toast.error(t("channelDialog:validation.nameRequired"))
      return
    }

    if (
      requiresRealClaudeCodeHubKey &&
      !hasUsableManagedSiteChannelKey(formData.key)
    ) {
      toast.error(t("messages:claudecodehub.realProviderKeyRequired"))
      return
    }

    if (isKeyFieldRequired && !formData.key.trim()) {
      toast.error(t("channelDialog:validation.keyRequired"))
      return
    }

    if (isBaseUrlRequired && !formData?.base_url?.trim()) {
      toast.error(t("channelDialog:validation.baseUrlRequired"))
      return
    }

    if (!isResourceBackedEdit && formData.models.length === 0) {
      toast.error(t("channelDialog:validation.modelsRequired"))
      return
    }

    setIsSaving(true)
    let submissionSiteType: string | null = null

    try {
      const service = await getManagedSiteService()
      submissionSiteType = service.siteType

      let response
      if (mode === DIALOG_MODES.EDIT && resourceEdit) {
        if (
          isLoadingResourceEdit ||
          resourceEditLoadError ||
          !resourceDetail ||
          !resourceFieldDescriptors ||
          resourceEditLoadRefKey !== activeResourceEditRefKey
        ) {
          return
        }

        const validation =
          resourceEdit.capabilities.drafts.validateDraft(formData)
        if (!validation.valid) {
          toast.error(
            validation.errors[0]?.message ??
              t("channelDialog:messages.saveFailed", { error: "" }),
          )
          return
        }

        response = await resourceEdit.capabilities.items.update(
          resourceEdit.config,
          resourceDetail,
          formData,
        )
      } else {
        const apiConfig = await service.getConfig()
        if (!apiConfig) {
          throw new Error(
            getManagedSiteConfigMissingMessage(t, service.messagesKey),
          )
        }

        if (mode === DIALOG_MODES.EDIT && channel) {
          const channelId = channel.id
          if (!channelId) {
            throw new Error(t("channelDialog:messages.missingChannelId"))
          }
          const updatePayload: UpdateChannelPayload = (() => {
            return {
              id: channelId,
              ...formData,
              models: formData.models.join(","),
              groups: formData.groups,
              // 实际只有这个group参数生效
              group: formData.groups.join(","),
            }
          })()
          response = await service.updateChannel(apiConfig, updatePayload)
        } else {
          const payload = service.buildChannelPayload(formData)
          response = await service.createChannel(apiConfig, payload)
        }
      }

      if (response.success) {
        const fallbackMessage =
          mode === DIALOG_MODES.EDIT
            ? t("managedSiteChannels:toasts.channelUpdated")
            : t("managedSiteChannels:toasts.channelSaved")

        const normalizedResponse = {
          ...response,
          message: response.message || fallbackMessage,
        }

        onMutationOutcome?.({
          mode,
          result: CHANNEL_DIALOG_MUTATION_RESULTS.Success,
          siteType: service.siteType,
        })
        onSuccess?.(normalizedResponse)
        onClose()
        resetForm()
      } else {
        throw new Error(response.message)
      }
    } catch (error: any) {
      logger.error("Save failed", error)
      const siteType =
        submissionSiteType ??
        (typeof managedSiteType === "string"
          ? managedSiteType
          : SITE_TYPES.NEW_API)
      onMutationOutcome?.({
        mode,
        result: CHANNEL_DIALOG_MUTATION_RESULTS.Failure,
        siteType,
      })
      toast.error(
        t("channelDialog:messages.saveFailed", {
          error: error.message,
        }),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const isResourceEditReady = Boolean(
    !resourceEdit ||
      (mode === DIALOG_MODES.EDIT &&
        !isLoadingResourceEdit &&
        !resourceEditLoadError &&
        resourceDetail &&
        resourceFieldDescriptors &&
        resourceEditLoadRefKey === activeResourceEditRefKey),
  )

  const resourceDraftValidation =
    isResourceBackedEdit && isResourceEditReady && resourceEdit
      ? resourceEdit.capabilities.drafts.validateDraft(formData)
      : null
  const isResourceDraftValid =
    !isResourceBackedEdit || resourceDraftValidation?.valid === true

  const isFormValid = Boolean(
    formData.name.trim() &&
      (isResourceBackedEdit
        ? isResourceDraftValid
        : formData.models.length > 0) &&
      (!isKeyFieldRequired || formData.key.trim()) &&
      (!requiresRealClaudeCodeHubKey ||
        hasUsableManagedSiteChannelKey(formData.key)) &&
      (!isBaseUrlRequired || formData?.base_url?.trim()) &&
      isResourceEditReady,
  )

  return {
    formData,
    updateField,
    handleTypeChange,
    handleSubmit,
    isFormValid,
    isSaving,
    isLoadingGroups,
    isLoadingModels,
    isResourceEditLoading: isLoadingResourceEdit,
    isResourceEditReady,
    resourceEditLoadError,
    retryResourceEditLoad,
    availableGroups,
    availableModels,
    resetForm,
    isKeyFieldRequired,
    isBaseUrlRequired,
  }
}
