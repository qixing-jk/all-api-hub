import type { TFunction } from "i18next"

import { Button } from "~/components/ui"

import { RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS } from "./resourceFieldPolicy"
import type {
  ResourceEditorControlledOptionState,
  ResourceOptionLoadState,
} from "./useLoadedResourceOptions"
import { RESOURCE_OPTION_LOAD_STATUSES } from "./useLoadedResourceOptions"

type OptionState =
  | ResourceOptionLoadState
  | ResourceEditorControlledOptionState
  | undefined

type ResourceManualOptionControlProps = {
  t: TFunction
  label: string
  disabled: boolean
  state: OptionState
  emptyMessage?: string
  optionCount: number
  onLoad: () => void
}

/** Renders the explicit load, refresh, retry, and empty states for manual options. */
export function ResourceManualOptionControl({
  t,
  label,
  disabled,
  state,
  emptyMessage,
  optionCount,
  onLoad,
}: ResourceManualOptionControlProps) {
  const isLoading = state?.status === RESOURCE_OPTION_LOAD_STATUSES.Loading
  const actionLabel = isLoading
    ? RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.loadingField(t, label)
    : state?.status === RESOURCE_OPTION_LOAD_STATUSES.Ready
      ? RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.refreshField(t, label)
      : RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.loadField(t, label)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {state?.status === RESOURCE_OPTION_LOAD_STATUSES.Error ? (
        <>
          <p role="alert" className="text-xs text-red-600">
            {state.errorMessage ??
              RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.error(t)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={onLoad}
            aria-label={`${RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.retry(t)} ${label}`}
          >
            {RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.retry(t)}
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || isLoading}
            aria-busy={isLoading || undefined}
            onClick={onLoad}
          >
            <span aria-live="polite">{actionLabel}</span>
          </Button>
          {state?.status === RESOURCE_OPTION_LOAD_STATUSES.Ready &&
          optionCount === 0 ? (
            <p className="text-muted-foreground text-xs">
              {emptyMessage ??
                RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.empty(t)}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

type ResourceAutomaticOptionFeedbackProps = {
  t: TFunction
  label: string
  disabled: boolean
  state: OptionState
  emptyMessage?: string
  optionCount: number
  announceControlledEmpty?: boolean
  onRetry: () => void
}

/** Renders progress, empty, and retry feedback for automatically loaded options. */
export function ResourceAutomaticOptionFeedback({
  t,
  label,
  disabled,
  state,
  emptyMessage,
  optionCount,
  announceControlledEmpty = false,
  onRetry,
}: ResourceAutomaticOptionFeedbackProps) {
  if (!state) return null
  if (state.status === RESOURCE_OPTION_LOAD_STATUSES.Loading) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-muted-foreground mt-1 text-xs"
      >
        {RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.loading(t)}
      </p>
    )
  }
  if (
    state.status === RESOURCE_OPTION_LOAD_STATUSES.Ready &&
    optionCount === 0
  ) {
    return (
      <p
        role={announceControlledEmpty && emptyMessage ? "status" : undefined}
        aria-live={
          announceControlledEmpty && emptyMessage ? "polite" : undefined
        }
        className="text-muted-foreground mt-1 text-xs"
      >
        {emptyMessage ?? RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.empty(t)}
      </p>
    )
  }
  if (state.status !== RESOURCE_OPTION_LOAD_STATUSES.Error) return null
  return (
    <div className="mt-1 flex items-center gap-2">
      <p role="alert" className="text-xs text-red-600">
        {state.errorMessage ??
          RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.error(t)}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onRetry}
        aria-label={`${RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.retry(t)} ${label}`}
      >
        {RESOURCE_EDITOR_OPTION_STATE_LABEL_RESOLVERS.retry(t)}
      </Button>
    </div>
  )
}
