import { RotateCcw } from "lucide-react"

import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"

/** A quiet, consistently labelled reset action for individual appearance fields. */
export function AppearanceResetButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip content={label} anchorAsChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        <RotateCcw aria-hidden="true" />
      </Button>
    </Tooltip>
  )
}
