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
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {steps.map((step, index) => {
        const isCurrent =
          step.state === UNIFIED_API_GUIDANCE_STEP_STATES.Current
        const isCompleted =
          step.state === UNIFIED_API_GUIDANCE_STEP_STATES.Completed

        return (
          <li
            key={step.id}
            className={`min-w-0 rounded-md border px-3 py-2.5 ${
              isCurrent
                ? "border-blue-300 bg-blue-50/70 dark:border-blue-800 dark:bg-blue-950/20"
                : "border-slate-200/70 bg-white/50 dark:border-white/10 dark:bg-white/[0.025]"
            }`}
          >
            <div className="flex min-w-0 gap-2.5">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isCompleted
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200"
                    : isCurrent
                      ? "bg-blue-600 text-white dark:bg-blue-500"
                      : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    aria-current={isCurrent ? "step" : undefined}
                    className="text-sm font-medium text-slate-900 dark:text-white"
                  >
                    {copy.stepTitle(step.id)}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {copy.stateLabel(step.state)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
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
