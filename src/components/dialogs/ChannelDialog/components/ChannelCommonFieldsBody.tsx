import type { TFunction } from "i18next"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  Alert,
  Button,
  CompactMultiSelect,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"

export type ChannelCommonFieldsValues = {
  name: string
  type: string
  key: string
  baseURL: string
  models: string[]
  groups: string[]
  priority: number
  weight: number
  status: string
}

export type ChannelCommonFieldsOption = {
  value: string
  label: string
}

export type ChannelCommonFieldsBodyProps = {
  t: TFunction
  values: ChannelCommonFieldsValues
  channelTypeOptions: ChannelCommonFieldsOption[]
  availableModels: ChannelCommonFieldsOption[]
  availableGroups: ChannelCommonFieldsOption[]
  statusOptions: ChannelCommonFieldsOption[]
  isViewMode: boolean
  isAddMode: boolean
  isInteractionDisabled: boolean
  isKeyRequired: boolean
  isBaseURLRequired: boolean
  isKeyRevealed: boolean
  canLoadRealKey: boolean
  isLoadingRealKey: boolean
  isLoadingModels: boolean
  isLoadingGroups: boolean
  showUnknownStringType: boolean
  showGenericModelsField: boolean
  showGroupsField: boolean
  showPriorityAndWeight: boolean
  showModelPrefillWarning: boolean
  onNameChange: (value: string) => void
  onTypeChange: (value: string) => void
  onKeyChange: (value: string) => void
  onKeyRevealedChange: (revealed: boolean) => void
  onLoadRealKey: () => void
  onBaseURLChange: (value: string) => void
  onModelsChange: (models: string[]) => void
  onGroupsChange: (groups: string[]) => void
  onSelectAllModels: () => void
  onInverseModels: () => void
  onDeselectAllModels: () => void
  onPriorityChange: (priority: number) => void
  onWeightChange: (weight: number) => void
  onStatusChange: (status: string) => void
}

/** Controlled presentation for fields shared by channel create/edit/detail. */
export function ChannelCommonFieldsBody({
  t,
  values,
  channelTypeOptions,
  availableModels,
  availableGroups,
  statusOptions,
  isViewMode,
  isAddMode,
  isInteractionDisabled,
  isKeyRequired,
  isBaseURLRequired,
  isKeyRevealed,
  canLoadRealKey,
  isLoadingRealKey,
  isLoadingModels,
  isLoadingGroups,
  showUnknownStringType,
  showGenericModelsField,
  showGroupsField,
  showPriorityAndWeight,
  showModelPrefillWarning,
  onNameChange,
  onTypeChange,
  onKeyChange,
  onKeyRevealedChange,
  onLoadRealKey,
  onBaseURLChange,
  onModelsChange,
  onGroupsChange,
  onSelectAllModels,
  onInverseModels,
  onDeselectAllModels,
  onPriorityChange,
  onWeightChange,
  onStatusChange,
}: ChannelCommonFieldsBodyProps) {
  return (
    <>
      <div>
        <Label htmlFor="channel-name" required={!isViewMode}>
          {t("channelDialog:fields.name.label")}
        </Label>
        <Input
          id="channel-name"
          data-testid={CHANNEL_DIALOG_TEST_IDS.nameInput}
          type="text"
          value={values.name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t("channelDialog:fields.name.placeholder")}
          disabled={isInteractionDisabled}
          readOnly={isViewMode}
          required={!isViewMode}
        />
      </div>

      <div>
        <Label htmlFor="channel-type" required={!isViewMode}>
          {t("channelDialog:fields.type.label")}
        </Label>
        <Select
          value={values.type}
          onValueChange={onTypeChange}
          disabled={isInteractionDisabled || !isAddMode}
          required={!isViewMode}
        >
          <SelectTrigger id="channel-type">
            <SelectValue
              placeholder={t("channelDialog:fields.type.placeholder")}
            />
          </SelectTrigger>
          <SelectContent>
            {showUnknownStringType ? (
              <SelectItem value={values.type}>{values.type}</SelectItem>
            ) : null}
            {channelTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
          {t("channelDialog:fields.type.hint")}
        </p>
      </div>

      <div>
        <Label htmlFor="channel-key" required={!isViewMode && isKeyRequired}>
          {t("channelDialog:fields.key.label")}
        </Label>
        <Input
          id="channel-key"
          data-testid={CHANNEL_DIALOG_TEST_IDS.keyInput}
          type="password"
          revealable
          revealed={isKeyRevealed}
          onRevealedChange={onKeyRevealedChange}
          revealLabels={{
            show: t("channelDialog:actions.showKey"),
            hide: t("channelDialog:actions.hideKey"),
          }}
          value={values.key}
          onChange={(event) => onKeyChange(event.target.value)}
          placeholder={t("channelDialog:fields.key.placeholder")}
          disabled={isInteractionDisabled}
          readOnly={isViewMode}
          required={!isViewMode && isKeyRequired}
        />
        {canLoadRealKey ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="dark:text-dark-text-secondary text-xs text-gray-500">
              {t("channelDialog:fields.key.realKeyHint")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onLoadRealKey}
              disabled={isInteractionDisabled}
              loading={isLoadingRealKey}
            >
              {isLoadingRealKey
                ? t("channelDialog:actions.loadingRealKey")
                : t("channelDialog:actions.loadRealKey")}
            </Button>
          </div>
        ) : null}
      </div>

      <div>
        <Label
          htmlFor="channel-base-url"
          required={!isViewMode && isBaseURLRequired}
        >
          {t("channelDialog:fields.baseUrl.label")}
        </Label>
        <Input
          id="channel-base-url"
          data-testid={CHANNEL_DIALOG_TEST_IDS.baseUrlInput}
          type="url"
          value={values.baseURL}
          onChange={(event) => onBaseURLChange(event.target.value)}
          placeholder={t("channelDialog:fields.baseUrl.placeholder")}
          disabled={isInteractionDisabled}
          readOnly={isViewMode}
          required={!isViewMode && isBaseURLRequired}
        />
      </div>

      {showGenericModelsField ? (
        <div>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label className="mb-0">
              {t("channelDialog:fields.models.label")}
            </Label>
            {!isViewMode ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSelectAllModels}
                  disabled={
                    isInteractionDisabled ||
                    isLoadingModels ||
                    availableModels.length === 0
                  }
                  type="button"
                >
                  {t("channelDialog:actions.selectAll")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onInverseModels}
                  disabled={
                    isInteractionDisabled ||
                    isLoadingModels ||
                    availableModels.length === 0
                  }
                  type="button"
                >
                  {t("channelDialog:actions.inverse")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDeselectAllModels}
                  disabled={
                    isInteractionDisabled ||
                    isLoadingModels ||
                    values.models.length === 0
                  }
                  type="button"
                >
                  {t("channelDialog:actions.deselectAll")}
                </Button>
              </div>
            ) : null}
          </div>
          {showModelPrefillWarning ? (
            <Alert
              variant="warning"
              title={t("channelDialog:warnings.modelsPrefillFailed.title")}
              description={t(
                "channelDialog:warnings.modelsPrefillFailed.description",
              )}
              className="mb-3"
            />
          ) : null}
          <CompactMultiSelect
            options={availableModels}
            selected={values.models}
            onChange={onModelsChange}
            size="default"
            inputTestId={CHANNEL_DIALOG_TEST_IDS.modelsInput}
            placeholder={
              isLoadingModels
                ? t("channelDialog:fields.models.loading")
                : t("channelDialog:fields.models.placeholder")
            }
            disabled={isViewMode || isInteractionDisabled || isLoadingModels}
            allowCustom
          />
          <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
            {t("channelDialog:fields.models.hint")}
          </p>
        </div>
      ) : null}

      {showGroupsField ? (
        <div>
          <CompactMultiSelect
            label={t("channelDialog:fields.groups.label")}
            options={availableGroups}
            selected={values.groups}
            onChange={onGroupsChange}
            size="default"
            placeholder={
              isLoadingGroups
                ? t("channelDialog:fields.groups.loading")
                : t("channelDialog:fields.groups.placeholder")
            }
            disabled={isViewMode || isInteractionDisabled || isLoadingGroups}
            allowCustom
          />
          <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
            {t("channelDialog:fields.groups.hint")}
          </p>
        </div>
      ) : null}

      <details className="dark:border-dark-bg-tertiary rounded-lg border border-gray-200 p-3">
        <summary className="dark:text-dark-text-primary cursor-pointer text-sm font-medium text-gray-700">
          {t("channelDialog:sections.advanced")}
        </summary>
        <div className="mt-3 space-y-4">
          {showPriorityAndWeight ? (
            <>
              <div>
                <Label htmlFor="channel-priority">
                  {t("channelDialog:fields.priority.label")}
                </Label>
                <Input
                  id="channel-priority"
                  type="number"
                  value={values.priority}
                  onChange={(event) =>
                    onPriorityChange(parseInt(event.target.value) || 0)
                  }
                  placeholder="0"
                  disabled={isInteractionDisabled}
                  readOnly={isViewMode}
                  min="0"
                />
                <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
                  {t("channelDialog:fields.priority.hint")}
                </p>
              </div>
              <div>
                <Label htmlFor="channel-weight">
                  {t("channelDialog:fields.weight.label")}
                </Label>
                <Input
                  id="channel-weight"
                  type="number"
                  value={values.weight}
                  onChange={(event) =>
                    onWeightChange(parseInt(event.target.value) || 0)
                  }
                  placeholder="0"
                  disabled={isInteractionDisabled}
                  readOnly={isViewMode}
                  min="0"
                />
                <p className="dark:text-dark-text-secondary mt-1 text-xs text-gray-500">
                  {t("channelDialog:fields.weight.hint")}
                </p>
              </div>
            </>
          ) : null}

          <div>
            <Label htmlFor="channel-status">
              {t("channelDialog:fields.status.label")}
            </Label>
            <Select
              value={values.status}
              onValueChange={onStatusChange}
              disabled={isViewMode || isInteractionDisabled}
            >
              <SelectTrigger id="channel-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </details>
    </>
  )
}

export default ChannelCommonFieldsBody
