import {
  PRICING_CONDITION_KINDS,
  PRICING_ISSUE_CODES,
  PRICING_PURPOSES,
  PRICING_RANGE_AXES,
  PRICING_RESPONSE_FORMATS,
  PRICING_SELECTION_AXES,
  PRICING_SERVICE_TIERS,
} from "./pricingConstants"
import {
  CACHE_TOKEN_METERS,
  INPUT_TOKEN_METERS,
  OUTPUT_TOKEN_METERS,
  type PricingPlan,
  type PricingScenario,
} from "./pricingPlan"
import { normalizeVideoQuality } from "./videoQuality"

const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const calendarFormatters = new Map<string, Intl.DateTimeFormat>()
const MAX_CALENDAR_FORMATTERS = 32

/** Reuses bounded timezone formatters; the instant is always formatted afresh. */
function getPricingCalendarParts(timeZone: string, date: Date) {
  let formatter = calendarFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      month: "numeric",
      day: "numeric",
    })
    if (calendarFormatters.size >= MAX_CALENDAR_FORMATTERS)
      calendarFormatters.delete(calendarFormatters.keys().next().value!)
    calendarFormatters.set(timeZone, formatter)
  }
  return formatter.formatToParts(date)
}

/** Predicates return unknown when the upstream axis or scenario is incomplete. */
export function matchesPricingCondition(
  condition: PricingPlan["rules"][number]["conditions"][number],
  scenario: PricingScenario,
): boolean | typeof PRICING_ISSUE_CODES.CACHE_BASIS_UNKNOWN | undefined {
  if (condition.kind === PRICING_CONDITION_KINDS.MEASUREMENT) {
    const value = scenario[condition.axis]
    if (value === undefined || !Number.isFinite(value) || value < 0)
      return undefined
    return (
      (condition.gt === undefined || value > condition.gt) &&
      (condition.lte === undefined || value <= condition.lte)
    )
  }
  if (condition.kind === PRICING_CONDITION_KINDS.SELECTION) {
    const value =
      condition.axis === PRICING_SELECTION_AXES.SERVICE_TIER
        ? scenario.serviceTier ?? PRICING_SERVICE_TIERS.STANDARD
        : scenario[condition.axis]
    if (value === undefined) return undefined
    return condition.axis === PRICING_SELECTION_AXES.VIDEO_QUALITY
      ? normalizeVideoQuality(value) === normalizeVideoQuality(condition.value)
      : value === condition.value
  }
  if (condition.kind === PRICING_CONDITION_KINDS.RANGE) {
    // An index describes the selected mix: excluded cache meters contribute no
    // tokens to that scenario. A real request needs explicit zero quantities.
    const excludesCache = CACHE_TOKEN_METERS.every(
      (meter) =>
        scenario.usage[meter] === 0 ||
        (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX &&
          scenario.usage[meter] == null),
    )
    if (
      condition.axis === PRICING_RANGE_AXES.INPUT_TOKENS_CACHE_BASIS_UNKNOWN &&
      !excludesCache &&
      scenario.inputTokens !== undefined &&
      Number.isSafeInteger(scenario.inputTokens) &&
      scenario.inputTokens >= 0
    )
      return PRICING_ISSUE_CODES.CACHE_BASIS_UNKNOWN
    let value =
      condition.axis === PRICING_RANGE_AXES.INPUT_TOKENS ||
      (condition.axis === PRICING_RANGE_AXES.INPUT_TOKENS_CACHE_BASIS_UNKNOWN &&
        excludesCache)
        ? scenario.inputTokens
        : condition.axis === PRICING_RANGE_AXES.OUTPUT_TOKENS
          ? scenario.outputTokens
          : condition.axis === PRICING_RANGE_AXES.TOTAL_TOKENS &&
              scenario.inputTokens !== undefined &&
              scenario.outputTokens !== undefined
            ? scenario.inputTokens + scenario.outputTokens
            : undefined
    if (value === undefined || !Number.isSafeInteger(value) || value < 0)
      return undefined
    const deductions =
      condition.inputTokenDeductions ?? condition.outputTokenDeductions
    if (deductions) {
      // The index scales the selected input or output mix to its reference length;
      // request quotes instead subtract actual measured token quantities.
      // An unspecified format is safe only when both deductions agree.
      const meters: readonly (
        | (typeof INPUT_TOKEN_METERS)[number]
        | (typeof OUTPUT_TOKEN_METERS)[number]
      )[] = condition.outputTokenDeductions
        ? OUTPUT_TOKEN_METERS
        : INPUT_TOKEN_METERS
      const quantities = meters.map(
        (meter) =>
          scenario.usage[meter] ??
          (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX ? 0 : undefined),
      )
      const total = quantities.reduce<number>(
        (sum, quantity) => sum + (quantity ?? 0),
        0,
      )
      if (
        quantities.some(
          (quantity) =>
            quantity !== undefined &&
            (!Number.isFinite(quantity) || quantity < 0),
        ) ||
        !Number.isFinite(total)
      )
        return undefined
      const basis = value
      const candidates = (
        scenario.responseFormat
          ? [scenario.responseFormat]
          : ([
              PRICING_RESPONSE_FORMATS.OPENAI,
              PRICING_RESPONSE_FORMATS.ANTHROPIC,
            ] as const)
      ).map((format) => {
        let deduction = 0
        for (const meter of deductions[format]) {
          const quantity = quantities[meters.indexOf(meter)]
          if (quantity === undefined) return undefined
          deduction += quantity
        }
        if (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX) {
          if (total === 0) return deduction === 0 ? basis : undefined
          deduction = basis * (deduction / total)
        }
        return Math.max(0, basis - deduction)
      })
      if (
        candidates.some(
          (candidate) => candidate === undefined || candidate !== candidates[0],
        )
      )
        return undefined
      value = candidates[0]!
    }
    return (
      (condition.min === undefined || value >= condition.min) &&
      (condition.maxExclusive === undefined || value < condition.maxExclusive)
    )
  }
  if (!scenario.at) return undefined
  const date = new Date(scenario.at)
  if (!Number.isFinite(date.getTime())) return undefined
  if (condition.kind === PRICING_CONDITION_KINDS.CALENDAR) {
    try {
      const parts = getPricingCalendarParts(condition.timeZone, date)
      const raw = parts.find((part) => part.type === condition.part)?.value
      const value =
        condition.part === "weekday"
          ? CALENDAR_WEEKDAYS.indexOf(raw ?? "")
          : Number(raw)
      if (!Number.isFinite(value) || value < 0) return undefined
      return condition.operator === "=="
        ? value === condition.value
        : condition.operator === ">="
          ? value >= condition.value
          : condition.operator === "<="
            ? value <= condition.value
            : condition.operator === ">"
              ? value > condition.value
              : value < condition.value
    } catch {
      return undefined
    }
  }
  if (condition.kind === PRICING_CONDITION_KINDS.DATE_WINDOW) {
    const start = Date.parse(condition.start),
      end = condition.end ? Date.parse(condition.end) : Infinity
    if (!Number.isFinite(start) || Number.isNaN(end) || end <= start)
      return undefined
    return date.getTime() >= start && date.getTime() < end
  }
  let minute = date.getUTCHours() * 60 + date.getUTCMinutes()
  let weekday = date.getUTCDay()
  if (condition.kind === PRICING_CONDITION_KINDS.TIME_WINDOW) {
    try {
      const parts = getPricingCalendarParts(condition.timeZone, date)
      const get = (type: string) =>
        parts.find((part) => part.type === type)?.value
      minute = Number(get("hour")) * 60 + Number(get("minute"))
      weekday = CALENDAR_WEEKDAYS.indexOf(get("weekday") ?? "")
      if (!Number.isFinite(minute) || weekday < 0) return undefined
    } catch {
      return undefined
    }
  }
  return (
    (!condition.days || condition.days.includes(weekday)) &&
    (condition.startMinute < condition.endMinute
      ? minute >= condition.startMinute && minute < condition.endMinute
      : minute >= condition.startMinute || minute < condition.endMinute)
  )
}
