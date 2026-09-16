import { RotateCcw } from "lucide-react"

import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"

/** Shared reset presentation; field actions reserve space when already default. */
export function SettingsResetButton({
  label,
  disabled,
  disabledLabel,
  hidden = false,
  iconOnly = false,
  onClick,
}: {
  label: string
  disabled?: boolean
  disabledLabel?: string
  hidden?: boolean
  iconOnly?: boolean
  onClick: () => void
}) {
  if (hidden)
    return (
      <span
        className="size-(--density-control-sm) shrink-0"
        aria-hidden="true"
      />
    )
  return (
    <Tooltip
      content={disabled && disabledLabel ? disabledLabel : label}
      anchorAsChild
    >
      <Button
        type="button"
        variant="ghost"
        size={iconOnly ? "icon-sm" : "sm"}
        className="text-muted-foreground shrink-0"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        <RotateCcw aria-hidden="true" />
        {!iconOnly && label}
      </Button>
    </Tooltip>
  )
}
