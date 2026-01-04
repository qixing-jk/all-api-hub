import { beforeEach, describe, expect, it, vi } from "vitest"

import { importToCliProxy } from "~/services/cliProxyService"
import { userPreferences } from "~/services/userPreferences"

describe("cliProxyService.importToCliProxy", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("includes models in the provider payload (PUT) when provided", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      cliProxy: {
        baseUrl: "http://localhost:8317/v0/management",
        managementKey: "k",
      },
    } as any)

    const fetchMock = vi.fn().mockImplementation((input: any, init?: any) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url.endsWith("/openai-compatibility") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.endsWith("/openai-compatibility") && method === "PUT") {
        return Promise.resolve(new Response("", { status: 200 }))
      }

      return Promise.resolve(new Response("", { status: 500 }))
    })

    vi.stubGlobal("fetch", fetchMock as any)

    const result = await importToCliProxy({
      account: {
        id: "acc",
        name: "openrouter",
        baseUrl: "https://openrouter.ai/api",
      } as any,
      token: { id: "tok", key: "sk" } as any,
      providerName: "openrouter",
      providerBaseUrl: "https://openrouter.ai/api/v1",
      proxyUrl: "",
      models: [{ name: "m", alias: "a" }],
    })

    expect(result.success).toBe(true)

    const putCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PUT",
    )
    expect(putCall).toBeTruthy()

    const putInit = putCall?.[1]
    const payload = JSON.parse(putInit.body) as any[]

    expect(payload[0]).toMatchObject({
      name: "openrouter",
      "base-url": "https://openrouter.ai/api/v1",
      "api-key-entries": [{ "api-key": "sk", "proxy-url": "" }],
      models: [{ name: "m", alias: "a" }],
      headers: {},
    })
  })

  it("keeps existing provider models when models are omitted", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      cliProxy: {
        baseUrl: "http://localhost:8317/v0/management",
        managementKey: "k",
      },
    } as any)

    const existingProvider = {
      name: "openrouter",
      "base-url": "https://openrouter.ai/api/v1",
      "api-key-entries": [{ "api-key": "sk-old", "proxy-url": "" }],
      models: [{ name: "existing", alias: "kept" }],
      headers: { "X-Provider": "openrouter" },
    }

    const fetchMock = vi.fn().mockImplementation((input: any, init?: any) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url.endsWith("/openai-compatibility") && method === "GET") {
        return Promise.resolve(
          new Response(JSON.stringify([existingProvider]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.endsWith("/openai-compatibility") && method === "PATCH") {
        return Promise.resolve(new Response("", { status: 200 }))
      }

      return Promise.resolve(new Response("", { status: 500 }))
    })

    vi.stubGlobal("fetch", fetchMock as any)

    const result = await importToCliProxy({
      account: {
        id: "acc",
        name: "openrouter",
        baseUrl: "https://openrouter.ai/api",
      } as any,
      token: { id: "tok", key: "sk-new" } as any,
      providerName: "openrouter",
      providerBaseUrl: "https://openrouter.ai/api/v1",
      proxyUrl: "",
    })

    expect(result.success).toBe(true)

    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    )
    expect(patchCall).toBeTruthy()

    const patchInit = patchCall?.[1]
    const payload = JSON.parse(patchInit.body) as any

    expect(payload.value.models).toEqual([{ name: "existing", alias: "kept" }])
  })
})
