import { useId, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { PELICAN_EXECUTION_MODES } from "~/services/verification/modelQuality/constants"
import { PELICAN_PROMPT_ID } from "~/services/verification/promptOverrides"

import type { VerificationToolsController } from "./useVerificationTools"
import { VerificationPromptSettings } from "./VerificationPromptSettings"
import { VerificationSettingToggle } from "./VerificationSettingToggle"

/** Compose drawing mode with the same prompt settings used by API probes. */
export function PelicanSettings({
  controller,
  idle,
}: {
  controller: ComponentProps<typeof VerificationPromptSettings>["controller"] &
    Pick<
      VerificationToolsController,
      "pelicanExecutionMode" | "setPelicanExecutionMode" | "isPelicanRunning"
    >
  idle: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const agentSwitchId = useId()
  const { isPelicanRunning } = controller
  return (
    <VerificationPromptSettings
      controller={controller}
      probeId={PELICAN_PROMPT_ID}
      autoOpen={idle ? undefined : false}
    >
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
    </VerificationPromptSettings>
  )
}
