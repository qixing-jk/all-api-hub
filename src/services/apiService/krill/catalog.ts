import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { KRILL_ENDPOINTS } from "./constants"
import { readKrillAccountEnvelope } from "./identity"
import { invalidKrillResponse } from "./transport"

/** Account-scoped pricing row; prices are USD per million tokens. */
export type KrillModelPricingEntry = {
  model_name: string
  provider: string
  enabled: boolean
  billingMode: "token" | "request" | "duration"
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cacheWrite1h?: number
  requestUsd: number
  contextWindow: number | null
  maxOutputTokens: number | null
  routeMultipliers: Record<string, number>
  highContext?: KrillTokenPrices & { threshold: number }
  timeWindows?: {
    label: string
    start: number
    end: number
    input: number
    output: number
    cacheRead: number
  }[]
}

type KrillTokenPrices = Pick<
  KrillModelPricingEntry,
  "input" | "output" | "cacheRead" | "cacheWrite" | "cacheWrite1h"
>

/** Preserve the distinct native cache write lifetimes in USD per million tokens. */
function tokenPrices(
  value: Record<string, unknown>,
  endpoint: string,
): KrillTokenPrices {
  return {
    input: decimal(value.input_token_price, endpoint),
    output: decimal(value.output_token_price, endpoint),
    cacheRead: decimal(value.cache_read_input_token_price, endpoint),
    cacheWrite: decimal(
      value.cache_creation_5m_token_price ?? value.cache_creation_token_price,
      endpoint,
    ),
    ...(value.cache_creation_1h_token_price != null
      ? { cacheWrite1h: decimal(value.cache_creation_1h_token_price, endpoint) }
      : {}),
  }
}

const decimal = (value: unknown, endpoint: string, allowZero = true) => {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value.trim()))
    invalidKrillResponse(endpoint)
  const amount = Number(value)
  if (!Number.isFinite(amount) || (!allowZero && amount <= 0))
    invalidKrillResponse(endpoint)
  return amount
}

/** The console's own model list for this account, not a provider-wide catalogue. */
export async function fetchKrillModelIds(
  request: ApiServiceRequest,
): Promise<string[]> {
  const endpoint = KRILL_ENDPOINTS.Models
  const body = await readKrillAccountEnvelope(request, endpoint)
  if (!Array.isArray(body.data)) invalidKrillResponse(endpoint)
  return body.data.flatMap((value) =>
    typeof value === "string" && value.trim() ? [value.trim()] : [],
  )
}

/** Prices are the account's own USD per-million-token rates before multipliers. */
export async function fetchKrillModelPricing(
  request: ApiServiceRequest,
): Promise<KrillModelPricingEntry[]> {
  const endpoint = KRILL_ENDPOINTS.ModelPricing
  const body = await readKrillAccountEnvelope(request, endpoint)
  if (!Array.isArray(body.data)) invalidKrillResponse(endpoint)
  return body.data.map((value) => parsePricingEntry(value, endpoint))
}

/** Validate shared catalogue and dedicated-price fields before calculating rates. */
function parsePricingEntry(
  value: unknown,
  endpoint: string,
): KrillModelPricingEntry {
  if (
    !isRecord(value) ||
    typeof value.model_name !== "string" ||
    !value.model_name.trim() ||
    typeof value.enabled !== "boolean" ||
    (value.billing_mode !== "token" &&
      value.billing_mode !== "request" &&
      value.billing_mode !== "duration")
  )
    invalidKrillResponse(endpoint)
  const multipliers: Record<string, number> = {}
  if (value.route_multipliers !== undefined) {
    if (!isRecord(value.route_multipliers)) invalidKrillResponse(endpoint)
    for (const [route, factor] of Object.entries(value.route_multipliers))
      multipliers[route] = decimal(factor, endpoint)
  }
  const contextWindow =
    value.context_window === null || value.context_window === undefined
      ? null
      : decimal(String(value.context_window), endpoint) || null
  const maxOutput =
    value.max_output_tokens === null || value.max_output_tokens === undefined
      ? null
      : decimal(String(value.max_output_tokens), endpoint) || null
  let highContext: KrillModelPricingEntry["highContext"]
  const high = value.high_context_rule
  if (isRecord(high) && high.enabled === true) {
    const threshold = high.input_tokens_threshold
    if (!Number.isSafeInteger(threshold) || Number(threshold) < 0)
      invalidKrillResponse(endpoint)
    highContext = {
      ...tokenPrices(high, endpoint),
      threshold: Number(threshold),
    }
  }
  const timeWindows: NonNullable<KrillModelPricingEntry["timeWindows"]> = []
  if (value.time_window_rules != null) {
    if (!Array.isArray(value.time_window_rules)) invalidKrillResponse(endpoint)
    for (const window of value.time_window_rules) {
      if (!isRecord(window) || typeof window.enabled !== "boolean")
        invalidKrillResponse(endpoint)
      if (!window.enabled) continue
      if (
        ![window.start_minute, window.end_minute].every(
          (n) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) < 1440,
        )
      )
        invalidKrillResponse(endpoint)
      timeWindows.push({
        label: typeof window.label === "string" ? window.label : "",
        start: Number(window.start_minute),
        end: Number(window.end_minute),
        input: decimal(window.input_token_price, endpoint),
        output: decimal(window.output_token_price, endpoint),
        cacheRead: decimal(window.cache_read_input_token_price, endpoint),
      })
    }
  }
  return {
    model_name: value.model_name.trim(),
    provider: typeof value.provider === "string" ? value.provider : "",
    enabled: value.enabled,
    billingMode: value.billing_mode,
    ...tokenPrices(value, endpoint),
    ...(highContext ? { highContext } : {}),
    ...(timeWindows.length ? { timeWindows } : {}),
    requestUsd: decimal(value.request_price_usd, endpoint),
    contextWindow,
    maxOutputTokens: maxOutput,
    routeMultipliers: multipliers,
  }
}

export type KrillPricingContext = {
  route: { key: string; name: string } | undefined
  modelRoutes: { modelName: string; providerId: number }[]
  dedicated: (KrillModelPricingEntry & {
    providerId: number
    routeKey: string
  })[]
}

/** Same initial route selection as the native pricing page. */
export async function fetchKrillPricingContext(
  request: ApiServiceRequest,
): Promise<KrillPricingContext> {
  const [settings, routes, dedicated] = await Promise.all([
    readKrillAccountEnvelope(request, KRILL_ENDPOINTS.EndpointSettings),
    readKrillAccountEnvelope(request, KRILL_ENDPOINTS.ModelRoutes),
    readKrillAccountEnvelope(request, KRILL_ENDPOINTS.DedicatedModels),
  ])
  if (
    !isRecord(settings.data) ||
    !Array.isArray(settings.data.routes) ||
    !Array.isArray(routes.data) ||
    !Array.isArray(dedicated.data)
  )
    invalidKrillResponse(KRILL_ENDPOINTS.ModelPricing)
  const endpoints = settings.data.routes.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.key !== "string" ||
      !value.key ||
      typeof value.name !== "string"
    )
      invalidKrillResponse(KRILL_ENDPOINTS.EndpointSettings)
    return { key: value.key, name: value.name }
  })
  return {
    route: endpoints.find((route) => route.name === "海外线路") ?? endpoints[0],
    dedicated: dedicated.data.map((value) => {
      if (
        !isRecord(value) ||
        !Number.isSafeInteger(value.provider_id) ||
        Number(value.provider_id) <= 0 ||
        typeof value.route_key !== "string"
      )
        invalidKrillResponse(KRILL_ENDPOINTS.DedicatedModels)
      const high = value.high_context_enabled
        ? {
            enabled: true,
            input_tokens_threshold: value.high_context_input_tokens_threshold,
            input_token_price: value.high_context_input_token_price,
            output_token_price: value.high_context_output_token_price,
            cache_read_input_token_price:
              value.high_context_cache_read_input_token_price,
            cache_creation_token_price:
              value.high_context_cache_creation_token_price,
            cache_creation_5m_token_price:
              value.high_context_cache_creation_5m_token_price ??
              value.high_context_cache_creation_token_price,
            cache_creation_1h_token_price:
              value.high_context_cache_creation_1h_token_price ??
              value.high_context_cache_creation_token_price,
          }
        : null
      return {
        ...parsePricingEntry(
          { ...value, enabled: true, high_context_rule: high },
          KRILL_ENDPOINTS.DedicatedModels,
        ),
        providerId: Number(value.provider_id),
        routeKey: value.route_key,
      }
    }),
    modelRoutes: routes.data.map((value) => {
      if (
        !isRecord(value) ||
        typeof value.model_name !== "string" ||
        !Number.isSafeInteger(value.provider_id) ||
        Number(value.provider_id) <= 0
      )
        invalidKrillResponse(KRILL_ENDPOINTS.ModelRoutes)
      return {
        modelName: value.model_name,
        providerId: Number(value.provider_id),
      }
    }),
  }
}
