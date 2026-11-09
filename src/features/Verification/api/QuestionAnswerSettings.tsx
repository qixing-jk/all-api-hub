import { RotateCcw } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  CollapsibleSection,
  Spinner,
  Textarea,
} from "~/components/ui"
import { cn } from "~/lib/utils"
import { DEFAULT_QUESTION_ANSWER_SETTINGS } from "~/services/verification/modelQuality/questionAnswerSettings"

import type { QuestionAnswerController } from "./useQuestionAnswerTest"
import { VerificationSettingsCard } from "./VerificationSettingsCard"

/** Edit and reset the default question like the other verification prompts. */
export function QuestionAnswerSettings({
  controller,
}: {
  controller: QuestionAnswerController
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const { settings, updateSettings, ready, running } = controller
  const disabled = !ready || running
  const questionEmpty = ready && !settings.question.trim()
  const modified =
    settings.question !== DEFAULT_QUESTION_ANSWER_SETTINGS.question ||
    settings.referenceAnswer !==
      DEFAULT_QUESTION_ANSWER_SETTINGS.referenceAnswer
  const fieldClass =
    "grid min-w-0 items-start gap-3 @sm/question-answer:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"

  return (
    <VerificationSettingsCard>
      <div className="@container/question-answer space-y-4">
        <div className={fieldClass}>
          <div className="min-w-0">
            <div className="flex min-h-8 items-center gap-1.5">
              <label
                htmlFor={`${id}-question`}
                className="text-foreground text-sm font-medium"
              >
                {t("verifyDialog.tools.questionAnswer.question")}
              </label>
              {modified ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("verifyDialog.tools.questionAnswer.reset")}
                  title={t("verifyDialog.tools.questionAnswer.reset")}
                  disabled={disabled}
                  onClick={() => {
                    updateSettings(DEFAULT_QUESTION_ANSWER_SETTINGS)
                    void controller.saveSettings()
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              ) : null}
              {controller.saving ? (
                <span
                  role="status"
                  aria-label={t("verifyDialog.tools.questionAnswer.saving")}
                >
                  <Spinner size="sm" variant="gray" />
                </span>
              ) : null}
            </div>
          </div>
          <div className="min-w-0">
            <Textarea
              id={`${id}-question`}
              autoSize
              rows={2}
              value={settings.question}
              disabled={disabled}
              aria-invalid={questionEmpty || undefined}
              aria-describedby={
                questionEmpty ? `${id}-question-error` : undefined
              }
              variant={questionEmpty ? "error" : "default"}
              onChange={(event) =>
                updateSettings({ question: event.target.value })
              }
              onBlur={() => void controller.saveSettings()}
              className={cn(
                "bg-card max-h-32! min-h-16 text-xs",
                !questionEmpty && "border-border-subtle",
              )}
            />
            {questionEmpty ? (
              <p
                id={`${id}-question-error`}
                className="text-destructive-text mt-density-1 text-xs"
              >
                {t("verifyDialog.tools.questionAnswer.questionRequired")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="border-border-subtle border-t pt-4">
          <div className={fieldClass}>
            <div className="min-w-0">
              <label
                htmlFor={`${id}-reference`}
                className="text-foreground text-sm font-medium"
              >
                {t("verifyDialog.tools.questionAnswer.reference")}
              </label>
            </div>
            <div className="min-w-0">
              <Textarea
                id={`${id}-reference`}
                autoSize
                rows={1}
                value={settings.referenceAnswer}
                disabled={disabled}
                onChange={(event) =>
                  updateSettings({ referenceAnswer: event.target.value })
                }
                onBlur={() => void controller.saveSettings()}
                className="border-border-subtle bg-card max-h-32! min-h-9 text-xs"
              />
              <CollapsibleSection
                title={t("verifyDialog.tools.questionAnswer.rules.title")}
                buttonClassName="mt-density-1 px-0"
                panelClassName="bg-transparent rounded-none border-0 px-0"
              >
                <ul className="text-muted-foreground list-disc space-y-2 pl-4 text-xs leading-relaxed">
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
      {controller.saveError ? (
        <Alert variant="warning">
          {controller.saveError === "load"
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
    </VerificationSettingsCard>
  )
}
