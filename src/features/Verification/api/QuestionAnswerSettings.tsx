import { useContext, useId } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button, CollapsibleSection, Textarea } from "~/components/ui"
import { DEFAULT_QUESTION_ANSWER_SETTINGS } from "~/services/verification/modelQuality/questionAnswerSettings"

import { VERIFICATION_SETTINGS_ERROR_PHASES } from "./types"
import type { QuestionAnswerController } from "./useQuestionAnswerTest"
import { VerificationPromptComposer } from "./VerificationPromptComposer"
import {
  VERIFICATION_SETTINGS_TARGETS,
  VerificationSelectionContext,
} from "./VerificationSelectionContext"
import { VerificationSettingsCard } from "./VerificationSettingsCard"

/** Keep grading configuration in the settings sidebar. */
export function QuestionAnswerSettings({
  controller,
}: {
  controller: QuestionAnswerController
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const { settings, updateSettings, ready, running } = controller
  const disabled = !ready || running
  const fieldClass = "grid min-w-0 items-start gap-3"
  return (
    <VerificationSettingsCard running={running}>
      <div className="@container/question-answer space-y-4">
        <div className="space-y-3">
          <div className={fieldClass}>
            <div className="min-w-0">
              <label
                htmlFor={`${id}-reference`}
                className="text-sm font-medium text-foreground"
              >
                {t("verifyDialog.tools.questionAnswer.reference")}
              </label>
            </div>
            <div className="min-w-0">
              <Textarea
                id={`${id}-reference`}
                data-verification-reference-answer
                autoSize
                rows={1}
                value={settings.referenceAnswer}
                disabled={disabled}
                onChange={(event) =>
                  updateSettings({ referenceAnswer: event.target.value })
                }
                onBlur={() => void controller.saveSettings()}
                className="max-h-32! min-h-9 border-border-subtle bg-card text-xs"
              />
              <CollapsibleSection
                title={t("verifyDialog.tools.questionAnswer.rules.title")}
                buttonClassName="mt-density-1 px-0"
                panelClassName="bg-transparent rounded-none border-0 px-0"
              >
                <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
                  <li>
                    {t("verifyDialog.tools.questionAnswer.rules.extraction")}
                  </li>
                  <li>
                    {t("verifyDialog.tools.questionAnswer.rules.matching")}
                  </li>
                  <li>
                    {t("verifyDialog.tools.questionAnswer.rules.unavailable")}
                  </li>
                  <li>
                    {t("verifyDialog.tools.questionAnswer.rules.privacy")}
                  </li>
                </ul>
              </CollapsibleSection>
            </div>
          </div>
        </div>
      </div>
    </VerificationSettingsCard>
  )
}

/** The editable question and send action stay beside the conversation. */
export function QuestionAnswerComposer({
  controller,
}: {
  controller: QuestionAnswerController
}) {
  const { t } = useTranslation("aiApiVerification")
  const workspace = useContext(VerificationSelectionContext)
  const { settings, ready, running } = controller
  const modified =
    settings.question !== DEFAULT_QUESTION_ANSWER_SETTINGS.question ||
    settings.referenceAnswer !==
      DEFAULT_QUESTION_ANSWER_SETTINGS.referenceAnswer
  return (
    <>
      <VerificationPromptComposer
        label={t("verifyDialog.tools.questionAnswer.question")}
        value={settings.question}
        onChange={(question) => controller.updateSettings({ question })}
        onBlur={() => void controller.saveSettings()}
        disabled={!ready}
        running={running}
        saving={controller.saving}
        saveHint={t("verifyDialog.composer.questionSavedScope")}
        accessory={
          workspace?.openSettings ? (
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto shrink-0 p-0 text-xs"
                onClick={() =>
                  workspace.openSettings?.(
                    VERIFICATION_SETTINGS_TARGETS.ReferenceAnswer,
                  )
                }
              >
                {t("verifyDialog.tools.questionAnswer.editReference")}
              </Button>
              {settings.referenceAnswer.trim() ? (
                <span className="truncate text-muted-foreground">
                  {settings.referenceAnswer}
                </span>
              ) : null}
            </div>
          ) : undefined
        }
        error={
          ready && !settings.question.trim()
            ? t("verifyDialog.tools.questionAnswer.questionRequired")
            : undefined
        }
        resetLabel={t("verifyDialog.tools.questionAnswer.reset")}
        onReset={
          modified
            ? () => {
                controller.updateSettings(DEFAULT_QUESTION_ANSWER_SETTINGS)
                void controller.saveSettings()
              }
            : undefined
        }
        action={{
          onClick: running ? controller.stop : controller.run,
          disabled: !running && !controller.canRun,
        }}
      />
      {controller.saveError ? (
        <Alert variant="warning">
          {controller.saveError === VERIFICATION_SETTINGS_ERROR_PHASES.Load
            ? t("verifyDialog.tools.questionAnswer.loadFailed")
            : t("verifyDialog.tools.questionAnswer.saveFailed")}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void (controller.ready
                ? controller.saveSettings()
                : controller.loadSettings())
            }
          >
            {t("verifyDialog.actions.retry")}
          </Button>
        </Alert>
      ) : null}
    </>
  )
}
