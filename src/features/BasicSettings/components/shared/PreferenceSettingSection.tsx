import type { ComponentProps } from "react"

import { SettingSection } from "~/components/SettingSection"

type SectionProps = ComponentProps<typeof SettingSection>
type ResetKeys = "onReset" | "resetDisabled" | "resetRequiresConfirmation"
type ResetPolicy =
  | (Required<Pick<SectionProps, ResetKeys>> & { resetNotApplicable?: never })
  | {
      /** Only non-preference sections may omit reset; the reason stays in source. */
      resetNotApplicable:
        | "browser-permissions"
        | "runtime-status"
        | "external-consent"
      onReset?: never
      resetDisabled?: never
      resetRequiresConfirmation?: never
    }

/** Settings cannot silently omit a reset action, default-state check, or risk decision. */
export function PreferenceSettingSection({
  resetNotApplicable: _resetNotApplicable,
  ...props
}: Omit<SectionProps, ResetKeys> & ResetPolicy) {
  return <SettingSection {...props} />
}
