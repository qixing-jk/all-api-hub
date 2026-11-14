import { ChartNoAxesCombined, Info } from "lucide-react"
import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button, IconButton } from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import type { VerificationGenerationMetrics } from "~/services/verification/aiApiVerification/generationMetrics"

import { VerificationGenerationMetricsView } from "./VerificationGenerationMetricsView"
import { VerificationDetailContext } from "./VerificationSelectionContext"

/** Keep statistics state with the output owner even while measurements are absent. */
export function useVerificationGenerationStatistics() {
  const detail = useContext(VerificationDetailContext)
  const headerTarget = detail?.headerActionsTarget ?? detail?.headerTarget
  const selected = detail?.selected ?? true
  const [metricsOpen, setMetricsOpen] = useState(false)
  useEffect(() => {
    if (!selected) setMetricsOpen(false)
  }, [selected])
  const metricsHelpRef = useRef<HTMLButtonElement>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  )
  // Float outside the result scroller, within the dialog's document or shadow root.
  const attachMetrics = useCallback((element: HTMLDivElement | null) => {
    setPortalContainer(element?.closest<HTMLElement>('[role="dialog"]') ?? null)
  }, [])
  return {
    detail,
    headerTarget,
    metricsOpen,
    setMetricsOpen,
    metricsHelpRef,
    portalContainer,
    attachMetrics,
  }
}

/** Own statistics disclosure, nested help and selected-test portal placement. */
export function VerificationGenerationStatistics({
  steps,
  controller,
}: {
  steps: VerificationGenerationMetrics[]
  controller: ReturnType<typeof useVerificationGenerationStatistics>
}) {
  const {
    detail,
    headerTarget,
    metricsOpen,
    setMetricsOpen,
    metricsHelpRef,
    portalContainer,
    attachMetrics,
  } = controller
  const { t } = useTranslation("aiApiVerification")
  const metricsContent = steps?.length ? (
    <div
      ref={attachMetrics}
      data-verification-header-actions={headerTarget ? "" : undefined}
      hidden={headerTarget ? !detail?.selected : undefined}
      className={
        headerTarget
          ? "ml-auto flex shrink-0 items-center"
          : "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3"
      }
    >
      {!headerTarget ? (
        <VerificationGenerationMetricsView steps={steps} compact />
      ) : null}
      <Popover
        open={metricsOpen && (!detail || detail.selected)}
        onOpenChange={setMetricsOpen}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size={headerTarget ? "icon-sm" : "sm"}
            aria-label={t("verifyDialog.generation.statistics")}
            title={t("verifyDialog.generation.statistics")}
            className="ml-auto gap-1.5 text-xs text-muted-foreground"
          >
            <ChartNoAxesCombined className="size-3.5" aria-hidden="true" />
            {!headerTarget ? t("verifyDialog.generation.statistics") : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          container={portalContainer ?? undefined}
          align="end"
          aria-label={t("verifyDialog.generation.statistics")}
          className="max-h-[min(28rem,60dvh)] w-96 max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto p-4"
          onEscapeKeyDown={(event) => {
            event.stopPropagation()
            // Dismiss the nested explanation before closing the statistics.
            if (metricsHelpRef.current?.dataset.tooltipOpen === "true")
              event.preventDefault()
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>
              {t("verifyDialog.generation.statistics")}
            </PopoverTitle>
            <Tooltip
              content={t("verifyDialog.generation.metricsHint")}
              portalContainer={portalContainer ?? undefined}
              anchorAsChild
              openOnClick
              className="max-w-[min(20rem,calc(100vw-2rem))] leading-relaxed"
            >
              <IconButton
                ref={metricsHelpRef}
                type="button"
                variant="ghost"
                size="none"
                className="size-6"
                aria-label={t("verifyDialog.generation.metricsHelp")}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </IconButton>
            </Tooltip>
          </div>
          <VerificationGenerationMetricsView steps={steps} />
        </PopoverContent>
      </Popover>
    </div>
  ) : null
  return headerTarget && metricsContent
    ? createPortal(metricsContent, headerTarget)
    : metricsContent
}
