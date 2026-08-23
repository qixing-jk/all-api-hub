import { z } from "zod"

import type { AccountSiteType } from "~/constants/siteType"
import {
  MODEL_CATALOG_FAILURE_CATEGORIES,
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelListSourceActionPolicy,
  type ModelListSourceInfo,
  type ModelPriceMetadata,
  type PricingResponse,
  type ProductCanonicalModel,
} from "~/services/modelList/pricingModel"
import { isIsoCalendarDate } from "~/services/models/isoCalendarDate"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import {
  isModelDisplayTranslationKey,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_DISPLAY_PRICE_UNITS,
} from "~/services/models/modelDisplayFacts"

/** A provider response must carry every action decision used by the UI. */
export type CompleteModelListSourceActionPolicy =
  Required<ModelListSourceActionPolicy>

export type ProviderModelCatalogSourceInfo = Omit<
  ModelListSourceInfo,
  | "kind"
  | "provider"
  | "supportsRuntimeModelList"
  | "supportsPricing"
  | "actionPolicy"
> & {
  kind: typeof MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG
  provider: AccountSiteType
  supportsRuntimeModelList: false
  supportsPricing: boolean
  actionPolicy: CompleteModelListSourceActionPolicy
}

export type ProviderModelCatalogModel = ProductCanonicalModel & {
  price_metadata: ModelPriceMetadata
}

export type ProviderModelCatalogPricingResponse = Omit<
  PricingResponse,
  "data" | "success" | "model_list_source"
> & {
  data: ProviderModelCatalogModel[]
  success: true
  model_list_source: ProviderModelCatalogSourceInfo
}

const trimmedNonBlankStringSchema = z
  .string()
  .min(1)
  .refine((value) => {
    return value.trim() === value
  })

const finiteNonnegativeNumberSchema = z.number().finite().nonnegative()

const safeExternalUrlSchema = z.url().refine((value) => {
  return new URL(value).protocol === "https:"
})

const utcClockSchema = z
  .number()
  .int()
  .nonnegative()
  .max(2359)
  .refine((value) => value % 100 < 60)

const isoCalendarDateSchema = z.string().refine(isIsoCalendarDate)

const modelDisplayLabelSchema = z.strictObject({
  translationKey: trimmedNonBlankStringSchema
    .refine(isModelDisplayTranslationKey)
    .optional(),
  fallback: trimmedNonBlankStringSchema,
})

const stringListSchema = z
  .array(trimmedNonBlankStringSchema)
  .refine((values) => new Set(values).size === values.length)

const modelDisplayPriceUnitSchema = z.enum(MODEL_DISPLAY_PRICE_UNITS)

const modelDisplayPriceSchema = z.strictObject({
  label: modelDisplayLabelSchema,
  amount: finiteNonnegativeNumberSchema,
  currency: z.literal("USD"),
  unit: modelDisplayPriceUnitSchema,
})

const modelDisplayPriceConditionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("minimum-prompt-tokens"),
    value: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("utc-window"),
    start: utcClockSchema,
    end: utcClockSchema,
  }),
])

const modelDisplayFactSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.Text),
    label: modelDisplayLabelSchema,
    value: trimmedNonBlankStringSchema,
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.TokenQuantity),
    label: modelDisplayLabelSchema,
    value: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.StringList),
    label: modelDisplayLabelSchema,
    values: stringListSchema.min(1),
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.Boolean),
    label: modelDisplayLabelSchema,
    value: z.boolean(),
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.Number),
    label: modelDisplayLabelSchema,
    value: z.number().finite(),
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.Date),
    label: modelDisplayLabelSchema,
    value: isoCalendarDateSchema,
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.Link),
    label: modelDisplayLabelSchema,
    href: safeExternalUrlSchema,
    text: modelDisplayLabelSchema,
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.CurrencyPrice),
    ...modelDisplayPriceSchema.shape,
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.PriceOverrides),
    label: modelDisplayLabelSchema,
    overrides: z
      .array(
        z.strictObject({
          conditions: z.array(modelDisplayPriceConditionSchema).min(1),
          prices: z.array(modelDisplayPriceSchema).min(1),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    type: z.literal(MODEL_DISPLAY_FACT_TYPES.BenchmarkList),
    label: modelDisplayLabelSchema,
    entries: z
      .array(
        z.strictObject({
          arena: trimmedNonBlankStringSchema,
          category: trimmedNonBlankStringSchema,
          score: finiteNonnegativeNumberSchema,
          rank: z.number().int().positive(),
          winRatePercent: finiteNonnegativeNumberSchema.max(100),
        }),
      )
      .min(1),
  }),
])

const modelPresentationSchema = z
  .strictObject({
    summaryFacts: z.array(modelDisplayFactSchema).min(1).optional(),
    sections: z
      .array(
        z.strictObject({
          id: trimmedNonBlankStringSchema,
          label: modelDisplayLabelSchema,
          facts: z.array(modelDisplayFactSchema).min(1),
        }),
      )
      .min(1)
      .optional(),
  })
  .refine((presentation) =>
    Boolean(presentation.summaryFacts || presentation.sections),
  )

const vendorEvidenceSchema = z.strictObject({
  kind: z.union([
    z.literal(MODEL_VENDOR_EVIDENCE_KINDS.Publisher),
    z.literal(MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory),
    z.literal(MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider),
  ]),
  name: trimmedNonBlankStringSchema,
  externalId: trimmedNonBlankStringSchema.optional(),
})

const tokenPriceSchema = z
  .strictObject({
    input: finiteNonnegativeNumberSchema.optional(),
    output: finiteNonnegativeNumberSchema.optional(),
    cache_read: finiteNonnegativeNumberSchema.optional(),
    cache_write: finiteNonnegativeNumberSchema.optional(),
  })
  .refine((price) => Object.values(price).some((value) => value !== undefined))

const perCallPriceSchema = z.strictObject({
  input: finiteNonnegativeNumberSchema,
  output: finiteNonnegativeNumberSchema,
})

const priceMetadataSchema = z
  .strictObject({
    source: z.literal(MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG),
    precision: z.union([
      z.literal(MODEL_PRICE_PRECISION_KINDS.EXACT),
      z.literal(MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE),
    ]),
    unavailable_reason: z
      .union([
        z.literal(MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY),
        z.literal(MODEL_UNAVAILABLE_PRICE_REASONS.NO_USABLE_GROUP),
        z.literal(MODEL_UNAVAILABLE_PRICE_REASONS.GROUP_RATIO_UNAVAILABLE),
        z.literal(MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN),
        z.literal(MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING),
        z.literal(MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_INVALID),
        z.literal(MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE),
      ])
      .optional(),
    source_date: trimmedNonBlankStringSchema.optional(),
    unmatched_model_count: z.number().int().nonnegative().optional(),
  })
  .superRefine((metadata, context) => {
    if (
      metadata.precision === MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE &&
      metadata.unavailable_reason === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Unavailable provider prices must include a reason",
      })
    }
    if (
      metadata.precision === MODEL_PRICE_PRECISION_KINDS.EXACT &&
      metadata.unavailable_reason !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Exact provider prices cannot include an unavailable reason",
      })
    }
  })

const productCanonicalModelSchema = z
  .strictObject({
    model_name: trimmedNonBlankStringSchema,
    display_name: trimmedNonBlankStringSchema.optional(),
    vendorEvidence: vendorEvidenceSchema.optional(),
    model_description: trimmedNonBlankStringSchema.optional(),
    presentation: modelPresentationSchema.optional(),
    quota_type: z.union([z.literal(0), z.literal(1)]),
    model_ratio: finiteNonnegativeNumberSchema,
    model_price: z.union([finiteNonnegativeNumberSchema, perCallPriceSchema]),
    token_price_usd_per_million: tokenPriceSchema.optional(),
    price_metadata: priceMetadataSchema,
    owner_by: trimmedNonBlankStringSchema.optional(),
    completion_ratio: finiteNonnegativeNumberSchema,
    enable_groups: stringListSchema,
    supported_endpoint_types: stringListSchema,
  })
  .superRefine((model, context) => {
    if (model.price_metadata.precision !== MODEL_PRICE_PRECISION_KINDS.EXACT) {
      return
    }

    const prices = model.token_price_usd_per_million
    if (prices?.input === undefined || prices.output === undefined) {
      context.addIssue({
        code: "custom",
        path: ["token_price_usd_per_million"],
        message: "Exact provider prices require input and output token prices",
      })
    }
  })

const actionPolicySchema = z.strictObject({
  supportsGroupFiltering: z.boolean(),
  supportsAccountSummary: z.boolean(),
  supportsTokenCompatibility: z.boolean(),
  supportsCredentialVerification: z.boolean(),
  supportsBatchCredentialVerification: z.boolean(),
  supportsCliVerification: z.boolean(),
})

const providerModelCatalogSourceSchema = z.strictObject({
  kind: z.literal(MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG),
  provider: trimmedNonBlankStringSchema,
  catalogScope: z.enum(MODEL_CATALOG_SCOPES).optional(),
  catalogFallback: z
    .strictObject({
      from: z.enum(MODEL_CATALOG_SCOPES),
      failureCategory: z.enum(MODEL_CATALOG_FAILURE_CATEGORIES),
    })
    .optional(),
  supportsRuntimeModelList: z.literal(false),
  supportsPricing: z.boolean(),
  actionPolicy: actionPolicySchema,
})

const providerModelCatalogPricingResponseSchema = z.strictObject({
  data: z.array(productCanonicalModelSchema),
  group_ratio: z.record(z.string(), finiteNonnegativeNumberSchema),
  success: z.literal(true),
  usable_group: z.record(z.string(), z.unknown()),
  model_list_source: providerModelCatalogSourceSchema,
})

/**
 * Admits only the complete product-owned provider response contract.
 *
 * This boundary is intentionally stricter than the historical PricingResponse
 * type: provider rows must carry explicit price metadata, valid presentation
 * facts when present, and every source action decision before cache or React
 * state can consume them.
 */
export function isValidProviderModelCatalogPricing(
  value: unknown,
  expectedProvider: AccountSiteType,
): value is ProviderModelCatalogPricingResponse {
  const parsed = providerModelCatalogPricingResponseSchema.safeParse(value)
  return (
    parsed.success &&
    parsed.data.model_list_source.provider === expectedProvider
  )
}
