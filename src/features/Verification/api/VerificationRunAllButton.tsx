import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import { BUTTON_LOADING_BEHAVIORS } from "~/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import type { useVerificationConcurrency } from "~/hooks/verification/useVerificationConcurrency"
import { cn } from "~/lib/utils"

import {
  VERIFICATION_CONCURRENCY_CONTROL_VARIANTS,
  VerificationConcurrencyControl,
} from "./VerificationConcurrencyControl"

export interface VerificationRunAllButtonProps {
  isRunning: boolean
  disabled?: boolean
  concurrency: ReturnType<typeof useVerificationConcurrency>
  onRun: () => void | Promise<void>
  onStop: () => void | Promise<void>
  runLabel?: ReactNode
  stopLabel?: ReactNode
  hint?: ReactNode
  className?: string
  portalContainer?: HTMLElement
  testId?: string
}

/**
 * Unified split execution button for batch verification runs.
 *
 * In idle state, combines a primary "Run All" action with a progressive-disclosure
 * popover for tuning execution preferences (safe/moderate/fast presets or custom stepper).
 * In running state, transitions to a single stop button with loading indicator.
 */
export function VerificationRunAllButton({
  isRunning,
  disabled = false,
  concurrency,
  onRun,
  onStop,
  runLabel,
  stopLabel,
  hint,
  className,
  portalContainer,
  testId = "verification-run-all",
}: VerificationRunAllButtonProps) {
  const { t } = useTranslation("aiApiVerification")
  const [open, setOpen] = useState(false)

  const effectiveRunLabel = runLabel ?? t("verifyDialog.actions.runAll")
  const effectiveStopLabel = stopLabel ?? t("verifyDialog.actions.stop")
  const effectiveHint = hint ?? t("verifyDialog.actions.runAllHint")
  const concurrencyHint = t("verifyDialog.concurrency.current", {
    value: concurrency.value,
  })

  if (isRunning) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={onStop}
        loading={true}
        loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
        className={className}
        data-testid={`${testId}-stop`}
      >
        {effectiveStopLabel}
      </Button>
    )
  }

  return (
    <div
      className={cn("inline-flex items-center", className)}
      role="group"
      data-slot="split-button"
      data-testid={testId}
    >
      <Tooltip anchorAsChild content={effectiveHint}>
        <Button
          type="button"
          variant="secondary"
          onClick={onRun}
          disabled={disabled}
          className="rounded-r-none border-r-0 focus-visible:z-10"
          data-testid={`${testId}-trigger`}
        >
          {effectiveRunLabel}
        </Button>
      </Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip anchorAsChild content={concurrencyHint}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="default"
              disabled={disabled}
              className="relative size-auto min-h-(--density-control) gap-1.5 rounded-l-none border-l-0 px-2.5 text-xs before:absolute before:inset-y-2 before:left-0 before:w-px before:bg-muted-foreground/40 focus-visible:z-10"
              aria-label={t("verifyDialog.concurrency.optionsTrigger")}
              aria-expanded={open}
              data-testid={`${testId}-options-trigger`}
              data-verification-run-options-trigger
            >
              <span>{concurrency.value}</span>
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={6}
          container={portalContainer}
          className="w-80 space-y-3 p-3.5 text-xs shadow-lg"
          data-testid={`${testId}-options-popover`}
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-semibold text-foreground">
              {t("verifyDialog.concurrency.options")}
            </span>
          </div>
          <VerificationConcurrencyControl
            controller={concurrency}
            disabled={disabled}
            variant={VERIFICATION_CONCURRENCY_CONTROL_VARIANTS.Compact}
            showPresets
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
