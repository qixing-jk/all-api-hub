import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelForm } from "~/components/ChannelDialog/hooks/useChannelForm"
import {
  Button,
  CompactMultiSelect,
  IconButton,
  Input,
  Label,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { ChannelType, ChannelTypeOptions } from "~/constants/managedSite"
import { OctopusOutboundTypeOptions } from "~/constants/octopus"
import { OCTOPUS } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  CHANNEL_STATUS,
  type ChannelFormData,
  type ChannelStatus,
  type ManagedSiteChannel,
} from "~/types/managedSite"
import { OctopusOutboundType } from "~/types/octopus"

export interface ChannelDialogProps {
  isOpen: boolean
  onClose: () => void
  mode?: DialogMode
  channel?: ManagedSiteChannel | null
  onSuccess?: (channel: any) => void
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
}

/**
 * Full channel create/edit dialog for the New API feature.
 * Handles form state, validation, and submission via useChannelForm.
 * @param props Component props bundle.
 * @param props.isOpen Whether the dialog is visible.
 * @param props.onClose Callback invoked when the dialog should close.
 * @param props.mode Dialog mode (add/edit) controlling UX copy.
 * @param props.channel Existing channel for edit mode.
 * @param props.onSuccess Callback fired after successful mutation.
 * @param props.initialValues Pre-filled form values when reusing data.
 * @param props.initialModels Models to seed multi-select state.
 * @param props.initialGroups Groups to seed multi-select state.
 */
export function ChannelDialog({
  isOpen,
  onClose,
  mode = DIALOG_MODES.ADD,
  channel = null,
  onSuccess,
  initialValues,
  initialModels,
  initialGroups,
}: ChannelDialogProps) {
  const { t } = useTranslation(["channelDialog", "common"])
  const [showKey, setShowKey] = useState(false)
  const { managedSiteType } = useUserPreferencesContext()
  const isOctopus = managedSiteType === OCTOPUS

  const {
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
    isKeyFieldRequired,
    isBaseUrlRequired,
  } = useChannelForm({
    mode,
    channel,
    isOpen,
    onClose,
    onSuccess,
    initialValues,
    initialModels,
    initialGroups,
  })

  const handleSelectAllModels = () => {
    updateField(
      "models",
      availableModels.map((m) => m.value),
    )
  }

  const handleInverseModels = () => {
    const currentModels = new Set(formData.models)
    const invertedModels = availableModels
      .map((m) => m.value)
      .filter((value) => !currentModels.has(value))
    updateField("models", invertedModels)
  }

  const handleDeselectAllModels = () => {
    updateField("models", [])
  }

  const header = (
    <div>
      <h3 className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
        {mode === DIALOG_MODES.ADD
          ? t("channelDialog:title.add")
          : t("channelDialog:title.edit")}
      </h3>
      <p className="dark:text-dark-text-secondary mt-1 text-sm text-gray-500">
        {mode === DIALOG_MODES.ADD
          ? t("channelDialog:description.add")
          : t("channelDialog:description.edit")}
      </p>
    </div>
  )

  const footer = (
    <div className="flex justify-end gap-3">
      <Button
        variant="outline"
        onClick={onClose}
        disabled={isSaving}
        type="button"
      >
        {t("common:actions.cancel")}
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={!isFormValid || isSaving}
        loading={isSaving}
        type="submit"
      >
        {mode === DIALOG_MODES.ADD
          ? t("channelDialog:actions.create")
          : t("channelDialog:actions.update")}
      </Button>
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      header={header}
      footer={footer}
      size="lg"
      closeOnBackdropClick={!isSaving}
      closeOnEsc={!isSaving}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Channel Name */}
        <div>
          <Label htmlFor="channel-name" required>
            {t("channelDialog:fields.name.label")}
          </Label>
          <Input
            id="channel-name"
            type="text"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder={t("channelDialog:fields.name.placeholder")}
            disabled={isSaving}
            required
          />
        </div>

        {/* Channel Type */}
        <div>
          <Label htmlFor="channel-type" required>
            {t("channelDialog:fields.type.label")}
          </Label>
          <Select
            value={
              formData.type === undefined || formData.type === null
                ? ""
                : String(formData.type)
            }
            onValueChange={(value) =>
              handleTypeChange(
                Number(value) as ChannelType | OctopusOutboundType,
              )
            }
            disabled={isSaving || mode === DIALOG_MODES.EDIT}
            required
          >
            <SelectTrigger id="channel-type">
              <SelectValue
                placeholder={t("channelDialog:fields.type.placeholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {isOctopus
                ? OctopusOutboundTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))
                : ChannelTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
          <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
            {t("channelDialog:fields.type.hint")}
          </p>
        </div>

        {/* API Key */}
        <div>
          <Label htmlFor="channel-key" required={isKeyFieldRequired}>
            {t("channelDialog:fields.key.label")}
          </Label>
          <Input
            id="channel-key"
            type={showKey ? "text" : "password"}
            value={formData.key}
            onChange={(e) => updateField("key", e.target.value)}
            placeholder={t("channelDialog:fields.key.placeholder")}
            disabled={isSaving}
            required={isKeyFieldRequired}
            rightIcon={
              <IconButton
                variant="ghost"
                size="xs"
                onClick={() => setShowKey(!showKey)}
                aria-label={
                  showKey
                    ? t("channelDialog:actions.hideKey")
                    : t("channelDialog:actions.showKey")
                }
                type="button"
                disabled={isSaving}
              >
                {showKey ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </IconButton>
            }
          />
        </div>

        {/* Base URL */}
        <div>
          <Label htmlFor="channel-base-url" required={isBaseUrlRequired}>
            {t("channelDialog:fields.baseUrl.label")}
          </Label>
          <Input
            id="channel-base-url"
            type="url"
            value={formData.base_url}
            onChange={(e) => updateField("base_url", e.target.value)}
            placeholder={t("channelDialog:fields.baseUrl.placeholder")}
            disabled={isSaving}
            required={isBaseUrlRequired}
          />
        </div>

        {/* Models */}
        <div>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label className="mb-0">
              {t("channelDialog:fields.models.label")}
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllModels}
                disabled={
                  isSaving || isLoadingModels || availableModels.length === 0
                }
                type="button"
              >
                {t("channelDialog:actions.selectAll")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInverseModels}
                disabled={
                  isSaving || isLoadingModels || availableModels.length === 0
                }
                type="button"
              >
                {t("channelDialog:actions.inverse")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAllModels}
                disabled={
                  isSaving || isLoadingModels || formData.models.length === 0
                }
                type="button"
              >
                {t("channelDialog:actions.deselectAll")}
              </Button>
            </div>
          </div>
          <CompactMultiSelect
            options={availableModels}
            selected={formData.models}
            onChange={(models) => updateField("models", models)}
            placeholder={
              isLoadingModels
                ? t("channelDialog:fields.models.loading")
                : t("channelDialog:fields.models.placeholder")
            }
            disabled={isSaving || isLoadingModels}
            allowCustom
          />
          <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
            {t("channelDialog:fields.models.hint")}
          </p>
        </div>

        {/* Groups - Octopus 没有分组概念，隐藏此字段 */}
        {!isOctopus && (
          <div>
            <CompactMultiSelect
              label={t("channelDialog:fields.groups.label")}
              options={availableGroups}
              selected={formData.groups}
              onChange={(groups) => updateField("groups", groups)}
              placeholder={
                isLoadingGroups
                  ? t("channelDialog:fields.groups.loading")
                  : t("channelDialog:fields.groups.placeholder")
              }
              disabled={isSaving || isLoadingGroups}
              allowCustom
            />
            <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
              {t("channelDialog:fields.groups.hint")}
            </p>
          </div>
        )}

        {/* Advanced Settings */}
        <details className="dark:border-dark-bg-tertiary rounded-lg border border-gray-200 p-3">
          <summary className="dark:text-dark-text-primary cursor-pointer text-sm font-medium text-gray-700">
            {t("channelDialog:sections.advanced")}
          </summary>
          <div className="mt-3 space-y-4">
            {/* Priority - Octopus 不支持优先级 */}
            {!isOctopus && (
              <div>
                <Label htmlFor="channel-priority">
                  {t("channelDialog:fields.priority.label")}
                </Label>
                <Input
                  id="channel-priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) =>
                    updateField("priority", parseInt(e.target.value) || 0)
                  }
                  placeholder="0"
                  disabled={isSaving}
                  min="0"
                />
                <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
                  {t("channelDialog:fields.priority.hint")}
                </p>
              </div>
            )}

            {/* Weight - Octopus 不支持权重 */}
            {!isOctopus && (
              <div>
                <Label htmlFor="channel-weight">
                  {t("channelDialog:fields.weight.label")}
                </Label>
                <Input
                  id="channel-weight"
                  type="number"
                  value={formData.weight}
                  onChange={(e) =>
                    updateField("weight", parseInt(e.target.value) || 0)
                  }
                  placeholder="0"
                  disabled={isSaving}
                  min="0"
                />
                <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
                  {t("channelDialog:fields.weight.hint")}
                </p>
              </div>
            )}

            {/* Status */}
            <div>
              <Label htmlFor="channel-status">
                {t("channelDialog:fields.status.label")}
              </Label>
              <Select
                value={
                  formData.status === undefined || formData.status === null
                    ? ""
                    : String(formData.status)
                }
                onValueChange={(value) =>
                  updateField("status", Number(value) as ChannelStatus)
                }
                disabled={isSaving}
              >
                <SelectTrigger id="channel-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(CHANNEL_STATUS.Enable)}>
                    {t("channelDialog:fields.status.enabled")}
                  </SelectItem>
                  <SelectItem value={String(CHANNEL_STATUS.ManuallyDisabled)}>
                    {t("channelDialog:fields.status.disabled")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </details>
      </form>
    </Modal>
  )
}

export default ChannelDialog
