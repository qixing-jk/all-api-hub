import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import type { MultiSelectOption } from "~/components/ui/MultiSelect"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/managedSite"
import { getApiService } from "~/services/apiService"
import { getManagedSiteService } from "~/services/managedSiteService"
import type {
  ChannelFormData,
  ManagedSiteChannel,
  UpdateChannelPayload,
} from "~/types/managedSite"
import { mergeUniqueOptions } from "~/utils/selectOptions"

export interface UseChannelFormProps {
  mode: DialogMode
  channel: ManagedSiteChannel | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: (response: any) => void
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
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
 * @param props.initialValues Prefilled form values supplied externally.
 * @param props.initialModels Prefilled model list for the multiselect.
 * @param props.initialGroups Prefilled group list for the multiselect.
 * @returns Binding helpers plus UI/loading flags for the form consumer.
 */
export function useChannelForm({
  mode,
  channel,
  isOpen,
  onClose,
  onSuccess,
  initialValues,
  initialModels,
  initialGroups,
}: UseChannelFormProps) {
  const { t } = useTranslation(["channelDialog", "messages"])

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
  const [availableGroups, setAvailableGroups] = useState<MultiSelectOption[]>(
    [],
  )
  const [availableModels, setAvailableModels] = useState<MultiSelectOption[]>(
    [],
  )

  // Load groups and model suggestions on mount
  useEffect(() => {
    if (isOpen) {
      loadGroups()
      loadModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialValues, initialModels, initialGroups])

  // Load form data when dialog opens
  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (mode === DIALOG_MODES.EDIT && channel) {
      setFormData({
        name: channel.name,
        type: channel.type,
        key: channel.key,
        base_url: channel.base_url || "",
        models: channel.models ? channel.models.split(",") : [],
        groups: channel.group.split(",") ?? DEFAULT_CHANNEL_FIELDS.groups,
        priority: channel.priority ?? DEFAULT_CHANNEL_FIELDS.priority,
        weight: channel.weight ?? DEFAULT_CHANNEL_FIELDS.weight,
        status: channel.status ?? DEFAULT_CHANNEL_FIELDS.status,
      })
    } else {
      setFormData(buildInitialFormData())
    }
  }, [isOpen, mode, channel, buildInitialFormData])

  const resetForm = useCallback(() => {
    setFormData(buildInitialFormData())
  }, [buildInitialFormData])

  const loadGroups = async () => {
    setIsLoadingGroups(true)
    try {
      const service = await getManagedSiteService()
      const hasConfig = await service.checkValidConfig()
      const preselectedGroups = (
        initialValues?.groups ??
        initialGroups ??
        []
      ).map((value) => ({ label: value, value }))

      if (!hasConfig) {
        console.warn("[ChannelForm] No valid New API configuration")
        const fallback = [{ label: "default", value: "default" }]
        setAvailableGroups(mergeUniqueOptions(fallback, preselectedGroups))
        return
      }

      const config = await service.getConfig()
      if (!config) {
        setAvailableGroups(
          mergeUniqueOptions(
            [{ label: "default", value: "default" }],
            preselectedGroups,
          ),
        )
        return
      }

      const groupsData = await getApiService(
        service.siteType,
      ).fetchSiteUserGroups({
        baseUrl: config.baseUrl,
        userId: config.userId,
        token: config.token,
      })

      let groupOptions = groupsData.map((group) => ({
        label: group,
        value: group,
      }))

      if (!groupOptions.some((option) => option.value === "default")) {
        groupOptions.push({ label: "default", value: "default" })
      }

      groupOptions = mergeUniqueOptions(groupOptions, preselectedGroups)
      setAvailableGroups(groupOptions)
    } catch (error) {
      console.error("[ChannelForm] Failed to load groups:", error)
      const fallback = [{ label: "default", value: "default" }]
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
      console.error("[ChannelForm] Failed to load models:", error)
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

  const handleTypeChange = (newType: ChannelType) => {
    setFormData((prev) => ({
      ...prev,
      type: newType,
      priority: prev.priority,
      weight: prev.weight,
    }))
  }

  const isKeyFieldRequired = mode === DIALOG_MODES.ADD

  const isBaseUrlRequired =
    formData.type === ChannelType.VolcEngine ||
    formData.type === ChannelType.SunoAPI

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.name.trim()) {
      toast.error(t("channelDialog:validation.nameRequired"))
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

    setIsSaving(true)

    try {
      const service = await getManagedSiteService()
      const apiConfig = await service.getConfig()
      if (!apiConfig) {
        throw new Error(t(`messages:${service.messagesKey}.configMissing`))
      }

      // Build payload
      const payload = service.buildChannelPayload(formData)

      let response
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
        response = await service.updateChannel(
          apiConfig.baseUrl,
          apiConfig.token,
          apiConfig.userId,
          updatePayload,
        )
      } else {
        response = await service.createChannel(
          apiConfig.baseUrl,
          apiConfig.token,
          apiConfig.userId,
          payload,
        )
      }

      if (response.success) {
        onSuccess?.(response)
        onClose()
        resetForm()
      } else {
        throw new Error(response.message)
      }
    } catch (error: any) {
      console.error("[ChannelForm] Save failed:", error)
      toast.error(
        t("channelDialog:messages.saveFailed", {
          error: error.message,
        }),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const isFormValid = Boolean(
    formData.name.trim() &&
      (!isKeyFieldRequired || formData.key.trim()) &&
      (!isBaseUrlRequired || formData?.base_url?.trim()),
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
    availableGroups,
    availableModels,
    resetForm,
    isKeyFieldRequired,
    isBaseUrlRequired,
  }
}
