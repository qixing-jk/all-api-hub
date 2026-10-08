import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  OMNIROUTE_ACCESS_TOKEN_PREFIX,
  resolveOmniRouteBuiltinProvider,
} from "~/constants/omniroute"
import { SITE_TYPES } from "~/constants/siteType"
import {
  checkValidOmniRouteConfig,
  fetchOmniRouteChannelSecretKey,
  prepareChannelFormData,
  resolveOmniRouteChannelTarget,
  validateOmniRouteCredential,
} from "~/services/managedSites/providers/omniroute"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

const mocks = vi.hoisted(() => ({ getPreferences: vi.fn() }))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: mocks.getPreferences,
    },
  }
})

const BASE_URL = "http://omniroute.example.invalid:20128"

describe("OmniRoute credential validation", () => {
  beforeEach(() => {
    server.resetHandlers()
    mocks.getPreferences.mockReset()
  })

  it.each(["opaque-access-token", "other-prefix-token"])(
    "validates token %s without a format check or exchange",
    async (credential) => {
      const request = vi.fn(({ request }: { request: Request }) => {
        expect(request.headers.get("Authorization")).toBe(
          `Bearer ${credential}`,
        )
        return HttpResponse.json({
          authenticated: true,
          viaAccessToken: true,
          scope: "admin",
          connections: [],
        })
      })
      const exchange = vi.fn(() => HttpResponse.json({}, { status: 500 }))
      server.use(
        http.get(`${BASE_URL}/api/cli/whoami`, request),
        http.get(`${BASE_URL}/api/providers`, request),
        http.post(`${BASE_URL}/api/cli/connect`, exchange),
      )
      const result = await validateOmniRouteCredential({
        baseUrl: BASE_URL,
        credential,
      })
      expect(result).toEqual({
        status: "valid",
        token: credential,
        scope: "admin",
      })
      expect(request).toHaveBeenCalledTimes(2)
      expect(exchange).not.toHaveBeenCalled()
    },
  )

  it("accepts an admin-scoped access token", async () => {
    server.use(
      http.get(`${BASE_URL}/api/cli/whoami`, () =>
        HttpResponse.json({
          authenticated: true,
          viaAccessToken: true,
          scope: "admin",
        }),
      ),
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({ connections: [], total: 0 }),
      ),
    )

    const result = await validateOmniRouteCredential({
      baseUrl: `${BASE_URL}/`,
      credential: `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_example`,
    })

    expect(result).toEqual({
      status: "valid",
      token: `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_example`,
      scope: "admin",
    })
  })

  it.each([
    [401, "invalid-credential"],
    [403, "insufficient-scope"],
    [503, "unreachable"],
  ])(
    "classifies token failure %s and redacts the credential",
    async (status, expected) => {
      const credential = "oma_live_secret"
      server.use(
        http.get(`${BASE_URL}/api/cli/whoami`, () =>
          HttpResponse.json(
            {
              error:
                status === 403
                  ? `Access token scope 'read' is insufficient; 'admin' required. ${credential}`
                  : `failed ${credential}`,
            },
            { status },
          ),
        ),
      )
      const result = await validateOmniRouteCredential({
        baseUrl: BASE_URL,
        credential,
      })
      expect(result.status).toBe(expected)
      expect(JSON.stringify(result)).not.toContain(credential)
    },
  )

  it("reports an under-scoped token without calling the exchange route", async () => {
    let exchangeCalls = 0
    server.use(
      http.post(`${BASE_URL}/api/cli/connect`, () => {
        exchangeCalls += 1
        return HttpResponse.json({}, { status: 500 })
      }),
      http.get(`${BASE_URL}/api/cli/whoami`, () =>
        HttpResponse.json({
          authenticated: true,
          viaAccessToken: true,
          scope: "write",
        }),
      ),
    )

    const result = await validateOmniRouteCredential({
      baseUrl: BASE_URL,
      credential: `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_readonly`,
    })

    expect(result).toEqual({
      status: "insufficient-scope",
      have: "write",
      need: "admin",
      message: "",
    })
    // An `oma_` token is never exchanged for another token.
    expect(exchangeCalls).toBe(0)
  })

  it("keeps a scope shortfall reported by a write route distinct", async () => {
    server.use(
      http.get(`${BASE_URL}/api/cli/whoami`, () =>
        HttpResponse.json({
          authenticated: true,
          viaAccessToken: true,
          scope: "admin",
        }),
      ),
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json(
          {
            error:
              "Access token scope 'read' is insufficient; 'admin' required.",
          },
          { status: 403 },
        ),
      ),
    )

    const result = await validateOmniRouteCredential({
      baseUrl: BASE_URL,
      credential: `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_stale`,
    })

    expect(result).toMatchObject({
      status: "insufficient-scope",
      have: "read",
      need: "admin",
    })
  })
})

describe("OmniRoute saved config checks", () => {
  beforeEach(() => {
    server.resetHandlers()
    mocks.getPreferences.mockReset()
  })

  it("is false without a complete config", async () => {
    mocks.getPreferences.mockResolvedValue({
      omniroute: { baseUrl: "", token: "" },
    })
    await expect(checkValidOmniRouteConfig()).resolves.toBe(false)
  })

  it("returns false when preferences cannot be read", async () => {
    mocks.getPreferences.mockRejectedValue(new Error("storage unavailable"))
    await expect(checkValidOmniRouteConfig()).resolves.toBe(false)
  })

  it("is true when the saved admin token authenticates", async () => {
    mocks.getPreferences.mockResolvedValue({
      omniroute: {
        baseUrl: BASE_URL,
        token: `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_saved`,
      },
    })
    server.use(
      http.get(`${BASE_URL}/api/cli/whoami`, () =>
        HttpResponse.json({
          authenticated: true,
          viaAccessToken: true,
          scope: "admin",
        }),
      ),
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({ connections: [], total: 0 }),
      ),
    )

    await expect(checkValidOmniRouteConfig()).resolves.toBe(true)
  })

  it("is false when the saved token is under-scoped", async () => {
    mocks.getPreferences.mockResolvedValue({
      omniroute: {
        baseUrl: BASE_URL,
        token: `${OMNIROUTE_ACCESS_TOKEN_PREFIX}live_write`,
      },
    })
    server.use(
      http.get(`${BASE_URL}/api/cli/whoami`, () =>
        HttpResponse.json({
          authenticated: true,
          viaAccessToken: true,
          scope: "write",
        }),
      ),
    )

    await expect(checkValidOmniRouteConfig()).resolves.toBe(false)
  })
})

describe("OmniRoute import prefill", () => {
  it("keeps a recognised first-party endpoint on its own provider", () => {
    expect(
      resolveOmniRouteChannelTarget({ baseUrl: "https://api.openai.com/v1/" }),
    ).toEqual({ provider: "openai", baseUrl: "" })
    expect(
      resolveOmniRouteChannelTarget({ baseUrl: "https://api.deepseek.com" }),
    ).toEqual({ provider: "deepseek", baseUrl: "" })
  })

  it("falls back to the OpenAI-compatible provider with a base URL override", () => {
    expect(
      resolveOmniRouteChannelTarget({
        baseUrl: "https://relay.example.invalid/v1",
      }),
    ).toEqual({
      provider: "openai",
      baseUrl: "https://relay.example.invalid/v1",
    })
  })

  it("uses the declaring protocol's provider when the address is unknown", () => {
    expect(
      resolveOmniRouteChannelTarget({
        baseUrl: "https://anthropic-relay.example.invalid",
        apiType: API_TYPES.ANTHROPIC,
      }),
    ).toEqual({
      provider: "anthropic",
      baseUrl: "https://anthropic-relay.example.invalid",
    })
    expect(
      resolveOmniRouteChannelTarget({
        baseUrl: "https://gemini-relay.example.invalid",
        apiType: API_TYPES.GOOGLE,
      }),
    ).toEqual({
      provider: "gemini",
      baseUrl: "https://gemini-relay.example.invalid",
    })
  })

  it("carries no per-channel model list into the draft", async () => {
    const draft = await prepareChannelFormData({
      name: "Imported (auto)",
      baseUrl: "https://relay.example.invalid/v1",
      apiKey: "sk-source",
      modelHints: ["gpt-example"],
    })

    expect(draft).toEqual({
      name: "Imported (auto)",
      type: "openai",
      key: "sk-source",
      base_url: "https://relay.example.invalid/v1",
      models: [],
      groups: [],
      enabled: true,
    })
  })
})

describe("OmniRoute channel secret read", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("reads the plaintext credential from the client route", async () => {
    const readPaths: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers/client`, ({ request }) => {
        readPaths.push(new URL(request.url).pathname)
        return HttpResponse.json({
          connections: [
            { id: "conn-1", provider: "openai", apiKey: "sk-plain" },
          ],
        })
      }),
    )

    await expect(
      fetchOmniRouteChannelSecretKey(
        { baseUrl: BASE_URL, token: "oma_live_example" },
        "conn-1",
      ),
    ).resolves.toBe("sk-plain")
    expect(readPaths).toEqual(["/api/providers/client"])
  })

  it("fails when the deployment stops returning a readable credential", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/client`, () =>
        HttpResponse.json({
          connections: [
            { id: "conn-1", provider: "openai", apiKey: "sk-a****z" },
          ],
        }),
      ),
    )

    await expect(
      fetchOmniRouteChannelSecretKey(
        { baseUrl: BASE_URL, token: "oma_live_example" },
        "conn-1",
      ),
    ).rejects.toThrow(/readable channel credential/)
  })
})

describe("OmniRoute site registration facts", () => {
  it("resolves the built-in provider catalogue deterministically", () => {
    expect(resolveOmniRouteBuiltinProvider("https://api.openai.com/v1")).toBe(
      "openai",
    )
    expect(
      resolveOmniRouteBuiltinProvider("https://relay.example.invalid/v1"),
    ).toBeNull()
  })

  it("keeps the runtime config principal stable for the repair receipt", async () => {
    const { getManagedSiteRuntimePrincipal } = await import(
      "~/services/managedSites/configuration/runtimeConfig"
    )
    expect(
      getManagedSiteRuntimePrincipal({
        siteType: SITE_TYPES.OMNIROUTE,
        config: { baseUrl: BASE_URL, token: "oma_live_example" },
      }),
    ).toBe("admin")
  })

  it("rejects a blank base URL before any request", async () => {
    await expect(
      validateOmniRouteCredential({ baseUrl: "  ", credential: "oma_x" }),
    ).resolves.toMatchObject({ status: "invalid-credential" })
  })
})
