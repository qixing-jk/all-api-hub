import { useTranslation } from "react-i18next"

import { Alert, Badge, CollapsibleSection, Heading6 } from "~/components/ui"
import { QUESTION_ANSWER_TEST_ID } from "~/services/verification/modelQuality/questionAnswer"

import { QuestionAnswerSettings } from "./QuestionAnswerSettings"
import type { QuestionAnswerController } from "./useQuestionAnswerTest"
import { formatLatency } from "./utils"
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
  const idle = controller.status === "idle"
  const draftChanged =
    result &&
    (controller.settings.question !== result.question ||
      controller.settings.referenceAnswer !== result.referenceAnswer)
  const outcomes = {
    matched: t("verifyDialog.tools.questionAnswer.outcomes.matched"),
    mismatched: t("verifyDialog.tools.questionAnswer.outcomes.mismatched"),
    manual: t("verifyDialog.tools.questionAnswer.outcomes.manual"),
    ungraded: t("verifyDialog.tools.questionAnswer.outcomes.ungraded"),
    empty: t("verifyDialog.tools.questionAnswer.outcomes.empty"),
    incomplete: t("verifyDialog.tools.questionAnswer.outcomes.incomplete"),
  }
  const status = running
    ? t("verifyDialog.actions.running")
    : controller.status === "stopped"
      ? t("verifyDialog.status.stopped")
      : controller.status === "error"
        ? t("verifyDialog.tools.questionAnswer.requestFailed")
        : result
          ? outcomes[result.outcome]
          : t("verifyDialog.status.pending")

  return (
    <section aria-label={t("verifyDialog.tools.questionAnswer.title")}>
      <VerificationProbeDetails
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
          <Heading6 className="text-foreground text-sm">
            <VerificationTestLabel testId={QUESTION_ANSWER_TEST_ID}>
              {t("verifyDialog.tools.questionAnswer.title")}
            </VerificationTestLabel>
          </Heading6>
        }
        description={
          !idle ? (
            <p className="text-muted-foreground text-xs">
              {t("verifyDialog.tools.questionAnswer.description")}
            </p>
          ) : undefined
        }
        status={
          <Badge
            size="sm"
            className="gap-1.5"
            variant={
              controller.status === "error"
                ? "danger"
                : result?.outcome === "matched"
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
          result ? (
            <div className="space-y-density-3 @container/qa-result">
              {result.referenceAnswer.trim() ? (
                <div
                  role="group"
                  aria-label={t("verifyDialog.tools.questionAnswer.comparison")}
                  className="space-y-2"
                >
                  <dl className="grid min-w-0 gap-3 @sm/qa-result:grid-cols-2">
                    <div className="bg-surface-subtle min-w-0 space-y-2 rounded-lg p-3">
                      <dt className="text-muted-foreground text-xs">
                        {t("verifyDialog.tools.questionAnswer.finalAnswer")}
                      </dt>
                      <dd className="text-foreground text-sm font-medium break-words whitespace-pre-wrap">
                        {result.answer ||
                          t("verifyDialog.tools.questionAnswer.notIdentified")}
                      </dd>
                    </div>
                    <div className="bg-surface-subtle min-w-0 space-y-2 rounded-lg p-3">
                      <dt className="text-muted-foreground text-xs">
                        {t("verifyDialog.tools.questionAnswer.runReference")}
                      </dt>
                      <dd className="text-foreground text-sm font-medium break-words whitespace-pre-wrap">
                        {result.referenceAnswer}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {t("verifyDialog.tools.questionAnswer.comparisonHint")}
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  {t("verifyDialog.tools.questionAnswer.response")}
                </p>
                <pre className="text-foreground bg-surface-subtle max-h-64 overflow-auto rounded-lg p-3 [font-family:inherit] text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {result.text ||
                    t("verifyDialog.tools.questionAnswer.outcomes.empty")}
                </pre>
              </div>
              <CollapsibleSection
                title={t("verifyDialog.tools.questionAnswer.runQuestion")}
                buttonClassName="px-0 py-2"
                panelClassName="bg-transparent rounded-none border-0 px-0"
              >
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {result.question}
                </p>
              </CollapsibleSection>
            </div>
          ) : undefined
        }
      >
        {controller.error ? (
          <Alert variant="warning">
            {t("verifyDialog.tools.errors.unexpected", {
              message: controller.error,
            })}
          </Alert>
        ) : null}
        <QuestionAnswerSettings controller={controller} />
      </VerificationProbeDetails>
    </section>
  )
}
