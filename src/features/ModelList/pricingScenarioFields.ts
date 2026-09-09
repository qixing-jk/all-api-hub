import {
  PRICING_MEASUREMENT_AXES,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_SELECTION_AXES,
} from "~/services/modelPricing/pricingConstants"

/** Display order shared by editable selectors and the comparison summary. */
export const PRICING_SCENARIO_SELECTION_AXES = [
  PRICING_SELECTION_AXES.SERVICE_TIER,
  PRICING_SELECTION_AXES.RESPONSE_FORMAT,
  PRICING_SELECTION_AXES.VIDEO_INPUT,
  PRICING_SELECTION_AXES.IMAGE_SIZE,
  PRICING_SELECTION_AXES.VIDEO_QUALITY,
  PRICING_SELECTION_AXES.IMAGE_QUALITY,
] as const

/** Editable task quantities, in display order, with their comparison defaults. */
export const PRICING_TASK_FIELDS = [
  { meter: PRICING_METERS.PAGES, defaultValue: 1 },
  { meter: PRICING_METERS.OUTPUT_MEGAPIXELS, defaultValue: 1 },
  { meter: PRICING_METERS.IMAGE, defaultValue: 1 },
  { meter: PRICING_METERS.VIDEO_SECONDS, defaultValue: 1 },
  { meter: PRICING_METERS.CHARACTERS, defaultValue: 1000 },
  { meter: PRICING_METERS.SEARCH_UNITS, defaultValue: 1 },
  { meter: PRICING_METERS.REFERENCE_IMAGE, defaultValue: 0 },
] as const

export const PRICING_SCENARIO_EXTRA_FIELDS = {
  IMAGE_MEGAPIXELS: PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS,
  TIME: "at",
} as const

const REQUIREMENT_FIELDS = [
  ...PRICING_TASK_FIELDS.map(({ meter }) => meter),
  PRICING_RANGE_AXES.INPUT_TOKENS,
  PRICING_RANGE_AXES.OUTPUT_TOKENS,
  PRICING_SCENARIO_EXTRA_FIELDS.IMAGE_MEGAPIXELS,
  PRICING_SCENARIO_EXTRA_FIELDS.TIME,
] as const

export type PricingConditionTarget =
  | (typeof PRICING_SCENARIO_SELECTION_AXES)[number]
  | (typeof REQUIREMENT_FIELDS)[number]

export const UNSPECIFIED_PRICING_OPTION = "unknown"
export const PRICING_TIME_FIELD_ID = "model-price-comparison-time"

/** Only task meters represented by an actual quantity field are navigable. */
export function isPricingTaskMeter(
  value: string | undefined,
): value is (typeof PRICING_TASK_FIELDS)[number]["meter"] {
  return PRICING_TASK_FIELDS.some(({ meter }) => meter === value)
}

/** Narrows requirement axes to controls the pricing page actually renders. */
export function isPricingRequirementTarget(
  value: string,
): value is (typeof REQUIREMENT_FIELDS)[number] {
  return REQUIREMENT_FIELDS.some((field) => field === value)
}
