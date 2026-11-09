import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { CollapsibleSection } from "~/components/ui"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification/types"

import { safeJsonStringify } from "./utils"
import { VerificationMediaPreview } from "./VerificationMediaPreview"
import { VerificationOutputText } from "./VerificationOutputText"
import { VerificationResultCard } from "./VerificationResultCard"

export type ProbeDetailsResult = Pick<
  ApiVerificationProbeResult,
  "input" | "output" | "media" | "summary"
>

/** Own result disclosure and generic response evidence independently of test selection. */
export function VerificationProbeResult({
  result,
  resultSummary,
  detailsContent,
  status,
  selected,
  defaultDetailsOpen = true,
}: {
  result?: ProbeDetailsResult | null
  resultSummary?: ReactNode
  detailsContent?: ReactNode
  status?: ReactNode
  selected: boolean
  defaultDetailsOpen?: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const hasResult = Boolean(result || detailsContent || resultSummary)
  const hasDetails = Boolean(
    detailsContent ||
      (result &&
        (result.input !== undefined ||
          result.output !== undefined ||
          result.media)),
  )
  const [showResult, setShowResult] = useState(hasDetails && defaultDetailsOpen)
  useEffect(() => {
    if (hasDetails && defaultDetailsOpen) setShowResult(true)
  }, [result, hasDetails, defaultDetailsOpen])
  const output = result?.output
  const text =
    typeof output === "string"
      ? output
      : output &&
          typeof output === "object" &&
          "text" in output &&
          typeof output.text === "string"
        ? output.text
        : null
  return (
    <>
      {hasResult ? (
        <VerificationResultCard
          bodyHidden={!showResult}
          onToggle={hasDetails ? () => setShowResult(!showResult) : undefined}
          status={status}
          summary={
            resultSummary ?? (!detailsContent ? result?.summary : undefined)
          }
        >
          {hasDetails ? (
            <div className="space-y-density-3">
              {showResult
                ? detailsContent ?? (
                    <>
                      <VerificationMediaPreview
                        output={output}
                        media={result?.media}
                        active={selected}
                      />
                      {text !== null ? (
                        <pre className="text-foreground bg-surface-subtle max-h-64 overflow-auto rounded-lg p-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
                          {text}
                        </pre>
                      ) : null}
                      {result?.input !== undefined ? (
                        <CollapsibleSection
                          title={t("verifyDialog.details.input")}
                          buttonClassName="px-0 py-2"
                          panelClassName="bg-transparent rounded-none border-0 px-0"
                        >
                          <VerificationOutputText
                            text={safeJsonStringify(result.input)}
                          />
                        </CollapsibleSection>
                      ) : null}
                      {output !== undefined ? (
                        <CollapsibleSection
                          title={t("verifyDialog.details.output")}
                          buttonClassName="px-0 py-2"
                          panelClassName="bg-transparent rounded-none border-0 px-0"
                        >
                          <VerificationOutputText
                            text={safeJsonStringify(output)}
                          />
                        </CollapsibleSection>
                      ) : null}
                    </>
                  )
                : null}
            </div>
          ) : null}
        </VerificationResultCard>
      ) : null}
    </>
  )
}
