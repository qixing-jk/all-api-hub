import type { ZodType } from "zod"

import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import {
  aliasTargetSchema,
  architectureSchema,
  artificialAnalysisSchema,
  benchmarksSchema,
  booleanSchema,
  defaultParametersSchema,
  designArenaEntrySchema,
  finiteNumberSchema,
  isoDateSchema,
  linksSchema,
  nonBlankStringSchema,
  OPENROUTER_FACT_LABELS,
  OPENROUTER_SECTION_LABELS,
  perRequestLimitsSchema,
  pricingSchema,
  reasoningSchema,
  tokenQuantitySchema,
  topProviderSchema,
  unknownArraySchema,
  unknownRecordSchema,
} from "~/services/apiAdapters/openrouter/modelPresentationContract"
import type { OpenRouterPublicModel } from "~/services/apiService/openrouter/publicModelCatalogSchemas"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import {
  MODEL_DISPLAY_FACT_LABELS,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_DISPLAY_PRICE_UNITS,
  type ModelDisplayFact,
  type ModelDisplayLabel,
  type ModelDisplayPrice,
  type ModelDisplayPriceCondition,
  type ModelDisplayPriceUnit,
  type ModelDisplaySection,
  type ModelPresentation,
} from "~/services/models/modelDisplayFacts"

/** Parses one optional provider field without coupling sibling validity. */
function parseOptional<T>(schema: ZodType<T>, value: unknown): T | undefined {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** Normalizes a nonblank provider string. */
function normalizeString(value: unknown): string | undefined {
  return parseOptional(nonBlankStringSchema, value)
}

/** Normalizes a nonnegative integral token quantity. */
function normalizeTokenQuantity(value: unknown): number | undefined {
  return parseOptional(tokenQuantitySchema, value)
}

/** Normalizes a finite numeric value while retaining zero. */
function normalizeFiniteNumber(value: unknown): number | undefined {
  return parseOptional(finiteNumberSchema, value)
}

/** Normalizes a strict provider boolean. */
function normalizeBoolean(value: unknown): boolean | undefined {
  return parseOptional(booleanSchema, value)
}

/** Normalizes a provider list into unique nonblank strings. */
function normalizeStringList(value: unknown): string[] | undefined {
  const values = parseOptional(unknownArraySchema, value)
  if (!values) return undefined

  const normalized = Array.from(
    new Set(
      values.map(normalizeString).filter((item): item is string => !!item),
    ),
  )
  return normalized.length > 0 ? normalized : undefined
}

/** Normalizes a calendar date without accepting rollovers. */
function normalizeDate(value: unknown): string | undefined {
  return parseOptional(isoDateSchema, value)
}

/** Converts a Unix timestamp into a UTC calendar date. */
function normalizeCreatedDate(value: unknown): string | undefined {
  const timestamp = normalizeTokenQuantity(value)
  if (timestamp === undefined) return undefined

  const date = new Date(timestamp * 1000)
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10)
}

/** Converts an official USD-per-token string to USD per million tokens. */
function normalizeUsdPerMillionTokens(value: unknown): number | undefined {
  const raw = normalizeString(value)
  if (!raw) return undefined

  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0) return undefined

  const perMillion = amount * 1_000_000
  return Number.isFinite(perMillion) ? perMillion : undefined
}

/** Keeps a nonnegative direct USD price such as per request or per image. */
function normalizeDirectUsd(value: unknown): number | undefined {
  const raw = normalizeString(value)
  if (!raw) return undefined

  const amount = Number(raw)
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined
}

type PrimaryPriceStatus = "missing" | "invalid" | "valid"

/** Distinguishes absent primary pricing from malformed and valid values. */
function classifyPrimaryPrice(value: unknown): PrimaryPriceStatus {
  if (value === undefined || value === null) return "missing"
  return normalizeUsdPerMillionTokens(value) === undefined ? "invalid" : "valid"
}

interface OpenRouterCanonicalPricing {
  inputPrice?: number
  outputPrice?: number
  cacheReadPrice?: number
  cacheWritePrice?: number
  hasInvalidPrimaryPrice: boolean
}

interface PriceFieldDefinition {
  key: string
  label: ModelDisplayLabel
  unit: ModelDisplayPriceUnit
  normalize: (value: unknown) => number | undefined
  includeInOverrides?: true
}

const BASE_PRICE_FIELDS: PriceFieldDefinition[] = [
  {
    key: "input_cache_write_1h",
    label: OPENROUTER_FACT_LABELS.cacheWriteOneHourPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionCacheWriteOneHourTokens,
    normalize: normalizeUsdPerMillionTokens,
    includeInOverrides: true,
  },
  {
    key: "internal_reasoning",
    label: OPENROUTER_FACT_LABELS.reasoningPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionReasoningTokens,
    normalize: normalizeUsdPerMillionTokens,
  },
  {
    key: "request",
    label: OPENROUTER_FACT_LABELS.requestPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.Request,
    normalize: normalizeDirectUsd,
  },
  {
    key: "image",
    label: OPENROUTER_FACT_LABELS.imageInputPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.InputImage,
    normalize: normalizeDirectUsd,
  },
  {
    key: "image_output",
    label: OPENROUTER_FACT_LABELS.imageOutputPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.OutputImage,
    normalize: normalizeDirectUsd,
  },
  {
    key: "image_token",
    label: OPENROUTER_FACT_LABELS.imageTokenPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionImageTokens,
    normalize: normalizeUsdPerMillionTokens,
  },
  {
    key: "audio",
    label: OPENROUTER_FACT_LABELS.audioInputPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionAudioInputTokens,
    normalize: normalizeUsdPerMillionTokens,
    includeInOverrides: true,
  },
  {
    key: "audio_output",
    label: OPENROUTER_FACT_LABELS.audioOutputPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionAudioOutputTokens,
    normalize: normalizeUsdPerMillionTokens,
  },
  {
    key: "input_audio_cache",
    label: OPENROUTER_FACT_LABELS.cachedAudioInputPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionCachedAudioInputTokens,
    normalize: normalizeUsdPerMillionTokens,
    includeInOverrides: true,
  },
  {
    key: "web_search",
    label: OPENROUTER_FACT_LABELS.webSearchPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.WebSearch,
    normalize: normalizeDirectUsd,
  },
]

const OVERRIDE_PRIMARY_PRICE_FIELDS: PriceFieldDefinition[] = [
  {
    key: "prompt",
    label: OPENROUTER_FACT_LABELS.inputPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionInputTokens,
    normalize: normalizeUsdPerMillionTokens,
    includeInOverrides: true,
  },
  {
    key: "completion",
    label: OPENROUTER_FACT_LABELS.outputPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionOutputTokens,
    normalize: normalizeUsdPerMillionTokens,
    includeInOverrides: true,
  },
  {
    key: "input_cache_read",
    label: OPENROUTER_FACT_LABELS.cacheReadPrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionCachedInputTokens,
    normalize: normalizeUsdPerMillionTokens,
    includeInOverrides: true,
  },
  {
    key: "input_cache_write",
    label: OPENROUTER_FACT_LABELS.cacheWritePrice,
    unit: MODEL_DISPLAY_PRICE_UNITS.MillionCacheWriteTokens,
    normalize: normalizeUsdPerMillionTokens,
    includeInOverrides: true,
  },
]

const OVERRIDE_PRICE_FIELDS = [
  ...OVERRIDE_PRIMARY_PRICE_FIELDS,
  ...BASE_PRICE_FIELDS,
].filter((field) => field.includeInOverrides)

/** Maps one documented price field into an explicit currency and meter. */
function createPrice(
  record: Record<string, unknown>,
  definition: PriceFieldDefinition,
): ModelDisplayPrice | undefined {
  const amount = definition.normalize(record[definition.key])
  return amount === undefined
    ? undefined
    : {
        label: definition.label,
        amount,
        currency: "USD",
        unit: definition.unit,
      }
}

/** Checks OpenRouter's base-100 HHMM integer for a UTC pricing window. */
function isValidUtcClock(value: number): boolean {
  const hours = Math.floor(value / 100)
  const minutes = value % 100
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

/** Normalizes a complete conditional-pricing predicate set. */
function normalizeOverrideConditions(
  record: Record<string, unknown>,
): ModelDisplayPriceCondition[] | undefined {
  const conditions: ModelDisplayPriceCondition[] = []

  if (record.min_prompt_tokens !== undefined) {
    const value = normalizeTokenQuantity(record.min_prompt_tokens)
    if (value === undefined) return undefined
    conditions.push({ type: "minimum-prompt-tokens", value })
  }

  const hasUtcStart = record.utc_start !== undefined
  const hasUtcEnd = record.utc_end !== undefined
  if (hasUtcStart || hasUtcEnd) {
    const start = normalizeTokenQuantity(record.utc_start)
    const end = normalizeTokenQuantity(record.utc_end)
    if (
      start === undefined ||
      end === undefined ||
      !isValidUtcClock(start) ||
      !isValidUtcClock(end)
    ) {
      return undefined
    }
    conditions.push({ type: "utc-window", start, end })
  }

  return conditions.length > 0 ? conditions : undefined
}

/** Normalizes independently valid conditional price entries. */
function normalizePriceOverrides(value: unknown) {
  const rawOverrides = parseOptional(unknownArraySchema, value)
  if (!rawOverrides) return undefined

  const overrides = rawOverrides.flatMap((rawOverride) => {
    const record = parseOptional(unknownRecordSchema, rawOverride)
    if (!record) return []

    const conditions = normalizeOverrideConditions(record)
    if (!conditions) return []

    const prices = OVERRIDE_PRICE_FIELDS.map((definition) =>
      createPrice(record, definition),
    ).filter((price): price is ModelDisplayPrice => !!price)

    return prices.length > 0 ? [{ conditions, prices }] : []
  })

  return overrides.length > 0 ? overrides : undefined
}

/** Normalizes native detail prices and canonical comparable token prices. */
function normalizePricing(value: unknown): {
  canonical: OpenRouterCanonicalPricing
  facts: ModelDisplayFact[]
} {
  const parsed = pricingSchema.safeParse(value)
  if (!parsed.success) {
    return {
      canonical: {
        hasInvalidPrimaryPrice: value !== undefined && value !== null,
      },
      facts: [],
    }
  }

  const pricing = parsed.data as Record<string, unknown>
  const inputPrice = normalizeUsdPerMillionTokens(pricing.prompt)
  const outputPrice = normalizeUsdPerMillionTokens(pricing.completion)
  const primaryStatuses = [
    classifyPrimaryPrice(pricing.prompt),
    classifyPrimaryPrice(pricing.completion),
  ]
  const facts = BASE_PRICE_FIELDS.flatMap((definition): ModelDisplayFact[] => {
    const price = createPrice(pricing, definition)
    return price
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.CurrencyPrice,
            ...price,
          },
        ]
      : []
  })
  const overrides = normalizePriceOverrides(pricing.overrides)
  if (overrides) {
    facts.push({
      type: MODEL_DISPLAY_FACT_TYPES.PriceOverrides,
      label: OPENROUTER_FACT_LABELS.conditionalPrices,
      overrides,
    })
  }

  const cacheReadPrice = normalizeUsdPerMillionTokens(pricing.input_cache_read)
  const cacheWritePrice = normalizeUsdPerMillionTokens(
    pricing.input_cache_write,
  )

  return {
    canonical: {
      ...(inputPrice !== undefined ? { inputPrice } : {}),
      ...(outputPrice !== undefined ? { outputPrice } : {}),
      ...(cacheReadPrice !== undefined ? { cacheReadPrice } : {}),
      ...(cacheWritePrice !== undefined ? { cacheWritePrice } : {}),
      hasInvalidPrimaryPrice: primaryStatuses.includes("invalid"),
    },
    facts,
  }
}

/** Creates a text fact when its provider value is usable. */
function textFact(
  factLabel: ModelDisplayLabel,
  value: unknown,
): ModelDisplayFact | undefined {
  const normalized = normalizeString(value)
  return normalized
    ? {
        type: MODEL_DISPLAY_FACT_TYPES.Text,
        label: factLabel,
        value: normalized,
      }
    : undefined
}

/** Creates a token-quantity fact while preserving zero. */
function tokenFact(
  factLabel: ModelDisplayLabel,
  value: unknown,
): ModelDisplayFact | undefined {
  const normalized = normalizeTokenQuantity(value)
  return normalized === undefined
    ? undefined
    : {
        type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
        label: factLabel,
        value: normalized,
      }
}

/** Creates a strict boolean fact while preserving false. */
function booleanFact(
  factLabel: ModelDisplayLabel,
  value: unknown,
): ModelDisplayFact | undefined {
  const normalized = normalizeBoolean(value)
  return normalized === undefined
    ? undefined
    : {
        type: MODEL_DISPLAY_FACT_TYPES.Boolean,
        label: factLabel,
        value: normalized,
      }
}

/** Creates a finite numeric fact while preserving zero. */
function numberFact(
  factLabel: ModelDisplayLabel,
  value: unknown,
): ModelDisplayFact | undefined {
  const normalized = normalizeFiniteNumber(value)
  return normalized === undefined
    ? undefined
    : {
        type: MODEL_DISPLAY_FACT_TYPES.Number,
        label: factLabel,
        value: normalized,
      }
}

/** Creates a validated calendar-date fact. */
function dateFact(
  factLabel: ModelDisplayLabel,
  value: unknown,
): ModelDisplayFact | undefined {
  const normalized = normalizeDate(value)
  return normalized
    ? {
        type: MODEL_DISPLAY_FACT_TYPES.Date,
        label: factLabel,
        value: normalized,
      }
    : undefined
}

/** Creates a nonempty structured string-list fact. */
function stringListFact(
  factLabel: ModelDisplayLabel,
  value: unknown,
): ModelDisplayFact | undefined {
  const values = normalizeStringList(value)
  return values
    ? { type: MODEL_DISPLAY_FACT_TYPES.StringList, label: factLabel, values }
    : undefined
}

/** Removes unavailable optional facts without disturbing order. */
function compactFacts(
  facts: Array<ModelDisplayFact | undefined>,
): ModelDisplayFact[] {
  return facts.filter((fact): fact is ModelDisplayFact => !!fact)
}

/** Creates a presentation section only when it contains usable facts. */
function createSection(
  id: string,
  sectionLabel: ModelDisplayLabel,
  facts: ModelDisplayFact[],
): ModelDisplaySection | undefined {
  return facts.length > 0 ? { id, label: sectionLabel, facts } : undefined
}

/** Splits architecture fields between bounded summary and detail facts. */
function normalizeArchitecture(value: unknown) {
  const architecture = parseOptional(architectureSchema, value)
  if (!architecture) return { summary: [], details: [] }

  return {
    summary: compactFacts([
      stringListFact(
        MODEL_DISPLAY_FACT_LABELS.InputModalities,
        architecture.input_modalities,
      ),
      stringListFact(
        MODEL_DISPLAY_FACT_LABELS.OutputModalities,
        architecture.output_modalities,
      ),
    ]),
    details: compactFacts([
      textFact(OPENROUTER_FACT_LABELS.modality, architecture.modality),
      textFact(OPENROUTER_FACT_LABELS.tokenizer, architecture.tokenizer),
      textFact(OPENROUTER_FACT_LABELS.instructType, architecture.instruct_type),
    ]),
  }
}

/** Normalizes supported controls, reasoning behavior, and defaults. */
function normalizeCapabilities(
  model: OpenRouterPublicModel,
): ModelDisplayFact[] {
  const facts = compactFacts([
    stringListFact(
      OPENROUTER_FACT_LABELS.supportedParameters,
      model.supported_parameters,
    ),
    stringListFact(
      OPENROUTER_FACT_LABELS.supportedVoices,
      model.supported_voices,
    ),
  ])

  const reasoning = parseOptional(reasoningSchema, model.reasoning)
  if (reasoning) {
    facts.push(
      ...compactFacts([
        booleanFact(
          OPENROUTER_FACT_LABELS.reasoningMandatory,
          reasoning.mandatory,
        ),
        booleanFact(
          OPENROUTER_FACT_LABELS.reasoningDefaultEnabled,
          reasoning.default_enabled,
        ),
        textFact(
          OPENROUTER_FACT_LABELS.reasoningDefaultEffort,
          reasoning.default_effort,
        ),
        stringListFact(
          OPENROUTER_FACT_LABELS.reasoningSupportedEfforts,
          reasoning.supported_efforts,
        ),
        booleanFact(
          OPENROUTER_FACT_LABELS.reasoningSupportsMaxTokens,
          reasoning.supports_max_tokens,
        ),
      ]),
    )
  }

  const defaults = parseOptional(
    defaultParametersSchema,
    model.default_parameters,
  )
  if (defaults) {
    facts.push(
      ...compactFacts([
        numberFact(
          OPENROUTER_FACT_LABELS.defaultTemperature,
          defaults.temperature,
        ),
        numberFact(OPENROUTER_FACT_LABELS.defaultTopP, defaults.top_p),
        numberFact(OPENROUTER_FACT_LABELS.defaultTopK, defaults.top_k),
        numberFact(
          OPENROUTER_FACT_LABELS.defaultFrequencyPenalty,
          defaults.frequency_penalty,
        ),
        numberFact(
          OPENROUTER_FACT_LABELS.defaultPresencePenalty,
          defaults.presence_penalty,
        ),
        numberFact(
          OPENROUTER_FACT_LABELS.defaultRepetitionPenalty,
          defaults.repetition_penalty,
        ),
      ]),
    )
  }

  return facts
}

/** Normalizes independently valid per-request limits. */
function normalizeRequestLimits(value: unknown): ModelDisplayFact[] {
  const limits = parseOptional(perRequestLimitsSchema, value)
  return limits
    ? compactFacts([
        tokenFact(
          OPENROUTER_FACT_LABELS.promptTokenLimit,
          limits.prompt_tokens,
        ),
        tokenFact(
          OPENROUTER_FACT_LABELS.completionTokenLimit,
          limits.completion_tokens,
        ),
      ])
    : []
}

/** Normalizes routing-provider facts separately from publisher identity. */
function normalizeRouting(value: unknown): ModelDisplayFact[] {
  const routing = parseOptional(topProviderSchema, value)
  return routing
    ? compactFacts([
        tokenFact(
          OPENROUTER_FACT_LABELS.routingContextLimit,
          routing.context_length,
        ),
        tokenFact(
          MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
          routing.max_completion_tokens,
        ),
        booleanFact(OPENROUTER_FACT_LABELS.moderation, routing.is_moderated),
      ])
    : []
}

/** Normalizes documented lifecycle and alias metadata. */
function normalizeLifecycle(model: OpenRouterPublicModel): ModelDisplayFact[] {
  const alias = parseOptional(aliasTargetSchema, model.alias_target)
  const created = normalizeCreatedDate(model.created)

  return compactFacts([
    textFact(OPENROUTER_FACT_LABELS.canonicalSlug, model.canonical_slug),
    textFact(OPENROUTER_FACT_LABELS.huggingFaceId, model.hugging_face_id),
    created
      ? {
          type: MODEL_DISPLAY_FACT_TYPES.Date,
          label: OPENROUTER_FACT_LABELS.created,
          value: created,
        }
      : undefined,
    dateFact(OPENROUTER_FACT_LABELS.knowledgeCutoff, model.knowledge_cutoff),
    dateFact(OPENROUTER_FACT_LABELS.expirationDate, model.expiration_date),
    textFact(OPENROUTER_FACT_LABELS.aliasName, alias?.name),
    textFact(OPENROUTER_FACT_LABELS.aliasSlug, alias?.slug),
  ])
}

/** Normalizes independent index metrics and complete arena rows. */
function normalizeBenchmarks(value: unknown): ModelDisplayFact[] {
  const benchmarks = parseOptional(benchmarksSchema, value)
  if (!benchmarks) return []

  const facts: ModelDisplayFact[] = []
  const artificialAnalysis = parseOptional(
    artificialAnalysisSchema,
    benchmarks.artificial_analysis,
  )
  if (artificialAnalysis) {
    facts.push(
      ...compactFacts([
        numberFact(
          OPENROUTER_FACT_LABELS.intelligenceIndex,
          artificialAnalysis.intelligence_index,
        ),
        numberFact(
          OPENROUTER_FACT_LABELS.codingIndex,
          artificialAnalysis.coding_index,
        ),
        numberFact(
          OPENROUTER_FACT_LABELS.agenticIndex,
          artificialAnalysis.agentic_index,
        ),
      ]).filter(
        (fact) =>
          fact.type !== MODEL_DISPLAY_FACT_TYPES.Number || fact.value >= 0,
      ),
    )
  }

  const designArena = parseOptional(unknownArraySchema, benchmarks.design_arena)
  const entries = (designArena ?? []).flatMap((rawEntry) => {
    const entry = parseOptional(designArenaEntrySchema, rawEntry)
    if (!entry) return []

    const arena = normalizeString(entry.arena)
    const category = normalizeString(entry.category)
    const score = normalizeFiniteNumber(entry.elo)
    const rank = normalizeTokenQuantity(entry.rank)
    const winRatePercent = normalizeFiniteNumber(entry.win_rate)
    if (
      !arena ||
      !category ||
      score === undefined ||
      score < 0 ||
      rank === undefined ||
      rank < 1 ||
      winRatePercent === undefined ||
      winRatePercent < 0 ||
      winRatePercent > 100
    ) {
      return []
    }

    return [{ arena, category, score, rank, winRatePercent }]
  })
  if (entries.length > 0) {
    facts.push({
      type: MODEL_DISPLAY_FACT_TYPES.BenchmarkList,
      label: OPENROUTER_FACT_LABELS.designArena,
      entries,
    })
  }

  return facts
}

/** Accepts only provider-owned endpoint detail links without credentials. */
function normalizeTrustedDetailsLink(value: unknown): string | undefined {
  const raw = normalizeString(value)
  if (!raw) return undefined

  try {
    const baseUrl = new URL(OPENROUTER_API_BASE_URL)
    const url = new URL(raw, `${baseUrl.origin}/`)
    const isTrustedPath =
      url.pathname.startsWith("/api/v1/models/") &&
      url.pathname.endsWith("/endpoints")

    return url.origin === baseUrl.origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      isTrustedPath
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

/** Normalizes the documented trusted provider-details link. */
function normalizeLinks(value: unknown): ModelDisplayFact[] {
  const links = parseOptional(linksSchema, value)
  const href = normalizeTrustedDetailsLink(links?.details)
  return href
    ? [
        {
          type: MODEL_DISPLAY_FACT_TYPES.Link,
          label: OPENROUTER_FACT_LABELS.providerDetails,
          href,
          text: OPENROUTER_FACT_LABELS.openProviderDetails,
        },
      ]
    : []
}

/** Derives publisher evidence from the canonical provider model slug. */
function derivePublisherEvidence(model: OpenRouterPublicModel) {
  const canonicalSlug = normalizeString(model.canonical_slug)
  const sourceId = canonicalSlug ?? model.id
  const separatorIndex = sourceId.indexOf("/")
  if (separatorIndex <= 0 || separatorIndex === sourceId.length - 1) {
    return undefined
  }

  const publisher = sourceId.slice(0, separatorIndex)
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(publisher)) {
    return undefined
  }

  return {
    kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
    name: publisher,
    externalId: publisher,
  } as const
}

interface NormalizedOpenRouterModel {
  displayName?: string
  description?: string
  vendorEvidence?: ReturnType<typeof derivePublisherEvidence>
  pricing: OpenRouterCanonicalPricing
  presentation?: ModelPresentation
}

/**
 * Normalizes the documented OpenRouter model contract into product-owned facts.
 * Optional siblings fail independently; unknown additive fields are ignored.
 */
export function normalizeOpenRouterModel(
  model: OpenRouterPublicModel,
): NormalizedOpenRouterModel {
  const contextLimit = tokenFact(
    MODEL_DISPLAY_FACT_LABELS.ContextLimit,
    model.context_length,
  )
  const architecture = normalizeArchitecture(model.architecture)
  const pricing = normalizePricing(model.pricing)
  const summaryFacts = compactFacts([contextLimit, ...architecture.summary])
  const sections = [
    createSection("pricing", OPENROUTER_SECTION_LABELS.pricing, pricing.facts),
    createSection(
      "architecture",
      OPENROUTER_SECTION_LABELS.architecture,
      architecture.details,
    ),
    createSection(
      "capabilities",
      OPENROUTER_SECTION_LABELS.capabilities,
      normalizeCapabilities(model),
    ),
    createSection(
      "request-limits",
      OPENROUTER_SECTION_LABELS.requestLimits,
      normalizeRequestLimits(model.per_request_limits),
    ),
    createSection(
      "routing",
      OPENROUTER_SECTION_LABELS.routing,
      normalizeRouting(model.top_provider),
    ),
    createSection(
      "lifecycle",
      OPENROUTER_SECTION_LABELS.lifecycle,
      normalizeLifecycle(model),
    ),
    createSection(
      "benchmarks",
      OPENROUTER_SECTION_LABELS.benchmarks,
      normalizeBenchmarks(model.benchmarks),
    ),
    createSection(
      "links",
      OPENROUTER_SECTION_LABELS.links,
      normalizeLinks(model.links),
    ),
  ].filter((section): section is ModelDisplaySection => !!section)

  const displayName = normalizeString(model.name)
  const description = normalizeString(model.description)
  const vendorEvidence = derivePublisherEvidence(model)

  return {
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(vendorEvidence ? { vendorEvidence } : {}),
    pricing: pricing.canonical,
    ...(summaryFacts.length > 0 || sections.length > 0
      ? {
          presentation: {
            ...(summaryFacts.length > 0 ? { summaryFacts } : {}),
            ...(sections.length > 0 ? { sections } : {}),
          },
        }
      : {}),
  }
}
