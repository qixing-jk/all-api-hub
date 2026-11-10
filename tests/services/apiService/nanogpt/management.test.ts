import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { fetchNanoGptBalance } from "~/services/apiService/nanogpt"
import { encodeNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import {
  createNanoGptKey,
  deleteNanoGptKey,
  fetchNanoGptKey,
  fetchNanoGptKeys,
  updateNanoGptKey,
} from "~/services/apiService/nanogpt/management"
import { verifyNanoGptManagementCredential } from "~/services/apiService/nanogpt/managementIdentity"
import {
  fetchNanoGptData,
  fetchNanoGptManagementData,
} from "~/services/apiService/nanogpt/transport"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { nativeKey } from "~~/tests/test-utils/nanogpt"

const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://nano-gpt.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: encodeNanoGptCredentials({
      apiKey: "sk-nano-inference-fixture",
      managementToken: "sk-nano-mgmt-fixture",
    }),
  },
}

it("classifies inference rate limiting independently of authentication", async () => {
  server.use(
    http.post("https://api.nano-gpt.com/api/check-balance", () =>
      HttpResponse.json({ error: "limited" }, { status: 429 }),
    ),
  )
  await expect(fetchNanoGptBalance(request)).rejects.toMatchObject({
    code: "HTTP_429",
  })
})

it("rejects missing and role-mismatched credentials before dispatch", async () => {
  await expect(
    fetchNanoGptData(
      { ...request, auth: { ...request.auth, accessToken: "" } },
      "/fixture",
    ),
  ).rejects.toMatchObject({ code: "HTTP_401" })
  await expect(
    fetchNanoGptManagementData(
      {
        ...request,
        auth: {
          ...request.auth,
          accessToken: encodeNanoGptCredentials({
            apiKey: "inference",
            managementToken: "wrong-role",
          }),
        },
      },
      "/fixture",
    ),
  ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
})

it.each([
  null,
  { ...nativeKey, name: 3 },
  { ...nativeKey, daily_usd_limit: -1 },
  { ...nativeKey, weekly_usd_limit: "1" },
])("rejects malformed inventory metadata %j", async (key) => {
  server.use(
    http.get("https://nano-gpt.com/api/management/v1/api-keys", () =>
      HttpResponse.json({ data: [key] }),
    ),
  )
  await expect(fetchNanoGptKeys(request)).rejects.toMatchObject({
    code: "JSON_PARSE_ERROR",
  })
})

it("rejects an invalid resource id and a non-204 revoke response", async () => {
  await expect(fetchNanoGptKey(request, "../1")).rejects.toMatchObject({
    code: "JSON_PARSE_ERROR",
  })
  server.use(
    http.delete("https://nano-gpt.com/api/management/v1/api-keys/17", () =>
      HttpResponse.json({ success: true }),
    ),
  )
  await expect(deleteNanoGptKey(request, "17")).rejects.toMatchObject({
    code: "JSON_PARSE_ERROR",
  })
})

it("rejects management read and update responses with a different resource identity", async () => {
  server.use(
    http.get("https://nano-gpt.com/api/management/v1/api-keys/17", () =>
      HttpResponse.json({ ...nativeKey, id: "18" }),
    ),
    http.patch("https://nano-gpt.com/api/management/v1/api-keys/17", () =>
      HttpResponse.json({ ...nativeKey, id: "18" }),
    ),
  )
  await expect(fetchNanoGptKey(request, "17")).rejects.toMatchObject({
    code: "JSON_PARSE_ERROR",
  })
  await expect(
    updateNanoGptKey(request, "17", { name: "changed" }),
  ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
})

describe("NanoGPT management contract", () => {
  it("reads masked inventory using only the management token on the console host", async () => {
    server.use(
      http.get(
        "https://nano-gpt.com/api/management/v1/api-keys",
        ({ request }) => {
          expect(request.headers.get("Authorization")).toBe(
            "Bearer sk-nano-mgmt-fixture",
          )
          expect(request.credentials).toBe("omit")
          return HttpResponse.json({
            data: [{ ...nativeKey, key: "sk-nano-should-not-leak" }],
          })
        },
      ),
    )
    const keys = await fetchNanoGptKeys(request)
    expect(keys).toEqual([nativeKey])
    await expect(
      fetchNanoGptKeys({
        ...request,
        auth: { ...request.auth, accessToken: "sk-nano-fixture" },
      }),
    ).rejects.toThrow(/management/i)
  })
})

it("creates once with idempotency, patches only changed fields and consumes a 204 revoke", async () => {
  const calls: string[] = []
  server.use(
    http.post(
      "https://nano-gpt.com/api/management/v1/api-keys",
      async ({ request }) => {
        expect(request.headers.get("Idempotency-Key")).toBeTruthy()
        expect(await request.json()).toEqual({
          name: "new",
          daily_usd_limit: 1.5,
          zdr_policy: "zdr",
        })
        calls.push("create")
        return HttpResponse.json({
          ...nativeKey,
          name: "new",
          daily_usd_limit: 1.5,
          zdr_policy: "zdr",
          key: "sk-nano-new",
        })
      },
    ),
    http.patch(
      "https://nano-gpt.com/api/management/v1/api-keys/17",
      async ({ request }) => {
        expect(await request.json()).toEqual({ name: "renamed" })
        calls.push("patch")
        return HttpResponse.json({ ...nativeKey, name: "renamed" })
      },
    ),
    http.delete("https://nano-gpt.com/api/management/v1/api-keys/17", () => {
      calls.push("delete")
      return new HttpResponse(null, { status: 204 })
    }),
  )
  expect(
    (
      await createNanoGptKey(request, {
        name: "new",
        daily_usd_limit: 1.5,
        zdr_policy: "zdr",
      })
    ).secret,
  ).toBe("sk-nano-new")
  expect(
    (await updateNanoGptKey(request, "17", { name: "renamed" })).name,
  ).toBe("renamed")
  await deleteNanoGptKey(request, "17")
  expect(calls).toEqual(["create", "patch", "delete"])
})

it("refuses mismatched detail identities and masked create secrets", async () => {
  server.use(
    http.get("https://nano-gpt.com/api/management/v1/api-keys/17", () =>
      HttpResponse.json({ ...nativeKey, id: "18" }),
    ),
    http.post("https://nano-gpt.com/api/management/v1/api-keys", () =>
      HttpResponse.json({ ...nativeKey, key: "sk-nano-********" }),
    ),
  )
  await expect(fetchNanoGptKey(request, "17")).rejects.toThrow()
  await expect(createNanoGptKey(request, { name: "fixture" })).rejects.toThrow()
})

it("uses the independent inference secret even when a management token is also stored", async () => {
  server.use(
    http.post("https://api.nano-gpt.com/api/check-balance", ({ request }) => {
      expect(request.headers.get("Authorization")).toBe(
        "Bearer sk-nano-inference-fixture",
      )
      expect(request.credentials).toBe("omit")
      return HttpResponse.json({
        usd_balance: "1",
        nano_balance: "0",
        nanoDepositAddress: "nano_fixture",
      })
    }),
  )
  expect((await fetchNanoGptBalance(request)).usdBalance).toBe(1)
})

it("admits key-read tokens after a usage scope refusal but does not hide expired tokens", async () => {
  let inventoryReads = 0
  server.use(
    http.get("https://nano-gpt.com/api/management/v1/subscription/usage", () =>
      HttpResponse.json(
        { error: { code: "insufficient_scope" } },
        { status: 403 },
      ),
    ),
    http.get("https://nano-gpt.com/api/management/v1/api-keys", () => {
      inventoryReads++
      return HttpResponse.json({ data: [] })
    }),
  )
  await expect(
    verifyNanoGptManagementCredential(request),
  ).resolves.toBeUndefined()
  expect(inventoryReads).toBe(1)
  server.use(
    http.get("https://nano-gpt.com/api/management/v1/subscription/usage", () =>
      HttpResponse.json(
        { error: { code: "invalid_management_token" } },
        { status: 401 },
      ),
    ),
  )
  await expect(
    verifyNanoGptManagementCredential(request),
  ).rejects.toMatchObject({ statusCode: 401 })
  expect(inventoryReads).toBe(1)
})

it("rejects a returned management token even if it has surrounding whitespace", async () => {
  server.use(
    http.post("https://nano-gpt.com/api/management/v1/api-keys", () =>
      HttpResponse.json({ ...nativeKey, key: " sk-nano-mgmt-wrong-class " }),
    ),
  )
  await expect(createNanoGptKey(request, { name: "fixture" })).rejects.toThrow()
})
