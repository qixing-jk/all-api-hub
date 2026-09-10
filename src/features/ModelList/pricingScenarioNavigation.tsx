import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"

import {
  PRICING_CONDITION_KINDS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_RANGE_AXES,
} from "~/services/modelPricing/pricingConstants"
import type { QuoteResult } from "~/services/modelPricing/pricingPlan"

import {
  isPricingRequirementTarget,
  isPricingTaskMeter,
  PRICING_SCENARIO_EXTRA_FIELDS,
  type PricingConditionTarget,
} from "./pricingScenarioFields"

/** Identify a single actionable field from affected meters and published rules. */
export function getPricingConditionTarget(
  quote: QuoteResult,
): PricingConditionTarget | undefined {
  if (quote.conditionDetails?.length === 1)
    return quote.conditionDetails[0].axis
  const missingMeters = quote.issues
    .filter((issue) => issue.code === PRICING_ISSUE_CODES.CONDITION_MISSING)
    .map((issue) => issue.meter)
  const targets = new Set<PricingConditionTarget>()
  for (const issue of quote.issues) {
    if (
      ![
        PRICING_ISSUE_CODES.USAGE_MISSING,
        PRICING_ISSUE_CODES.USAGE_INVALID,
      ].some((code) => code === issue.code)
    )
      continue
    const meter = issue.meter
    if (isPricingTaskMeter(meter)) targets.add(meter)
  }
  for (const rule of quote.publishedSchedule ?? []) {
    if (!missingMeters.some((meter) => meter && rule.rates[meter])) continue
    for (const condition of rule.conditions) {
      if (condition.kind === PRICING_CONDITION_KINDS.SELECTION)
        targets.add(condition.axis)
      else if (condition.kind === PRICING_CONDITION_KINDS.MEASUREMENT)
        targets.add(condition.axis)
      else if (condition.kind === PRICING_CONDITION_KINDS.RANGE) {
        if (condition.axis === PRICING_RANGE_AXES.OUTPUT_TOKENS)
          targets.add(PRICING_RANGE_AXES.OUTPUT_TOKENS)
        else if (
          condition.axis === PRICING_RANGE_AXES.INPUT_TOKENS ||
          condition.axis === PRICING_RANGE_AXES.INPUT_TOKENS_CACHE_BASIS_UNKNOWN
        )
          targets.add(PRICING_RANGE_AXES.INPUT_TOKENS)
      } else targets.add(PRICING_SCENARIO_EXTRA_FIELDS.TIME)
    }
  }
  return targets.size === 1 ? [...targets][0] : undefined
}

/** Resolve every editable field without inventing a target for unsupported rules. */
export function getPricingConditionTargets(
  quote: Pick<QuoteResult, "conditionDetails" | "requirementDetails"> &
    Partial<Pick<QuoteResult, "issues">>,
): PricingConditionTarget[] {
  const targets = new Set<PricingConditionTarget>(
    quote.conditionDetails?.map((detail) => detail.axis),
  )
  if (
    quote.issues?.some(
      (issue) => issue.code === PRICING_ISSUE_CODES.CACHE_BASIS_UNKNOWN,
    )
  ) {
    targets.add(PRICING_METERS.CACHE_READ)
    targets.add(PRICING_METERS.CACHE_WRITE)
  }
  for (const detail of quote.requirementDetails ?? []) {
    if (detail.axis === PRICING_RANGE_AXES.TOTAL_TOKENS) {
      targets.add(PRICING_RANGE_AXES.INPUT_TOKENS)
      targets.add(PRICING_RANGE_AXES.OUTPUT_TOKENS)
    } else if (isPricingRequirementTarget(detail.axis)) targets.add(detail.axis)
  }
  return [...targets]
}

const PricingScenarioNavigationContext = createContext<
  | {
      configure: (
        target?: PricingConditionTarget | PricingConditionTarget[],
      ) => void
      controlsRef: RefObject<HTMLElement | null>
    }
  | undefined
>(undefined)

/** Opens and focuses the local estimator without changing the options-page route. */
export function PricingScenarioNavigation({
  children,
  onConfigure,
}: {
  children: ReactNode
  onConfigure: () => void
}) {
  const controlsRef = useRef<HTMLElement>(null)
  const targetRef = useRef<PricingConditionTarget[]>([])
  const [requested, setRequested] = useState(0)
  useEffect(() => {
    if (!requested) return
    const controls = controlsRef.current
    if (controls) {
      const targets = targetRef.current.flatMap((target) => {
        const field = controls.querySelector<HTMLElement>(
          `[data-pricing-condition="${target}"]`,
        )
        return field ? [field] : []
      })
      for (const target of targets) {
        let ancestor = target.parentElement
        while (ancestor && ancestor !== controls) {
          if (ancestor instanceof HTMLDetailsElement) ancestor.open = true
          ancestor = ancestor.parentElement
        }
        target.dataset.pricingHighlight = "true"
      }
      if (!targets.length) {
        const customization = controls.querySelector("details")
        if (customization) customization.open = true
      }
      const destination = targets[0] ?? controls
      destination.scrollIntoView?.({ block: "center" })
      destination.focus({ preventScroll: true })
      const clear = () => {
        for (const target of targets) delete target.dataset.pricingHighlight
      }
      const timeout = setTimeout(clear, 4000)
      return () => {
        clearTimeout(timeout)
        clear()
      }
    }
  }, [requested])
  return (
    <PricingScenarioNavigationContext.Provider
      value={{
        controlsRef,
        configure: (target) => {
          targetRef.current =
            target === undefined
              ? []
              : Array.isArray(target)
                ? target
                : [target]
          onConfigure()
          setRequested((value) => value + 1)
        },
      }}
    >
      {children}
    </PricingScenarioNavigationContext.Provider>
  )
}

/** Returns estimator navigation only within a model-list page that owns it. */
export function usePricingScenarioNavigation() {
  return useContext(PricingScenarioNavigationContext)
}
