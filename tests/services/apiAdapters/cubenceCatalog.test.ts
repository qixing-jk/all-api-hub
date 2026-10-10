import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildCubenceCatalog,
  cubenceModelCatalog,
} from "~/services/apiAdapters/cubence/modelCatalog"
import { fetchAnnouncements } from "~/services/apiService/cubence/announcements"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const group = {
  id: 72,
  name: "openai-off(x0.8)",
  is_active: true,
  multiplier: 0.8,
  supported_protocols: ["openai.responses"],
}
const model = {
  model_name: "example-model",
  is_active: true,
  billing_mode: "token",
  input_price: 2,
  output_price: 8,
  cache_read_price: 0.2,
  cache_write_price: 2.5,
  request_price: 0,
  pricing_tiers: [],
  group_ids: [72],
  groups: [{ id: 72, base_multiplier: 0.8, schedule_enabled: false }],
  vendor: { id: 1, name: "Example provider" },
}

describe("Cubence catalog and announcements", () => {
  beforeEach(() => {
    installCookieTransport()
  })
  afterEach(() => vi.restoreAllMocks())
  it("limits selected-key models to the owned active key's group, retaining console authentication", async () => {
    server.use(
      http.get("https://cubence.com/api/v1/auth/me", () =>
        HttpResponse.json({
          user: { id: 7, username: "example", active: true },
        }),
      ),
      http.get("https://cubence.com/api/v1/user/apikeys", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 1,
              user_id: 7,
              name: "Example",
              key: "sk-example",
              status: "active",
              share_type: "public",
              share_group_id: 72,
              quota_limit: -1,
              quota_used: 0,
              usage_count: 0,
            },
          ],
        }),
      ),
      http.get("https://cubence.com/api/model-plaza", ({ request }) => {
        expect(request.headers.has("authorization")).toBe(false)
        return HttpResponse.json({
          success: true,
          data: {
            models: [
              model,
              { ...model, model_name: "other-group", group_ids: [99] },
            ],
          },
        })
      }),
    )
    const request = {
      baseUrl: "https://api.cubence.com",
      auth: { authType: AuthTypeEnum.AccessToken, apiKey: "sk-example" },
    }
    const accountRequest = {
      baseUrl: "https://cubence.com",
      auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
    }
    await expect(
      cubenceModelCatalog.fetchModels(request, { accountRequest }),
    ).resolves.toMatchObject([{ id: "example-model" }])
    await expect(
      cubenceModelCatalog.fetchModels(
        { ...request, auth: { ...request.auth, apiKey: "sk-not-owned" } },
        { accountRequest },
      ),
    ).rejects.toMatchObject({ code: "TOKEN_SECRET_UNAVAILABLE" })
  })
  it("maps USD token rates and verified group access without treating one key as the whole catalog", () => {
    expect(buildCubenceCatalog([model], [group])).toMatchObject({
      success: true,
      groupRatios: { "72": 0.8 },
      groupAccess: { kind: "authoritative", usableGroups: ["72"] },
      data: [
        {
          model_name: "example-model",
          token_price_usd_per_million: {
            input: 2,
            output: 8,
            cache_read: 0.2,
            cache_write: 2.5,
          },
          enable_groups: ["72"],
          groupDisplayNames: { "72": "openai-off" },
          price_metadata: { precision: "estimated" },
        },
      ],
    })
  })

  it.each([
    {
      ...model,
      pricing_tiers: [{ min_tokens: 100001, max_tokens: null, input_price: 4 }],
    },
    { ...model, groups: [{ id: 72, schedule_enabled: true }] },
    {
      ...model,
      billing_mode: "per_request",
      request_billing_strategy: "dynamic",
      request_price: 0.2,
    },
  ])(
    "does not publish a misleading flat quote for unverified tier, time or returned-image-area rules",
    (value) => {
      expect(
        buildCubenceCatalog([value], [group]).data[0]!.price_metadata
          ?.precision,
      ).toBe("unavailable")
    },
  )

  it("preserves zero rates but rejects missing rates", () => {
    expect(
      buildCubenceCatalog([{ ...model, input_price: 0 }], [group]).data[0]!
        .token_price_usd_per_million?.input,
    ).toBe(0)
    expect(
      buildCubenceCatalog([{ ...model, input_price: null }], [group]).data[0]!
        .price_metadata?.precision,
    ).toBe("unavailable")
  })

  it("paginates announcements and ignores per-account presentation revision state", async () => {
    const seen: number[] = []
    server.use(
      http.get("https://cubence.com/api/v1/announcements", ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"))
        seen.push(page)
        return HttpResponse.json({
          success: true,
          data: {
            total: 2,
            page,
            page_size: 1,
            announcements: [
              {
                id: page,
                title: `News ${page}`,
                content: "Body",
                published_at: "2026-10-09T00:00:00Z",
                notification_revision: 3,
              },
            ],
          },
        })
      }),
    )
    const result = await fetchAnnouncements({
      baseUrl: "https://cubence.com",
      auth: { authType: AuthTypeEnum.Cookie },
    })
    expect(seen).toEqual([1, 2])
    expect(result).toEqual([
      { id: "1", title: "News 1", content: "Body", createdAt: 1791504000000 },
      { id: "2", title: "News 2", content: "Body", createdAt: 1791504000000 },
    ])
  })
})
