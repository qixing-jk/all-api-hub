import { Bot } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { CollapsibleSection } from "~/components/ui"
import type { VerificationGenerationMetrics } from "~/services/verification/aiApiVerification/generationMetrics"
import {
  VERIFICATION_GENERATION_PART_TYPES,
  VERIFICATION_GENERATION_TOOL_STATES,
} from "~/services/verification/aiApiVerification/generationProgress"
import type {
  VerificationGenerationPart,
  VerificationGenerationProgress,
} from "~/services/verification/aiApiVerification/generationProgress"

import { formatLatency } from "./utils"
import { VerificationGenerationFeed } from "./VerificationGenerationFeed"
import {
  useVerificationGenerationStatistics,
  VerificationGenerationStatistics,
} from "./VerificationGenerationStatistics"

/** Ordered process evidence with independent, optional diagnostics. */
export function VerificationGenerationOutput({
  progress,
  text,
  metrics,
  running = false,
  startedAt,
  partial = false,
  requestDetails,
  question,
  children,
}: {
  progress?: VerificationGenerationProgress
  text?: string
  metrics?: VerificationGenerationMetrics[]
  running?: boolean
  startedAt?: number
  partial?: boolean
  requestDetails?: ReactNode
  question?: string
  children?: ReactNode
}) {
  const statistics = useVerificationGenerationStatistics()
  const { t } = useTranslation("aiApiVerification")
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [running, startedAt])
  const content = text ?? progress?.text
  const steps = metrics ?? progress?.metrics
  let parts: VerificationGenerationPart[] = progress?.parts?.length
    ? progress.parts
    : content
      ? [
          {
            id: "answer",
            step: 1,
            type: VERIFICATION_GENERATION_PART_TYPES.Text,
            text: content,
          },
        ]
      : []
  // Accepted output takes precedence over its final streamed draft, while the
  // earlier reasoning and tool blocks remain attached to the completed request.
  if (!running && text !== undefined && progress?.parts?.length) {
    let finalTextIndex = -1
    for (let index = parts.length - 1; index >= 0; index--) {
      if (
        parts[index]?.type === VERIFICATION_GENERATION_PART_TYPES.Text &&
        parts[index]?.step === progress.step
      ) {
        finalTextIndex = index
        break
      }
    }
    if (finalTextIndex >= 0)
      parts = parts.map((part, index) =>
        index === finalTextIndex ? { ...part, text } : part,
      )
    else if (text)
      parts = [
        ...parts,
        {
          id: "accepted-answer",
          step: progress.step,
          type: VERIFICATION_GENERATION_PART_TYPES.Text,
          text,
        },
      ]
  }
  const lastPart = parts.at(-1)
  const activity = running ? (
    <p
      className="mt-3 flex items-center gap-2.5 text-sm text-muted-foreground"
      role="status"
    >
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted"
      >
        <Bot className="size-4" />
      </span>
      <span className="shimmer motion-reduce:shimmer-none">
        {lastPart?.type === VERIFICATION_GENERATION_PART_TYPES.Reasoning
          ? t("verifyDialog.generation.thinking")
          : lastPart?.type === VERIFICATION_GENERATION_PART_TYPES.Text
            ? t("verifyDialog.generation.responding")
            : lastPart?.type === VERIFICATION_GENERATION_PART_TYPES.Tool &&
                (lastPart.state ===
                  VERIFICATION_GENERATION_TOOL_STATES.InputAvailable ||
                  lastPart.state ===
                    VERIFICATION_GENERATION_TOOL_STATES.InputStreaming)
              ? t("verifyDialog.generation.toolRunning")
              : t("verifyDialog.generation.waiting")}
      </span>
      {startedAt !== undefined ? (
        <span aria-hidden="true" className="text-xs tabular-nums">
          · {formatLatency(Math.max(0, now - startedAt))}
        </span>
      ) : null}
    </p>
  ) : null
  if (!(
    parts.length ||
    children ||
    running ||
    partial ||
    steps?.length ||
    requestDetails ||
    question
  ))
    return null
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 [&>*:not([data-slot=verification-feed])]:shrink-0 [@container(min-width:52rem)]:overflow-y-auto"
      data-testid="verification-generation-output"
    >
      {parts.length || running || question ? (
        <VerificationGenerationFeed
          key={startedAt}
          parts={parts}
          running={running}
          partial={partial}
          activity={activity}
          question={question}
        />
      ) : (
        activity
      )}
      {children}
      {partial ? (
        <p className="text-xs text-muted-foreground" role="status">
          {t("verifyDialog.generation.partial")}
        </p>
      ) : null}
      {steps?.length ? (
        <VerificationGenerationStatistics
          steps={steps}
          controller={statistics}
        />
      ) : null}
      {requestDetails ? (
        <CollapsibleSection
          title={t("verifyDialog.generation.requestDetails")}
          buttonClassName="px-0 py-2"
          panelClassName="space-y-4 rounded-none border-0 bg-transparent px-0"
        >
          {requestDetails}
        </CollapsibleSection>
      ) : null}
    </div>
  )
}
