import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  checkValidGptLoadConfig,
  fetchGptLoadChannelSecretKey,
  prepareGptLoadChannelFormData,
  resolveGptLoadChannelTarget,
  validateGptLoadCredential,
} from "~/services/managedSites/providers/gptLoad"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  DEFAULT_GPT_LOAD_CONFIG,
  normalizeGptLoadBaseUrl,
} from "~/types/gptLoadConfig"
import { server } from "~~/tests/msw/server"

const BASE_URL = "https://gpt-load.example.invalid"
afterEach(() => vi.restoreAllMocks())

const sessionOk = () =>
  HttpResponse.json({
    code: 0,
    message: "ok",
    data: { authenticated: true, principal_type: "admin" },
  })

describe("gpt-load config normalization", () => {
  it("trims trailing slashes and defaults", () => {
    expect(
      normalizeGptLoadBaseUrl(" https://gpt-load.example.invalid/// "),
    ).toBe("https://gpt-load.example.invalid")
    expect(DEFAULT_GPT_LOAD_CONFIG).toEqual({
      baseUrl: "",
      managementKey: "",
    })
  })
})

describe("validateGptLoadCredential", () => {
  it("reports forbidden credentials without retrying", async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/session`, () =>
        HttpResponse.json({ message: "forbidden" }, { status: 403 }),
      ),
    )
    expect(
      await validateGptLoadCredential({
        baseUrl: BASE_URL,
        credential: "fake",
      }),
    ).toMatchObject({ status: "insufficient-privilege" })
  })

  it("validates saved config and contains storage failures", async () => {
    const prefs = vi.spyOn(userPreferences, "getPreferences")
    prefs.mockResolvedValue({
      gptLoad: { baseUrl: "", managementKey: "" },
    } as any)
    expect(await checkValidGptLoadConfig()).toBe(false)
    prefs.mockResolvedValue({
      gptLoad: { baseUrl: BASE_URL, managementKey: "fake" },
    } as any)
    server.use(
      http.get(`${BASE_URL}/api/auth/session`, sessionOk),
      http.get(`${BASE_URL}/api/groups`, () =>
        HttpResponse.json({ code: 0, data: { items: [] } }),
      ),
    )
    expect(await checkValidGptLoadConfig()).toBe(true)
    prefs.mockRejectedValue(new Error("storage unavailable"))
    expect(await checkValidGptLoadConfig()).toBe(false)
  })

  it("rejects empty and unrevealable pools instead of guessing a key", async () => {
    const config = { baseUrl: BASE_URL, managementKey: "fake" }
    await expect(fetchGptLoadChannelSecretKey(config, "NaN")).rejects.toThrow(
      /Invalid/,
    )
    server.use(
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        HttpResponse.json({ code: 0, data: { items: [] } }),
      ),
    )
    await expect(fetchGptLoadChannelSecretKey(config, 1)).rejects.toThrow(
      /no credentials/,
    )
    server.use(
      http.get(`${BASE_URL}/api/groups/1/credentials`, () =>
        HttpResponse.json({
          code: 0,
          data: { items: [{ credential_id: 11 }] },
        }),
      ),
      http.post(
        `${BASE_URL}/api/groups/1/credentials/11/reveal`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    )
    await expect(fetchGptLoadChannelSecretKey(config, 1)).rejects.toThrow(
      /readable/,
    )
  })
  beforeEach(() => {
    server.resetHandlers()
  })

  it("requires both the address and the key", async () => {
    expect(
      await validateGptLoadCredential({ baseUrl: "", credential: "" }),
    ).toMatchObject({ status: "invalid-credential" })
  })

  it("accepts the admin principal and confirms the group read", async () => {
    let sessionCalls = 0
    let groupCalls = 0
    server.use(
      http.get(`${BASE_URL}/api/auth/session`, () => {
        sessionCalls += 1
        return sessionOk()
      }),
      http.get(`${BASE_URL}/api/groups`, () => {
        groupCalls += 1
        return HttpResponse.json({
          code: 0,
          message: "ok",
          data: { items: [] },
        })
      }),
    )

    const result = await validateGptLoadCredential({
      baseUrl: `${BASE_URL}/`,
      credential: "auth-key",
    })

    expect(result).toMatchObject({ status: "valid", principalType: "admin" })
    // Validation is a single session check plus a single group read; it never
    // retries a rejected key (the gateway locks the peer IP after 5 failures).
    expect(sessionCalls).toBe(1)
    expect(groupCalls).toBe(1)
  })

  it("rejects a downstream access key without issuing a group read", async () => {
    let groupCalls = 0
    server.use(
      http.get(`${BASE_URL}/api/auth/session`, () =>
        HttpResponse.json({
          code: 0,
          message: "ok",
          data: { authenticated: true, principal_type: "access_key" },
        }),
      ),
      http.get(`${BASE_URL}/api/groups`, () => {
        groupCalls += 1
        return HttpResponse.json({
          code: 0,
          message: "ok",
          data: { items: [] },
        })
      }),
    )

    const result = await validateGptLoadCredential({
      baseUrl: BASE_URL,
      credential: "sk-gl-access-key",
    })

    expect(result.status).toBe("insufficient-privilege")
    expect(groupCalls).toBe(0)
  })

  it("reports a rejected key as invalid-credential", async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/session`, () =>
        HttpResponse.json(
          { code: "UNAUTHORIZED", message: "无效的授权密钥" },
          { status: 401 },
        ),
      ),
    )

    const result = await validateGptLoadCredential({
      baseUrl: BASE_URL,
      credential: "bad",
    })
    expect(result.status).toBe("invalid-credential")
  })

  it("reports an unreachable deployment", async () => {
    server.use(
      http.get(
        `${BASE_URL}/api/auth/session`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    )

    const result = await validateGptLoadCredential({
      baseUrl: BASE_URL,
      credential: "auth-key",
    })
    expect(result.status).toBe("unreachable")
  })
})

describe("resolveGptLoadChannelTarget", () => {
  it("maps a first-party endpoint to its channel id without an override", () => {
    expect(
      resolveGptLoadChannelTarget({ baseUrl: "https://api.deepseek.com/v1" }),
    ).toEqual({ channelId: "deepseek", baseUrl: "" })
  })

  it("keeps the compatible channel and overrides the address for a relay", () => {
    expect(
      resolveGptLoadChannelTarget({
        baseUrl: "https://relay.example.invalid/v1",
      }),
    ).toEqual({
      channelId: "openai_compatible",
      baseUrl: "https://relay.example.invalid/v1",
    })
  })

  it("picks the most specific first-party root", () => {
    expect(
      resolveGptLoadChannelTarget({
        baseUrl: "https://api.openai.com/v1/",
      }),
    ).toEqual({ channelId: "openai", baseUrl: "" })
  })
})

describe("prepareGptLoadChannelFormData", () => {
  it("prefills the native editor with the resolved target", async () => {
    const draft = await prepareGptLoadChannelFormData({
      name: "Imported",
      baseUrl: "https://relay.example.invalid/v1",
      apiKey: "sk-example",
      modelHints: [],
    })

    expect(draft).toMatchObject({
      name: "Imported",
      type: "openai_compatible",
      key: "sk-example",
      base_url: "https://relay.example.invalid/v1",
      enabled: true,
    })
  })

  it("leaves the address empty for a known provider", async () => {
    const draft = await prepareGptLoadChannelFormData({
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-example",
      modelHints: [],
    })
    expect(draft.type).toBe("deepseek")
    expect(draft.base_url).toBe("")
  })
})
