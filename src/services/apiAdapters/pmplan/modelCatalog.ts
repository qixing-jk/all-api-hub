import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import {
  MODEL_PRICING_RUNTIME_KEY_FALLBACKS,
  type ModelPricingCapability,
} from "~/services/apiAdapters/contracts/modelPricing"
import { withPmplanSession } from "~/services/apiService/pmplan"
import { PMPLAN_MICRO_USD_PER_USD } from "~/services/apiService/pmplan/constants"
import {
  fetchPmplanModels,
  fetchPmplanModelSquare,
} from "~/services/apiService/pmplan/models"
import { MODEL_GROUP_ACCESS_EVIDENCE_KINDS } from "~/services/modelCatalog/snapshot"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
} from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_SOURCE_KINDS,
  PRICING_SOURCE_NOTE_KINDS,
  PRICING_USAGE_MODES,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import { normalizeModelDescriptors } from "~/services/models/modelDescriptor"
import {
  createModelDisplayLabel,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_PRESENTATION_SUMMARY_LAYOUTS,
} from "~/services/models/modelDisplayFacts"

const PLAN_LABELS: Readonly<Record<string, string>> = {
  lite: "Lite",
  essential: "Essential",
  standard: "Standard",
  go: "Go",
  plus: "Plus",
  pro: "Pro",
  max: "Max",
  ultra: "Ultra",
}

/** Native display names; preserve custom plan identities verbatim. */
function planLabel(plan: string) {
  return Object.hasOwn(PLAN_LABELS, plan) ? PLAN_LABELS[plan]! : plan
}

/** Eligibility is account-scoped; quotes are independent minima across enabled channels. */
export const pmplanModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: MODEL_PRICING_RUNTIME_KEY_FALLBACKS.ACCOUNT_PRICING,
  async fetchPricing(request) {
    const [square, eligibleModels] = await withPmplanSession(
      request,
      async (scoped) =>
        [
          await fetchPmplanModelSquare(scoped),
          await fetchPmplanModels(scoped),
        ] as const,
    )
    const eligibleByName = new Map(
      eligibleModels.map((model) => [model.name, model]),
    )
    const url = `${new URL(request.baseUrl).origin}/#/models`
    return {
      success: true,
      groupAccess: { kind: MODEL_GROUP_ACCESS_EVIDENCE_KINDS.NOT_APPLICABLE },
      groupRatios: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
        catalogScope: MODEL_CATALOG_SCOPES.PERSONALIZED,
        provider: SITE_TYPES.PMPLAN,
        supportsPricing: true,
        actionPolicy: { supportsGroupFiltering: false },
      },
      data: square.models.map((model) => {
        // /api/models evaluates access per channel, unlike model-square's
        // merged tier map; an unrestricted channel can make the model usable.
        const eligible = eligibleByName.get(model.name)
        const prices = eligible ?? model
        const multipleChannels = prices.channel_count !== 1
        return {
          model_name: model.name,
          presentation: {
            summaryLayout: MODEL_PRESENTATION_SUMMARY_LAYOUTS.Inline,
            summaryFacts: [
              {
                type: MODEL_DISPLAY_FACT_TYPES.StringList,
                label: createModelDisplayLabel(
                  "displayFacts.supportedPlans",
                  "Available plans",
                ),
                values: model.tiers.map(planLabel),
                ...(square.plan && model.tiers.includes(square.plan)
                  ? { currentValue: planLabel(square.plan) }
                  : {}),
              },
            ],
          },
          availability: { available: Boolean(eligible) },
          quota_type: 0,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: prices.input_micro
            ? prices.output_micro / prices.input_micro
            : 1,
          enable_groups: [],
          supported_endpoint_types: ["openai"],
          pricingPlan: {
            usageMode: PRICING_USAGE_MODES.TOKENS,
            // usage.rs::cost_micro establishes USD/1M. /api/models restricts
            // the independent channel minima to this plan; model-square does not.
            rates: {
              input: {
                amount: prices.input_micro / PMPLAN_MICRO_USD_PER_USD,
                currency: CURRENCIES.USD,
                unit: PRICE_RATE_UNITS.TOKEN,
                per: TOKENS_PER_MILLION,
              },
              output: {
                amount: prices.output_micro / PMPLAN_MICRO_USD_PER_USD,
                currency: CURRENCIES.USD,
                unit: PRICE_RATE_UNITS.TOKEN,
                per: TOKENS_PER_MILLION,
              },
            },
            rules: [],
            groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
            source: {
              kind: multipleChannels
                ? PRICING_SOURCE_KINDS.ESTIMATE
                : eligible
                  ? PRICING_SOURCE_KINDS.ACCOUNT
                  : PRICING_SOURCE_KINDS.CATALOG,
              url,
              notes: multipleChannels
                ? [
                    {
                      kind: PRICING_SOURCE_NOTE_KINDS.CHANNEL_MINIMUM,
                      scope: eligible
                        ? PRICING_SOURCE_KINDS.ACCOUNT
                        : PRICING_SOURCE_KINDS.CATALOG,
                    },
                  ]
                : [],
            },
            issues: [],
          },
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: multipleChannels
              ? MODEL_PRICE_PRECISION_KINDS.ESTIMATED
              : MODEL_PRICE_PRECISION_KINDS.EXACT,
            source_url: url,
          },
        }
      }),
    }
  },
}

/** /v1/models is scoped to the selected inference key and never borrows console Cookies. */
export const pmplanModelCatalog: ModelCatalogCapability = {
  async fetchModels(request) {
    return normalizeModelDescriptors(
      (
        await fetchOpenAICompatibleModelIds({
          baseUrl: request.baseUrl,
          apiKey: request.auth.apiKey,
          abortSignal: request.abortSignal,
          requestHeaders: request.requestHeaders,
        })
      ).map((id) => ({ id })),
    )
  },
}
