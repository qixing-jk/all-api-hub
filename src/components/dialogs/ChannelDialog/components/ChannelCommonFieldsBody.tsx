import type { TFunction } from "i18next"
import type { ReactNode } from "react"

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

const fieldDescriptionIds = (
  ...ids: Array<string | undefined>
): string | undefined => {
  const definedIds = ids.filter((id): id is string => Boolean(id))
  return definedIds.length > 0 ? definedIds.join(" ") : undefined
}

/** Renders shared field help or an accessible validation message. */
function ChannelFieldMessage({
  id,
  children,
  tone = "muted",
}: {
  id: string
  children: ReactNode
  tone?: "muted" | "error"
}) {
  return (
    <p
      id={id}
      role={tone === "error" ? "alert" : undefined}
      className={
        tone === "error"
          ? "mt-1 text-xs text-red-600 dark:text-red-400"
          : "dark:text-dark-text-secondary mt-1 text-xs text-gray-500"
      }
    >
      {children}
    </p>
  )
}

/** Shared name control used by legacy and resource-native channel binders. */
export function ChannelNameField({
  t,
  value,
  onChange,
  disabled,
  readOnly = false,
  required = false,
  errorMessage,
}: {
  t: TFunction
  value: string
  onChange: (value: string) => void
  disabled: boolean
  readOnly?: boolean
  required?: boolean
  errorMessage?: string
}) {
  const errorId = errorMessage ? "channel-name-error" : undefined
  return (
    <div>
      <Label htmlFor="channel-name" required={required}>
        {t("channelDialog:fields.name.label")}
      </Label>
      <Input
        id="channel-name"
        data-testid={CHANNEL_DIALOG_TEST_IDS.nameInput}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("channelDialog:fields.name.placeholder")}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorId}
      />
      {errorMessage && errorId ? (
        <ChannelFieldMessage id={errorId} tone="error">
          {errorMessage}
        </ChannelFieldMessage>
      ) : null}
    </div>
  )
}

/** Shared type control used by legacy and resource-native channel binders. */
export function ChannelTypeField({
  t,
  value,
  options,
  onChange,
  disabled,
  required = false,
  showUnknownStringType = false,
  errorMessage,
}: {
  t: TFunction
  value: string
  options: readonly ChannelCommonFieldsOption[]
  onChange: (value: string) => void
  disabled: boolean
  required?: boolean
  showUnknownStringType?: boolean
  errorMessage?: string
}) {
  const hintId = "channel-type-hint"
  const errorId = errorMessage ? "channel-type-error" : undefined
  return (
    <div>
      <Label htmlFor="channel-type" required={required}>
        {t("channelDialog:fields.type.label")}
      </Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          id="channel-type"
          data-testid={CHANNEL_DIALOG_TEST_IDS.typeSelect}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={fieldDescriptionIds(hintId, errorId)}
        >
          <SelectValue
            placeholder={t("channelDialog:fields.type.placeholder")}
          />
        </SelectTrigger>
        <SelectContent>
          {showUnknownStringType ? (
            <SelectItem value={value}>{value}</SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ChannelFieldMessage id={hintId}>
        {t("channelDialog:fields.type.hint")}
      </ChannelFieldMessage>
      {errorMessage && errorId ? (
        <ChannelFieldMessage id={errorId} tone="error">
          {errorMessage}
        </ChannelFieldMessage>
      ) : null}
    </div>
  )
}

/** Shared secret control that accepts only the binder-provided safe input value. */
export function ChannelSecretField({
  t,
  value,
  onChange,
  disabled,
  readOnly = false,
  required = false,
  revealed,
  onRevealedChange,
  placeholder,
  description,
  errorMessage,
  canLoadRealKey = false,
  isLoadingRealKey = false,
  onLoadRealKey,
  onCancelLoadRealKey,
  loadRealKeyLabel,
  loadingRealKeyLabel,
  cancelLoadRealKeyLabel,
  realKeyHint,
  actions,
}: {
  t: TFunction
  value: string
  onChange: (value: string) => void
  disabled: boolean
  readOnly?: boolean
  required?: boolean
  revealed: boolean
  onRevealedChange: (revealed: boolean) => void
  placeholder?: string
  description?: ReactNode
  errorMessage?: string
  canLoadRealKey?: boolean
  isLoadingRealKey?: boolean
  onLoadRealKey?: () => void
  onCancelLoadRealKey?: () => void
  loadRealKeyLabel?: string
  loadingRealKeyLabel?: string
  cancelLoadRealKeyLabel?: string
  realKeyHint?: string
  actions?: ReactNode
}) {
  const descriptionId = description ? "channel-key-description" : undefined
  const errorId = errorMessage ? "channel-key-error" : undefined
  return (
    <div>
      <Label htmlFor="channel-key" required={required}>
        {t("channelDialog:fields.key.label")}
      </Label>
      <Input
        id="channel-key"
        data-testid={CHANNEL_DIALOG_TEST_IDS.keyInput}
        type="password"
        revealable
        revealed={revealed}
        onRevealedChange={onRevealedChange}
        revealLabels={{
          show: t("channelDialog:actions.showKey"),
          hide: t("channelDialog:actions.hideKey"),
        }}
        value={value}
        autoComplete="new-password"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t("channelDialog:fields.key.placeholder")}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={fieldDescriptionIds(descriptionId, errorId)}
      />
      {description && descriptionId ? (
        <ChannelFieldMessage id={descriptionId}>
          {description}
        </ChannelFieldMessage>
      ) : null}
      {errorMessage && errorId ? (
        <ChannelFieldMessage id={errorId} tone="error">
          {errorMessage}
        </ChannelFieldMessage>
      ) : null}
      {canLoadRealKey ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="dark:text-dark-text-secondary text-xs text-gray-500">
            {realKeyHint ?? t("channelDialog:fields.key.realKeyHint")}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onLoadRealKey}
              disabled={disabled}
              loading={isLoadingRealKey}
            >
              {isLoadingRealKey
                ? loadingRealKeyLabel ??
                  t("channelDialog:actions.loadingRealKey")
                : loadRealKeyLabel ?? t("channelDialog:actions.loadRealKey")}
            </Button>
            {isLoadingRealKey && onCancelLoadRealKey ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onCancelLoadRealKey}
              >
                {cancelLoadRealKeyLabel ?? t("common:actions.cancel")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {actions ? (
        <div className="mt-2 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

/** Shared base URL control used by legacy and resource-native channel binders. */
export function ChannelBaseUrlField({
  t,
  value,
  onChange,
  disabled,
  readOnly = false,
  required = false,
  errorMessage,
}: {
  t: TFunction
  value: string
  onChange: (value: string) => void
  disabled: boolean
  readOnly?: boolean
  required?: boolean
  errorMessage?: string
}) {
  const errorId = errorMessage ? "channel-base-url-error" : undefined
  return (
    <div>
      <Label htmlFor="channel-base-url" required={required}>
        {t("channelDialog:fields.baseUrl.label")}
      </Label>
      <Input
        id="channel-base-url"
        data-testid={CHANNEL_DIALOG_TEST_IDS.baseUrlInput}
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("channelDialog:fields.baseUrl.placeholder")}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorId}
      />
      {errorMessage && errorId ? (
        <ChannelFieldMessage id={errorId} tone="error">
          {errorMessage}
        </ChannelFieldMessage>
      ) : null}
    </div>
  )
}

/** Shared models control used by legacy and resource-native channel binders. */
export function ChannelModelsField({
  t,
  options,
  selected,
  onChange,
  disabled,
  isLoading = false,
  showPrefillWarning = false,
  onSelectAll,
  onInverse,
  onDeselectAll,
  errorMessage,
  required = false,
  description,
}: {
  t: TFunction
  options: readonly ChannelCommonFieldsOption[]
  selected: string[]
  onChange: (models: string[]) => void
  disabled: boolean
  isLoading?: boolean
  showPrefillWarning?: boolean
  onSelectAll?: () => void
  onInverse?: () => void
  onDeselectAll?: () => void
  errorMessage?: string
  required?: boolean
  description?: ReactNode
}) {
  const showBulkActions = Boolean(onSelectAll && onInverse && onDeselectAll)
  const descriptionId = "channel-models-description"
  const errorId = errorMessage ? "channel-models-error" : undefined
  return (
    <div role="group" aria-label={t("channelDialog:fields.models.label")}>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Label className="mb-0" required={required}>
          {t("channelDialog:fields.models.label")}
        </Label>
        {showBulkActions ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectAll}
              disabled={disabled || isLoading || options.length === 0}
              type="button"
            >
              {t("channelDialog:actions.selectAll")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onInverse}
              disabled={disabled || isLoading || options.length === 0}
              type="button"
            >
              {t("channelDialog:actions.inverse")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDeselectAll}
              disabled={disabled || isLoading || selected.length === 0}
              type="button"
            >
              {t("channelDialog:actions.deselectAll")}
            </Button>
          </div>
        ) : null}
      </div>
      {showPrefillWarning ? (
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
        options={[...options]}
        selected={selected}
        onChange={onChange}
        size="default"
        inputTestId={CHANNEL_DIALOG_TEST_IDS.modelsInput}
        placeholder={
          isLoading
            ? t("channelDialog:fields.models.loading")
            : t("channelDialog:fields.models.placeholder")
        }
        disabled={disabled || isLoading}
        allowCustom
        aria-label={t("channelDialog:fields.models.label")}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={fieldDescriptionIds(descriptionId, errorId)}
        aria-required={required}
      />
      <ChannelFieldMessage id={descriptionId}>
        {description ?? t("channelDialog:fields.models.hint")}
      </ChannelFieldMessage>
      {errorMessage ? (
        <ChannelFieldMessage id="channel-models-error" tone="error">
          {errorMessage}
        </ChannelFieldMessage>
      ) : null}
    </div>
  )
}

/** Shared status control used by legacy and resource-native channel binders. */
export function ChannelStatusField({
  t,
  value,
  options,
  onChange,
  disabled,
  errorMessage,
  required = false,
}: {
  t: TFunction
  value: string
  options: readonly ChannelCommonFieldsOption[]
  onChange: (value: string) => void
  disabled: boolean
  errorMessage?: string
  required?: boolean
}) {
  const errorId = errorMessage ? "channel-status-error" : undefined
  return (
    <div>
      <Label htmlFor="channel-status" required={required}>
        {t("channelDialog:fields.status.label")}
      </Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          id="channel-status"
          data-testid={CHANNEL_DIALOG_TEST_IDS.statusSelect}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorId}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errorMessage && errorId ? (
        <ChannelFieldMessage id={errorId} tone="error">
          {errorMessage}
        </ChannelFieldMessage>
      ) : null}
    </div>
  )
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
      <ChannelNameField
        t={t}
        value={values.name}
        onChange={onNameChange}
        disabled={isInteractionDisabled}
        readOnly={isViewMode}
        required={!isViewMode}
      />

      <ChannelTypeField
        t={t}
        value={values.type}
        options={channelTypeOptions}
        onChange={onTypeChange}
        disabled={isInteractionDisabled || !isAddMode}
        required={!isViewMode}
        showUnknownStringType={showUnknownStringType}
      />

      <ChannelSecretField
        t={t}
        value={values.key}
        onChange={onKeyChange}
        disabled={isInteractionDisabled}
        readOnly={isViewMode}
        required={!isViewMode && isKeyRequired}
        revealed={isKeyRevealed}
        onRevealedChange={onKeyRevealedChange}
        canLoadRealKey={canLoadRealKey}
        isLoadingRealKey={isLoadingRealKey}
        onLoadRealKey={onLoadRealKey}
      />

      <ChannelBaseUrlField
        t={t}
        value={values.baseURL}
        onChange={onBaseURLChange}
        disabled={isInteractionDisabled}
        readOnly={isViewMode}
        required={!isViewMode && isBaseURLRequired}
      />

      {showGenericModelsField ? (
        <ChannelModelsField
          t={t}
          options={availableModels}
          selected={values.models}
          onChange={onModelsChange}
          disabled={isViewMode || isInteractionDisabled}
          isLoading={isLoadingModels}
          showPrefillWarning={showModelPrefillWarning}
          onSelectAll={isViewMode ? undefined : onSelectAllModels}
          onInverse={isViewMode ? undefined : onInverseModels}
          onDeselectAll={isViewMode ? undefined : onDeselectAllModels}
        />
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

          <ChannelStatusField
            t={t}
            value={values.status}
            options={statusOptions}
            onChange={onStatusChange}
            disabled={isViewMode || isInteractionDisabled}
          />
        </div>
      </details>
    </>
  )
}

export default ChannelCommonFieldsBody
