import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { pmApiModelPricing } from "~/services/apiAdapters/pmapi/modelCatalog"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const origin = "https://pmcat.top"
const envelope = (data: unknown) => ({ data, message: "", success: true })

const request: ApiServiceRequest = {
  baseUrl: origin,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "10171",
    accessToken: "t",
  },
}

function mockTokenGroups(groups: string[]) {
  server.use(
    http.get(`${origin}/api/me`, () =>
      HttpResponse.json(
        envelope({
          id: 10171,
          username: "pm-test-user",
          quota: 0,
          used_quota: 0,
        }),
      ),
    ),
    http.get(`${origin}/api/token-groups`, () =>
      HttpResponse.json(envelope(groups)),
    ),
  )
}

describe("PM-API model pricing", () => {
  it("maps direct token prices and per-request prices from the catalogue", async () => {
    server.use(
      http.get(`${origin}/api/pricing`, () =>
        HttpResponse.json(
          envelope({
            groups: [
              { name: "default", desc: "神秘分组喵", ratio: 1 },
              { name: "Free", desc: "神秘免费分组喵", ratio: 0 },
            ],
            models: [
              {
                model: "codestral-2508",
                available: true,
                billing: "per_token",
                completion_ratio: 3,
                groups: ["default"],
                input_per_m: 0.3,
                model_ratio: 0.15,
                output_per_m: 0.9,
                price: null,
                providers: ["openai"],
                vendor: "Mistral",
              },
              {
                // Free-group row: `available` is the server's verdict for the
                // caller's own group only; the model is still routable.
                model: "agnes-2.5-flash",
                available: false,
                billing: "per_request",
                completion_ratio: 0,
                groups: ["Free"],
                input_per_m: 0,
                model_ratio: 0,
                output_per_m: 0,
                price: 0,
                providers: ["openai"],
                vendor: "Other",
              },
              {
                model: "big-pickle",
                available: false,
                billing: "per_request",
                completion_ratio: 0,
                groups: ["Free"],
                input_per_m: 0,
                model_ratio: 0,
                output_per_m: 0,
                price: 0,
                providers: ["openai"],
                vendor: "Other",
              },
              {
                model: "mystery-model",
                available: true,
                billing: "per_token",
                completion_ratio: 1,
                groups: ["default"],
                input_per_m: null,
                model_ratio: 0,
                output_per_m: null,
                price: null,
                providers: ["openai"],
                vendor: "Other",
              },
            ],
          }),
        ),
      ),
    )
    mockTokenGroups(["default", "Free", "Nvidia"])
    const snapshot = await pmApiModelPricing.fetchPricing(request)
    expect(snapshot.success).toBe(true)
    expect(snapshot.groupRatios).toEqual({ default: 1, Free: 0 })
    expect(snapshot.groupAccess).toEqual({
      kind: "authoritative",
      usableGroups: ["default", "Free", "Nvidia"],
    })
    expect(snapshot.data).toHaveLength(4)
    // Token rows publish the site's own per-million rates as a plan whose
    // group multiplier is pending, so the quote multiplies by the group
    // ratio exactly like the console's pricing page (input_per_m × gr).
    expect(snapshot.data[0]).toMatchObject({
      model_name: "codestral-2508",
      owner_by: "Mistral",
      quota_type: 0,
      completion_ratio: 3,
      enable_groups: ["default"],
      pricingPlan: {
        usageMode: "tokens",
        groupMultiplier: "pending",
        rates: {
          input: {
            amount: 0.3,
            currency: "USD",
            unit: "token",
            per: 1_000_000,
          },
          output: {
            amount: 0.9,
            currency: "USD",
            unit: "token",
            per: 1_000_000,
          },
          request: { amount: 0, currency: "USD", unit: "request", per: 1 },
        },
      },
    })
    expect(snapshot.data[0]?.price_metadata).toMatchObject({
      precision: "exact",
      source_url: `${origin}/#/pricing`,
    })
    expect(snapshot.data[2]).toMatchObject({
      model_name: "big-pickle",
      quota_type: 1,
      model_price: 0,
      enable_groups: ["Free"],
    })
    // The console's own pricing page renders per-request rows as "$X per
    // call"; a finite per-call price is exact, not missing.
    expect(snapshot.data[2]?.price_metadata).toMatchObject({
      precision: "exact",
    })
    expect(snapshot.data[2]).toMatchObject({
      model_name: "big-pickle",
      pricingPlan: {
        usageMode: "request",
        groupMultiplier: "pending",
        rates: {
          request: { amount: 0, currency: "USD", unit: "request", per: 1 },
        },
      },
    })
    expect(snapshot.data[1]).toMatchObject({
      model_name: "agnes-2.5-flash",
      enable_groups: ["Free"],
    })
    // A per-group verdict never dims the card; the model stays reachable
    // through its own group.
    expect(snapshot.data[1]?.availability).toBeUndefined()
    expect(snapshot.data[3]).toMatchObject({
      model_name: "mystery-model",
      quota_type: 0,
      model_price: 0,
    })
    expect(snapshot.data[3]?.price_metadata).toMatchObject({
      precision: "unavailable",
      unavailable_reason: "official-price-missing",
    })
    expect(snapshot.data[3]?.pricingPlan).toBeUndefined()
    expect(snapshot.model_list_source?.actionPolicy).toMatchObject({
      supportsGroupFiltering: true,
      supportsTokenCompatibility: true,
      supportsCredentialVerification: true,
      supportsBatchCredentialVerification: true,
      supportsCliVerification: true,
    })
  })

  it("keeps the catalogue visible when the usable-group probe fails", async () => {
    // The pricing read itself needs no identity; the probe's identity check
    // runs against the same msw server, so the failure must come from the
    // groups route only.
    server.use(
      http.get(`${origin}/api/pricing`, () =>
        HttpResponse.json(
          envelope({
            groups: [
              { name: "default", ratio: 1 },
              { name: "Free", ratio: 0 },
            ],
            models: [
              {
                model: "codestral-2508",
                available: true,
                billing: "per_token",
                completion_ratio: 3,
                groups: ["default"],
                input_per_m: 0.3,
                model_ratio: 0.15,
                output_per_m: 0.9,
                price: null,
                providers: ["openai"],
                vendor: "Mistral",
              },
            ],
          }),
        ),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json({}, { status: 401 }),
      ),
      http.get(`${origin}/api/token-groups`, () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    )
    const snapshot = await pmApiModelPricing.fetchPricing(request)
    expect(snapshot.groupAccess).toEqual({
      kind: "compatible-priced-fallback",
      candidateGroups: ["default", "Free"],
    })
  })

  it("rejects a malformed catalogue row instead of returning partial data", async () => {
    mockTokenGroups([])
    server.use(
      http.get(`${origin}/api/pricing`, () =>
        HttpResponse.json(
          envelope({
            models: [{ model: "", available: true }],
          }),
        ),
      ),
    )
    await expect(pmApiModelPricing.fetchPricing(request)).rejects.toMatchObject(
      { code: "JSON_PARSE_ERROR" },
    )
  })
  it.each([null, { models: [], groups: [null] }])(
    "rejects malformed catalog envelopes: %j",
    async (data) => {
      server.use(
        http.get(`${origin}/api/pricing`, () =>
          HttpResponse.json(envelope(data)),
        ),
      )
      await expect(
        pmApiModelPricing.fetchPricing(request),
      ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
    },
  )
  it("keeps access unknown and the default completion ratio when group metadata is unavailable", async () => {
    server.use(
      http.get(`${origin}/api/pricing`, () =>
        HttpResponse.json(
          envelope({
            models: [
              {
                model: "model-a",
                available: true,
                billing: "per_request",
                price: 1,
                vendor: "test",
                groups: ["Free"],
              },
            ],
          }),
        ),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json({}, { status: 401 }),
      ),
    )
    const result = await pmApiModelPricing.fetchPricing(request)
    expect(result.groupAccess).toEqual({ kind: "unavailable" })
    expect(result.data[0]?.enable_groups).toEqual(["Free"])
    expect(result.data[0]?.completion_ratio).toBe(1)
  })
})
