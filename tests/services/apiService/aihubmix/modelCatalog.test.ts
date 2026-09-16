import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import {
  fetchAIHubMixApiUserModelIds,
  fetchAIHubMixModelCatalog,
  fetchAIHubMixWebsiteModels,
} from "~/services/apiService/aihubmix/modelCatalog"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

describe("AIHubMix native catalogs", () => {
  it("accepts a nested public catalog and discards non-object rows", async () => {
    server.use(
      http.get("https://aihubmix.com/api/v1/models", () =>
        HttpResponse.json({
          success: true,
          data: { data: [{ id: "model" }, null, 7] },
        }),
      ),
    )
    expect(await fetchAIHubMixModelCatalog()).toEqual([{ id: "model" }])
  })

  it("filters malformed account model identifiers and deduplicates aliases", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () =>
        HttpResponse.json({
          success: true,
          data: [
            null,
            7,
            {},
            { id: 3 },
            " model ",
            { model: "model" },
            { name: "second" },
          ],
        }),
      ),
    )
    expect(
      await fetchAIHubMixApiUserModelIds({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test-token" },
      }),
    ).toEqual(["model", "second"])
  })

  it("rejects missing authentication before requesting an account catalog", async () => {
    let requests = 0
    server.use(
      http.get("https://aihubmix.com/api/user/available_models", () => {
        requests += 1
        return HttpResponse.json({ data: [] })
      }),
    )
    await expect(
      fetchAIHubMixApiUserModelIds({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "  " },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(requests).toBe(0)
  })
  it("preserves descriptions independently of optional website billing data", async () => {
    const rows = [
      { model: "missing", desc: "中文描述", desc_en: "Description" },
      { model: "structured", billing_config: { unit: "token" } },
      { model: "invalid", billing_config: null },
    ]
    server.use(
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({
          success: true,
          data: [...rows, null, 4, { model: 3 }],
        }),
      ),
    )
    expect(await fetchAIHubMixWebsiteModels()).toEqual(
      new Map(rows.map((row) => [row.model, row])),
    )
  })
})
