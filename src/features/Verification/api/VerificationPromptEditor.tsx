import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { getApiVerificationProbeLabel } from "~/services/verification/aiApiVerification/i18n"
import { PELICAN_TEST_PROMPT } from "~/services/verification/modelQuality/pelican"
import {
  PELICAN_PROMPT_ID,
  type VerificationPromptId,
} from "~/services/verification/promptOverrides"

import { VerificationPromptComposer } from "./VerificationPromptComposer"

/** Edits the shared prompt directly beneath the selected test's conversation. */
export function VerificationPromptEditor({
  controller,
  probeId,
  action,
  running,
}: {
  controller: Pick<
    VerificationToolsController,
    | "getDefaultPrompt"
    | "promptDraft"
    | "setPromptDraftValue"
    | "resetPrompt"
    | "promptSaveError"
    | "isSavingPrompts"
    | "promptIds"
  >
  probeId: VerificationPromptId
  action?: ComponentProps<typeof VerificationPromptComposer>["action"]
  running?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const defaultPrompt =
    controller.getDefaultPrompt(probeId) ??
    (probeId === PELICAN_PROMPT_ID ? PELICAN_TEST_PROMPT : "")
  const value = controller.promptDraft[probeId] ?? defaultPrompt
  const custom = Boolean(value.trim() && value.trim() !== defaultPrompt)
  if (probeId !== PELICAN_PROMPT_ID && !controller.promptIds.includes(probeId))
    return null
  return (
    <>
      <VerificationPromptComposer
        label={t("verifyDialog.tools.prompts.editorLabel", {
          probe: getApiVerificationProbeLabel(t, probeId),
        })}
        value={value}
        placeholder={defaultPrompt}
        onChange={(text) => controller.setPromptDraftValue(probeId, text)}
        running={running}
        saving={controller.isSavingPrompts}
        saveHint={t("verifyDialog.composer.savedScope")}
        resetDisabled={controller.isSavingPrompts}
        onReset={custom ? () => controller.resetPrompt(probeId) : undefined}
        action={action}
      />
      {controller.promptSaveError ? (
        <Alert variant="warning">
          {t("verifyDialog.tools.prompts.saveFailed", {
            message: controller.promptSaveError,
          })}
        </Alert>
      ) : null}
    </>
  )
}
