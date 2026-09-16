import type { ReactNode } from "react"

import { SettingsResetButton } from "~/components/SettingsResetButton"

/** Shared field heading and reset affordance; choices keep their own layout. */
export function AppearanceFieldset({
  id,
  labelId,
  label,
  resetLabel,
  saving,
  isDefault,
  onReset,
  description,
  children,
}: {
  id?: string
  labelId: string
  label: string
  resetLabel: string
  saving: boolean
  isDefault: boolean
  onReset: () => void
  description?: string
  children: ReactNode
}) {
  return (
    <fieldset
      id={id}
      aria-labelledby={labelId}
      className="space-y-density-3 min-w-0"
    >
      <legend className="w-full text-sm font-medium">
        <span className="flex items-center justify-between gap-2">
          <span id={labelId}>{label}</span>
          <SettingsResetButton
            iconOnly
            label={resetLabel}
            disabled={saving}
            hidden={isDefault}
            onClick={onReset}
          />
        </span>
      </legend>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
      {children}
    </fieldset>
  )
}
