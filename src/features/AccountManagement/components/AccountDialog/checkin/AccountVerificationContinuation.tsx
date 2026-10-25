import { useTranslation } from "react-i18next"

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  WorkflowTransitionButton,
} from "~/components/ui"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { AUTO_CHECKIN_TARGET_IDS } from "~/features/BasicSettings/components/tabs/CheckinRedeem/searchTargets"
import type { CheckInConfig } from "~/types"
import { openSettingsTabInNewTab } from "~/utils/navigation"

/** Account-level choice for the continuation preference; absent inherits the global one. */
const VERIFICATION_CONTINUATION_VALUES = {
  inherit: "inherit",
  enabled: "enabled",
  disabled: "disabled",
} as const

/** Owns the account override and its link to the global verification preference. */
export function AccountVerificationContinuation({
  controlId,
  checkIn,
  onCheckInChange,
}: {
  controlId: string
  checkIn: CheckInConfig
  onCheckInChange: (value: CheckInConfig) => void
}) {
  const { t } = useTranslation("accountDialog")
  const { preferences } = useUserPreferencesContext()
  const verificationContinuationSelection =
    checkIn.continueWhenVerificationRequired === true
      ? VERIFICATION_CONTINUATION_VALUES.enabled
      : checkIn.continueWhenVerificationRequired === false
        ? VERIFICATION_CONTINUATION_VALUES.disabled
        : VERIFICATION_CONTINUATION_VALUES.inherit
  // Inheriting must still show what it resolves to; the global default is off.
  const globalContinueWhenVerificationRequired =
    preferences?.autoCheckin?.continueWhenVerificationRequired === true
  const resolvedContinueWhenVerificationRequired =
    checkIn.continueWhenVerificationRequired ??
    globalContinueWhenVerificationRequired
  return (
    <div className="gap-y-density-2 flex flex-col gap-x-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex-1">
        <Label htmlFor={controlId}>
          {t("form.continueWhenVerificationRequired")}
        </Label>
        <p className="text-muted-foreground mt-density-1 text-xs">
          {t("form.continueWhenVerificationRequiredDesc")}
        </p>
        <WorkflowTransitionButton
          type="button"
          variant="link"
          size="sm"
          className="text-muted-foreground mt-density-1 hover:text-foreground h-auto min-h-0 justify-start p-0 text-xs font-medium"
          onClick={() => {
            // A background tab keeps this form and its unsaved draft mounted.
            void openSettingsTabInNewTab(BASIC_SETTINGS_TAB_IDS.CheckinRedeem, {
              anchor: AUTO_CHECKIN_TARGET_IDS.continueWhenVerificationRequired,
              highlight: true,
              keepCurrentWindow: true,
            })
          }}
        >
          {t("form.continueWhenVerificationRequiredOpenSettings")}
        </WorkflowTransitionButton>
      </div>
      <Select
        value={verificationContinuationSelection}
        onValueChange={(value) =>
          onCheckInChange({
            ...checkIn,
            continueWhenVerificationRequired:
              value === VERIFICATION_CONTINUATION_VALUES.inherit
                ? undefined
                : value === VERIFICATION_CONTINUATION_VALUES.enabled,
          })
        }
      >
        <SelectTrigger
          className="w-full sm:w-56"
          id={controlId}
          aria-label={t("form.continueWhenVerificationRequired")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={VERIFICATION_CONTINUATION_VALUES.inherit}>
            {t(
              resolvedContinueWhenVerificationRequired
                ? "form.continueWhenVerificationRequiredInheritOn"
                : "form.continueWhenVerificationRequiredInheritOff",
            )}
          </SelectItem>
          <SelectItem value={VERIFICATION_CONTINUATION_VALUES.enabled}>
            {t("form.continueWhenVerificationRequiredOn")}
          </SelectItem>
          <SelectItem value={VERIFICATION_CONTINUATION_VALUES.disabled}>
            {t("form.continueWhenVerificationRequiredOff")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
