import { ChevronDown } from "lucide-react"
import { useContext, useEffect, useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button, CollapsibleSection, Heading6 } from "~/components/ui"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { safeJsonStringify } from "~/features/Verification/api/utils"
import { VerificationMediaPreview } from "~/features/Verification/api/VerificationMediaPreview"
import { VerificationPromptEditor } from "~/features/Verification/api/VerificationPromptEditor"
import { VerificationSelectionContext } from "~/features/Verification/api/VerificationSelectionContext"
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
  label,
  heading,
  headingAccessory,
  description,
  status,
  action,
  children,
  detailsContent,
  idleContent,
  defaultDetailsOpen = true,
}: {
  label?: string
  heading?: ReactNode
  headingAccessory?: ReactNode
  description?: ReactNode
  status?: ReactNode
  action?: ReactNode
  children?: ReactNode
  detailsContent?: ReactNode
  idleContent?: ReactNode
  defaultDetailsOpen?: boolean
  controller?: VerificationToolsController
  probeId?: ApiVerificationProbeId
  result?: ProbeDetailsResult | null
}) {
  const { t } = useTranslation("aiApiVerification")
  const id = useId()
  const selection = useContext(VerificationSelectionContext)
  const register = selection?.register
  useEffect(() => register?.(id), [register, id])
  const selected = !selection || selection.selectedId === id
  const SummaryControl = selection ? "button" : "div"
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
      data-verification-probe={probeId}
      data-testid={probeId ? `verification-prompt-${probeId}` : undefined}
    >
      <div
        data-verification-summary
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 [@container(min-width:52rem)]:px-3 [@container(min-width:52rem)]:py-2",
          selection && (selected ? "bg-primary/10" : "hover:bg-muted/60"),
        )}
      >
        <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {heading ? (
            <SummaryControl
              type={selection ? "button" : undefined}
              aria-label={selection ? label : undefined}
              aria-labelledby={selection && !label ? `${id}-label` : undefined}
              aria-expanded={selection ? selected : undefined}
              aria-controls={selection ? `${id}-detail` : undefined}
              onClick={selection ? () => selection.select(id) : undefined}
              className={cn(
                "focus-visible:ring-ring flex min-h-(--density-control-sm) min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none",
                headingAccessory
                  ? selection && "after:absolute after:inset-0"
                  : "flex-1",
              )}
            >
              <div id={`${id}-label`}>{heading}</div>
              {!headingAccessory && status ? (
                <div className="flex flex-wrap items-center gap-2">
                  {status}
                </div>
              ) : null}
            </SummaryControl>
          ) : null}
          {headingAccessory ? (
            <>
              {/* Keep help above the selection hit area without nesting buttons. */}
              <div className="relative z-10 flex shrink-0 items-center">
                {headingAccessory}
              </div>
              {status ? (
                <div className="pointer-events-none flex flex-wrap items-center gap-2">
                  {status}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {/* Keep each detail mounted in its row. CSS moves it to the desktop pane;
          selection and resizing must not reset editors, results or requests. */}
      <div
        id={`${id}-detail`}
        hidden={!selected}
        data-verification-detail
        className={cn(
          "min-w-0 [@container(min-width:52rem)]:[&_:is(pre,textarea,ol)]:max-h-none",
          selection &&
            "bg-surface-subtle my-1 rounded-lg p-3 [@container(min-width:52rem)]:absolute [@container(min-width:52rem)]:inset-y-0 [@container(min-width:52rem)]:right-0 [@container(min-width:52rem)]:left-[calc(var(--verification-list-width)+1.25rem)] [@container(min-width:52rem)]:my-0 [@container(min-width:52rem)]:overflow-y-auto [@container(min-width:52rem)]:rounded-xl [@container(min-width:52rem)]:p-5",
        )}
      >
        <div
          data-verification-detail-content
          className={cn(
            idleContent
              ? "gap-density-2 [@container(min-width:52rem)]:gap-density-3 flex flex-col [@container(min-width:52rem)]:h-full [@container(min-width:52rem)]:[&>*:not(:last-child)]:shrink-0"
              : "space-y-density-2 [@container(min-width:52rem)]:space-y-density-3",
          )}
        >
          <div
            className={cn(
              "flex-wrap items-center justify-between gap-2",
              hasDetails
                ? "flex"
                : idleContent
                  ? "hidden"
                  : "hidden [@container(min-width:52rem)]:flex",
            )}
          >
            {selection && label && !idleContent ? (
              <Heading6 className="text-foreground hidden text-base font-semibold [@container(min-width:52rem)]:block">
                {label}
              </Heading6>
            ) : null}
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
          </div>
          {description}
          {hasPrompt ? (
            <div className="mt-density-1">
              <VerificationPromptEditor
                controller={controller}
                probeId={probeId}
                autoOpen={Boolean(selection?.isWide && !hasDetails)}
              />
            </div>
          ) : null}
          {children}
          {idleContent}
          {showResult && hasDetails ? (
            <section
              id={`${id}-result`}
              aria-label={t("verifyDialog.details.result")}
              className="bg-surface-subtle border-border-subtle space-y-density-2 rounded-md border p-3"
            >
              {detailsContent ?? (
                <>
                  <VerificationMediaPreview
                    output={output}
                    media={result?.media}
                  />
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
      </div>
    </div>
  )
}
