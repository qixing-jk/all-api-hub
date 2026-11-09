import { Play } from "lucide-react"
import { type MouseEventHandler } from "react"
import { Trans, useTranslation } from "react-i18next"

import { Button, Heading6 } from "~/components/ui"
import type { VerificationTestId } from "~/features/Verification/api/VerificationTestLabel"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification"
import { PELICAN_PROMPT_ID } from "~/services/verification/modelQuality/constants"
import { CONTEXT_CAPACITY_TEST_ID } from "~/services/verification/modelQuality/contextCapacityConstants"
import { NEEDLE_TEST_ID } from "~/services/verification/modelQuality/needleConstants"
import { QUESTION_ANSWER_TEST_ID } from "~/services/verification/modelQuality/questionAnswer"

/** Explains an unstarted probe without implying progress or fabricating results. */
export function VerificationProbeIntroduction({
  probeId,
  title,
  onRun,
  disabled,
}: {
  probeId: VerificationTestId
  title: string
  onRun: MouseEventHandler<HTMLButtonElement> | undefined
  disabled?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
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
    <div className="order-first min-h-0 w-full [container-name:probe-intro] [@container(min-width:52rem)]:[container-type:size] [@container(min-width:52rem)]:order-last [@container(min-width:52rem)]:mx-auto [@container(min-width:52rem)]:max-w-[38rem] [@container(min-width:52rem)]:flex-1">
      <div className="flex h-full items-center justify-center">
        {/* Scale intrinsic-height content so the alignment wrapper cannot add overflow. */}
        <div className="flex w-full flex-col gap-4 text-left [@container_probe-intro_(max-height:5rem)]:hidden [@container_probe-intro_(min-height:0px)]:max-w-md [@container_probe-intro_(min-height:0px)]:items-center [@container_probe-intro_(min-height:0px)]:py-2 [@container_probe-intro_(min-height:0px)]:text-center [@container_probe-intro_(min-width:38rem)_and_(min-height:30rem)]:scale-[1.1]">
          <Heading6 className="text-foreground hidden w-full text-center text-xl font-semibold [@container_probe-intro_(min-height:10rem)]:block">
            {title}
          </Heading6>
          <p className="text-muted-foreground w-full min-w-0 text-xs leading-relaxed [@container_probe-intro_(min-height:14rem)]:text-sm">
            {descriptions[probeId]}
          </p>
          <p className="text-muted-foreground hidden text-xs [@container_probe-intro_(min-height:16rem)]:block">
            <Trans
              t={t}
              i18nKey="verifyDialog.intro.startHint"
              components={{
                run: (
                  <Button
                    type="button"
                    variant="outline"
                    className="hover:border-primary/30 hover:bg-primary/5 hover:text-primary mx-1 min-h-0 gap-1 rounded-md px-2 py-0.5 align-baseline text-xs whitespace-nowrap has-[>svg]:px-2"
                    leftIcon={<Play aria-hidden="true" className="size-3" />}
                    onClick={onRun}
                    disabled={disabled}
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
