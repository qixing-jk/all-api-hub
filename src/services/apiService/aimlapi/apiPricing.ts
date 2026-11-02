import { readAimlApiCatalogPrice } from "~/services/apiService/aimlapi/catalogPrice"
import {
  AIMLAPI_CATALOG_PRICING_URL,
  AIMLAPI_MODEL_ENDPOINT_TYPES as endpointTypes,
} from "~/services/apiService/aimlapi/constants"
import type { AimlApiPublicModel } from "~/services/apiService/aimlapi/models"
import type { PublishedPrice } from "~/services/apiService/aimlapi/pricing"
import {
  PRICING_SOURCE_NOTE_KINDS as noteKinds,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"

export { AIMLAPI_CATALOG_PRICING_URL } from "~/services/apiService/aimlapi/constants"

/** Endpoint duplicates may add optional tools, but must agree on the charge contract. */
export function readAimlApiCatalogPrices(
  models: readonly AimlApiPublicModel[],
) {
  const result = new Map<string, PublishedPrice>()
  const rateKey = (rates: PricingPlan["rates"]) =>
    Object.entries(rates)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([meter, rate]) => [
        meter,
        rate.unit,
        rate.currency,
        rate.amount / rate.per,
      ])
  const contract = (price: PublishedPrice) =>
    JSON.stringify({
      rates: rateKey(price.rates),
      rules: (price.rules ?? [])
        .map((rule) => ({
          conditions: rule.conditions.map((c) => JSON.stringify(c)).sort(),
          rates: rateKey(rule.rates),
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      usageMode: price.usageMode,
      comparison: price.comparison,
      requiresRuleMatch: !!price.requiresRuleMatch,
      requiredUsage: [...(price.requiredUsage ?? [])].sort(),
      rulesUnavailable: !!price.rulesUnavailable,
    })
  const conflicts = new Set<string>()
  const records = models.map((model) => ({
    model,
    price: readAimlApiCatalogPrice(model),
  }))
  const byId = new Map<string, typeof records>()
  for (const record of records) {
    const group = byId.get(record.model.id) ?? []
    group.push(record)
    byId.set(record.model.id, group)
  }
  // Generation uses no reference inputs; editing adds a per-input-image charge.
  // Unify only this optional quantity, with every other endpoint fee identical.
  for (const group of byId.values()) {
    // The public model page publishes one token price. Responses may repeat
    // only its output fees. Accept a matching subset of the complete Chat
    // contract; never invent a union, overwrite a differing fee or drop limits.
    const chats = group.filter(({ model }) => model.type === endpointTypes.Chat)
    const responses = group.filter(
      ({ model }) => model.type === endpointTypes.Responses,
    )
    const complete = chats[0]?.price
    if (
      !complete ||
      !responses.length ||
      chats.length + responses.length !== group.length ||
      group.some(
        ({ price }) =>
          price.rulesUnavailable ||
          price.estimated ||
          price.hasUnpricedCharges ||
          price.issues?.length ||
          price.rules?.length ||
          price.requiresRuleMatch ||
          price.requiredUsage?.length ||
          price.usageMode !== PRICING_USAGE_MODES.TOKENS,
      ) ||
      !complete.rates.input ||
      !complete.rates.output ||
      chats.some(({ price }) => contract(price) !== contract(complete))
    )
      continue
    const compatible = responses.every(({ price }) =>
      Object.entries(price.rates).every(([meter, rate]) => {
        const expected = complete.rates[meter as PriceMeter]
        return (
          expected &&
          JSON.stringify(rateKey({ [meter]: rate })) ===
            JSON.stringify(rateKey({ [meter]: expected }))
        )
      }),
    )
    if (compatible) for (const record of group) record.price = complete
  }
  for (const group of byId.values()) {
    const editing = group.filter(
      ({ model }) => model.type === endpointTypes.ImageEditing,
    )
    const generating = group.filter(
      ({ model }) => model.type === endpointTypes.ImageGeneration,
    )
    const reference = editing[0]?.price.rates.referenceImage
    if (
      !reference ||
      !generating.length ||
      editing.length + generating.length !== group.length ||
      group.some(
        ({ price }) =>
          price.rulesUnavailable ||
          price.estimated ||
          price.hasUnpricedCharges ||
          price.issues?.length,
      ) ||
      editing.some(({ price }) => !price.rates.referenceImage) ||
      generating.some(({ price }) => price.rates.referenceImage)
    )
      continue
    const expected = contract(editing[0]!.price)
    const normalized = group.map(({ price }) => ({
      ...price,
      rates: {
        ...price.rates,
        referenceImage: price.rates.referenceImage ?? reference,
      },
    }))
    if (normalized.some((price) => contract(price) !== expected)) continue
    for (const [index, record] of group.entries())
      record.price = normalized[index]!
  }
  for (const { model, price: next } of records) {
    // These records describe asynchronous batch management, not interactive inference.
    if (
      (
        [
          endpointTypes.Batches,
          endpointTypes.BatchStatus,
          endpointTypes.BatchCancel,
          endpointTypes.AudioPreprocess,
        ] as readonly string[]
      ).includes(model.type)
    )
      continue
    if (conflicts.has(model.id)) continue
    const previous = result.get(model.id)
    if (!previous) result.set(model.id, next)
    else if (contract(previous) !== contract(next)) {
      conflicts.add(model.id)
      result.set(model.id, {
        rates: {},
        usageMode: PRICING_USAGE_MODES.CUSTOM,
        rulesUnavailable: true,
        sourceUrl: AIMLAPI_CATALOG_PRICING_URL,
        issues: [
          {
            code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
            reason: PRICING_ISSUE_REASONS.SOURCE_CONFLICT,
          },
        ],
        notes: [{ kind: noteKinds.ENDPOINT_SOURCE_CONFLICT }],
      })
    } else {
      result.set(model.id, {
        ...previous,
        ...(next.estimated ? { estimated: true } : {}),
        ...(next.hasUnpricedCharges ? { hasUnpricedCharges: true } : {}),
        issues: [
          ...new Map(
            [...(previous.issues ?? []), ...(next.issues ?? [])].map(
              (issue) => [JSON.stringify(issue), issue],
            ),
          ).values(),
        ],
        notes: [
          ...new Map(
            [...(previous.notes ?? []), ...(next.notes ?? [])].map((note) => [
              JSON.stringify(note),
              note,
            ]),
          ).values(),
        ],
      })
    }
  }
  return result
}
