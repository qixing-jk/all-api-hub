import type { TFunction } from "i18next"
import { Eye, LoaderCircle, RotateCw } from "lucide-react"
import type { ReactNode } from "react"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import {
  Alert,
  Button,
  CompactMultiSelect,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { ResourceFieldLabel } from "~/features/ResourceEditor/ResourceFieldLabel"

export type ChannelCommonFieldsOption = {
  value: string
  label: string
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

/** Shared name control for native managed resources. */
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
      <ResourceFieldLabel htmlFor="channel-name" required={required}>
        {t("channelDialog:fields.name.label")}
      </ResourceFieldLabel>
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

/** Shared type control for native managed resources. */
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
      <ResourceFieldLabel htmlFor="channel-type" required={required}>
        {t("channelDialog:fields.type.label")}
      </ResourceFieldLabel>
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
  realKeyLoadError,
  realKeyUnavailableMessage,
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
  realKeyLoadError?: string
  realKeyUnavailableMessage?: string
  actions?: ReactNode
}) {
  const isCancelableRealKeyLoad =
    isLoadingRealKey && Boolean(onCancelLoadRealKey)

  const descriptionId = description ? "channel-key-description" : undefined
  const realKeyHintId = canLoadRealKey ? "channel-key-real-key-hint" : undefined
  const realKeyUnavailableMessageId =
    !canLoadRealKey && realKeyUnavailableMessage
      ? "channel-key-real-key-unavailable"
      : undefined
  const errorId = errorMessage ? "channel-key-error" : undefined
  return (
    <div>
      <ResourceFieldLabel htmlFor="channel-key" required={required}>
        {t("channelDialog:fields.key.label")}
      </ResourceFieldLabel>
      <Input
        id="channel-key"
        data-testid={CHANNEL_DIALOG_TEST_IDS.keyInput}
        type="password"
        revealable={!canLoadRealKey}
        rightIcon={
          canLoadRealKey ? (
            <IconButton
              type="button"
              size="sm"
              variant="ghost"
              onMouseDown={(event) => event.preventDefault()}
              onClick={
                isCancelableRealKeyLoad ? onCancelLoadRealKey : onLoadRealKey
              }
              disabled={
                disabled || (isLoadingRealKey && !isCancelableRealKeyLoad)
              }
              aria-busy={isLoadingRealKey}
              aria-live={isLoadingRealKey ? "polite" : undefined}
              aria-describedby={realKeyHintId}
              aria-label={
                isCancelableRealKeyLoad
                  ? cancelLoadRealKeyLabel ?? t("common:actions.cancel")
                  : isLoadingRealKey
                    ? loadingRealKeyLabel ??
                      t("channelDialog:actions.loadingRealKey")
                    : loadRealKeyLabel ?? t("channelDialog:actions.loadRealKey")
              }
            >
              {isLoadingRealKey ? (
                <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
              ) : realKeyLoadError ? (
                <RotateCw aria-hidden className="h-4 w-4" />
              ) : (
                <Eye aria-hidden className="h-4 w-4" />
              )}
            </IconButton>
          ) : undefined
        }
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
        aria-describedby={fieldDescriptionIds(
          descriptionId,
          realKeyHintId,
          realKeyUnavailableMessageId,
          errorId,
        )}
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
        <div className="mt-1">
          <p
            id={realKeyHintId}
            role={realKeyLoadError ? "alert" : "status"}
            className={
              realKeyLoadError
                ? "min-w-0 text-xs text-red-600 dark:text-red-400"
                : "text-muted-foreground min-w-0 text-xs"
            }
          >
            {realKeyLoadError ??
              realKeyHint ??
              t("channelDialog:fields.key.realKeyHint")}
          </p>
        </div>
      ) : null}
      {realKeyUnavailableMessageId ? (
        <ChannelFieldMessage id={realKeyUnavailableMessageId}>
          {realKeyUnavailableMessage}
        </ChannelFieldMessage>
      ) : null}
      {actions ? (
        <div className="mt-2 flex flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

/** Shared base URL control for native managed resources. */
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
      <ResourceFieldLabel htmlFor="channel-base-url" required={required}>
        {t("channelDialog:fields.baseUrl.label")}
      </ResourceFieldLabel>
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

/** Shared models control for native managed resources. */
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
  actions,
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
  actions?: ReactNode
}) {
  const showBulkActions = Boolean(onSelectAll && onInverse && onDeselectAll)
  const descriptionId = "channel-models-description"
  const errorId = errorMessage ? "channel-models-error" : undefined
  return (
    <div role="group" aria-label={t("channelDialog:fields.models.label")}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <ResourceFieldLabel className="mb-0 min-w-0" required={required}>
          {t("channelDialog:fields.models.label")}
        </ResourceFieldLabel>
        {showBulkActions || actions ? (
          <div className="ml-auto flex max-w-[65%] shrink-0 flex-wrap items-center justify-end gap-2">
            {showBulkActions ? (
              <>
                <Button
                  variant="dashed"
                  size="sm"
                  onClick={onSelectAll}
                  disabled={disabled || isLoading || options.length === 0}
                  type="button"
                >
                  {t("channelDialog:actions.selectAll")}
                </Button>
                <Button
                  variant="dashed"
                  size="sm"
                  onClick={onInverse}
                  disabled={disabled || isLoading || options.length === 0}
                  type="button"
                >
                  {t("channelDialog:actions.inverse")}
                </Button>
                <Button
                  variant="dashed"
                  size="sm"
                  onClick={onDeselectAll}
                  disabled={disabled || isLoading || selected.length === 0}
                  type="button"
                >
                  {t("channelDialog:actions.deselectAll")}
                </Button>
              </>
            ) : null}
            {actions}
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
        bulkActionsMinOptions={
          showBulkActions ? Number.POSITIVE_INFINITY : undefined
        }
        aria-label={t("channelDialog:fields.models.label")}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={fieldDescriptionIds(descriptionId, errorId)}
        aria-required={required}
      />
      <ChannelFieldMessage id={descriptionId}>
        {description ?? t("channelDialog:fields.models.hint")}
      </ChannelFieldMessage>
      {errorMessage && errorId ? (
        <ChannelFieldMessage id={errorId} tone="error">
          {errorMessage}
        </ChannelFieldMessage>
      ) : null}
    </div>
  )
}

/** Shared status control for native managed resources. */
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
      <ResourceFieldLabel htmlFor="channel-status" required={required}>
        {t("channelDialog:fields.status.label")}
      </ResourceFieldLabel>
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
