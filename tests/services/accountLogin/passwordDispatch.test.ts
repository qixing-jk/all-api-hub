import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { SITE_TYPES } from "~/constants/siteType"
import {
  discoverAccountLoginMethods,
  loginAccount,
} from "~/services/accountLogin"
import { discardSub2ApiLoginCredential } from "~/services/apiAdapters/sub2api/auth/credentialCleanup"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

const deps = vi.hoisted(() => ({
  passwordContext: vi.fn(),
  oauthContext: vi.fn(),
  authenticate: vi.fn(),
  status: vi.fn(),
  settings: vi.fn(),
  verificationContext: vi.fn(),
  keys: new Map<string, CryptoKeyPair>(),
  keyWriteFailure: false,
}))
vi.mock("~/services/apiService/sub2api/auth/panelProofStore", () => ({
  readSub2ApiPanelSigningKey: async (origin: string) => deps.keys.get(origin),
  getSub2ApiPanelSigningKey: async (origin: string) => {
    if (deps.keyWriteFailure) throw new Error("Signing storage unavailable")
    if (!deps.keys.has(origin))
      deps.keys.set(
        origin,
        await crypto.subtle.generateKey(
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["sign", "verify"],
        ),
      )
    return deps.keys.get(origin)
  },
}))
vi.mock("~/services/accountLogin/browserPassword", () => ({
  createBrowserPasswordContext: deps.passwordContext,
}))
vi.mock("~/services/browserOAuth/browserOAuth", () => ({
  createBrowserOAuthContext: deps.oauthContext,
}))
vi.mock("~/services/browserLogin/browserLogin", () => ({
  createBrowserLoginContext: deps.verificationContext,
}))
vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { envelope: deps.status },
}))
vi.mock("~/services/apiService/sub2api/account/publicSettings", () => ({
  fetchSub2ApiPublicSettings: deps.settings,
}))

async function confirmPanelOrigin(origin: string) {
  deps.keys.set(
    origin,
    await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    ),
  )
}

describe("password login public dispatch", () => {
  it.each([{ accessToken: "" }, { accessToken: "access" }])(
    "does not dispatch cleanup without a complete issued family: %j",
    async (credential) => {
      const fetch = vi.fn()
      vi.stubGlobal("fetch", fetch)
      await discardSub2ApiLoginCredential(
        "https://failure-contract.example",
        credential,
      )
      expect(fetch).not.toHaveBeenCalled()
    },
  )
  it.each([undefined, { tencent_captcha_enabled: true }])(
    "retains native login when public settings do not enable the background flow: %j",
    async (settings) => {
      await confirmPanelOrigin("https://failure-contract.example")
      deps.settings.mockResolvedValue(settings)
      await expect(
        loginAccount(backgroundRequest(true)),
      ).resolves.toMatchObject({ status: "authenticated" })
      expect(deps.passwordContext).toHaveBeenCalledOnce()
    },
  )
  const backgroundRequest = (attended = false) => ({
    account: {
      site_type: SITE_TYPES.SUB2API,
      site_url: "https://failure-contract.example",
      account_info: { id: "17" },
      login: {
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        credentials: { username: "member@example.com", password: "secret" },
      },
    },
    methodId: ACCOUNT_LOGIN_METHODS.Password,
    requestId: "failure-contract",
    captureCredential: true,
    attended,
  })
  const issuedData = () => ({
    access_token: "issued-access",
    refresh_token: "issued-refresh",
    expires_in: 3600,
    user: { id: 17 },
  })

  it("reports uncertainty after a signed password request loses its response", async () => {
    await confirmPanelOrigin("https://failure-contract.example")
    const fetch = vi.fn(async () => {
      throw new TypeError("Connection lost after dispatch")
    })
    vi.stubGlobal("fetch", fetch)
    await expect(loginAccount(backgroundRequest())).resolves.toMatchObject({
      status: "uncertain",
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(deps.passwordContext).not.toHaveBeenCalled()
  })

  it("stops an attended acquisition when public settings disappear after CAPTCHA", async () => {
    await confirmPanelOrigin("https://failure-contract.example")
    deps.settings
      .mockResolvedValueOnce({ turnstile_enabled: true })
      .mockResolvedValueOnce(undefined)
    const fetch = vi.fn(async () =>
      Response.json({ code: 404 }, { status: 404 }),
    )
    vi.stubGlobal("fetch", fetch)
    deps.verificationContext.mockImplementation((flow) => ({
      authenticate: async () =>
        flow.execute({
          assertOrigin: vi.fn(),
          sendSiteAction: vi.fn().mockResolvedValue({
            success: true,
            status: "token_obtained",
            token: "captcha",
          }),
        }),
    }))
    await expect(loginAccount(backgroundRequest(true))).resolves.toMatchObject({
      status: "failed",
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(deps.passwordContext).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: "server failure",
      body: { code: 500 },
      http: 500,
      status: "uncertain",
      cleanup: false,
    },
    {
      name: "login rejection",
      body: { code: 401 },
      http: 401,
      status: "failed",
      cleanup: false,
    },
    {
      name: "invalid envelope",
      body: null,
      http: 200,
      status: "failed",
      cleanup: false,
    },
    {
      name: "missing access token",
      data: { access_token: "" },
      status: "uncertain",
      cleanup: false,
    },
    {
      name: "missing refresh token",
      data: { refresh_token: "" },
      status: "uncertain",
      cleanup: false,
    },
    {
      name: "invalid expiry",
      data: { expires_in: "3600" },
      status: "uncertain",
      cleanup: true,
    },
    {
      name: "nonpositive expiry",
      data: { expires_in: 0 },
      status: "uncertain",
      cleanup: true,
    },
    {
      name: "missing user",
      data: { user: null },
      status: "uncertain",
      cleanup: true,
    },
    {
      name: "identity endpoint rejected",
      self: { code: 401 },
      status: "uncertain",
      cleanup: true,
    },
    {
      name: "different verified identity",
      self: { code: 0, data: { id: 18 } },
      status: "identity_mismatch",
      cleanup: true,
    },
    {
      name: "second factor after issuance",
      data: { requires_2fa: true },
      status: "interaction_required",
      cleanup: true,
    },
  ])(
    "retains the acquisition outcome and revokes only an issued family: $name",
    async (scenario) => {
      await confirmPanelOrigin("https://failure-contract.example")
      const fetch = vi.fn(async (url: string, _init: RequestInit) => {
        if (url.endsWith("/auth/login"))
          return Response.json(
            "body" in scenario
              ? scenario.body
              : { code: 0, data: { ...issuedData(), ...scenario.data } },
            { status: "http" in scenario ? scenario.http : 200 },
          )
        if (url.endsWith("/auth/me"))
          return Response.json(scenario.self ?? { code: 0, data: { id: 17 } })
        return Response.json({ code: 0 })
      })
      vi.stubGlobal("fetch", fetch)
      const result = await loginAccount(backgroundRequest())
      expect(result.status).toBe(scenario.status)
      expect(result.credential).toBeUndefined()
      const logout = fetch.mock.calls.filter(([url]) =>
        url.endsWith("/auth/logout"),
      )
      expect(logout).toHaveLength(scenario.cleanup ? 1 : 0)
      if (scenario.cleanup) {
        const init = logout[0]![1]
        expect(init.credentials).toBe("omit")
        expect(new Headers(init.headers).get("authorization")).toBe(
          "Bearer issued-access",
        )
        expect(JSON.parse(await new Response(init.body).text())).toEqual({
          refresh_token: "issued-refresh",
        })
      }
      expect(deps.passwordContext).not.toHaveBeenCalled()
    },
  )

  it.each(["http", "envelope", "malformed"])(
    "reports uncertainty when issued-family cleanup is rejected: %s",
    async (failure) => {
      await confirmPanelOrigin("https://failure-contract.example")
      const fetch = vi.fn(async (url: string) => {
        if (url.endsWith("/auth/login"))
          return Response.json({
            code: 0,
            data: { ...issuedData(), user: { id: 18 } },
          })
        return Response.json(
          failure === "malformed"
            ? null
            : { code: failure === "envelope" ? 1 : 0 },
          { status: failure === "http" ? 500 : 200 },
        )
      })
      vi.stubGlobal("fetch", fetch)
      await expect(loginAccount(backgroundRequest())).resolves.toMatchObject({
        status: "uncertain",
        message: expect.any(String),
      })
      expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
      ])
    },
  )

  it.each(["storage unavailable", "robot challenge"])(
    "does not fall back to native password dispatch on a confirmed panel when settings fail: %s",
    async (failure) => {
      await confirmPanelOrigin("https://failure-contract.example")
      deps.settings.mockRejectedValue(
        failure === "robot challenge"
          ? new ApiError(
              "Challenge required",
              403,
              "/api/v1/settings/public",
              API_ERROR_CODES.ROBOT_CHALLENGE,
            )
          : new Error("Unavailable"),
      )
      await expect(loginAccount(backgroundRequest())).resolves.toMatchObject({
        status:
          failure === "robot challenge" ? "interaction_required" : "failed",
      })
      expect(deps.passwordContext).not.toHaveBeenCalled()
    },
  )

  it.each([false, true])(
    "requires attended verification without submitting a password when no CAPTCHA token is available: %s",
    async (attended) => {
      await confirmPanelOrigin("https://failure-contract.example")
      deps.settings.mockResolvedValue({ turnstile_enabled: true })
      const fetch = vi.fn(async (_url: string) =>
        Response.json({ code: 404 }, { status: 404 }),
      )
      vi.stubGlobal("fetch", fetch)
      deps.verificationContext.mockImplementation((flow) => ({
        authenticate: async () =>
          flow.execute({
            assertOrigin: vi.fn(),
            sendSiteAction: vi.fn().mockResolvedValue({
              success: true,
              status: "token_obtained",
              token: "",
            }),
          }),
      }))
      await expect(
        loginAccount(backgroundRequest(attended)),
      ).resolves.toMatchObject({ status: "interaction_required" })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch.mock.calls[0]?.[0]).toContain("/auth/security-challenge")
      expect(deps.passwordContext).not.toHaveBeenCalled()
    },
  )
  it("stops a matched unsigned PoW runtime failure without native login", async () => {
    deps.settings.mockResolvedValue({ turnstile_enabled: true })
    const hashing = vi
      .spyOn(crypto.subtle, "digest")
      .mockRejectedValue(new Error("Web Crypto unavailable"))
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/auth/refresh")
        ? Response.json({ code: 400 }, { status: 400 })
        : Response.json({
            code: 0,
            data: {
              provider: "local_pow",
              bits: 16,
              prefix: "fixture:",
              ticket: "spow1_fixture",
              expires_in: 60,
            },
          }),
    )
    vi.stubGlobal("fetch", fetch)
    try {
      await expect(
        loginAccount({
          account: {
            site_type: SITE_TYPES.SUB2API,
            site_url: "https://pow-runtime-failure.example",
            account_info: { id: "17" },
            login: {
              methodId: "password",
              credentials: {
                username: "member@example.com",
                password: "secret",
              },
            },
          },
          methodId: "password",
          requestId: "pow-runtime-failure",
          captureCredential: true,
        }),
      ).resolves.toMatchObject({
        status: "interaction_required",
        reason: "verification_required",
      })
      expect(deps.passwordContext).not.toHaveBeenCalled()
      expect(deps.verificationContext).not.toHaveBeenCalled()
      expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
        "/api/v1/auth/refresh",
        "/api/v1/auth/security-challenge",
      ])
    } finally {
      hashing.mockRestore()
    }
  })
  it("does not fall back to website login when confirmed panel proof cannot persist its key", async () => {
    deps.keyWriteFailure = true
    const hint = `e30.${btoa(JSON.stringify({ cnf: { jkt: "website-key" } }))}.signature`
    const fetch = vi.fn(async () =>
      Response.json(
        { code: 401, reason: "PANEL_PROOF_INVALID" },
        { status: 401 },
      ),
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      loginAccount({
        account: {
          site_type: SITE_TYPES.SUB2API,
          site_url: "https://proof-storage-failure.example",
          account_info: { id: "17", access_token: hint },
          login: {
            methodId: "password",
            credentials: { username: "member@example.com", password: "secret" },
          },
        },
        methodId: "password",
        requestId: "proof-storage-failure",
        captureCredential: true,
        attended: true,
      }),
    ).resolves.toMatchObject({ status: "failed" })
    expect(deps.passwordContext).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each(["settings", "probe", "challenge"])(
    "preserves native login when optional protocol discovery fails at %s",
    async (failure) => {
      const hint = `e30.${btoa(JSON.stringify({ cnf: { jkt: "unrelated-key" } }))}.signature`
      const error =
        failure === "challenge"
          ? new ApiError(
              "Verification required",
              403,
              "/api/v1/settings/public",
              API_ERROR_CODES.ROBOT_CHALLENGE,
            )
          : new Error("Optional discovery unavailable")
      if (failure !== "probe") deps.settings.mockRejectedValue(error)
      const fetch = vi.fn(async () => {
        throw error
      })
      vi.stubGlobal("fetch", fetch)
      await expect(
        loginAccount({
          account: {
            site_type: SITE_TYPES.SUB2API,
            site_url: "https://ordinary-discovery.example",
            account_info: { id: "17", access_token: hint },
            login: {
              methodId: "password",
              credentials: {
                username: "member@example.com",
                password: "secret",
              },
            },
          },
          methodId: "password",
          requestId: "optional-discovery",
          captureCredential: true,
          attended: true,
        }),
      ).resolves.toMatchObject({ status: "authenticated", identity: "17" })
      expect(deps.passwordContext).toHaveBeenCalledOnce()
      expect(deps.keys.has("https://ordinary-discovery.example")).toBe(false)
    },
  )
  it("does not take over native login based only on a generic token-binding claim", async () => {
    const hint = `e30.${btoa(JSON.stringify({ cnf: { jkt: "unrelated-key" } }))}.signature`
    const fetch = vi.fn(async (_url: string) =>
      Response.json({ code: 401, reason: "TOKEN_INVALID" }, { status: 401 }),
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      loginAccount({
        account: {
          site_type: SITE_TYPES.SUB2API,
          site_url: "https://ordinary-bound-hint.example",
          account_info: { id: "17", access_token: hint },
          login: {
            methodId: "password",
            credentials: { username: "member@example.com", password: "secret" },
          },
        },
        methodId: "password",
        requestId: "ordinary-bound-hint",
        captureCredential: true,
        attended: true,
      }),
    ).resolves.toMatchObject({ status: "authenticated", identity: "17" })
    expect(deps.passwordContext).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
    expect(
      fetch.mock.calls.every(([url]) => url.endsWith("/auth/refresh")),
    ).toBe(true)
    expect(deps.keys.has("https://ordinary-bound-hint.example")).toBe(false)
  })
  it("preserves the native credential-capture flow when no extension protocol is matched", async () => {
    deps.settings.mockResolvedValue({})
    const fetch = vi.fn(async (_url: string, _options: RequestInit) => {
      return Response.json({ code: 400 }, { status: 400 })
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      loginAccount({
        account: {
          site_type: SITE_TYPES.SUB2API,
          site_url: "https://ordinary-native.example",
          account_info: { id: "17" },
          login: {
            methodId: "password",
            credentials: { username: "member@example.com", password: "secret" },
          },
        },
        methodId: "password",
        requestId: "ordinary-native",
        captureCredential: true,
        attended: true,
      }),
    ).resolves.toMatchObject({ status: "authenticated", identity: "17" })
    expect(deps.passwordContext).toHaveBeenCalledOnce()
    expect(deps.verificationContext).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://ordinary-native.example/api/v1/auth/refresh",
    )
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body))).toEqual({
      refresh_token: "",
    })
    expect(fetch.mock.calls[0]?.[1].credentials).toBe("omit")
  })
  it("rejects a local challenge that expires during acquisition before any password is sent", async () => {
    deps.settings.mockResolvedValue({ turnstile_enabled: true })
    deps.keys.set(
      "https://expired-local-pow.example",
      await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign", "verify"],
      ),
    )
    let clock = Date.now()
    const time = vi.spyOn(Date, "now").mockImplementation(() => clock)
    const fetch = vi.fn(async () => {
      clock += 61000
      return Response.json({
        code: 0,
        data: {
          provider: "local_pow",
          bits: 16,
          prefix: "expiry-fixture:",
          ticket: "spow1_expired",
          expires_in: 60,
        },
      })
    })
    vi.stubGlobal("fetch", fetch)
    try {
      await expect(
        loginAccount({
          account: {
            site_type: SITE_TYPES.SUB2API,
            site_url: "https://expired-local-pow.example",
            account_info: { id: "17" },
            login: {
              methodId: "password",
              credentials: {
                username: "member@example.com",
                password: "secret",
              },
            },
          },
          methodId: "password",
          requestId: "expired-local-pow",
          captureCredential: true,
          attended: false,
        }),
      ).resolves.toMatchObject({ status: "interaction_required" })
      expect(fetch).toHaveBeenCalledOnce()
    } finally {
      time.mockRestore()
    }
  })
  it("cancels local computation without issuing credentials", async () => {
    deps.settings.mockResolvedValue({ turnstile_enabled: true })
    deps.keys.set(
      "https://cancel-local-pow.example",
      await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign", "verify"],
      ),
    )
    const controller = new AbortController()
    const original = crypto.subtle.digest.bind(crypto.subtle)
    const hashing = vi
      .spyOn(crypto.subtle, "digest")
      .mockImplementation((algorithm, bytes) => {
        if (
          new TextDecoder()
            .decode(bytes as Uint8Array<ArrayBuffer>)
            .startsWith("cancellation-fixture:")
        )
          controller.abort()
        return original(algorithm, bytes)
      })
    const fetch = vi.fn(async () =>
      Response.json({
        code: 0,
        data: {
          provider: "local_pow",
          bits: 16,
          prefix: "cancellation-fixture:",
          ticket: "spow1_cancelled",
          expires_in: 60,
        },
      }),
    )
    vi.stubGlobal("fetch", fetch)
    try {
      await expect(
        loginAccount({
          account: {
            site_type: SITE_TYPES.SUB2API,
            site_url: "https://cancel-local-pow.example",
            account_info: { id: "17" },
            login: {
              methodId: "password",
              credentials: {
                username: "member@example.com",
                password: "secret",
              },
            },
          },
          methodId: "password",
          requestId: "cancel-local-pow",
          captureCredential: true,
          attended: false,
          abortSignal: controller.signal,
        }),
      ).resolves.toMatchObject({ status: "cancelled" })
      expect(fetch).toHaveBeenCalledOnce()
      expect(deps.verificationContext).not.toHaveBeenCalled()
    } finally {
      hashing.mockRestore()
    }
  })
  it.each(["missing", "unknown", "unavailable", "network"])(
    "keeps native CAPTCHA login when unsigned local verification is unmatched (%s)",
    async (kind) => {
      deps.settings.mockResolvedValue({ turnstile_enabled: true })
      const fetch = vi.fn(async (url: string) => {
        if (url.endsWith("/auth/refresh"))
          return Response.json({ code: 400 }, { status: 400 })
        if (kind === "network") throw new TypeError("unavailable")
        if (kind === "missing")
          return Response.json({ code: 404 }, { status: 404 })
        if (kind === "unavailable")
          return Response.json({ code: 503 }, { status: 503 })
        return Response.json({ code: 0, data: { provider: "turnstile" } })
      })
      vi.stubGlobal("fetch", fetch)
      await loginAccount({
        account: {
          site_type: SITE_TYPES.SUB2API,
          site_url: "https://native-captcha.example",
          account_info: { id: "17" },
          login: {
            methodId: "password",
            credentials: { username: "member@example.com", password: "secret" },
          },
        },
        methodId: "password",
        requestId: "native-captcha",
        captureCredential: true,
      })
      expect(deps.passwordContext).toHaveBeenCalledOnce()
      expect(deps.verificationContext).not.toHaveBeenCalled()
      expect(deps.keys.size).toBe(0)
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://native-captcha.example/api/v1/auth/refresh",
        "https://native-captcha.example/api/v1/auth/security-challenge",
      ])
    },
  )
  it.each(
    [false, true].flatMap((signed) =>
      [{ bits: 17 }, { prefix: "" }, { expires_in: -1 }].map((invalid) => ({
        signed,
        invalid,
      })),
    ),
  )(
    "stops unsupported or expired local verification before sending credentials (%j)",
    async ({ signed, invalid }) => {
      deps.settings.mockResolvedValue({ turnstile_enabled: true })
      if (signed)
        deps.keys.set(
          "https://invalid-local-pow.example",
          await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["sign", "verify"],
          ),
        )
      const fetch = vi.fn(async (url: string) =>
        url.endsWith("/auth/refresh")
          ? Response.json({ code: 400 }, { status: 400 })
          : Response.json({
              code: 0,
              data: {
                provider: "local_pow",
                bits: 16,
                prefix: "fixture-prefix:",
                ticket: "spow1_fixture",
                expires_in: 60,
                ...invalid,
              },
            }),
      )
      vi.stubGlobal("fetch", fetch)
      await expect(
        loginAccount({
          account: {
            site_type: SITE_TYPES.SUB2API,
            site_url: "https://invalid-local-pow.example",
            account_info: { id: "17" },
            login: {
              methodId: "password",
              credentials: {
                username: "member@example.com",
                password: "secret",
              },
            },
          },
          methodId: "password",
          requestId: "invalid-local-pow",
          captureCredential: true,
          attended: false,
        }),
      ).resolves.toMatchObject({
        status: "interaction_required",
        reason: "verification_required",
      })
      expect(fetch).toHaveBeenCalledTimes(signed ? 1 : 2)
      expect(deps.verificationContext).not.toHaveBeenCalled()
    },
  )
  it.each([false, true])(
    "completes local proof-of-work independently of signing (%s)",
    async (signed) => {
      deps.settings.mockResolvedValue({ turnstile_enabled: true })
      if (signed)
        deps.keys.set(
          "https://local-pow.example",
          await crypto.subtle.generateKey(
            { name: "ECDSA", namedCurve: "P-256" },
            false,
            ["sign", "verify"],
          ),
        )
      const fetch = vi.fn(async (url: string, options: RequestInit) => {
        expect(new Headers(options.headers).has("X-Panel-Proof")).toBe(signed)
        if (url.endsWith("/auth/refresh"))
          return Response.json({ code: 400 }, { status: 400 })
        if (url.endsWith("/auth/security-challenge")) {
          expect(JSON.parse(await new Response(options.body).text())).toEqual({
            purpose: "login",
          })
          return Response.json({
            code: 0,
            data: {
              provider: "local_pow",
              bits: 16,
              prefix: "sub2api-test-0:",
              ticket: "spow1_fixture",
              expires_in: 60,
            },
          })
        }
        if (url.endsWith("/auth/login")) {
          const body = JSON.parse(await new Response(options.body).text())
          const nonce = body.turnstile_token.slice("spow1_fixture.".length)
          expect(body.turnstile_token).toMatch(/^spow1_fixture\.[0-9a-z]+$/)
          expect(
            createHash("sha256")
              .update(`sub2api-test-0:${nonce}`)
              .digest()
              .subarray(0, 2),
          ).toEqual(Buffer.from([0, 0]))
          return Response.json({
            code: 0,
            data: {
              access_token: "issued-access",
              refresh_token: "issued-refresh",
              expires_in: 3600,
              user: { id: 17 },
            },
          })
        }
        return Response.json({ code: 0, data: { id: 17 } })
      })
      vi.stubGlobal("fetch", fetch)
      await expect(
        loginAccount({
          account: {
            site_type: SITE_TYPES.SUB2API,
            site_url: "https://local-pow.example",
            account_info: { id: "17" },
            login: {
              methodId: "password",
              credentials: {
                username: "member@example.com",
                password: "secret",
              },
            },
          },
          methodId: "password",
          requestId: "local-pow",
          captureCredential: true,
          attended: false,
        }),
      ).resolves.toMatchObject({
        status: "authenticated",
        credential: { sub2apiAuth: { refreshToken: "issued-refresh" } },
      })
      expect(deps.verificationContext).not.toHaveBeenCalled()
      expect(deps.passwordContext).not.toHaveBeenCalled()
      expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
        ...(!signed ? ["/api/v1/auth/refresh"] : []),
        "/api/v1/auth/security-challenge",
        "/api/v1/auth/login",
        "/api/v1/auth/me",
      ])
      expect(deps.keys.has("https://local-pow.example")).toBe(signed)
    },
  )
  it("retains uncertainty when the CAPTCHA context cancels a dispatched background login", async () => {
    await confirmPanelOrigin("https://cancel-captcha-login.example")
    deps.settings.mockResolvedValue({ turnstile_enabled: true })
    const controller = new AbortController()
    deps.verificationContext.mockImplementation((flow) => ({
      authenticate: async () => {
        await flow.execute({
          assertOrigin: vi.fn(),
          abortSignal: controller.signal,
          sendSiteAction: vi.fn().mockResolvedValue({
            success: true,
            status: "token_obtained",
            token: "captcha",
          }),
        })
        return { status: "cancelled" }
      },
    }))
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/security-challenge"))
        return Response.json({ code: 404 }, { status: 404 })
      controller.abort()
      throw new DOMException("Connection aborted", "AbortError")
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      loginAccount({
        account: {
          site_type: SITE_TYPES.SUB2API,
          site_url: "https://cancel-captcha-login.example",
          account_info: { id: "17" },
          login: {
            methodId: "password",
            credentials: { username: "member@example.com", password: "secret" },
          },
        },
        methodId: "password",
        requestId: "cancel-captcha-login",
        captureCredential: true,
        attended: true,
        abortSignal: controller.signal,
      }),
    ).resolves.toMatchObject({ status: "uncertain" })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it("reports an unknown issued family when cancellation follows password dispatch", async () => {
    await confirmPanelOrigin("https://cancel-after-login.example")
    const controller = new AbortController()
    const fetch = vi.fn(async () => {
      controller.abort()
      throw new DOMException("Aborted after dispatch", "AbortError")
    })
    vi.stubGlobal("fetch", fetch)
    const result = await loginAccount({
      account: {
        site_type: SITE_TYPES.SUB2API,
        site_url: "https://cancel-after-login.example",
        account_info: { id: "17" },
        login: {
          methodId: "password",
          credentials: { username: "member@example.com", password: "secret" },
        },
      },
      methodId: "password",
      requestId: "cancel-after-login",
      captureCredential: true,
      attended: false,
      abortSignal: controller.signal,
    })
    expect(result.status).toBe("uncertain")
    expect(fetch).toHaveBeenCalledOnce()
    expect(deps.passwordContext).not.toHaveBeenCalled()
  })
  it("preserves native attended protection recovery before any password was submitted", async () => {
    deps.settings.mockRejectedValue(
      new ApiError(
        "Verification required",
        403,
        "/api/v1/settings/public",
        API_ERROR_CODES.ROBOT_CHALLENGE,
      ),
    )
    const result = await loginAccount({
      account: {
        site_type: SITE_TYPES.SUB2API,
        site_url: "https://protected-native.example",
        account_info: { id: "17" },
        login: {
          methodId: "password",
          credentials: { username: "member@example.com", password: "secret" },
        },
      },
      methodId: "password",
      requestId: "protected-native",
      captureCredential: true,
      attended: true,
    })
    expect(result.status).toBe("authenticated")
    expect(deps.passwordContext).toHaveBeenCalledOnce()
  })
  it("discovers proof middleware using an empty refresh probe before first credential acquisition", async () => {
    deps.settings.mockResolvedValue({ totp_enabled: true })
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/me"))
        return Response.json({ code: "INVALID_TOKEN" }, { status: 401 })
      if (url.endsWith("/auth/refresh"))
        return new Headers(init.headers).has("X-Panel-Proof")
          ? Response.json(
              { code: 401, reason: "TOKEN_INVALID" },
              { status: 401 },
            )
          : Response.json(
              { code: 401, reason: "PANEL_PROOF_INVALID" },
              { status: 401 },
            )
      return Response.json({ code: 0, data: { requires_2fa: true } })
    })
    vi.stubGlobal("fetch", fetch)
    const result = await loginAccount({
      account: {
        site_type: SITE_TYPES.SUB2API,
        site_url: "https://cold-proof.example",
        account_info: { id: "17" },
        login: {
          methodId: "password",
          credentials: { username: "member@example.com", password: "secret" },
        },
      },
      methodId: "password",
      requestId: "cold-proof",
      captureCredential: true,
      attended: true,
    })
    expect(result.status).toBe("interaction_required")
    expect(deps.passwordContext).not.toHaveBeenCalled()
    expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      "/api/v1/auth/refresh",
      "/api/v1/auth/refresh",
      "/api/v1/auth/login",
    ])
  })
  it("keeps acquisition in the extension for a bound token even before its first key exists", async () => {
    deps.settings.mockResolvedValue({ totp_enabled: true })
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/auth/login")
        ? Response.json({ code: 0, data: { requires_2fa: true } })
        : deps.keys.has("https://first-proof-login.example")
          ? Response.json({ code: 400 }, { status: 400 })
          : Response.json(
              { code: 401, reason: "PANEL_PROOF_INVALID" },
              { status: 401 },
            ),
    )
    vi.stubGlobal("fetch", fetch)
    const hint = `header.${btoa(JSON.stringify({ cnf: { jkt: "website-key" } }))}.signature`
    const result = await loginAccount({
      account: {
        site_type: SITE_TYPES.SUB2API,
        site_url: "https://first-proof-login.example",
        account_info: { id: "17", access_token: hint },
        login: {
          methodId: "password",
          credentials: { username: "member@example.com", password: "secret" },
        },
      },
      methodId: "password",
      requestId: "first-proof-login",
      captureCredential: true,
      attended: true,
    })
    expect(result.status).toBe("interaction_required")
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(deps.passwordContext).not.toHaveBeenCalled()
  })
  it("preserves native 2FA on ordinary Sub2API deployments before submitting credentials", async () => {
    deps.settings.mockResolvedValue({ totp_enabled: true })
    const fetch = vi.fn(async () =>
      Response.json({ code: 401 }, { status: 401 }),
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      loginAccount({
        account: {
          site_type: SITE_TYPES.SUB2API,
          site_url: "https://native-2fa.example",
          account_info: { id: "17" },
          login: {
            methodId: "password",
            credentials: { username: "member@example.com", password: "secret" },
          },
        },
        methodId: "password",
        requestId: "native-2fa",
        captureCredential: true,
        attended: true,
      }),
    ).resolves.toMatchObject({ status: "authenticated", identity: "17" })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({ credentials: "omit" }),
    )
    expect(deps.passwordContext).toHaveBeenCalledTimes(1)
  })
  it("cleans up an issued family when identity verification fails", async () => {
    await confirmPanelOrigin("https://wrong-identity.example")
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/login"))
        return Response.json({
          code: 0,
          data: {
            access_token: "issued-access",
            refresh_token: "issued-refresh",
            expires_in: 3600,
            user: { id: 18 },
          },
        })
      return Response.json({ code: 0 })
    })
    vi.stubGlobal("fetch", fetch)
    const result = await loginAccount({
      account: {
        site_type: SITE_TYPES.SUB2API,
        site_url: "https://wrong-identity.example",
        account_info: { id: "17" },
        login: {
          methodId: "password",
          credentials: { username: "member@example.com", password: "secret" },
        },
      },
      methodId: "password",
      requestId: "wrong-identity",
      captureCredential: true,
      attended: false,
    })
    expect(result.status).toBe("identity_mismatch")
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/auth/logout"))).toBe(
      true,
    )
  })
  afterEach(() => vi.unstubAllGlobals())
  it.each([false, true])(
    "captures renewable credentials without a page; protocol previously known: %s",
    async (known) => {
      if (known) await confirmPanelOrigin("https://background.example")
      const fetch = vi.fn(async (url: string) => {
        if (url.endsWith("/auth/refresh"))
          return deps.keys.has("https://background.example")
            ? Response.json({ code: 400 }, { status: 400 })
            : Response.json(
                { code: 401, reason: "PANEL_PROOF_INVALID" },
                { status: 401 },
              )
        if (url.endsWith("/auth/login"))
          return Response.json({
            code: 0,
            data: {
              access_token: "issued-access",
              refresh_token: "issued-refresh",
              expires_in: 3600,
              user: { id: 17 },
            },
          })
        return Response.json({ code: 0, data: { id: 17 } })
      })
      vi.stubGlobal("fetch", fetch)
      const result = await loginAccount({
        account: {
          site_type: SITE_TYPES.SUB2API,
          site_url: "https://background.example",
          account_info: { id: "17" },
          login: {
            methodId: ACCOUNT_LOGIN_METHODS.Password,
            credentials: { username: "alice@example.com", password: "secret" },
          },
        },
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        requestId: "background-login",
        captureCredential: true,
        attended: false,
      })
      expect(result).toMatchObject({
        status: "authenticated",
        identity: "17",
        credential: {
          accessToken: "issued-access",
          sub2apiAuth: { refreshToken: "issued-refresh" },
        },
      })
      expect(deps.passwordContext).not.toHaveBeenCalled()
      expect(deps.oauthContext).not.toHaveBeenCalled()
      expect(fetch).toHaveBeenCalledTimes(known ? 2 : 4)
    },
  )
  it("uses an attended page only for Turnstile and still issues the credential in the background", async () => {
    await confirmPanelOrigin("https://captcha.example")
    deps.settings.mockResolvedValue({ turnstile_enabled: true })
    const sendSiteAction = vi.fn().mockResolvedValue({
      success: true,
      status: "token_obtained",
      token: "captcha-proof",
    })
    let captured: unknown
    deps.verificationContext.mockImplementation((flow) => ({
      authenticate: async (input: unknown) => {
        const result = await flow.execute({
          input,
          assertOrigin: vi.fn(),
          sendSiteAction,
        })
        captured = await flow.captureCredential()
        return result
      },
    }))
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/auth/security-challenge"))
        return Response.json({ code: 404 }, { status: 404 })
      if (url.endsWith("/auth/login")) {
        expect(
          JSON.parse(await new Response(options.body).text()).turnstile_token,
        ).toBe("captcha-proof")
        return Response.json({
          code: 0,
          data: {
            access_token: "issued-access",
            refresh_token: "issued-refresh",
            expires_in: 3600,
            user: { id: 17 },
          },
        })
      }
      return Response.json({ code: 0, data: { id: 17 } })
    })
    vi.stubGlobal("fetch", fetch)
    const result = await loginAccount({
      account: {
        site_type: SITE_TYPES.SUB2API,
        site_url: "https://captcha.example",
        account_info: { id: "17" },
        login: {
          methodId: ACCOUNT_LOGIN_METHODS.Password,
          credentials: { username: "alice@example.com", password: "secret" },
        },
      },
      methodId: ACCOUNT_LOGIN_METHODS.Password,
      requestId: "captcha-login",
      captureCredential: true,
      attended: true,
    })
    expect(result).toMatchObject({
      status: "authenticated",
      credential: { accessToken: "issued-access" },
    })
    expect(deps.verificationContext).toHaveBeenCalledTimes(1)
    expect(deps.passwordContext).not.toHaveBeenCalled()
    expect(sendSiteAction).toHaveBeenCalledTimes(1)
    expect(captured).toEqual(result.credential)
  })
  it.each([SITE_TYPES.NEW_API, SITE_TYPES.SUB2API])(
    "never revives legacy secrets after canonical login was cleared (%s)",
    async (site_type) => {
      const account = {
        site_type,
        site_url: "https://gateway.example",
        account_info: { id: "17" },
        login: undefined,
        passwordAuth: { username: "alice", password: "obsolete-secret" },
      }
      await expect(
        loginAccount({
          account,
          methodId: ACCOUNT_LOGIN_METHODS.Password,
          requestId: "cleared",
        }),
      ).resolves.toEqual({ status: "failed" })
      expect(deps.passwordContext).not.toHaveBeenCalled()
    },
  )
  beforeEach(() => {
    deps.keyWriteFailure = false
    deps.keys.clear()
    vi.resetAllMocks()
    deps.passwordContext.mockReturnValue({ authenticate: deps.authenticate })
    deps.authenticate.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      evidence: {},
    })
    deps.status.mockResolvedValue({
      success: true,
      data: { system_name: "Agent Router" },
    })
    deps.settings.mockResolvedValue({})
  })

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.SUB2API, "agentrouter"] as const)(
    "discovers and executes the explicit %s password method with saved credentials",
    async (type) => {
      const account = {
        site_url:
          type === "agentrouter"
            ? "https://agentrouter.org"
            : "https://gateway.example",
        site_type: type === "agentrouter" ? SITE_TYPES.NEW_API : type,
        account_info: { id: "17" },
        login: {
          methodId: ACCOUNT_LOGIN_METHODS.Password,
          credentials: { username: "alice", password: "secret" },
        },
      }
      expect(await discoverAccountLoginMethods(account)).toContainEqual({
        id: "password",
        label: "Password",
      })
      await expect(
        loginAccount({
          account,
          methodId: ACCOUNT_LOGIN_METHODS.Password,
          requestId: "p1",
        }),
      ).resolves.toMatchObject({ status: "authenticated", identity: "17" })
      expect(deps.passwordContext).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: { username: "alice", password: "secret" },
        }),
      )
      expect(deps.oauthContext).not.toHaveBeenCalled()
    },
  )

  it("does not open a browser or choose OAuth when password credentials are missing", async () => {
    expect(
      await loginAccount({
        account: {
          site_url: "https://gateway.example",
          site_type: SITE_TYPES.NEW_API,
          account_info: { id: "17" },
        },
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        requestId: "p1",
      }),
    ).toEqual({ status: "failed" })
    expect(deps.passwordContext).not.toHaveBeenCalled()
    expect(deps.oauthContext).not.toHaveBeenCalled()
  })
})
