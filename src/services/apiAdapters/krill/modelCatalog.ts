import { SITE_TYPES } from "~/constants/siteType"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import {
  fetchKrillModelIds,
  fetchKrillModelPricing,
  type KrillModelPricingEntry,
} from "~/services/apiService/krill"
import {
  fetchKrillPricingContext,
  type KrillPricingContext,
} from "~/services/apiService/krill/catalog"
import {
  fetchKrillChannels,
  type KrillChannel,
} from "~/services/apiService/krill/keys"
import { withKrillSession } from "~/services/apiService/krill/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import type {
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { normalizeModelDescriptors } from "~/services/models/modelDescriptor"
import {
  MODEL_DISPLAY_FACT_LABELS,
  type ModelDisplayFact,
} from "~/services/models/modelDisplayFacts"

/** Normalize the native default price view without introducing account groups. */
function planFor(
  entry: KrillModelPricingEntry,
  context: KrillPricingContext,
  channels: readonly KrillChannel[],
  url: string,
): PricingPlan {
  const ids = context.modelRoutes
    .filter((route) => route.modelName === entry.model_name)
    .map((route) => route.providerId)
  const dedicated = ids.map((id) => {
    const rules = context.dedicated.filter(
      (rule) => rule.model_name === entry.model_name && rule.providerId === id,
    )
    return (
      rules.find((rule) => rule.routeKey === (context.route?.key ?? "")) ??
      rules.find((rule) => rule.routeKey === "")
    )
  })
  const completeDedicated =
    ids.length > 0 && dedicated.every((rule) => rule !== undefined)
  const specific = completeDedicated
    ? dedicated
        .filter((rule) => rule !== undefined)
        .sort(
          (a, b) =>
            b.input +
            b.output +
            b.requestUsd -
            (a.input + a.output + a.requestUsd),
        )[0]
    : undefined
  const effective = specific ?? entry
  const channel = channels
    .filter((channel) => ids.includes(channel.id))
    .sort((a, b) => b.billingMultiplier - a.billingMultiplier)[0]
  const multiplier = specific
    ? 1
    : Number(
        (
          (context.route ? entry.routeMultipliers[context.route.key] ?? 1 : 1) *
          (channel?.billingMultiplier ?? 1)
        ).toFixed(4),
      )
  const token = (amount: number): PriceRate => ({
    amount: amount * multiplier,
    currency: "USD",
    unit: "token",
    per: 1_000_000,
  })
  const tokenRates = (
    prices: Pick<
      KrillModelPricingEntry,
      "input" | "output" | "cacheRead" | "cacheWrite" | "cacheWrite1h"
    >,
  ): PricingPlan["rates"] => ({
    input: token(prices.input),
    output: token(prices.output),
    cacheRead: token(prices.cacheRead),
    cacheWrite: token(prices.cacheWrite),
    ...(prices.cacheWrite1h !== undefined
      ? { cacheWrite1h: token(prices.cacheWrite1h) }
      : {}),
  })
  const time = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
  const windows = effective.timeWindows
    ?.map(
      (window) =>
        `${window.label} ${time(window.start)}–${time(window.end)}: $${window.input * multiplier} / $${window.output * multiplier} / $${window.cacheRead * multiplier} (input / output / cache read, /M)`,
    )
    .join("; ")
  return {
    rates:
      effective.billingMode === "token"
        ? tokenRates(effective)
        : effective.billingMode === "duration"
          ? {
              videoSeconds: {
                amount: effective.requestUsd * multiplier,
                currency: "USD",
                unit: "second",
                per: 1,
              },
            }
          : {
              request: {
                amount: effective.requestUsd * multiplier,
                currency: "USD",
                unit: "request",
                per: 1,
              },
            },
    usageMode:
      effective.billingMode === "token"
        ? "tokens"
        : effective.billingMode === "duration"
          ? "metered"
          : "request",
    ...(effective.billingMode === "duration"
      ? { comparison: { meter: "videoSeconds" as const } }
      : {}),
    rules:
      effective.billingMode === "token" && effective.highContext
        ? [
            {
              id: "high-context",
              conditions: [
                {
                  kind: "range",
                  axis: "inputTokens",
                  min: effective.highContext.threshold + 1,
                },
              ],
              rates: tokenRates(effective.highContext),
            },
          ]
        : [],
    groupMultiplier: "included",
    issues: windows
      ? [{ code: "unverified-axis", meters: ["input", "output", "cacheRead"] }]
      : [],
    limits:
      effective.billingMode === "token"
        ? {
            ...(entry.contextWindow
              ? { totalTokens: entry.contextWindow }
              : {}),
            ...(entry.maxOutputTokens
              ? { outputTokens: entry.maxOutputTokens }
              : {}),
          }
        : {},
    source: {
      kind: "account",
      url,
      pricingDescription: {
        zh: `${context.route?.name ?? "默认线路"} · 全部渠道${channel ? `（${channel.name}）` : ""} · ${specific ? "专属价格，已含倍率" : `倍率 ${multiplier}`}。采用原站默认价格视图；实际费用取决于请求线路和渠道。${windows ? `\n${windows}。原站未提供时区，当前显示常规价格，未自动应用时段优惠。` : ""}`,
        en: `${context.route?.name ?? "Default route"} · All channels${channel ? ` (${channel.name})` : ""} · ${specific ? "Dedicated prices, multipliers included" : `Multiplier ${multiplier}`}. Native default pricing view; charges depend on the request route and channel.${windows ? `\n${windows}. No timezone is published; regular rates shown, time-window discounts are not automatically applied.` : ""}`,
      },
    },
  }
}

/** Route and channel multipliers change the charged rate, so prices stay estimates. */
function buildKrillPricing(
  entries: readonly KrillModelPricingEntry[],
  baseUrl: string,
  context: KrillPricingContext,
  channels: readonly KrillChannel[],
): ModelPricing[] {
  return entries.map((entry) => ({
    model_name: entry.model_name,
    ...(entry.provider
      ? { vendorEvidence: { kind: "publisher" as const, name: entry.provider } }
      : {}),
    quota_type: entry.billingMode === "token" ? 0 : 1,
    model_ratio: 0,
    model_price: 0,
    completion_ratio: 1,
    pricingPlan: planFor(entry, context, channels, `${baseUrl}/app/pricing`),
    presentation: {
      summaryFacts: [
        ...(entry.contextWindow
          ? [
              {
                type: "token-quantity",
                label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
                value: entry.contextWindow,
              } as ModelDisplayFact,
            ]
          : []),
        ...(entry.maxOutputTokens
          ? [
              {
                type: "token-quantity",
                label: MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
                value: entry.maxOutputTokens,
              } as ModelDisplayFact,
            ]
          : []),
      ],
    },
    price_metadata: {
      source: "provider-catalog" as const,
      precision: "estimated" as const,
      source_url: `${baseUrl}/app/pricing`,
    },
    enable_groups: [],
    supported_endpoint_types: ["openai"],
  }))
}

/** Channels gate billing routes rather than model groups, so group access is N/A. */
function snapshot(
  entries: readonly KrillModelPricingEntry[],
  baseUrl: string,
  context: KrillPricingContext,
  channels: readonly KrillChannel[],
): ModelCatalogSnapshot {
  return {
    success: true,
    data: buildKrillPricing(entries, baseUrl, context, channels),
    groupRatios: {},
    // Channels gate billing routes, not model access, so no group policy applies.
    groupAccess: { kind: "not-applicable" },
    model_list_source: {
      kind: "user-scoped",
      provider: SITE_TYPES.KRILL,
      supportsPricing: true,
      actionPolicy: {
        supportsGroupFiltering: false,
        supportsAccountSummary: true,
        supportsTokenCompatibility: true,
        supportsCredentialVerification: true,
        supportsBatchCredentialVerification: false,
        supportsCliVerification: true,
      },
    },
  }
}

/** Pricing is read through the account Cookie, so the account request is required. */
async function loadSnapshot(request: ApiServiceRequest) {
  return withKrillSession(request, async (request) => {
    const [entries, context, channels] = await Promise.all([
      fetchKrillModelPricing(request),
      fetchKrillPricingContext(request),
      fetchKrillChannels(request),
    ])
    return snapshot(entries, request.baseUrl, context, channels)
  })
}

export const krillModelPricing: ModelPricingCapability = {
  fetchPricing: loadSnapshot,
}

export const krillModelCatalog: ModelCatalogCapability = {
  async fetchModels(request, context) {
    // `/api/models` is scoped to the signed-in account, not to a selected key.
    if (!context?.accountRequest)
      throw new ApiError(
        "Krill AI account context is required",
        undefined,
        undefined,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      )
    return normalizeModelDescriptors(
      (
        await fetchKrillModelIds({
          ...context.accountRequest,
          abortSignal:
            request.abortSignal ?? context.accountRequest.abortSignal,
        })
      ).map((id) => ({ id })),
    )
  },
  async enrichPricing({ accountRequest }) {
    return loadSnapshot(accountRequest)
  },
}
