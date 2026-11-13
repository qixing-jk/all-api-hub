import { useContext, type ComponentProps, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Heading6 } from "~/components/ui"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification/types"

import { safeJsonStringify } from "./utils"
import { VerificationGenerationOutput } from "./VerificationGenerationOutput"
import { VerificationMediaPreview } from "./VerificationMediaPreview"
import { VerificationOutputText } from "./VerificationOutputText"
import { VerificationResultCard } from "./VerificationResultCard"
import { VerificationDetailContext } from "./VerificationSelectionContext"

export type ProbeDetailsResult = Pick<
  ApiVerificationProbeResult,
  "input" | "output" | "media" | "summary" | "metrics" | "generation"
> & {
  status?: ApiVerificationProbeResult["status"]
}
export type ProbeGenerationState = Pick<
  ComponentProps<typeof VerificationGenerationOutput>,
  "progress" | "running" | "startedAt" | "partial"
>

/** Keep conclusions visible alongside the ordered process and optional diagnostics. */
export function VerificationProbeResult({
  result,
  resultSummary,
  detailsContent,
  generation,
  status,
  selected,
  question,
}: {
  result?: ProbeDetailsResult | null
  resultSummary?: ReactNode
  detailsContent?: ReactNode
  generation?: ProbeGenerationState
  status?: ReactNode
  selected: boolean
  question?: string
}) {
  const { t } = useTranslation("aiApiVerification")
  const detail = useContext(VerificationDetailContext)
  if (!(result || detailsContent || generation || resultSummary || question))
    return null
  const output = result?.output
  const text =
    typeof output === "string"
      ? output
      : output &&
          typeof output === "object" &&
          "text" in output &&
          typeof output.text === "string"
        ? output.text
        : undefined
  const hasMedia = Boolean(
    result?.media || (output && typeof output === "object" && "url" in output),
  )
  const requestDetails =
    result?.input !== undefined || output !== undefined ? (
      <>
        {result?.input !== undefined ? (
          <section className="space-y-2">
            <Heading6 className="text-xs text-muted-foreground">
              {t("verifyDialog.details.input")}
            </Heading6>
            <VerificationOutputText text={safeJsonStringify(result.input)} />
          </section>
        ) : null}
        {output !== undefined ? (
          <section className="space-y-2">
            <Heading6 className="text-xs text-muted-foreground">
              {t("verifyDialog.details.output")}
            </Heading6>
            <VerificationOutputText text={safeJsonStringify(output)} />
          </section>
        ) : null}
      </>
    ) : undefined
  const hasEvidence = Boolean(
    question || detailsContent || generation || requestDetails || hasMedia,
  )
  const hasDetails = hasEvidence || Boolean(result?.metrics?.length)
  return (
    <VerificationResultCard
      bodyHidden={Boolean(detail?.headerTarget) && !hasEvidence}
      status={status}
      summary={resultSummary ?? (!detailsContent ? result?.summary : undefined)}
    >
      {hasDetails
        ? (detailsContent ?? (
            <VerificationGenerationOutput
              {...generation}
              progress={generation?.progress ?? result?.generation}
              question={question}
              text={generation?.running ? undefined : text}
              metrics={result?.metrics}
              requestDetails={requestDetails}
            >
              {hasMedia ? (
                <VerificationMediaPreview
                  output={output}
                  media={result?.media}
                  active={selected}
                />
              ) : null}
            </VerificationGenerationOutput>
          ))
        : null}
    </VerificationResultCard>
  )
}
