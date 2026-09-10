import { Compass, X } from "lucide-react"
import type { TooltipRenderProps } from "react-joyride"

import { Button } from "~/components/ui"

import { PRODUCT_TOUR_TEST_IDS } from "./testIds"

/** Project-styled, accessible tooltip used by React Joyride. */
export function ProductTourTooltip({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  size,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <section
      {...tooltipProps}
      className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xl sm:p-5 dark:text-gray-100"
      data-testid={PRODUCT_TOUR_TEST_IDS.tooltip}
      aria-labelledby="product-tour-step-title"
      aria-describedby="product-tour-step-description"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-blue-600 dark:text-blue-400">
          <Compass className="h-5 w-5 shrink-0" aria-hidden="true" />
          <h2
            id="product-tour-step-title"
            className="text-base font-semibold text-gray-900 dark:text-gray-100"
          >
            {step.title}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={closeProps["aria-label"]}
          title={closeProps.title}
          data-action={closeProps["data-action"]}
          onClick={closeProps.onClick}
          className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div
        id="product-tour-step-description"
        className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300"
      >
        {step.content}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="text-xs text-gray-600 dark:text-gray-400"
            aria-label={`${index + 1} / ${size}`}
          >
            {index + 1} / {size}
          </span>
          {!isLastStep ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={skipProps["aria-label"]}
              title={skipProps.title}
              data-action={skipProps["data-action"]}
              onClick={skipProps.onClick}
            >
              {step.locale.skip}
            </Button>
          ) : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {index > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={backProps["aria-label"]}
              title={backProps.title}
              data-action={backProps["data-action"]}
              onClick={backProps.onClick}
            >
              {step.locale.back}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            aria-label={primaryProps["aria-label"]}
            title={primaryProps.title}
            data-action={primaryProps["data-action"]}
            onClick={primaryProps.onClick}
          >
            {isLastStep ? step.locale.last : step.locale.next}
          </Button>
        </div>
      </div>
    </section>
  )
}
