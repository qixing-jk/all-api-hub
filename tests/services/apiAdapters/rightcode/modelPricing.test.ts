import { describe, expect, it, vi } from "vitest"

import { MODEL_PRICING_RUNTIME_KEY_FALLBACKS } from "~/services/apiAdapters/contracts/modelPricing"
import { rightCodeModelPricing } from "~/services/apiAdapters/rightcode/modelPricing"
import * as rightCodeApi from "~/services/apiService/rightcode"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/services/apiService/rightcode", () => ({
  fetchRightCodeEffectiveUpstreams: vi.fn(),
}))

describe("rightCodeModelPricing", () => {
  it("uses account pricing fallback", () => {
    expect(rightCodeModelPricing.runtimeKeyFallback).toBe(
      MODEL_PRICING_RUNTIME_KEY_FALLBACKS.ACCOUNT_PRICING,
    )
  })

  it("fetches pricing using effective upstreams", async () => {
    vi.mocked(
      rightCodeApi.fetchRightCodeEffectiveUpstreams,
    ).mockResolvedValueOnce([
      {
        upstream_id: 1,
        name: "Test Upstream",
        prefix: "/test",
        copy_with_v1: false,
        effective_upstream_rate: "1",
        default_protocol: "responses",
        supported_protocols: ["responses"],
        models: [
          {
            model_id: 1,
            name: "test-model",
            is_available: true,
            billing_mode: "token",
            effective_price_config: {
              input_price: "1",
              output_price: "2",
            },
          },
        ],
      },
    ])

    const request = {
      baseUrl: "https://www.right.codes",
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
    }

    const snapshot = await rightCodeModelPricing.fetchPricing(request)
    expect(snapshot.success).toBe(true)
    expect(snapshot.data).toHaveLength(1)
    expect(atIndex(snapshot.data ?? [], 0).model_name).toBe("test-model")
    expect(rightCodeApi.fetchRightCodeEffectiveUpstreams).toHaveBeenCalledWith(
      request,
    )
  })
})
