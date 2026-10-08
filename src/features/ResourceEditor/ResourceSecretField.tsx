import type { TFunction } from "i18next"
import type { ReactNode } from "react"

import { Button, Input } from "~/components/ui"
import { ResourceFieldLabel } from "~/features/ResourceEditor/ResourceFieldLabel"
import {
  RESOURCE_SECRET_EDIT_INTENT_KINDS,
  RESOURCE_SECRET_STATES,
  type RESOURCE_FIELD_TYPES,
  type ResourceFieldDescriptor,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/resourceNative"

type Props = {
  t: TFunction
  id: string
  label: string
  descriptor: Extract<
    ResourceFieldDescriptor,
    { type: typeof RESOURCE_FIELD_TYPES.Secret }
  >
  intent?: SecretEditIntent
  disabled: boolean
  hasErrors: boolean
  describedBy?: string
  help: ReactNode
  error: ReactNode
  onChange: (intent: SecretEditIntent) => void
}

/** Renders secret edit intent without exposing an existing credential. */
export function ResourceSecretField({
  t,
  id,
  label,
  descriptor,
  intent,
  disabled,
  hasErrors,
  describedBy,
  help,
  error,
  onChange,
}: Props) {
  return (
    <div>
      <ResourceFieldLabel htmlFor={id} required={descriptor.required}>
        {label}
      </ResourceFieldLabel>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        value={
          intent?.kind === RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
            ? intent.value
            : ""
        }
        placeholder={
          descriptor.secretState === RESOURCE_SECRET_STATES.Unavailable
            ? t("ui:secretList.newPlaceholder")
            : t("ui:secretList.keepPlaceholder")
        }
        disabled={disabled || !descriptor.canReplace}
        aria-invalid={hasErrors}
        aria-describedby={describedBy}
        onChange={(event) =>
          onChange(
            event.target.value
              ? {
                  kind: RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
                  value: event.target.value,
                }
              : { kind: RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged },
          )
        }
      />
      <div className="mt-density-2 flex gap-2">
        {descriptor.allowClear && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              disabled ||
              intent?.kind === RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear
            }
            onClick={() =>
              onChange({ kind: RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear })
            }
          >
            {t("common:actions.clear")}
          </Button>
        )}
        {intent?.kind !== RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() =>
              onChange({ kind: RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged })
            }
          >
            {descriptor.secretState === RESOURCE_SECRET_STATES.Unavailable
              ? t("common:actions.reset")
              : t("ui:secretList.restore")}
          </Button>
        )}
      </div>
      {intent?.kind === RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear && (
        <p className="text-muted-foreground mt-density-1 text-xs" role="status">
          {t("ui:secretList.clearedState")}
        </p>
      )}
      {help}
      {error}
    </div>
  )
}
