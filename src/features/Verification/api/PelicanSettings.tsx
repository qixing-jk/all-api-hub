import { useId } from "react"
import { useTranslation } from "react-i18next"

import { PELICAN_EXECUTION_MODES } from "~/services/verification/modelQuality/constants"

import type { VerificationToolsController } from "./useVerificationTools"
import { VerificationSettingsCard } from "./VerificationSettingsCard"
import { VerificationSettingToggle } from "./VerificationSettingToggle"

/** Compose drawing mode with the same prompt settings used by API probes. */
export function PelicanSettings({
  controller,
}: {
  controller: Pick<
    VerificationToolsController,
    "pelicanExecutionMode" | "setPelicanExecutionMode" | "isPelicanRunning"
  >
}) {
  const { t } = useTranslation("aiApiVerification")
  const agentSwitchId = useId()
  const { isPelicanRunning } = controller
  return (
    <VerificationSettingsCard running={isPelicanRunning}>
      <VerificationSettingToggle
        id={agentSwitchId}
        label={t("verifyDialog.tools.agent.label")}
        hint={t("verifyDialog.tools.agent.hint")}
        checked={
          controller.pelicanExecutionMode === PELICAN_EXECUTION_MODES.Agent
        }
        onChange={(checked) =>
          controller.setPelicanExecutionMode(
            checked
              ? PELICAN_EXECUTION_MODES.Agent
              : PELICAN_EXECUTION_MODES.Reply,
          )
        }
        disabled={isPelicanRunning}
      />
    </VerificationSettingsCard>
  )
}
