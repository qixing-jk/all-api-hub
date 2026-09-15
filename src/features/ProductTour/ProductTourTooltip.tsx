import { Compass, X } from "lucide-react"
import type { TooltipRenderProps } from "react-joyride"

import { Button } from "~/components/ui"

import { PRODUCT_TOUR_TEST_IDS } from "./testIds"

/** Joyride supplies the shared shadow around this surface and its themed arrow. */
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
      className="bg-card text-foreground py-density-4 sm:py-density-5 w-[min(22rem,calc(100vw-2rem))] rounded-xl px-4 sm:px-5"
      data-testid={PRODUCT_TOUR_TEST_IDS.tooltip}
      aria-labelledby="product-tour-step-title"
      aria-describedby="product-tour-step-description"
    >
      <div className="gap-y-density-4 flex items-start justify-between gap-x-4">
        <div className="text-theme-600 dark:text-theme-400 gap-y-density-2 flex min-w-0 items-center gap-x-2">
          <Compass className="h-5 w-5 shrink-0" aria-hidden="true" />
          <h2
            id="product-tour-step-title"
            className="text-foreground text-base font-semibold"
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
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div
        id="product-tour-step-description"
        className="text-muted-foreground dark:text-secondary-foreground mt-density-3 text-sm leading-6"
      >
        {step.content}
      </div>

      <div className="mt-density-5 gap-y-density-3 flex flex-wrap items-center justify-between gap-x-3">
        <div className="gap-y-density-2 flex items-center gap-x-2">
          <span
            className="text-muted-foreground text-xs"
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
        <div className="gap-y-density-2 ml-auto flex flex-wrap items-center justify-end gap-x-2">
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
