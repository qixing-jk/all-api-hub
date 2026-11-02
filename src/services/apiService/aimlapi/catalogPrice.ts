import {
  AIMLAPI_CATALOG_PRICING_URL,
  AIMLAPI_CHARGE_TYPES as chargeTypes,
  AIMLAPI_PRICING_CONTENTS as pricingContents,
  AIMLAPI_PRICING_KINDS as pricingKinds,
  AIMLAPI_PRICING_ORIGINS as pricingOrigins,
  AIMLAPI_PRICING_UNITS as pricingUnits,
} from "~/services/apiService/aimlapi/constants"
import type { AimlApiPublicModel } from "~/services/apiService/aimlapi/models"
import type { PublishedPrice } from "~/services/apiService/aimlapi/pricing"
import {
  PRICING_SOURCE_NOTE_KINDS as noteKinds,
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_DOCUMENT_ANNOTATIONS,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_MEASUREMENT_AXES,
  PRICING_METERS,
  PRICING_SELECTION_AXES,
  PRICING_USAGE_MODES,
  PRICING_VIDEO_AUDIO_MODES,
  PRICING_VIDEO_DYNAMIC_RANGES,
  PRICING_VIDEO_INPUTS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { compileExclusiveVariantRules } from "~/services/modelPricing/selectionPricingRules"
import { normalizeVideoQuality } from "~/services/modelPricing/videoQuality"
import { isRecord } from "~/utils/core/object"

/** Compile declared request variants without selecting a default parameter value. */
function readVariants(
  pricing: Record<string, unknown>,
  model: AimlApiPublicModel,
  fallback: PublishedPrice,
): PublishedPrice {
  if (
    !Array.isArray(pricing.variants) ||
    !pricing.variants.length ||
    !Array.isArray(pricing.units) ||
    !pricing.units.length
  )
    return fallback
  if (
    pricing.units.some(
      (unit) =>
        !isRecord(unit) ||
        unit.type !== chargeTypes.Charge ||
        typeof unit.per !== "number" ||
        !Number.isFinite(unit.per) ||
        unit.per <= 0,
    )
  )
    return fallback
  const variants = pricing.variants
  if (
    Array.isArray(pricing.dimensions) &&
    pricing.dimensions.some(
      (key) =>
        typeof key !== "string" ||
        !variants.some(
          (variant) =>
            isRecord(variant) &&
            isRecord(variant.when) &&
            Object.hasOwn(variant.when, key),
        ),
    )
  )
    return fallback
  const rules: PricingPlan["rules"] = []
  let comparisonMeter:
    | NonNullable<PricingPlan["comparison"]>["meter"]
    | typeof PRICING_METERS.REQUEST
    | typeof PRICING_METERS.VIDEO_OUTPUT
    | undefined
  const onlyVariant =
    pricing.variants.length === 1 ? pricing.variants[0] : undefined
  const onlyUnit = pricing.units.length === 1 ? pricing.units[0] : undefined
  if (
    isRecord(onlyVariant) &&
    isRecord(onlyVariant.when) &&
    !Object.keys(onlyVariant.when).length &&
    isRecord(onlyUnit) &&
    onlyUnit.variable === false &&
    onlyVariant.unit === onlyUnit.name &&
    typeof onlyUnit.price === "number" &&
    typeof onlyUnit.per === "number" &&
    typeof onlyVariant.price === "number" &&
    typeof onlyVariant.per === "number" &&
    onlyUnit.price * onlyVariant.per === onlyVariant.price * onlyUnit.per
  )
    return readAimlApiCatalogPrice({
      ...model,
      pricing: { ...pricing, kind: pricingKinds.Fixed, variants: [] },
    })
  const primary = pricing.units.findIndex(
    (unit) => isRecord(unit) && unit.variable === true,
  )
  const independent: PricingPlan["rates"] = {}
  const supportedExtra = new Set<number>()
  for (const [index, unit] of pricing.units.entries()) {
    const meter =
      isRecord(unit) && unit.content === pricingContents.Image
        ? unit.name === pricingUnits.Generation &&
          unit.origin === pricingOrigins.Generated
          ? PRICING_METERS.OUTPUT_IMAGE
          : unit.name === pricingUnits.Payload &&
              unit.origin === pricingOrigins.Provided &&
              unit.measure === "count"
            ? PRICING_METERS.REFERENCE_IMAGE
            : undefined
        : undefined
    if (
      index === primary ||
      !isRecord(unit) ||
      !meter ||
      typeof unit.price !== "number" ||
      !Number.isFinite(unit.price) ||
      unit.price < 0 ||
      typeof unit.per !== "number"
    )
      continue
    if (independent[meter]) return fallback
    independent[meter] = {
      amount: unit.price,
      per: unit.per,
      currency: "USD",
      unit: PRICE_RATE_UNITS.IMAGE,
    }
    supportedExtra.add(index)
  }
  const extras = pricing.units.filter(
    (unit, index) =>
      !supportedExtra.has(index) &&
      isRecord(unit) &&
      unit.price !== 0 &&
      unit.variable !== true,
  )
  if (extras.length)
    return {
      ...fallback,
      notes: [{ kind: noteKinds.AMBIGUOUS_VARIANT_CHARGES }],
    }
  const excluded = pricing.units
    .filter(
      (unit, index) =>
        index !== primary &&
        !supportedExtra.has(index) &&
        isRecord(unit) &&
        unit.price !== 0,
    )
    .map((unit) =>
      isRecord(unit) ? `${unit.content} ${unit.name}` : "unknown charge",
    )
  for (const variant of pricing.variants) {
    if (
      !isRecord(variant) ||
      !isRecord(variant.when) ||
      typeof variant.price !== "number" ||
      !Number.isFinite(variant.price) ||
      variant.price < 0 ||
      typeof variant.per !== "number" ||
      !Number.isFinite(variant.per) ||
      variant.per <= 0
    )
      return fallback
    const duration =
      typeof variant.when.duration === "number"
        ? variant.when.duration
        : typeof variant.when.duration === "string" &&
            /^\d+(?:\.\d+)?s$/.test(variant.when.duration)
          ? Number(variant.when.duration.slice(0, -1))
          : undefined
    const generationDuration =
      variant.unit === pricingUnits.Generation &&
      model.type.includes("video") &&
      duration !== undefined &&
      Number.isFinite(duration) &&
      duration > 0
    const meter =
      variant.unit === pricingUnits.Page
        ? PRICING_METERS.PAGES
        : (variant.unit === pricingUnits.Second || generationDuration) &&
            model.type.includes("video")
          ? PRICING_METERS.VIDEO_SECONDS
          : variant.unit === pricingUnits.Generation
            ? model.type.includes("image")
              ? PRICING_METERS.IMAGE
              : PRICING_METERS.REQUEST
            : variant.unit === pricingUnits.Token &&
                model.type.includes("video")
              ? PRICING_METERS.VIDEO_OUTPUT
              : undefined
    if (!meter || (comparisonMeter && comparisonMeter !== meter))
      return fallback
    comparisonMeter = meter
    const conditions: PricingPlan["rules"][number]["conditions"] = []
    for (const [key, value] of Object.entries(variant.when)) {
      if (
        ["resolution", "parameters.resolution", "max_resolution"].includes(
          key,
        ) &&
        (typeof value === "string" ||
          (key === "max_resolution" &&
            typeof value === "number" &&
            Number.isFinite(value) &&
            value > 0))
      )
        conditions.push({
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: model.type.includes("image")
            ? PRICING_SELECTION_AXES.IMAGE_SIZE
            : PRICING_SELECTION_AXES.VIDEO_QUALITY,
          value: normalizeVideoQuality(
            typeof value === "number" ? `${value}p` : value,
          ),
        })
      else if (
        ["quality", "output_tier"].includes(key) &&
        typeof value === "string" &&
        value.trim()
      )
        conditions.push({
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.IMAGE_QUALITY,
          value,
        })
      else if (
        key === "megapixels" &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value > 0
      )
        conditions.push({
          kind: PRICING_CONDITION_KINDS.MEASUREMENT,
          axis: PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS,
          eq: value,
        })
      else if (
        ["generate_audio", "parameters.audio", "sound"].includes(key) &&
        (typeof value === "boolean" || value === "on" || value === "off")
      )
        conditions.push({
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.VIDEO_AUDIO,
          value:
            value === true || value === "on"
              ? PRICING_VIDEO_AUDIO_MODES.WITH_AUDIO
              : PRICING_VIDEO_AUDIO_MODES.WITHOUT_AUDIO,
        })
      else if (key === "video_url" && (value === true || value === null))
        conditions.push({
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.VIDEO_INPUT,
          value:
            value === true
              ? PRICING_VIDEO_INPUTS.WITH_VIDEO
              : PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
        })
      else if (
        ["type", "mode"].includes(key) &&
        typeof value === "string" &&
        value.trim()
      )
        conditions.push({
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis:
            key === "type"
              ? PRICING_SELECTION_AXES.GENERATION_MODE
              : PRICING_SELECTION_AXES.VIDEO_MODE,
          value,
        })
      else if (key === "hdr" && typeof value === "boolean")
        conditions.push({
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.VIDEO_DYNAMIC_RANGE,
          value: value
            ? PRICING_VIDEO_DYNAMIC_RANGES.HDR
            : PRICING_VIDEO_DYNAMIC_RANGES.SDR,
        })
      else if (key === "annotated" && typeof value === "boolean")
        conditions.push({
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.DOCUMENT_ANNOTATION,
          value: value
            ? PRICING_DOCUMENT_ANNOTATIONS.ANNOTATED
            : PRICING_DOCUMENT_ANNOTATIONS.PLAIN,
        })
      else if (
        key === "duration" &&
        duration !== undefined &&
        Number.isFinite(duration) &&
        duration > 0
      )
        conditions.push({
          kind: PRICING_CONDITION_KINDS.MEASUREMENT,
          axis: PRICING_MEASUREMENT_AXES.VIDEO_SECONDS,
          eq: duration,
        })
      else return fallback
    }
    rules.push({
      id: `variant-${rules.length + 1}`,
      conditions,
      rates: {
        [meter]: {
          amount: variant.price,
          per: variant.per * (generationDuration ? duration! : 1),
          currency: "USD",
          unit:
            meter === PRICING_METERS.VIDEO_OUTPUT
              ? PRICE_RATE_UNITS.TOKEN
              : meter === PRICING_METERS.IMAGE
                ? PRICE_RATE_UNITS.IMAGE
                : meter === PRICING_METERS.REQUEST
                  ? PRICE_RATE_UNITS.REQUEST
                  : meter === PRICING_METERS.PAGES
                    ? PRICE_RATE_UNITS.PAGE
                    : PRICE_RATE_UNITS.SECOND,
        },
      },
    })
  }
  const unconditional = rules.length === 1 && !rules[0]!.conditions.length
  const compiled = unconditional ? rules : compileExclusiveVariantRules(rules)
  if (!compiled || !comparisonMeter) return fallback
  if (
    Object.keys(independent).length &&
    [PRICING_METERS.REQUEST, PRICING_METERS.VIDEO_OUTPUT].some(
      (meter) => meter === comparisonMeter,
    )
  )
    return fallback
  return {
    rates: { ...independent, ...(unconditional ? rules[0]!.rates : {}) },
    rules: unconditional ? [] : compiled,
    ...(!unconditional ? { requiresRuleMatch: true } : {}),
    usageMode:
      comparisonMeter === PRICING_METERS.VIDEO_OUTPUT
        ? PRICING_USAGE_MODES.VIDEO
        : comparisonMeter === PRICING_METERS.REQUEST
          ? PRICING_USAGE_MODES.REQUEST
          : PRICING_USAGE_MODES.METERED,
    ...(comparisonMeter !== PRICING_METERS.REQUEST &&
    comparisonMeter !== PRICING_METERS.VIDEO_OUTPUT
      ? { comparison: { meter: comparisonMeter } }
      : {}),
    sourceUrl: AIMLAPI_CATALOG_PRICING_URL,
    ...(excluded.length
      ? {
          estimated: true,
          hasUnpricedCharges: true,
          issues: [
            {
              code: PRICING_ISSUE_CODES.UNKNOWN_FEES,
              reason: PRICING_ISSUE_REASONS.TASK_USAGE,
            },
          ],
          notes: [{ kind: noteKinds.EXCLUDED_CHARGES, charges: excluded }],
        }
      : {}),
  }
}

/** Complete reference rates from the declared zero-threshold tier, without choosing a tier for a quote. */
function readThresholdReferenceUnits(
  pricing: Record<string, unknown>,
): unknown[] | undefined {
  if (!Array.isArray(pricing.units) || !Array.isArray(pricing.thresholds))
    return undefined
  const zero = pricing.thresholds.find(
    (tier) => isRecord(tier) && tier.from === 0,
  )
  if (!isRecord(zero) || !Array.isArray(zero.units)) return pricing.units
  const units = new Map<string, Record<string, unknown>>()
  for (const unit of [...pricing.units, ...zero.units]) {
    if (!isRecord(unit)) return undefined
    // A reservation is not a consumed charge and cannot enter the cost schedule.
    if (unit.type === chargeTypes.Hold) continue
    const key = JSON.stringify([
      unit.type,
      unit.name,
      unit.content,
      unit.origin,
      unit.phase,
      unit.tag,
    ])
    const previous = units.get(key)
    if (
      previous &&
      (typeof unit.price !== "number" ||
        typeof unit.per !== "number" ||
        typeof previous.price !== "number" ||
        typeof previous.per !== "number" ||
        unit.price * previous.per !== previous.price * unit.per)
    )
      return undefined
    units.set(key, unit)
  }
  return [...units.values()]
}

const AIMLAPI_TEXT_TOKEN_METERS: Readonly<Record<string, PriceMeter>> = {
  [pricingOrigins.Provided]: PRICING_METERS.INPUT,
  [pricingOrigins.Generated]: PRICING_METERS.OUTPUT,
  [pricingOrigins.Cached]: PRICING_METERS.CACHE_READ,
  [pricingOrigins.CacheWrite]: PRICING_METERS.CACHE_WRITE,
  [pricingOrigins.CacheWrite1h]: PRICING_METERS.CACHE_WRITE1H,
}

type AimlApiUnitCharge =
  | { meter: PriceMeter; rateUnit: PriceRate["unit"] }
  | { unpricedLabel: string }

/** Maps one validated provider unit to a product meter without mutating pricing state. */
function resolveAimlApiUnitCharge(
  unit: Record<string, unknown>,
  allUnits: readonly unknown[],
): AimlApiUnitCharge {
  let meter: PriceMeter | undefined
  let rateUnit: PriceRate["unit"] | undefined
  if (
    unit.name === pricingUnits.Call &&
    isRecord(unit.tag) &&
    unit.tag.type === "tool" &&
    ["google_search", "websearch_tool"].includes(String(unit.tag.name))
  ) {
    meter = PRICING_METERS.SEARCH
    rateUnit = PRICE_RATE_UNITS.SEARCH
  } else if (
    unit.name === pricingUnits.Call &&
    isRecord(unit.tag) &&
    unit.tag.type === "tool" &&
    unit.tag.name === "code_execution"
  ) {
    meter = PRICING_METERS.CODE_EXECUTION
    rateUnit = PRICE_RATE_UNITS.REQUEST
  } else if (unit.name === pricingUnits.Call && !unit.tag) {
    meter = PRICING_METERS.REQUEST
    rateUnit = PRICE_RATE_UNITS.REQUEST
  } else if (
    unit.name === pricingUnits.Second &&
    unit.content === pricingContents.Audio
  ) {
    meter = PRICING_METERS.AUDIO
    rateUnit = PRICE_RATE_UNITS.SECOND
  } else if (
    unit.name === pricingUnits.Second &&
    unit.content === pricingContents.Video
  ) {
    meter = PRICING_METERS.VIDEO_SECONDS
    rateUnit = PRICE_RATE_UNITS.SECOND
  } else if (
    unit.name === pricingUnits.Generation &&
    [pricingContents.Image, pricingContents.Video, pricingContents.Audio].some(
      (content) => content === String(unit.content),
    )
  ) {
    const mixedImage =
      unit.content === pricingContents.Image &&
      allUnits.some(
        (other) => isRecord(other) && other.name === pricingUnits.Token,
      )
    meter = mixedImage ? PRICING_METERS.IMAGE : PRICING_METERS.REQUEST
    rateUnit = mixedImage ? PRICE_RATE_UNITS.IMAGE : PRICE_RATE_UNITS.REQUEST
  } else if (
    unit.name === pricingUnits.Page &&
    unit.content === pricingContents.Document
  ) {
    meter = PRICING_METERS.PAGES
    rateUnit = PRICE_RATE_UNITS.PAGE
  } else if (
    unit.name === pricingUnits.Megapixel &&
    unit.content === pricingContents.Image
  ) {
    meter = PRICING_METERS.OUTPUT_MEGAPIXELS
    rateUnit = PRICE_RATE_UNITS.MEGAPIXEL
  } else if (
    unit.name === pricingUnits.Token &&
    unit.content === pricingContents.Video &&
    [pricingOrigins.Generated, pricingOrigins.Provided].some(
      (origin) => origin === String(unit.origin),
    )
  ) {
    meter =
      unit.origin === pricingOrigins.Generated
        ? PRICING_METERS.VIDEO_OUTPUT
        : PRICING_METERS.VIDEO_INPUT_TOKENS
    rateUnit = PRICE_RATE_UNITS.TOKEN
  } else if (
    unit.name === pricingUnits.Token &&
    [pricingContents.Image, pricingContents.Audio].some(
      (content) => content === String(unit.content),
    )
  ) {
    meter =
      unit.content === pricingContents.Image
        ? unit.origin === pricingOrigins.Provided
          ? PRICING_METERS.IMAGE_INPUT
          : unit.origin === pricingOrigins.Generated
            ? PRICING_METERS.IMAGE_OUTPUT
            : unit.origin === pricingOrigins.Cached
              ? PRICING_METERS.IMAGE_CACHE
              : undefined
        : unit.origin === pricingOrigins.Provided
          ? PRICING_METERS.AUDIO_INPUT
          : unit.origin === pricingOrigins.Generated
            ? PRICING_METERS.AUDIO_OUTPUT
            : undefined
    rateUnit = PRICE_RATE_UNITS.TOKEN
  } else if (
    unit.name === pricingUnits.Token &&
    unit.content === pricingContents.Text
  ) {
    meter =
      typeof unit.origin === "string"
        ? AIMLAPI_TEXT_TOKEN_METERS[unit.origin]
        : undefined
    rateUnit = PRICE_RATE_UNITS.TOKEN
  } else {
    return {
      unpricedLabel:
        isRecord(unit.tag) && typeof unit.tag.name === "string"
          ? unit.tag.name
          : `${unit.content} ${unit.name}`,
    }
  }
  return meter && rateUnit
    ? { meter, rateUnit }
    : { unpricedLabel: `${unit.content} ${unit.origin} ${unit.name}` }
}

/** Read the explicit catalogue contract; unknown declarations must not become HTML guesses. */
export function readAimlApiCatalogPrice(
  model: AimlApiPublicModel,
): PublishedPrice {
  const fallback: PublishedPrice = {
    rates: {},
    usageMode: PRICING_USAGE_MODES.CUSTOM,
    rulesUnavailable: true,
    sourceUrl: AIMLAPI_CATALOG_PRICING_URL,
    notes: [{ kind: noteKinds.RULES_UNAVAILABLE }],
  }
  const pricing = model.pricing
  if (
    isRecord(pricing) &&
    Array.isArray(pricing.thresholds) &&
    pricing.thresholds.length
  ) {
    const units = readThresholdReferenceUnits(pricing)
    if (!units)
      return {
        ...fallback,
        issues: [
          {
            code: PRICING_ISSUE_CODES.UNVERIFIED_AXIS,
            reason: PRICING_ISSUE_REASONS.SOURCE_CONFLICT,
          },
        ],
        notes: [{ kind: noteKinds.THRESHOLD_SOURCE_CONFLICT }],
      }
    const reference = readAimlApiCatalogPrice({
      ...model,
      pricing: { ...pricing, units, thresholds: [] },
    })
    return {
      ...reference,
      rulesUnavailable: true,
      issues: [
        ...(reference.issues ?? []),
        {
          code: PRICING_ISSUE_CODES.UNVERIFIED_AXIS,
          reason: PRICING_ISSUE_REASONS.THRESHOLD_BASIS_UNVERIFIED,
        },
      ],
      notes: [{ kind: noteKinds.THRESHOLD_BASIS_UNVERIFIED }],
    }
  }
  if (
    isRecord(pricing) &&
    pricing.currency === "USD" &&
    pricing.kind === pricingKinds.Variants
  )
    return readVariants(pricing, model, fallback)
  const providerEstimate =
    isRecord(pricing) &&
    pricing.kind === pricingKinds.Variable &&
    isRecord(pricing.billing) &&
    pricing.billing.source === "provider-reported" &&
    pricing.billing.fallback === "listed-token-estimate"
  if (
    isRecord(pricing) &&
    pricing.kind === pricingKinds.Fixed &&
    Array.isArray(pricing.dimensions) &&
    pricing.dimensions.length
  )
    return fallback
  if (
    isRecord(pricing) &&
    pricing.currency === "USD" &&
    pricing.kind === pricingKinds.Variable &&
    !providerEstimate
  ) {
    const numericUnits = Array.isArray(pricing.units)
      ? pricing.units
          .filter(
            (unit) =>
              isRecord(unit) &&
              typeof unit.price === "number" &&
              Number.isFinite(unit.price) &&
              unit.price >= 0,
          )
          .map((unit) => ({ ...unit, variable: false }))
      : []
    const reference = numericUnits.length
      ? readAimlApiCatalogPrice({
          ...model,
          pricing: {
            ...pricing,
            kind: pricingKinds.Fixed,
            units: numericUnits,
          },
        })
      : fallback
    return {
      ...reference,
      rulesUnavailable: true,
      notes: [{ kind: noteKinds.RUNTIME_DEPENDENT }],
    }
  }
  if (
    !isRecord(pricing) ||
    pricing.currency !== "USD" ||
    (!providerEstimate && pricing.kind !== pricingKinds.Fixed) ||
    !Array.isArray(pricing.units) ||
    !pricing.units.length
  )
    return fallback
  const rates: PricingPlan["rates"] = {}
  const contextFees = pricing.units.filter(
    (unit) =>
      isRecord(unit) &&
      isRecord(unit.tag) &&
      unit.tag.type === "tool" &&
      /^websearch_context_(low|medium|high)$/.test(String(unit.tag.name)),
  )
  if (contextFees.length) {
    const base = readAimlApiCatalogPrice({
      ...model,
      pricing: {
        ...pricing,
        units: pricing.units.filter((unit) => !contextFees.includes(unit)),
      },
    })
    if (base.rulesUnavailable || base.rates.search) return fallback
    const rules: PricingPlan["rules"] = []
    for (const unit of contextFees) {
      if (
        !isRecord(unit) ||
        !isRecord(unit.tag) ||
        unit.type !== chargeTypes.Charge ||
        unit.name !== pricingUnits.Call ||
        unit.variable !== false ||
        typeof unit.price !== "number" ||
        !Number.isFinite(unit.price) ||
        unit.price < 0 ||
        typeof unit.per !== "number" ||
        !Number.isFinite(unit.per) ||
        unit.per <= 0
      )
        return fallback
      rules.push({
        id: `search-context-${rules.length}`,
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.SEARCH_CONTEXT,
            value: String(unit.tag.name).replace("websearch_context_", ""),
          },
        ],
        rates: {
          search: {
            amount: unit.price,
            per: unit.per,
            currency: "USD",
            unit: PRICE_RATE_UNITS.SEARCH,
          },
        },
      })
    }
    const compiled = compileExclusiveVariantRules(rules)
    if (!compiled) return fallback
    return {
      ...base,
      rules: [...(base.rules ?? []), ...compiled],
      requiredUsage: [
        ...new Set([...(base.requiredUsage ?? []), PRICING_METERS.SEARCH]),
      ],
    }
  }
  const unpriced: string[] = []
  const phases = new Map<PriceMeter, unknown>()
  for (const unit of pricing.units) {
    if (
      !isRecord(unit) ||
      unit.type !== chargeTypes.Charge ||
      unit.variable !== false ||
      typeof unit.price !== "number" ||
      !Number.isFinite(unit.price) ||
      unit.price < 0 ||
      typeof unit.per !== "number" ||
      !Number.isFinite(unit.per) ||
      unit.per <= 0
    )
      return fallback
    // Token-priced image endpoints also emit a zero generation placeholder.
    // It cannot supply an image-count comparison without output token usage.
    if (
      unit.name === pricingUnits.Generation &&
      unit.content === pricingContents.Image &&
      unit.price === 0 &&
      pricing.units.some(
        (other) =>
          isRecord(other) &&
          other.name === pricingUnits.Token &&
          other.content === pricingContents.Image &&
          other.origin === pricingOrigins.Generated &&
          typeof other.price === "number" &&
          other.price > 0,
      )
    )
      continue
    const charge = resolveAimlApiUnitCharge(unit, pricing.units)
    if (!("meter" in charge)) {
      if (unit.price !== 0) unpriced.push(charge.unpricedLabel)
      continue
    }
    const { meter, rateUnit } = charge
    const rate = {
      amount: unit.price,
      per: unit.per,
      currency: "USD" as const,
      unit: rateUnit,
    }
    const previous = rates[meter]
    if (previous) {
      const previousPhase = phases.get(meter)
      if (
        meter !== PRICING_METERS.OUTPUT ||
        typeof previousPhase !== "string" ||
        !previousPhase.trim() ||
        typeof unit.phase !== "string" ||
        !unit.phase.trim() ||
        previousPhase === unit.phase ||
        previous.amount * rate.per !== rate.amount * previous.per
      )
        return {
          ...fallback,
          rates: Object.fromEntries(
            Object.entries(rates).filter(([key]) => key !== meter),
          ),
          notes: [{ kind: noteKinds.AMBIGUOUS_CHARGES }],
        }
    } else {
      rates[meter] = rate
      phases.set(meter, unit.phase)
    }
  }
  if (!Object.keys(rates).length) return fallback
  const tokenPrice = (meter: PriceMeter) =>
    (rates[meter]!.amount / rates[meter]!.per) * TOKENS_PER_MILLION
  const tokenPrices = {
    ...(rates.input ? { input: tokenPrice(PRICING_METERS.INPUT) } : {}),
    ...(rates.output ? { output: tokenPrice(PRICING_METERS.OUTPUT) } : {}),
    ...(rates.cacheRead
      ? { cache_read: tokenPrice(PRICING_METERS.CACHE_READ) }
      : {}),
    ...(rates.cacheWrite
      ? { cache_write: tokenPrice(PRICING_METERS.CACHE_WRITE) }
      : {}),
  }
  const comparisonMeter = rates.image
    ? PRICING_METERS.IMAGE
    : rates.videoSeconds
      ? PRICING_METERS.VIDEO_SECONDS
      : rates.audio
        ? PRICING_METERS.AUDIO
        : rates.pages
          ? PRICING_METERS.PAGES
          : rates.outputMegapixels
            ? PRICING_METERS.OUTPUT_MEGAPIXELS
            : undefined
  return {
    rates,
    usageMode: comparisonMeter
      ? PRICING_USAGE_MODES.METERED
      : rates.videoOutput
        ? PRICING_USAGE_MODES.VIDEO
        : rates.request && Object.keys(rates).length === 1
          ? PRICING_USAGE_MODES.REQUEST
          : PRICING_USAGE_MODES.TOKENS,
    ...(comparisonMeter ? { comparison: { meter: comparisonMeter } } : {}),
    ...(Object.keys(tokenPrices).length ? { tokenPrices } : {}),
    sourceUrl: AIMLAPI_CATALOG_PRICING_URL,
    ...(providerEstimate || unpriced.length
      ? {
          estimated: true,
          ...(unpriced.length ? { hasUnpricedCharges: true } : {}),
          issues: [
            {
              code: PRICING_ISSUE_CODES.UNKNOWN_FEES,
              ...(unpriced.length
                ? { reason: PRICING_ISSUE_REASONS.TASK_USAGE }
                : {}),
            },
          ],
          notes: unpriced.length
            ? [{ kind: noteKinds.EXCLUDED_CHARGES, charges: unpriced }]
            : [{ kind: noteKinds.PROVIDER_REPORTED_ESTIMATE }],
        }
      : {}),
  }
}
