import type { NanoGptCatalogModel } from "~/services/apiService/nanogpt/catalog"
import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import type { ProviderModelCatalogModel } from "~/services/modelList/providerCatalogAdmission"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_METERS,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_VIDEO_INPUTS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import {
  MODEL_DISPLAY_FACT_LABELS,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_DISPLAY_SECTION_LABELS,
} from "~/services/models/modelDisplayFacts"
import type {
  ModelDisplayFact,
  ModelDisplayLabel,
  ModelPresentation,
} from "~/services/models/modelDisplayFacts"

/** Published list-price table the catalog mirrors; the API states no markup. */
const NANOGPT_PRICING_SOURCE_URL = "https://nano-gpt.com/pricing"

/** All NanoGPT token rates are quoted in USD per million tokens. */
const rate = (amount: number): PriceRate => ({
  amount,
  currency: "USD",
  unit: PRICE_RATE_UNITS.TOKEN,
  per: TOKENS_PER_MILLION,
})

/**
 * Builds the structured quote plan from the provider's list prices.
 *
 * `video_request` rates apply to every token of a request that carries video
 * (documented in the catalog row's own note), which the shared quote engine
 * expresses as a `videoInput` selection rule.
 */
function createPricingPlan(model: NanoGptCatalogModel): PricingPlan {
  const pricing = model.pricing
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: {
      kind: PRICING_SOURCE_KINDS.CATALOG,
      capturedAt: new Date().toISOString(),
      url: NANOGPT_PRICING_SOURCE_URL,
    },
    issues: [],
  }
  if (!pricing) return plan

  plan.rates = {
    [PRICING_METERS.INPUT]: rate(pricing.input),
    [PRICING_METERS.OUTPUT]: rate(pricing.output),
    ...(pricing.cacheRead === undefined
      ? {}
      : { [PRICING_METERS.CACHE_READ]: rate(pricing.cacheRead) }),
    ...(pricing.cacheWrite === undefined
      ? {}
      : { [PRICING_METERS.CACHE_WRITE]: rate(pricing.cacheWrite) }),
    ...(pricing.audioInput === undefined
      ? {}
      : { [PRICING_METERS.AUDIO_INPUT]: rate(pricing.audioInput) }),
  }

  const video = pricing.videoRequest
  if (video) {
    plan.rules.push({
      id: "video-request",
      conditions: [
        {
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.VIDEO_INPUT,
          value: PRICING_VIDEO_INPUTS.WITH_VIDEO,
        },
      ],
      rates: {
        [PRICING_METERS.INPUT]: rate(video.input),
        [PRICING_METERS.OUTPUT]: rate(video.output),
        ...(video.cacheRead === undefined
          ? {}
          : { [PRICING_METERS.CACHE_READ]: rate(video.cacheRead) }),
      },
    })
  }

  return plan
}

/** Token-quantity fact; zero is not a usable specification. */
const tokenFact = (
  label: ModelDisplayLabel,
  value?: number,
): ModelDisplayFact | undefined =>
  value === undefined || value <= 0
    ? undefined
    : {
        type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
        label,
        value,
      }

/** Modality list fact; an empty list says nothing. */
function modalityFact(
  label: ModelDisplayLabel,
  values?: string[],
): ModelDisplayFact | undefined {
  return !values || values.length === 0
    ? undefined
    : { type: MODEL_DISPLAY_FACT_TYPES.StringList, label, values }
}

/**
 * Projects the catalog row into provider-neutral presentation facts.
 * Only facts the catalog actually publishes are included.
 */
function createPresentation(
  model: NanoGptCatalogModel,
): ModelPresentation | undefined {
  const summaryFacts = [
    tokenFact(MODEL_DISPLAY_FACT_LABELS.ContextLimit, model.contextLength),
    tokenFact(
      MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
      model.maxOutputTokens,
    ),
  ].filter((fact): fact is ModelDisplayFact => !!fact)

  const specificationFacts = [
    modalityFact(
      MODEL_DISPLAY_FACT_LABELS.InputModalities,
      model.inputModalities,
    ),
    modalityFact(
      MODEL_DISPLAY_FACT_LABELS.OutputModalities,
      model.outputModalities,
    ),
  ].filter((fact): fact is ModelDisplayFact => !!fact)

  if (summaryFacts.length === 0 && specificationFacts.length === 0)
    return undefined

  return {
    ...(summaryFacts.length ? { summaryFacts } : {}),
    ...(specificationFacts.length
      ? {
          sections: [
            {
              id: "specifications",
              label: MODEL_DISPLAY_SECTION_LABELS.Specifications,
              facts: specificationFacts,
            },
          ],
        }
      : {}),
  }
}

/**
 * Maps one detailed catalog row into the product-owned canonical model shape.
 * Rows without numeric primary rates keep an explicit unavailable price instead
 * of a fabricated zero.
 */
export function createNanoGptCatalogModel(
  model: NanoGptCatalogModel,
): ProviderModelCatalogModel {
  const pricing = model.pricing
  const presentation = createPresentation(model)

  return {
    model_name: model.id,
    ...(model.displayName && model.displayName !== model.id
      ? { display_name: model.displayName }
      : {}),
    ...(model.description ? { model_description: model.description } : {}),
    ...(model.ownerBy
      ? {
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: model.ownerBy,
          },
        }
      : {}),
    ...(presentation ? { presentation } : {}),
    pricingPlan: createPricingPlan(model),
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    ...(pricing
      ? {
          token_price_usd_per_million: {
            input: pricing.input,
            output: pricing.output,
            ...(pricing.cacheRead === undefined
              ? {}
              : { cache_read: pricing.cacheRead }),
            ...(pricing.cacheWrite === undefined
              ? {}
              : { cache_write: pricing.cacheWrite }),
          },
        }
      : {}),
    price_metadata: pricing
      ? {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
        }
      : {
          source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
        },
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  }
}
