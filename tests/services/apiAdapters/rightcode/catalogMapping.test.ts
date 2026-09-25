import { describe, expect, it } from "vitest"

import { buildRightCodePricingResponse } from "~/services/apiAdapters/rightcode/catalogMapping"
import type { RightCodeEffectiveUpstream } from "~/services/apiService/rightcode/type"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const upstream = (
  overrides: Partial<RightCodeEffectiveUpstream> = {},
): RightCodeEffectiveUpstream => ({
  upstream_id: 1,
  name: "Codex",
  prefix: "/codex",
  copy_with_v1: true,
  effective_upstream_rate: "0.4",
  default_protocol: "responses",
  supported_protocols: ["responses", "completions"],
  models: [
    {
      model_id: 1,
      name: "gpt-5.5",
      is_available: true,
      billing_mode: "token",
      effective_price_config: {
        input_price: "2",
        output_price: "12",
        cache_read_input_price: "0.2",
        cache_creation_input_price: "0.1",
      },
    },
  ],
  ...overrides,
})

describe("buildRightCodePricingResponse", () => {
  it("publishes the account's effective per-million token prices", () => {
    const snapshot = buildRightCodePricingResponse([upstream()])

    expect(snapshot.success).toBe(true)
    expect(snapshot.groupAccess).toEqual({ kind: "not-applicable" })
    expect(snapshot.groupRatios).toEqual({})
    expect(snapshot.data).toEqual([
      expect.objectContaining({
        model_name: "gpt-5.5",
        quota_type: 0,
        model_ratio: 0,
        token_price_usd_per_million: {
          input: 2,
          output: 12,
          cache_read: 0.2,
          cache_write: 0.1,
        },
        supported_endpoint_types: ["responses", "completions"],
        price_metadata: { source: "channel-pricing", precision: "exact" },
      }),
    ])
  })

  it("marks tiered models as estimated and prices them from the base tier", () => {
    const snapshot = buildRightCodePricingResponse([
      upstream({
        models: [
          {
            model_id: 2,
            name: "gpt-5.5-tiered",
            is_available: true,
            billing_mode: "tiered",
            effective_price_config: {
              tiers: [
                {
                  input_price: "2",
                  output_price: "12",
                  max_context_length: 272000,
                },
                { input_price: "4", output_price: "18" },
              ],
            },
          },
        ],
      }),
    ])

    expect(atIndex(snapshot.data, 0).token_price_usd_per_million).toEqual({
      input: 2,
      output: 12,
    })
    expect(atIndex(snapshot.data, 0).price_metadata?.precision).toBe(
      "estimated",
    )
  })

  it("maps request-billed models to per-call pricing", () => {
    const snapshot = buildRightCodePricingResponse([
      upstream({
        upstream_id: 12,
        name: "画图",
        prefix: "/draw",
        copy_with_v1: false,
        models: [
          {
            model_id: 79,
            name: "gpt-image-2",
            is_available: true,
            billing_mode: "request",
            effective_price_config: { request_price: "0.04" },
          },
        ],
      }),
    ])

    expect(atIndex(snapshot.data, 0)).toMatchObject({
      model_name: "gpt-image-2",
      quota_type: 1,
      model_price: 0.04,
      price_metadata: { source: "channel-pricing", precision: "exact" },
    })
    expect(
      atIndex(snapshot.data, 0).token_price_usd_per_million,
    ).toBeUndefined()
  })

  it("folds a model offered by several channels into its cheapest rate", () => {
    const snapshot = buildRightCodePricingResponse([
      upstream({
        upstream_id: 2,
        name: "Claude 官方渠道",
        prefix: "/claude",
        effective_upstream_rate: "1",
        models: [
          {
            model_id: 3,
            name: "shared-model",
            is_available: true,
            billing_mode: "token",
            effective_price_config: { input_price: "9" },
          },
        ],
      }),
      upstream({
        upstream_id: 1,
        effective_upstream_rate: "0.4",
        models: [
          {
            model_id: 4,
            name: "shared-model",
            is_available: true,
            billing_mode: "token",
            effective_price_config: { input_price: "2" },
          },
        ],
      }),
    ])

    expect(snapshot.data).toHaveLength(1)
    expect(atIndex(snapshot.data, 0).token_price_usd_per_million?.input).toBe(2)
  })

  it("places upstreams with missing rates after priced channels stably", () => {
    const snapshot = buildRightCodePricingResponse([
      upstream({
        upstream_id: 10,
        effective_upstream_rate: undefined,
        models: [
          {
            model_id: 101,
            name: "unranked-model",
            is_available: true,
            billing_mode: "token",
            effective_price_config: { input_price: "5" },
          },
        ],
      }),
      upstream({
        upstream_id: 11,
        effective_upstream_rate: "0.2",
        models: [
          {
            model_id: 102,
            name: "unranked-model",
            is_available: true,
            billing_mode: "token",
            effective_price_config: { input_price: "1" },
          },
        ],
      }),
    ])

    expect(snapshot.data).toHaveLength(1)
    expect(atIndex(snapshot.data, 0).token_price_usd_per_million?.input).toBe(1)
  })

  it("omits unavailable models", () => {
    const snapshot = buildRightCodePricingResponse([
      upstream({
        models: [
          {
            model_id: 5,
            name: "disabled-model",
            is_available: false,
            billing_mode: "token",
            effective_price_config: { input_price: "1" },
          },
        ],
      }),
    ])

    expect(snapshot.data).toEqual([])
  })

  it("picks the cheapest model price across channels regardless of channel rate", () => {
    const snapshot = buildRightCodePricingResponse([
      upstream({
        upstream_id: 1,
        effective_upstream_rate: "0.1",
        models: [
          {
            model_id: 10,
            name: "gpt-4o",
            is_available: true,
            billing_mode: "token",
            effective_price_config: { input_price: "5", output_price: "15" },
          },
        ],
      }),
      upstream({
        upstream_id: 2,
        effective_upstream_rate: "0.5",
        models: [
          {
            model_id: 20,
            name: "gpt-4o",
            is_available: true,
            billing_mode: "token",
            effective_price_config: { input_price: "2.5", output_price: "10" },
          },
        ],
      }),
    ])

    expect(snapshot.data).toHaveLength(1)
    expect(atIndex(snapshot.data, 0).token_price_usd_per_million?.input).toBe(
      2.5,
    )
  })
})
