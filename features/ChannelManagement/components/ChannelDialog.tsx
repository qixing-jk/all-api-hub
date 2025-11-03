import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  IconButton,
  Input,
  Label,
  Modal,
  MultiSelect,
  Select
} from "~/components/ui"
import { ChannelType, ChannelTypeOptions } from "~/constants/newApi.ts"
import { useChannelForm } from "~/features/ChannelManagement/hooks/useChannelForm"
import { CHANNEL_STATUS, ChannelFormData, NewApiChannel } from "~/types/newapi"

export interface ChannelDialogProps {
  isOpen: boolean
  onClose: () => void
  mode?: "add" | "edit"
  channel?: NewApiChannel | null
  onSuccess?: (channel: any) => void
  initialValues?: Partial<ChannelFormData>
  initialModels?: string[]
  initialGroups?: string[]
}

export function ChannelDialog({
  isOpen,
  onClose,
  mode = "add",
  channel = null,
  onSuccess,
  initialValues,
  initialModels,
  initialGroups
}: ChannelDialogProps) {
  const { t } = useTranslation(["channelDialog", "common"])
  const [showKey, setShowKey] = useState(false)

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
    availableModels
  } = useChannelForm({
    mode,
    channel,
    isOpen,
    onClose,
    onSuccess,
    initialValues,
    initialModels,
    initialGroups
  })

  const handleSelectAllModels = () => {
    updateField(
      "models",
      availableModels.map((m) => m.value)
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
      <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
        {mode === "add"
          ? t("channelDialog:title.add", "Add Channel")
          : t("channelDialog:title.edit", "Edit Channel")}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
        {mode === "add"
          ? t(
              "channelDialog:description.add",
              "Create a new channel for your API aggregator"
            )
          : t("channelDialog:description.edit", "Update channel settings")}
      </p>
    </div>
  )

  const footer = (
    <div className="flex justify-end gap-3">
      <Button
        variant="outline"
        onClick={onClose}
        disabled={isSaving}
        type="button">
        {t("common:actions.cancel", "Cancel")}
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={!isFormValid || isSaving}
        loading={isSaving}
        type="submit">
        {mode === "add"
          ? t("channelDialog:actions.create", "Create Channel")
          : t("channelDialog:actions.update", "Update Channel")}
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
      closeOnEsc={!isSaving}>
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
            id="channel-type"
            value={formData.type}
            onChange={(e) =>
              handleTypeChange(Number(e.target.value) as ChannelType)
            }
            disabled={isSaving || mode === "edit"}
            required>
            {ChannelTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
            {t("channelDialog:fields.type.hint")}
          </p>
        </div>

        {/* API Key */}
        <div>
          <Label htmlFor="channel-key" required>
            {t("channelDialog:fields.key.label", "API Key")}
          </Label>
          <Input
            id="channel-key"
            type={showKey ? "text" : "password"}
            value={formData.key}
            onChange={(e) => updateField("key", e.target.value)}
            placeholder={t("channelDialog:fields.key.placeholder")}
            disabled={isSaving}
            required
            rightIcon={
              <IconButton
                variant="ghost"
                size="xs"
                onClick={() => setShowKey(!showKey)}
                aria-label={
                  showKey
                    ? t("channelDialog:actions.hideKey", "Hide Key")
                    : t("channelDialog:actions.showKey", "Show Key")
                }
                type="button"
                disabled={isSaving}>
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
          <Label htmlFor="channel-base-url" required={true}>
            {t("channelDialog:fields.baseUrl.label", "Base URL")}
          </Label>
          <Input
            id="channel-base-url"
            type="url"
            value={formData.base_url}
            onChange={(e) => updateField("base_url", e.target.value)}
            placeholder={t("channelDialog:fields.baseUrl.placeholder")}
            disabled={isSaving}
            required={true}
          />
        </div>

        {/* Models */}
        <div>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label className="mb-0">
              {t("channelDialog:fields.models.label", "Models")}
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllModels}
                disabled={
                  isSaving || isLoadingModels || availableModels.length === 0
                }
                type="button">
                {t("channelDialog:actions.selectAll", "Select All")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleInverseModels}
                disabled={
                  isSaving || isLoadingModels || availableModels.length === 0
                }
                type="button">
                {t("channelDialog:actions.inverse", "Inverse")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAllModels}
                disabled={
                  isSaving || isLoadingModels || formData.models.length === 0
                }
                type="button">
                {t("channelDialog:actions.deselectAll", "Deselect All")}
              </Button>
            </div>
          </div>
          <MultiSelect
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
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
            {t("channelDialog:fields.models.hint")}
          </p>
        </div>

        {/* Groups */}
        <div>
          <MultiSelect
            label={t("channelDialog:fields.groups.label", "Groups")}
            options={availableGroups}
            selected={formData.groups}
            onChange={(groups) => updateField("groups", groups)}
            placeholder={
              isLoadingGroups
                ? t("channelDialog:fields.groups.loading", "Loading groups...")
                : t("channelDialog:fields.groups.placeholder", "Select groups")
            }
            disabled={isSaving || isLoadingGroups}
            allowCustom
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
            {t(
              "channelDialog:fields.groups.hint",
              "Groups from your New API configuration"
            )}
          </p>
        </div>

        {/* Advanced Settings */}
        <details className="rounded-lg border border-gray-200 p-3 dark:border-dark-bg-tertiary">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-dark-text-primary">
            {t("channelDialog:sections.advanced", "Advanced Settings")}
          </summary>
          <div className="mt-3 space-y-4">
            {/* Priority */}
            <div>
              <Label htmlFor="channel-priority">
                {t("channelDialog:fields.priority.label", "Priority")}
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
              <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
                {t(
                  "channelDialog:fields.priority.hint",
                  "Higher priority channels are used first"
                )}
              </p>
            </div>

            {/* Weight */}
            <div>
              <Label htmlFor="channel-weight">
                {t("channelDialog:fields.weight.label", "Weight")}
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
              <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
                {t(
                  "channelDialog:fields.weight.hint",
                  "Weight for load balancing (0 = equal distribution)"
                )}
              </p>
            </div>

            {/* Status */}
            <div>
              <Label htmlFor="channel-status">
                {t("channelDialog:fields.status.label", "Status")}
              </Label>
              <Select
                id="channel-status"
                value={formData.status}
                onChange={(e) =>
                  updateField(
                    "status",
                    parseInt(e.target.value) as CHANNEL_STATUS
                  )
                }
                disabled={isSaving}>
                <option value={CHANNEL_STATUS.Enable}>
                  {t("channelDialog:fields.status.enabled", "Enabled")}
                </option>
                <option value={CHANNEL_STATUS.ManuallyDisabled}>
                  {t("channelDialog:fields.status.disabled", "Disabled")}
                </option>
              </Select>
            </div>
          </div>
        </details>
      </form>
    </Modal>
  )
}

export default ChannelDialog
