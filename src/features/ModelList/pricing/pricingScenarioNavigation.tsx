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
  isPricingRequirementTarget,
  isPricingTaskMeter,
  PRICING_SCENARIO_EXTRA_FIELDS,
  type PricingConditionTarget,
} from "~/features/ModelList/pricing/pricingScenarioFields"
import {
  PRICING_CONDITION_KINDS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_RANGE_AXES,
} from "~/services/modelPricing/pricingConstants"
import type { QuoteResult } from "~/services/modelPricing/pricingPlan"
import { revealNavigationTarget } from "~/utils/dom/navigationTarget"

const PRICING_CONDITION_HIGHLIGHT_DURATION_MS = 4000

/** Identify a single actionable field from affected meters and published rules. */
export function getPricingConditionTarget(
  quote: QuoteResult,
): PricingConditionTarget | undefined {
  const [conditionDetail] = quote.conditionDetails ?? []
  if (quote.conditionDetails?.length === 1 && conditionDetail !== undefined)
    return conditionDetail.axis
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
      }
      if (!targets.length) {
        const customization = controls.querySelector("details")
        if (customization) customization.open = true
      }
      const destination = targets[0] ?? controls
      return revealNavigationTarget(destination, {
        block: "center",
        focus: true,
        highlight: {
          durationMs: PRICING_CONDITION_HIGHLIGHT_DURATION_MS,
          onChange: (active) => {
            for (const target of targets) {
              if (active) target.dataset.pricingHighlight = "true"
              else delete target.dataset.pricingHighlight
            }
          },
        },
      })
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
