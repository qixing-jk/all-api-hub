import type { UnifiedApiGuidanceStepperCopy } from "../i18n"
import {
  UNIFIED_API_GUIDANCE_STEP_STATES,
  type UnifiedApiGuidanceStep,
} from "../model"

interface UnifiedApiGuidanceStepperProps {
  copy: UnifiedApiGuidanceStepperCopy
  steps: readonly UnifiedApiGuidanceStep[]
}

/**
 * Shows the setup sequence while keeping completion claims tied to model state.
 */
export function UnifiedApiGuidanceStepper({
  copy,
  steps,
}: UnifiedApiGuidanceStepperProps) {
  return (
    <ol
      aria-label={copy.label()}
      className="gap-y-density-2 grid grid-cols-1 gap-x-2 lg:grid-cols-3"
    >
      {steps.map((step, index) => {
        const isCurrent =
          step.state === UNIFIED_API_GUIDANCE_STEP_STATES.Current
        const isCompleted =
          step.state === UNIFIED_API_GUIDANCE_STEP_STATES.Completed

        return (
          <li
            key={step.id}
            className={`py-density-2-5 min-w-0 rounded-md border px-3 ${
              isCurrent
                ? "border-theme-300 bg-theme-50/70 dark:border-theme-800 dark:bg-theme-950/20"
                : "border-border/70 bg-card/50 dark:border-foreground/10 dark:bg-foreground/[0.025]"
            }`}
          >
            <div className="gap-y-density-2-5 flex min-w-0 gap-x-2.5">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isCompleted
                    ? "bg-success-soft text-success-soft-foreground"
                    : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground dark:bg-foreground/10"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="gap-y-density-1 flex min-w-0 flex-wrap items-center gap-x-2">
                  <span
                    aria-current={isCurrent ? "step" : undefined}
                    className="text-foreground text-sm font-medium"
                  >
                    {copy.stepTitle(step.id)}
                  </span>
                  <span className="text-muted-foreground dark:text-secondary-foreground text-2xs font-medium">
                    {copy.stateLabel(step.state)}
                  </span>
                </div>
                <p className="text-muted-foreground dark:text-secondary-foreground mt-0.5 text-xs leading-5">
                  {copy.stepDescription(step.id)}
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
