import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import type { MultiSelectOption } from "~/components/ui/MultiSelect"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { ChannelType, DEFAULT_CHANNEL_FIELDS } from "~/constants/newApi"
import { fetchSiteUserGroups } from "~/services/apiService"
import {
  buildChannelPayload,
  checkValidNewApiConfig,
  createChannel,
  getNewApiConfig,
  updateChannel,
} from "~/services/newApiService/newApiService"
import type {
  ChannelFormData,
  NewApiChannel,
  UpdateChannelPayload,
} from "~/types/newapi"
import { mergeUniqueOptions } from "~/utils/selectOptions"

export interface UseChannelFormProps {
  mode: DialogMode
  channel: NewApiChannel | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: (channel: any) => void
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
}

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
  const { t } = useTranslation("channelDialog")

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
      const hasConfig = await checkValidNewApiConfig()
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

      const config = await getNewApiConfig()
      if (!config) {
        setAvailableGroups(
          mergeUniqueOptions(
            [{ label: "default", value: "default" }],
            preselectedGroups,
          ),
        )
        return
      }

      const groupsData = await fetchSiteUserGroups({
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
      toast.error(t("validation.nameRequired") || "Channel name is required")
      return
    }

    if (isKeyFieldRequired && !formData.key.trim()) {
      toast.error(t("validation.keyRequired") || "API key is required")
      return
    }

    if (isBaseUrlRequired && !formData?.base_url?.trim()) {
      toast.error(
        t("validation.baseUrlRequired") ||
          "Base URL is required for this channel type",
      )
      return
    }

    setIsSaving(true)

    try {
      const apiConfig = await getNewApiConfig()
      if (!apiConfig) {
        throw new Error("New API configuration not found")
      }

      // Build payload
      const payload = buildChannelPayload(formData)

      let response
      if (mode === DIALOG_MODES.EDIT && channel) {
        const channelId = channel.id
        if (!channelId) {
          throw new Error("Existing channel id is missing")
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
        response = await updateChannel(
          apiConfig.baseUrl,
          apiConfig.token,
          apiConfig.userId,
          updatePayload,
        )
      } else {
        response = await createChannel(
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
        throw new Error(response.message || "Failed to save channel")
      }
    } catch (error: any) {
      console.error("[ChannelForm] Save failed:", error)
      toast.error(
        t("channelDialog:messages.saveFailed", {
          error: error.message,
          defaultValue: `Failed to save channel: ${error.message}`,
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
