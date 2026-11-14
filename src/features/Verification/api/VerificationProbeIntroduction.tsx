import { Play } from "lucide-react"
import { type MouseEventHandler, type ReactNode } from "react"
import { Trans, useTranslation } from "react-i18next"

import { Button, Heading6 } from "~/components/ui"
import {
  VerificationTestIcon,
  type VerificationTestId,
} from "~/features/Verification/api/VerificationTestLabel"
import { cn } from "~/lib/utils"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification"
import { PELICAN_PROMPT_ID } from "~/services/verification/modelQuality/constants"
import { CONTEXT_CAPACITY_TEST_ID } from "~/services/verification/modelQuality/contextCapacityConstants"
import { NEEDLE_TEST_ID } from "~/services/verification/modelQuality/needleConstants"
import { QUESTION_ANSWER_TEST_ID } from "~/services/verification/modelQuality/questionAnswerConstants"

/** Explain a test when no current evidence is available, including restored summaries. */
export function VerificationProbeIntroduction({
  probeId,
  title,
  onRun,
  disabled,
  note,
}: {
  probeId: VerificationTestId
  title: string
  onRun: MouseEventHandler<HTMLButtonElement> | undefined
  disabled?: boolean
  note?: ReactNode
}) {
  const { t } = useTranslation("aiApiVerification")
  const primaryRun =
    probeId === API_VERIFICATION_PROBE_IDS.Models ||
    probeId === CONTEXT_CAPACITY_TEST_ID
  const descriptions: Record<VerificationTestId, string> = {
    [QUESTION_ANSWER_TEST_ID]: t(
      "verifyDialog.tools.questionAnswer.description",
    ),
    [NEEDLE_TEST_ID]: t("verifyDialog.tools.needle.description"),
    [PELICAN_PROMPT_ID]: t("verifyDialog.tools.pelican.description"),
    [CONTEXT_CAPACITY_TEST_ID]: t("verifyDialog.tools.context.hint"),
    [API_VERIFICATION_PROBE_IDS.Models]: t("verifyDialog.intro.probes.models"),
    [API_VERIFICATION_PROBE_IDS.TextGeneration]: t(
      "verifyDialog.intro.probes.text-generation",
    ),
    [API_VERIFICATION_PROBE_IDS.ToolCalling]: t(
      "verifyDialog.intro.probes.tool-calling",
    ),
    [API_VERIFICATION_PROBE_IDS.StructuredOutput]: t(
      "verifyDialog.intro.probes.structured-output",
    ),
    [API_VERIFICATION_PROBE_IDS.WebSearch]: t(
      "verifyDialog.intro.probes.web-search",
    ),
    [API_VERIFICATION_PROBE_IDS.Embedding]: t(
      "verifyDialog.intro.probes.embedding",
    ),
    [API_VERIFICATION_PROBE_IDS.Rerank]: t("verifyDialog.intro.probes.rerank"),
    [API_VERIFICATION_PROBE_IDS.ImageGeneration]: t(
      "verifyDialog.intro.probes.image-generation",
    ),
    [API_VERIFICATION_PROBE_IDS.VideoGeneration]: t(
      "verifyDialog.intro.probes.video-generation",
    ),
    [API_VERIFICATION_PROBE_IDS.Decision]: t(
      "verifyDialog.intro.probes.decision",
    ),
  }
  return (
    <div
      data-verification-introduction
      className="[container-type:size] order-first min-h-0 w-full flex-1 [container-name:probe-intro] [@container(min-width:52rem)]:mx-auto [@container(min-width:52rem)]:max-w-xl"
    >
      <div className="flex h-full items-center justify-center">
        {/* Reveal supporting copy only when the available height can contain it. */}
        <div className="flex w-full flex-col gap-3.5 text-left [@container_probe-intro_(max-height:3rem)]:hidden [@container_probe-intro_(min-height:0px)]:max-w-lg [@container_probe-intro_(min-height:0px)]:items-center [@container_probe-intro_(min-height:0px)]:py-2 [@container_probe-intro_(min-height:0px)]:text-center [@container_probe-intro_(min-height:22rem)]:gap-5">
          <div
            data-testid="probe-intro-icon"
            className="hidden size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs transition-all [@container_probe-intro_(min-height:20rem)]:flex [@container_probe-intro_(min-height:22rem)]:size-16"
          >
            <VerificationTestIcon
              testId={probeId}
              className="size-7 shrink-0 [@container_probe-intro_(min-height:22rem)]:size-8"
            />
          </div>
          <Heading6 className="hidden w-full text-center text-xl font-semibold tracking-tight text-foreground [@container_probe-intro_(min-height:22rem)]:text-2xl [@container_probe-intro_(min-height:8rem)]:block">
            {title}
          </Heading6>
          <p className="w-full min-w-0 text-xs leading-relaxed text-muted-foreground [@container_probe-intro_(min-height:14rem)]:text-sm [@container_probe-intro_(min-height:22rem)]:text-base">
            {descriptions[probeId]}
          </p>
          {note ? (
            <p className="w-full text-xs leading-relaxed text-muted-foreground">
              {note}
            </p>
          ) : null}
          <p className="hidden text-xs text-muted-foreground [@container_probe-intro_(min-height:12rem)]:block">
            <Trans
              t={t}
              i18nKey="verifyDialog.intro.startHint"
              components={{
                run: (
                  <Button
                    type="button"
                    variant={primaryRun ? "default" : "outline"}
                    className={cn(
                      "mx-1.5 inline-flex min-h-(--density-control-sm) gap-1.5 rounded-lg px-3 py-1 align-middle text-xs font-medium has-[>svg]:px-2.5",
                      !primaryRun &&
                        "border-primary/30 bg-primary/5 text-primary shadow-2xs transition-colors hover:border-primary/50 hover:bg-primary/10",
                    )}
                    leftIcon={
                      <Play
                        aria-hidden="true"
                        className="size-3.5 fill-current"
                      />
                    }
                    onClick={onRun}
                    disabled={disabled}
                    data-testid="probe-intro-run-button"
                  />
                ),
              }}
            />
          </p>
        </div>
      </div>
    </div>
  )
}
