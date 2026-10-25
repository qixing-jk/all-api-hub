import { ChevronDown } from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button, CollapsibleSection } from "~/components/ui"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { safeJsonStringify } from "~/features/Verification/api/utils"
import { VerificationMediaPreview } from "~/features/Verification/api/VerificationMediaPreview"
import { VerificationPromptEditor } from "~/features/Verification/api/VerificationPromptEditor"
import { cn } from "~/lib/utils"
import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification/types"

type ProbeDetailsResult = Pick<
  ApiVerificationProbeResult,
  "input" | "output" | "media" | "summary"
>

/** Keeps a test's editable configuration separate from the evidence of its last run. */
export function VerificationProbeDetails({
  controller,
  probeId,
  result,
  heading,
  action,
  children,
  detailsContent,
}: {
  heading?: ReactNode
  action?: ReactNode
  children?: ReactNode
  detailsContent?: ReactNode
  controller?: VerificationToolsController
  probeId?: ApiVerificationProbeId
  result?: ProbeDetailsResult | null
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const hasDetails = Boolean(
    detailsContent ||
      (result &&
        (result.input !== undefined ||
          result.output !== undefined ||
          result.media)),
  )
  const [showResult, setShowResult] = useState(hasDetails)
  useEffect(() => {
    if (hasDetails) setShowResult(true)
  }, [result, hasDetails])
  const hasPrompt =
    controller && probeId && controller.promptIds.includes(probeId)
  if (!heading && !action && !hasPrompt && !hasDetails) return null
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
    <div
      className="space-y-density-2"
      data-testid={probeId ? `verification-prompt-${probeId}` : undefined}
    >
      <div className="gap-density-2 flex flex-wrap items-baseline justify-between">
        {heading ? (
          <div className="min-w-0 flex-1 basis-40">{heading}</div>
        ) : null}
        <div className="gap-density-2 flex max-w-full flex-wrap items-center">
          {hasDetails ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground gap-x-1 px-1.5 text-xs font-normal"
              rightIcon={
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 transition-transform motion-reduce:transition-none",
                    showResult && "rotate-180",
                  )}
                />
              }
              aria-expanded={showResult}
              aria-controls={`${id}-result`}
              onClick={() => setShowResult(!showResult)}
            >
              {t("verifyDialog.details.result")}
            </Button>
          ) : null}
          {action}
        </div>
      </div>
      {hasPrompt ? (
        <VerificationPromptEditor controller={controller} probeId={probeId} />
      ) : null}
      {children}
      {showResult && hasDetails ? (
        <section
          id={`${id}-result`}
          aria-label={t("verifyDialog.details.result")}
          className="bg-surface-subtle border-border-subtle space-y-density-2 rounded-md border p-3"
        >
          {detailsContent ?? (
            <>
              <VerificationMediaPreview output={output} media={result?.media} />
              {text !== null ? (
                <pre className="text-foreground bg-card border-border-subtle max-h-64 overflow-auto rounded-md border p-3 text-sm break-words whitespace-pre-wrap">
                  {text}
                </pre>
              ) : null}
              {result?.input !== undefined ? (
                <CollapsibleSection
                  title={t("verifyDialog.details.input")}
                  buttonClassName="border-border-subtle rounded-md border px-3 py-2"
                >
                  <pre className="text-secondary-foreground max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap">
                    {safeJsonStringify(result.input)}
                  </pre>
                </CollapsibleSection>
              ) : null}
              {output !== undefined ? (
                <CollapsibleSection
                  title={t("verifyDialog.details.output")}
                  defaultOpen={text === null && !result?.media}
                  buttonClassName="border-border-subtle rounded-md border px-3 py-2"
                >
                  <pre className="text-secondary-foreground max-h-64 overflow-auto text-xs break-words whitespace-pre-wrap">
                    {safeJsonStringify(output)}
                  </pre>
                </CollapsibleSection>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}
