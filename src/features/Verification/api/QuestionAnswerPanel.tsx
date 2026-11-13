import { useTranslation } from "react-i18next"

import { Alert, Badge, CollapsibleSection, Heading6 } from "~/components/ui"
import { VERIFICATION_RAIL_STATUS_VARIANTS } from "~/features/Verification/api/types"
import { VERIFICATION_GENERATION_PART_TYPES } from "~/services/verification/aiApiVerification/generationProgress"
import {
  QUESTION_ANSWER_OUTCOMES,
  QUESTION_ANSWER_TEST_ID,
} from "~/services/verification/modelQuality/questionAnswer"

import {
  QuestionAnswerComposer,
  QuestionAnswerSettings,
} from "./QuestionAnswerSettings"
import { VERIFICATION_TOOL_STATUSES } from "./types"
import type { QuestionAnswerController } from "./useQuestionAnswerTest"
import { useVerificationRunPrompt } from "./useVerificationRunPrompt"
import { formatLatency } from "./utils"
import { VerificationGenerationOutput } from "./VerificationGenerationOutput"
import { VerificationProbeDetails } from "./VerificationProbeDetails"
import { VerificationProbeIntroduction } from "./VerificationProbeIntroduction"
import { VerificationRunAction } from "./VerificationRunAction"
import { VerificationTestLabel } from "./VerificationTestLabel"

/** On-demand Q&A configuration and answer evidence, independent of API compatibility. */
export function QuestionAnswerPanel({
  controller,
}: {
  controller: QuestionAnswerController
}) {
  const { t } = useTranslation("aiApiVerification")
  const { running, result } = controller
  const question = useVerificationRunPrompt({
    running,
    startedAt: controller.startedAt,
    draft: controller.settings.question.trim(),
    resultPrompt: result?.question,
  })
  const idle = controller.status === VERIFICATION_TOOL_STATUSES.Idle
  const draftChanged =
    result &&
    (controller.settings.question !== result.question ||
      controller.settings.referenceAnswer !== result.referenceAnswer)
  const outcomes = {
    [QUESTION_ANSWER_OUTCOMES.Matched]: t(
      "verifyDialog.tools.questionAnswer.outcomes.matched",
    ),
    [QUESTION_ANSWER_OUTCOMES.Mismatched]: t(
      "verifyDialog.tools.questionAnswer.outcomes.mismatched",
    ),
    [QUESTION_ANSWER_OUTCOMES.Manual]: t(
      "verifyDialog.tools.questionAnswer.outcomes.manual",
    ),
    [QUESTION_ANSWER_OUTCOMES.Ungraded]: t(
      "verifyDialog.tools.questionAnswer.outcomes.ungraded",
    ),
    [QUESTION_ANSWER_OUTCOMES.Empty]: t(
      "verifyDialog.tools.questionAnswer.outcomes.empty",
    ),
    [QUESTION_ANSWER_OUTCOMES.Incomplete]: t(
      "verifyDialog.tools.questionAnswer.outcomes.incomplete",
    ),
  }
  const status = running
    ? t("verifyDialog.actions.running")
    : controller.status === VERIFICATION_TOOL_STATUSES.Stopped
      ? t("verifyDialog.status.stopped")
      : controller.status === VERIFICATION_TOOL_STATUSES.Error
        ? t("verifyDialog.tools.questionAnswer.requestFailed")
        : result
          ? outcomes[result.outcome]
          : t("verifyDialog.status.pending")

  return (
    <section aria-label={t("verifyDialog.tools.questionAnswer.title")}>
      <VerificationProbeDetails
        settings={<QuestionAnswerSettings controller={controller} />}
        composer={<QuestionAnswerComposer controller={controller} />}
        testId={QUESTION_ANSWER_TEST_ID}
        running={controller.status === VERIFICATION_TOOL_STATUSES.Running}
        statusLabel={status}
        statusVariant={
          controller.status === VERIFICATION_TOOL_STATUSES.Running
            ? VERIFICATION_RAIL_STATUS_VARIANTS.Running
            : controller.status === VERIFICATION_TOOL_STATUSES.Error
              ? VERIFICATION_RAIL_STATUS_VARIANTS.Danger
              : result?.outcome === QUESTION_ANSWER_OUTCOMES.Matched
                ? VERIFICATION_RAIL_STATUS_VARIANTS.Success
                : result
                  ? VERIFICATION_RAIL_STATUS_VARIANTS.Warning
                  : undefined
        }
        label={t("verifyDialog.tools.questionAnswer.title")}
        idleContent={
          idle ? (
            <VerificationProbeIntroduction
              probeId={QUESTION_ANSWER_TEST_ID}
              title={t("verifyDialog.tools.questionAnswer.title")}
              onRun={controller.run}
              disabled={!controller.canRun}
            />
          ) : undefined
        }
        heading={
          <Heading6 className="text-sm text-foreground">
            <VerificationTestLabel testId={QUESTION_ANSWER_TEST_ID}>
              {t("verifyDialog.tools.questionAnswer.title")}
            </VerificationTestLabel>
          </Heading6>
        }
        status={
          <Badge
            size="sm"
            className="gap-1.5"
            variant={
              controller.status === VERIFICATION_TOOL_STATUSES.Error
                ? "danger"
                : result?.outcome === QUESTION_ANSWER_OUTCOMES.Matched
                  ? "success"
                  : result && result.outcome !== "manual"
                    ? "warning"
                    : "outline"
            }
          >
            <span>{status}</span>
            {result ? (
              <span className="font-normal">
                {formatLatency(result.latencyMs)}
              </span>
            ) : null}
          </Badge>
        }
        action={
          <VerificationRunAction
            running={running}
            canRun={controller.canRun}
            onRun={controller.run}
            onStop={controller.stop}
            runLabel={t("verifyDialog.tools.questionAnswer.run")}
          />
        }
        resultSummary={
          draftChanged ? (
            <Alert variant="info" role="status" compact>
              {t("verifyDialog.tools.questionAnswer.draftChanged")}
            </Alert>
          ) : undefined
        }
        detailsContent={
          result || running || controller.progress || question ? (
            <div className="@container/qa-result flex min-h-0 flex-1 flex-col gap-density-3 [&>*:not([data-testid=verification-generation-output])]:shrink-0">
              <VerificationGenerationOutput
                question={question}
                text={
                  result
                    ? result.text ||
                      t("verifyDialog.tools.questionAnswer.outcomes.empty")
                    : undefined
                }
                progress={controller.progress}
                metrics={result?.metrics}
                running={running}
                startedAt={controller.startedAt}
                partial={
                  !running &&
                  (!result ||
                    result.outcome === QUESTION_ANSWER_OUTCOMES.Incomplete)
                }
              />
              {result?.referenceAnswer.trim() ? (
                <div
                  role="group"
                  aria-label={t("verifyDialog.tools.questionAnswer.comparison")}
                  className="space-y-2"
                >
                  <CollapsibleSection
                    title={t("verifyDialog.tools.questionAnswer.comparison")}
                    buttonClassName="px-0"
                    panelClassName="space-y-2 border-0 bg-transparent px-0 shadow-none"
                  >
                    <dl className="grid min-w-0 gap-3 @sm/qa-result:grid-cols-2">
                      <div className="min-w-0 space-y-2 rounded-lg bg-surface-subtle p-3">
                        <dt className="text-xs text-muted-foreground">
                          {t("verifyDialog.tools.questionAnswer.finalAnswer")}
                        </dt>
                        <dd className="text-sm font-medium break-words whitespace-pre-wrap text-foreground">
                          {result.answer ||
                            t(
                              "verifyDialog.tools.questionAnswer.notIdentified",
                            )}
                        </dd>
                      </div>
                      <div className="min-w-0 space-y-2 rounded-lg bg-surface-subtle p-3">
                        <dt className="text-xs text-muted-foreground">
                          {t("verifyDialog.tools.questionAnswer.runReference")}
                        </dt>
                        <dd className="text-sm font-medium break-words whitespace-pre-wrap text-foreground">
                          {result.referenceAnswer}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {t("verifyDialog.tools.questionAnswer.comparisonHint")}
                    </p>
                  </CollapsibleSection>
                </div>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {controller.error &&
        !controller.progress?.parts?.some(
          (part) => part.type === VERIFICATION_GENERATION_PART_TYPES.Error,
        ) ? (
          <Alert variant="warning">
            {t("verifyDialog.tools.errors.unexpected", {
              message: controller.error,
            })}
          </Alert>
        ) : null}
      </VerificationProbeDetails>
    </section>
  )
}
