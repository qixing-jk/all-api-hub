import {
  ArrowDownUp,
  ArrowRight,
  Binary,
  Braces,
  Check,
  CheckCheck,
  Clock,
  Code,
  Eye,
  Files,
  FileText,
  GitBranch,
  Globe,
  Image,
  Link,
  List,
  ListOrdered,
  ListTree,
  MessageSquareText,
  Play,
  Ruler,
  ScanSearch,
  ScanText,
  Search,
  Send,
  Text,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { Fragment, type MouseEventHandler } from "react"
import { Trans, useTranslation } from "react-i18next"

import { Button, Heading6 } from "~/components/ui"
import type { VerificationTestId } from "~/features/Verification/api/VerificationTestLabel"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification"
import { PELICAN_PROMPT_ID } from "~/services/verification/modelQuality/constants"
import { CONTEXT_CAPACITY_TEST_ID } from "~/services/verification/modelQuality/contextCapacityConstants"

type IntroductionStep = { icon: LucideIcon; label: string }

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
  const flows: Record<
    VerificationTestId,
    readonly [IntroductionStep, IntroductionStep, IntroductionStep]
  > = {
    [API_VERIFICATION_PROBE_IDS.Models]: [
      { icon: List, label: t("verifyDialog.intro.steps.models.input") },
      { icon: ScanSearch, label: t("verifyDialog.intro.steps.models.process") },
      { icon: Check, label: t("verifyDialog.intro.steps.models.output") },
    ],
    [API_VERIFICATION_PROBE_IDS.TextGeneration]: [
      {
        icon: MessageSquareText,
        label: t("verifyDialog.intro.steps.text-generation.input"),
      },
      {
        icon: Text,
        label: t("verifyDialog.intro.steps.text-generation.process"),
      },
      {
        icon: FileText,
        label: t("verifyDialog.intro.steps.text-generation.output"),
      },
    ],
    [API_VERIFICATION_PROBE_IDS.ToolCalling]: [
      { icon: Wrench, label: t("verifyDialog.intro.steps.tool-calling.input") },
      {
        icon: GitBranch,
        label: t("verifyDialog.intro.steps.tool-calling.process"),
      },
      {
        icon: Braces,
        label: t("verifyDialog.intro.steps.tool-calling.output"),
      },
    ],
    [API_VERIFICATION_PROBE_IDS.StructuredOutput]: [
      {
        icon: ListTree,
        label: t("verifyDialog.intro.steps.structured-output.input"),
      },
      {
        icon: Braces,
        label: t("verifyDialog.intro.steps.structured-output.process"),
      },
      {
        icon: CheckCheck,
        label: t("verifyDialog.intro.steps.structured-output.output"),
      },
    ],
    [API_VERIFICATION_PROBE_IDS.WebSearch]: [
      { icon: Globe, label: t("verifyDialog.intro.steps.web-search.input") },
      { icon: Search, label: t("verifyDialog.intro.steps.web-search.process") },
      { icon: Link, label: t("verifyDialog.intro.steps.web-search.output") },
    ],
    [API_VERIFICATION_PROBE_IDS.Embedding]: [
      { icon: FileText, label: t("verifyDialog.intro.steps.embedding.input") },
      { icon: Binary, label: t("verifyDialog.intro.steps.embedding.process") },
      { icon: Ruler, label: t("verifyDialog.intro.steps.embedding.output") },
    ],
    [API_VERIFICATION_PROBE_IDS.Rerank]: [
      { icon: Files, label: t("verifyDialog.intro.steps.rerank.input") },
      {
        icon: ArrowDownUp,
        label: t("verifyDialog.intro.steps.rerank.process"),
      },
      { icon: ListOrdered, label: t("verifyDialog.intro.steps.rerank.output") },
    ],
    [API_VERIFICATION_PROBE_IDS.ImageGeneration]: [
      {
        icon: MessageSquareText,
        label: t("verifyDialog.intro.steps.image-generation.input"),
      },
      {
        icon: Image,
        label: t("verifyDialog.intro.steps.image-generation.process"),
      },
      {
        icon: Eye,
        label: t("verifyDialog.intro.steps.image-generation.output"),
      },
    ],
    [API_VERIFICATION_PROBE_IDS.VideoGeneration]: [
      {
        icon: Video,
        label: t("verifyDialog.intro.steps.video-generation.input"),
      },
      {
        icon: Clock,
        label: t("verifyDialog.intro.steps.video-generation.process"),
      },
      {
        icon: Play,
        label: t("verifyDialog.intro.steps.video-generation.output"),
      },
    ],
    [API_VERIFICATION_PROBE_IDS.Decision]: [
      { icon: Send, label: t("verifyDialog.intro.steps.decision.input") },
      {
        icon: GitBranch,
        label: t("verifyDialog.intro.steps.decision.process"),
      },
      {
        icon: ScanSearch,
        label: t("verifyDialog.intro.steps.decision.output"),
      },
    ],
    [PELICAN_PROMPT_ID]: [
      {
        icon: MessageSquareText,
        label: t("verifyDialog.intro.steps.pelican.input"),
      },
      { icon: Code, label: t("verifyDialog.intro.steps.pelican.process") },
      { icon: Eye, label: t("verifyDialog.intro.steps.pelican.output") },
    ],
    [CONTEXT_CAPACITY_TEST_ID]: [
      {
        icon: Text,
        label: t("verifyDialog.intro.steps.context-capacity.input"),
      },
      {
        icon: ScanText,
        label: t("verifyDialog.intro.steps.context-capacity.process"),
      },
      {
        icon: Ruler,
        label: t("verifyDialog.intro.steps.context-capacity.output"),
      },
    ],
  }
  return (
    <div className="order-first min-h-0 w-full [container-name:probe-intro] [@container(min-width:52rem)]:[container-type:size] [@container(min-width:52rem)]:order-last [@container(min-width:52rem)]:mx-auto [@container(min-width:52rem)]:max-w-[38rem] [@container(min-width:52rem)]:flex-1">
      <div className="flex h-full items-center justify-center">
        {/* Scale intrinsic-height content so the alignment wrapper cannot add overflow. */}
        <div className="flex w-full flex-col gap-4 text-left [@container_probe-intro_(max-height:5rem)]:hidden [@container_probe-intro_(min-height:0px)]:max-w-md [@container_probe-intro_(min-height:0px)]:items-center [@container_probe-intro_(min-height:0px)]:py-2 [@container_probe-intro_(min-height:0px)]:text-center [@container_probe-intro_(min-width:38rem)_and_(min-height:30rem)]:scale-[1.1]">
          <Heading6 className="text-foreground hidden w-full text-center text-xl font-semibold [@container_probe-intro_(min-height:10rem)]:block">
            {title}
          </Heading6>
          <div
            role="list"
            aria-label={t("verifyDialog.intro.flow")}
            className="hidden w-full shrink-0 items-center justify-between gap-2 [@container_probe-intro_(min-height:18rem)]:flex"
          >
            {flows[probeId].map(({ icon: Icon, label }, index) => (
              <Fragment key={label}>
                {index > 0 ? (
                  <ArrowRight
                    aria-hidden="true"
                    className="text-muted-foreground/50 size-4 shrink-0"
                  />
                ) : null}
                <div
                  role="listitem"
                  className="bg-card text-muted-foreground flex min-w-0 flex-1 flex-col items-center gap-3 self-stretch rounded-xl px-2 py-4"
                >
                  <Icon aria-hidden="true" className="size-5" />
                  <span className="text-xs">{label}</span>
                </div>
              </Fragment>
            ))}
          </div>
          <p className="text-muted-foreground w-full min-w-0 text-xs leading-relaxed [@container_probe-intro_(min-height:14rem)]:text-sm">
            {descriptions[probeId]}
          </p>
          <p className="text-muted-foreground hidden text-xs [@container_probe-intro_(min-height:26rem)]:block">
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
