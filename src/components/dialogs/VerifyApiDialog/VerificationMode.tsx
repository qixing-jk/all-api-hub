import { useId } from "react"
import { useTranslation } from "react-i18next"

import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { cn } from "~/lib/utils"
import {
  API_VERIFICATION_MODES,
  type ApiVerificationMode,
} from "~/services/verification/aiApiVerification"
import { getApiVerificationModeLabel } from "~/services/verification/aiApiVerification/i18n"

/** Select the generation mode to test without automatic mode negotiation. */
export function VerificationModeSelect({
  value,
  onChange,
  disabled,
  labelRowClassName,
}: {
  value: ApiVerificationMode
  onChange: (value: ApiVerificationMode) => void
  disabled?: boolean
  /**
   * Extra classes for the label row.
   *
   * Callers whose sibling fields reserve a taller label row can pass the same
   * height here so paired controls keep a shared baseline.
   */
  labelRowClassName?: string
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()

  return (
    <div className="space-y-density-1-5">
      <div className={cn("flex items-center", labelRowClassName)}>
        <label htmlFor={id} className="text-muted-foreground text-xs">
          {t("verifyDialog.meta.mode")}
        </label>
      </div>
      <Select
        value={value}
        onValueChange={(mode) => onChange(mode as ApiVerificationMode)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(API_VERIFICATION_MODES).map((mode) => (
            <SelectItem key={mode} value={mode}>
              {getApiVerificationModeLabel(t, mode)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Display recorded modes without guessing the mode of older results. */
export function VerificationModeBadge({
  mode,
}: {
  mode?: ApiVerificationMode
}) {
  const { t } = useTranslation("aiApiVerification")
  return mode ? (
    <Badge variant="outline" size="sm">
      {getApiVerificationModeLabel(t, mode)}
    </Badge>
  ) : null
}
