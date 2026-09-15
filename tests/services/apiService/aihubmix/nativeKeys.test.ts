import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { AIHUBMIX_API_ORIGIN } from "~/constants/siteType"
import {
  createAIHubMixKey,
  fetchAIHubMixKey,
  fetchAIHubMixKeys,
  updateAIHubMixKey,
} from "~/services/apiService/aihubmix"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const request = {
  baseUrl: "https://console.aihubmix.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "saved-token" },
}
const endpoint = `${AIHUBMIX_API_ORIGIN}/api/token/`
const payload = {
  name: "Native key",
  expired_time: -1,
  unlimited_quota: false,
  remain_quota: 500000,
  models: "model-a",
  subnet: "192.0.2.0/24",
}

describe("AIHubMix native key HTTP contract", () => {
  it.each([[{ id: 7 }], { items: [{ token_id: "7" }] }, { data: [{ id: 7 }] }])(
    "accepts supported inventory envelopes without losing identity",
    async (data) => {
      server.use(
        http.get(endpoint, () => HttpResponse.json({ success: true, data })),
      )
      await expect(fetchAIHubMixKeys(request)).resolves.toEqual([
        expect.objectContaining({ id: 7 }),
      ])
    },
  )
  it.each([null, "bad", {}, { items: "bad" }])(
    "rejects malformed inventory %j",
    async (data) => {
      server.use(
        http.get(endpoint, () => HttpResponse.json({ success: true, data })),
      )
      await expect(fetchAIHubMixKeys(request)).rejects.toThrow(
        "invalid_aihubmix_key_inventory",
      )
    },
  )
  it.each([0, -1, "not-an-id", 1.5])(
    "rejects invalid identity %s",
    async (id) => {
      server.use(
        http.get(endpoint, () => HttpResponse.json({ data: [{ id }] })),
      )
      await expect(fetchAIHubMixKeys(request)).rejects.toThrow(
        "invalid_aihubmix_key_id",
      )
    },
  )
  it("rejects duplicate inventory and mismatched detail identities", async () => {
    server.use(
      http.get(endpoint, () =>
        HttpResponse.json({ data: [{ id: 7 }, { id: 7 }] }),
      ),
      http.get(`${endpoint}7`, () => HttpResponse.json({ data: { id: 8 } })),
    )
    await expect(fetchAIHubMixKeys(request)).rejects.toThrow(
      "duplicate_aihubmix_key_id",
    )
    await expect(fetchAIHubMixKey(request, 7)).rejects.toThrow(
      "aihubmix_key_identity_mismatch",
    )
  })
  it("reads the exact detail and preserves a response-only create secret", async () => {
    server.use(
      http.get(`${endpoint}7`, () =>
        HttpResponse.json({ data: { id: 7, name: "Native key" } }),
      ),
      http.post(endpoint, async ({ request: req }) => {
        expect(await req.json()).toEqual(payload)
        expect(req.headers.get("Authorization")).toBe("saved-token")
        return HttpResponse.json({ data: { full_key: "sk-once" } })
      }),
    )
    await expect(fetchAIHubMixKey(request, 7)).resolves.toMatchObject({ id: 7 })
    await expect(createAIHubMixKey(request, payload)).resolves.toEqual({
      full_key: "sk-once",
    })
  })
  it.each([undefined, [], true, {}, { success: true, message: "ok" }])(
    "does not invent a key from an acknowledgement",
    async (data) => {
      server.use(
        http.post(endpoint, () => HttpResponse.json({ success: true, data })),
      )
      const result = await createAIHubMixKey(request, payload)
      expect(result).toBeUndefined()
    },
  )
  it.each([
    { id: 7 },
    { token_id: "7" },
    { name: "Created" },
    { key: "sk-once" },
    { full_key: "sk-once" },
    { token: "sk-once" },
    { value: "sk-once" },
  ])("preserves native create evidence %j", async (data) => {
    server.use(
      http.post(endpoint, () => HttpResponse.json({ success: true, data })),
    )
    await expect(createAIHubMixKey(request, payload)).resolves.toEqual(data)
  })
  it("updates the exact key with native quota and restrictions", async () => {
    let written: unknown
    server.use(
      http.put(endpoint, async ({ request: req }) => {
        written = await req.json()
        return HttpResponse.json({ success: true })
      }),
    )
    await updateAIHubMixKey(request, 7, payload)
    expect(written).toEqual({ ...payload, id: 7 })
  })
})
