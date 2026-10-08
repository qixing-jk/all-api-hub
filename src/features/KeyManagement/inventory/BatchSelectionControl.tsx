import Tooltip from "~/components/Tooltip"
import { Checkbox } from "~/components/ui"

interface BatchSelectionControlProps {
  checked?: boolean | "indeterminate"
  label: string
  onSelectionChange?: (checked: boolean) => void
  disabledReason?: string
}

/** Keeps unavailable batch selection visible and keyboard-explainable. */
export function BatchSelectionControl({
  checked = false,
  label,
  onSelectionChange,
  disabledReason,
}: BatchSelectionControlProps) {
  if (onSelectionChange) {
    return (
      <Checkbox
        checked={checked}
        aria-label={label}
        onCheckedChange={(nextChecked) =>
          onSelectionChange(nextChecked === true)
        }
      />
    )
  }

  if (!disabledReason) return null

  return (
    <Tooltip content={disabledReason} anchorAsChild>
      <span
        className="inline-flex"
        role="checkbox"
        tabIndex={0}
        aria-label={label}
        aria-checked="false"
        aria-disabled="true"
      >
        <Checkbox checked={false} disabled tabIndex={-1} aria-hidden="true" />
      </span>
    </Tooltip>
  )
}
