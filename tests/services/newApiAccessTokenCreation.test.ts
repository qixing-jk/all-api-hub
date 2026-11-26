import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/creation"
import { createTokenIssuanceJournal } from "~/services/apiService/newApiFamily/accessTokens/issuanceJournal"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { createDeferred } from "~~/tests/test-utils/deferred"

const origin = "https://newapi-token.example"
const request = {
  baseUrl: origin,
  directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "dashboard-session",
    userId: 42,
  },
}
const draft = { name: "All API Hub", scopes: ["profile:read"], expires_at: 0 }
const proof = {
  proof_token: "operation-proof",
  scope: "access_token.generate" as const,
  method: "password",
  expires_at: Math.floor(Date.now() / 1000) + 300,
}

beforeEach(() => {
  server.use(
    http.get(`${origin}/api/user/self`, () =>
      HttpResponse.json({ success: true, data: { id: 42 } }),
    ),
    http.get(`${origin}/api/user/access_tokens/catalog`, () =>
      HttpResponse.json({
        success: true,
        data: {
          default_expiry_days: 30,
          max_tokens: 20,
          groups: [
            {
              group: "personal",
              resources: [
                {
                  resource: "profile",
                  label_key: "Profile",
                  actions: [{ action: "read", label_key: "View" }],
                },
                {
                  resource: "usage",
                  label_key: "Usage",
                  actions: [{ action: "read", label_key: "View" }],
                },
              ],
            },
          ],
        },
      }),
    ),
    http.get(`${origin}/api/verify/methods`, () =>
      HttpResponse.json({
        success: true,
        data: {
          scope: "access_token.generate",
          methods: [{ method: "password", available: true }],
          oauth_providers: [],
          password_encryption_enabled: false,
        },
      }),
    ),
  )
})

describe("New API management token creation", () => {
  it("reconciles an externally revoked retained token only after explicit recovery review", async () => {
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () =>
        HttpResponse.json({
          success: true,
          data: {
            token: "nap_retained",
            item: { id: 8, ...draft, expires_at: 123 },
          },
        }),
      ),
      http.get(`${origin}/api/user/access_tokens`, () =>
        HttpResponse.json({ success: true, data: { items: [] } }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    await flow.create(draft, { method: "password", password: "secret" })
    expect(await flow.reviewRecovery()).toBe(true)
    await expect(flow.verifyCreated()).rejects.toThrow(
      "ACCESS_TOKEN_NOT_CREATED",
    )
  })
  it("keeps a returned token for recovery but never accepts changed expiry or credential class", async () => {
    let issues = 0
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () => {
        issues++
        return HttpResponse.json({
          success: true,
          data: {
            token: "dashboard-bearer",
            item: { id: 7, ...draft, expires_at: 123 },
          },
        })
      }),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    expect(
      await flow.create(draft, { method: "password", password: "secret" }),
    ).toMatchObject({ verified: false, id: 7 })
    await expect(flow.verifyCreated()).rejects.toThrow(
      "ACCESS_TOKEN_GRANT_MISMATCH",
    )
    expect(issues).toBe(1)
  })

  it("renews its session without losing an issued token awaiting validation", async () => {
    let valid = false
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () =>
        HttpResponse.json({
          success: true,
          data: { token: "nap_retained", item: { id: 8, ...draft } },
        }),
      ),
      http.get(`${origin}/api/user/self`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer nap_retained" && !valid
          ? HttpResponse.error()
          : HttpResponse.json({ success: true, data: { id: 42 } }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    expect(
      (await flow.create(draft, { method: "password", password: "secret" }))
        .verified,
    ).toBe(false)
    const replacement = new NewApiAccessTokenCreation(
      { ...request, auth: { ...request.auth, accessToken: "fresh-session" } },
      "42",
    )
    flow.reconnect(replacement)
    valid = true
    expect(await flow.verifyCreated()).toEqual({
      token: "nap_retained",
      id: 8,
      verified: true,
    })
  })

  it("cancels a retained token check and permits another check without issuing again", async () => {
    let issues = 0
    let check: "failed" | "held" | "ready" = "failed"
    const started = createDeferred<AbortSignal>()
    const release = createDeferred<void>()
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () => {
        issues++
        return HttpResponse.json({
          success: true,
          data: { token: "nap_retained", item: { id: 8, ...draft } },
        })
      }),
      http.get(`${origin}/api/user/self`, async ({ request }) => {
        if (request.headers.get("Authorization") === "Bearer nap_retained") {
          if (check === "failed") return HttpResponse.error()
          if (check === "held") {
            started.resolve(request.signal)
            await release.promise
          }
        }
        return HttpResponse.json({ success: true, data: { id: 42 } })
      }),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    expect(
      await flow.create(draft, { method: "password", password: "secret" }),
    ).toMatchObject({ verified: false })
    check = "held"
    const cancelled = flow.verifyCreated().then(
      () => false,
      () => true,
    )
    try {
      const signal = await started.promise
      flow.cancelVerification()
      await expect.poll(() => signal.aborted, { timeout: 1000 }).toBe(true)
    } finally {
      release.resolve()
      expect(await cancelled).toBe(true)
    }
    check = "ready"
    expect(await flow.verifyCreated()).toEqual({
      token: "nap_retained",
      id: 8,
      verified: true,
    })
    expect(issues).toBe(1)
  })

  it("verifies the explicitly selected token id before revoking and confirms its absence", async () => {
    let revoked = false
    server.use(
      http.get(`${origin}/api/user/access_tokens`, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: revoked
              ? []
              : [
                  {
                    id: 7,
                    name: "Lost response",
                    created_at: 100,
                    expires_at: 0,
                    scopes: ["profile:read"],
                    token_hint: "nap_...abcd",
                  },
                ],
          },
        }),
      ),
      http.get(`${origin}/api/verify/methods`, ({ request }) =>
        HttpResponse.json({
          success: true,
          data: {
            scope: new URL(request.url).searchParams.get("scope"),
            methods: [{ method: "password", available: true }],
            oauth_providers: [],
            password_encryption_enabled: false,
          },
        }),
      ),
      http.post(`${origin}/api/verify`, async ({ request }) => {
        expect(await request.json()).toMatchObject({
          scope: "access_token.revoke",
          context: { token_id: 7 },
        })
        return HttpResponse.json({
          success: true,
          data: { ...proof, scope: "access_token.revoke" },
        })
      }),
      http.delete(`${origin}/api/user/access_tokens/7`, ({ request }) => {
        expect(request.headers.get("X-Security-Proof")).toBe(proof.proof_token)
        revoked = true
        return HttpResponse.json({ success: true, data: null })
      }),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    expect((await flow.loadRecovery()).items).toHaveLength(1)
    await flow.revokeToken(7, { method: "password", password: "secret" })
    expect((await flow.loadRecovery()).items).toHaveLength(0)
  })
  it("rejects an account grant without identity access before verification or issuance", async () => {
    const flow = new NewApiAccessTokenCreation(request, "42")
    await expect(
      flow.create(
        { ...draft, scopes: ["usage:read"] },
        { method: "password", password: "secret" },
      ),
    ).rejects.toThrow("ACCESS_TOKEN_PROFILE_REQUIRED")
  })
  it("does not treat a coded server error as proof that issuance was rolled back", async () => {
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () =>
        HttpResponse.json(
          {
            success: false,
            code: "AUTH_INTERNAL_ERROR",
            message: "Internal error",
          },
          { status: 500 },
        ),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    await expect(
      flow.create(draft, { method: "password", password: "secret" }),
    ).rejects.toThrow("ACCESS_TOKEN_CREATION_UNCERTAIN")
  })
  it("does not issue a token after the user cancels interactive verification", async () => {
    let release!: () => void
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let attempts = 0
    server.use(
      http.get(`${origin}/api/verify/methods`, () =>
        HttpResponse.json({
          success: true,
          data: {
            scope: "access_token.generate",
            methods: [{ method: "oauth", available: true }],
            oauth_providers: [{ slug: "github", name: "GitHub" }],
            password_encryption_enabled: false,
          },
        }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () => {
        attempts++
        return HttpResponse.json({ success: false })
      }),
    )
    const flow = new NewApiAccessTokenCreation(request, "42", {
      verify: async () => {
        started()
        await gate
        return { ...proof, method: "oauth" }
      },
    })
    const operation = flow.create(draft, {
      method: "oauth",
      provider: "github",
    })
    await ready
    flow.cancelVerification()
    release()
    await expect(operation).rejects.toThrow()
    expect(attempts).toBe(0)
  })
  it("checks requested read capabilities with only the newly issued token", async () => {
    const headers: string[] = []
    server.use(
      http.get(`${origin}/api/user/access_tokens/catalog`, () =>
        HttpResponse.json({
          success: true,
          data: {
            default_expiry_days: 30,
            max_tokens: 20,
            groups: [
              {
                group: "personal",
                resources: ["profile", "usage", "wallet", "api_key"].map(
                  (resource) => ({
                    resource,
                    label_key: resource,
                    actions: [{ action: "read", label_key: "Read" }],
                  }),
                ),
              },
            ],
          },
        }),
      ),
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () =>
        HttpResponse.json({
          success: true,
          data: {
            token: "nap_capabilities",
            item: {
              id: 9,
              ...draft,
              scopes: [
                "profile:read",
                "usage:read",
                "wallet:read",
                "api_key:read",
              ],
            },
          },
        }),
      ),
      ...["/api/log/self", "/api/subscription/self", "/api/token/"].map(
        (path) =>
          http.get(`${origin}${path}`, ({ request }) => {
            headers.push(request.headers.get("Authorization") ?? "")
            expect(request.headers.get("Cookie")).toBeNull()
            return HttpResponse.json({ success: true, data: [] })
          }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    expect(
      (
        await flow.create(
          {
            ...draft,
            scopes: [
              "profile:read",
              "usage:read",
              "wallet:read",
              "api_key:read",
            ],
          },
          { method: "password", password: "secret" },
        )
      ).verified,
    ).toBe(true)
    expect(headers).toEqual([
      "Bearer nap_capabilities",
      "Bearer nap_capabilities",
      "Bearer nap_capabilities",
    ])
  })
  it("keeps an uncertain issuance blocked after reopening the creator", async () => {
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          _name: string,
          _options: unknown,
          work: () => Promise<unknown>,
        ) => work(),
      },
    })
    let attempts = 0
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () => {
        attempts++
        return HttpResponse.error()
      }),
    )
    const first = new NewApiAccessTokenCreation(
      request,
      "42",
      undefined,
      createTokenIssuanceJournal(origin, "42"),
    )
    await expect(
      first.create(draft, { method: "password", password: "secret" }),
    ).rejects.toThrow("ACCESS_TOKEN_CREATION_UNCERTAIN")
    const reopened = new NewApiAccessTokenCreation(
      request,
      "42",
      undefined,
      createTokenIssuanceJournal(origin, "42"),
    )
    expect((await reopened.load()).creationUncertain).toBe(true)
    await expect(
      reopened.create(draft, { method: "password", password: "secret" }),
    ).rejects.toThrow("ACCESS_TOKEN_CREATION_UNCERTAIN")
    expect(attempts).toBe(1)
  })
  it("offers the backend's verification methods and linked providers without creating a token", async () => {
    const requests: string[] = []
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { id: 42 } }),
      ),
      http.get(`${origin}/api/user/access_tokens/catalog`, () =>
        HttpResponse.json({
          success: true,
          data: {
            default_expiry_days: 30,
            max_tokens: 20,
            groups: [
              {
                group: "personal",
                resources: [
                  {
                    resource: "profile",
                    label_key: "Profile",
                    actions: [{ action: "read", label_key: "View" }],
                  },
                ],
              },
            ],
          },
        }),
      ),
      http.get(`${origin}/api/verify/methods`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("scope")).toBe(
          "access_token.generate",
        )
        return HttpResponse.json({
          success: true,
          data: {
            scope: "access_token.generate",
            methods: [
              { method: "password", available: true },
              { method: "2fa", available: true },
              { method: "passkey", available: false, reason: "disabled" },
              { method: "oauth", available: true },
            ],
            oauth_providers: [
              { slug: "github", name: "GitHub" },
              { slug: "work-sso", name: "Work SSO" },
            ],
            password_encryption_enabled: false,
          },
        })
      }),
      http.post(`${origin}/api/user/access_tokens`, () => {
        requests.push("create")
        return HttpResponse.json({ success: false })
      }),
    )
    const creation = new NewApiAccessTokenCreation(
      {
        baseUrl: origin,
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "dashboard-session",
          userId: 42,
        },
      },
      "42",
    )
    const capabilities = await creation.load()
    expect(
      capabilities.verification.methods.map((method) => [
        method.method,
        method.available,
      ]),
    ).toEqual([
      ["password", true],
      ["2fa", true],
      ["passkey", false],
      ["oauth", true],
    ])
    expect(
      capabilities.verification.oauth_providers.map(
        (provider) => provider.slug,
      ),
    ).toEqual(["github", "work-sso"])
    expect(capabilities.catalog.default_expiry_days).toBe(30)
    expect(requests).toEqual([])
  })

  it("verifies the selected grant, creates once, and confirms the token without the browser session", async () => {
    const created: unknown[] = []
    const credentials: string[] = []
    server.use(
      http.post(`${origin}/api/verify`, async ({ request }) => {
        expect(await request.json()).toEqual({
          method: "password",
          scope: "access_token.generate",
          context: { scopes: ["profile:read"], expires_at: 0 },
          password: "correct password",
        })
        return HttpResponse.json({ success: true, data: proof })
      }),
      http.post(`${origin}/api/user/access_tokens`, async ({ request }) => {
        expect(request.headers.get("X-Security-Proof")).toBe("operation-proof")
        created.push(await request.json())
        return HttpResponse.json({
          success: true,
          data: {
            token: "nap_new-token",
            item: {
              id: 7,
              name: draft.name,
              scopes: draft.scopes,
              expires_at: 0,
            },
          },
        })
      }),
      http.get(`${origin}/api/user/self`, ({ request }) => {
        credentials.push(request.headers.get("Authorization") ?? "")
        expect(request.headers.get("Cookie")).toBeNull()
        return HttpResponse.json({ success: true, data: { id: 42 } })
      }),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    const result = await flow.create(draft, {
      method: "password",
      password: "correct password",
    })
    expect(result.token).toBe("nap_new-token")
    expect(result.verified).toBe(true)
    expect(created).toEqual([draft])
    expect(credentials.at(-1)).toBe("Bearer nap_new-token")
  })

  it("does not repeat issuance after an uncertain response", async () => {
    let attempts = 0
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () => {
        attempts++
        return HttpResponse.error()
      }),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    await expect(
      flow.create(draft, { method: "password", password: "secret" }),
    ).rejects.toThrow("ACCESS_TOKEN_CREATION_UNCERTAIN")
    await expect(
      flow.create(draft, { method: "password", password: "secret" }),
    ).rejects.toThrow("ACCESS_TOKEN_CREATION_UNCERTAIN")
    expect(attempts).toBe(1)
  })

  it("retains issued plaintext and retries validation without issuing another token", async () => {
    let attempts = 0
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () => {
        attempts++
        return HttpResponse.json({
          success: true,
          data: { token: "nap_retained", item: { id: 8, ...draft } },
        })
      }),
      http.get(`${origin}/api/user/self`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer nap_retained"
          ? HttpResponse.json(
              { success: false, code: "AUTH_UNAUTHORIZED" },
              { status: 401 },
            )
          : HttpResponse.json({ success: true, data: { id: 42 } }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    expect(
      await flow.create(draft, { method: "password", password: "secret" }),
    ).toEqual({ id: 8, token: "nap_retained", verified: false })
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { id: 42 } }),
      ),
    )
    expect(await flow.verifyCreated()).toEqual({
      id: 8,
      token: "nap_retained",
      verified: true,
    })
    expect(attempts).toBe(1)
  })

  it("rejects an account switch before verification or issuance", async () => {
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { id: 99 } }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    await expect(
      flow.create(draft, { method: "password", password: "secret" }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })
})
