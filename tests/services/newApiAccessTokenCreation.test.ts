import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/creation"
import { createTokenIssuanceJournal } from "~/services/apiService/newApiFamily/accessTokens/issuanceJournal"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
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
  it.each([
    ["another account", request, "7"],
    ["another site", { ...request, baseUrl: "https://other.example" }, "42"],
  ] as const)(
    "does not replace the verified dashboard session with %s",
    (_case, replacement, identity) => {
      const flow = new NewApiAccessTokenCreation(request, "42")
      const other = new NewApiAccessTokenCreation(replacement, identity)
      expect(() => flow.reconnect(other)).toThrow("ACCOUNT_IDENTITY_MISMATCH")
    },
  )

  it("cannot validate a token before any issuance", async () => {
    const flow = new NewApiAccessTokenCreation(request, "42")
    await expect(flow.verifyCreated()).rejects.toThrow(
      "ACCESS_TOKEN_NOT_CREATED",
    )
    await expect(flow.reviewRecovery()).resolves.toBe(false)
  })

  it("retries issuance after an explicit rejection but requires reconciliation after a payload without a token", async () => {
    const origin = "https://newapi-token.example"
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          _options: LockOptions,
          work: (lock: object) => Promise<unknown>,
        ) => work({ name }),
      },
    })
    let issued = 0
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, () => {
        issued++
        return issued === 1
          ? HttpResponse.json(
              {
                success: false,
                code: "ACCESS_TOKEN_LIMIT",
                message: "Limit reached",
              },
              { status: 409 },
            )
          : HttpResponse.json({ success: true, data: { item: { id: 3 } } })
      }),
    )
    const journal = createTokenIssuanceJournal(origin, "retry-test")
    const flow = new NewApiAccessTokenCreation(
      request,
      "42",
      undefined,
      journal,
    )
    const input = { method: "password", password: "secret" } as const
    await expect(flow.create(draft, input)).rejects.toMatchObject({
      upstreamCode: "ACCESS_TOKEN_LIMIT",
    })
    expect(await journal.pending()).toBeUndefined()
    await expect(flow.create(draft, input)).rejects.toThrow(
      "ACCESS_TOKEN_CREATION_UNCERTAIN",
    )
    expect(await journal.pending()).toMatchObject({ uncertain: true })
    await expect(flow.create(draft, input)).rejects.toThrow(
      "ACCESS_TOKEN_CREATION_UNCERTAIN",
    )
    expect(issued).toBe(2)
  })

  it.each([
    ["too-short expiry", { expires_at: 1 }, "ACCESS_TOKEN_EXPIRY_INVALID"],
    [
      "scope absent from the site's catalog",
      { scopes: ["profile:read", "admin:write"] },
      "ACCESS_TOKEN_SCOPE_FORBIDDEN",
    ],
  ] as const)(
    "rejects a %s before requesting proof or issuing a token",
    async (_reason, change, error) => {
      const verify = vi.fn(() => HttpResponse.error())
      const issue = vi.fn(() => HttpResponse.error())
      server.use(
        http.post(`${origin}/api/verify`, verify),
        http.post(`${origin}/api/user/access_tokens`, issue),
      )
      const flow = new NewApiAccessTokenCreation(request, "42")
      await expect(
        flow.create(
          {
            ...draft,
            ...change,
            scopes: "scopes" in change ? [...change.scopes] : draft.scopes,
          },
          { method: "password", password: "secret" },
        ),
      ).rejects.toThrow(error)
      expect(verify).not.toHaveBeenCalled()
      expect(issue).not.toHaveBeenCalled()
    },
  )

  it.each([
    ["another operation", { scope: "access_token.revoke" }],
    ["another method", { method: "2fa" }],
    ["a past deadline", { expires_at: 1 }],
  ] as const)(
    "never issues when the provider returns proof for %s",
    async (_reason, change) => {
      const issue = vi.fn(() => HttpResponse.error())
      server.use(
        http.post(`${origin}/api/verify`, () =>
          HttpResponse.json({ success: true, data: { ...proof, ...change } }),
        ),
        http.post(`${origin}/api/user/access_tokens`, issue),
      )
      const flow = new NewApiAccessTokenCreation(request, "42")
      await expect(
        flow.create(draft, { method: "password", password: "secret" }),
      ).rejects.toThrow("SECURITY_PROOF_INVALID")
      expect(issue).not.toHaveBeenCalled()
    },
  )

  it("accepts only an available verification method and sends the typed authenticator code", async () => {
    const verify = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toMatchObject({
        method: "2fa",
        code: "123456",
      })
      return HttpResponse.json({
        success: true,
        data: { ...proof, method: "2fa" },
      })
    })
    const issue = vi.fn(() =>
      HttpResponse.json({
        success: true,
        data: { token: "nap_twofactor", item: { id: 5, ...draft } },
      }),
    )
    server.use(
      http.get(`${origin}/api/verify/methods`, () =>
        HttpResponse.json({
          success: true,
          data: {
            scope: "access_token.generate",
            methods: [
              { method: "2fa", available: true },
              { method: "password", available: false },
            ],
            oauth_providers: [],
            password_encryption_enabled: false,
          },
        }),
      ),
      http.post(`${origin}/api/verify`, verify),
      http.post(`${origin}/api/user/access_tokens`, issue),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    await expect(
      flow.create(draft, { method: "password", password: "secret" }),
    ).rejects.toThrow("SECURITY_METHOD_UNAVAILABLE")
    expect(verify).not.toHaveBeenCalled()
    await expect(
      flow.create(draft, { method: "2fa", code: " 123456 " }),
    ).resolves.toMatchObject({ verified: true, id: 5 })
    expect(verify).toHaveBeenCalledOnce()
    expect(issue).toHaveBeenCalledOnce()
  })

  it("refuses cookie-based token creation before contacting the site", async () => {
    const contact = vi.fn(() => HttpResponse.error())
    server.use(http.get(`${origin}/api/user/self`, contact))
    const flow = new NewApiAccessTokenCreation(
      {
        ...request,
        auth: { authType: AuthTypeEnum.Cookie, userId: 42 },
      },
      "42",
    )
    await expect(
      flow.create(draft, { method: "password", password: "secret" }),
    ).rejects.toThrow("INVALID_TOKEN_CONTEXT")
    expect(contact).not.toHaveBeenCalled()
  })

  it("uses the website's password encryption before sending a proof request", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    })
    const password = " password with edge spaces "
    let verificationRequests = 0
    server.use(
      http.get(`${origin}/api/verify/methods`, () =>
        HttpResponse.json({
          success: true,
          data: {
            scope: "access_token.generate",
            methods: [{ method: "password", available: true }],
            oauth_providers: [],
            password_encryption_enabled: true,
          },
        }),
      ),
      http.get(`${origin}/api/user/login/encryption-key`, () =>
        HttpResponse.json({
          success: true,
          data: {
            kid: "test-key",
            public_key: publicKey
              .export({ type: "spki", format: "pem" })
              .toString(),
          },
        }),
      ),
      http.post(`${origin}/api/verify`, async ({ request }) => {
        verificationRequests++
        const payload = (await request.json()) as {
          password_encrypted: string
          encryption_key_id: string
        }
        expect(payload).not.toHaveProperty("password")
        expect(payload.encryption_key_id).toBe("test-key")
        const text = privateDecrypt(
          {
            key: privateKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
          },
          Buffer.from(payload.password_encrypted, "base64"),
        )
        expect(text.toString()).toBe(password)
        return HttpResponse.json({ success: true, data: proof })
      }),
      http.post(`${origin}/api/user/access_tokens`, () =>
        HttpResponse.json({
          success: true,
          data: { token: "nap_encrypted", item: { id: 7, ...draft } },
        }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    await expect(
      flow.create(draft, { method: "password", password }),
    ).resolves.toMatchObject({ verified: true })
    expect(verificationRequests).toBe(1)
  })

  it.each([false, true])(
    "requires an available linked OAuth provider and an owning browser interaction (%s)",
    async (linked) => {
      const issue = vi.fn(() => HttpResponse.error())
      server.use(
        http.get(`${origin}/api/verify/methods`, () =>
          HttpResponse.json({
            success: true,
            data: {
              scope: "access_token.generate",
              methods: [{ method: "oauth", available: true }],
              oauth_providers: linked
                ? [{ slug: "github", name: "GitHub" }]
                : [],
              password_encryption_enabled: false,
            },
          }),
        ),
        http.post(`${origin}/api/user/access_tokens`, issue),
      )
      const flow = new NewApiAccessTokenCreation(request, "42")
      await expect(
        flow.create(draft, { method: "oauth", provider: "github" }),
      ).rejects.toThrow(
        linked
          ? "SECURITY_VERIFICATION_FLOW_REQUIRED"
          : "SECURITY_METHOD_UNAVAILABLE",
      )
      expect(issue).not.toHaveBeenCalled()
    },
  )

  it("reconciles an externally revoked retained token only after explicit recovery review", async () => {
    let present = true
    let accountId = 42
    server.use(
      http.get(`${origin}/api/user/self`, () =>
        HttpResponse.json({ success: true, data: { id: accountId } }),
      ),
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
        HttpResponse.json({
          success: true,
          data: { items: present ? [{ id: 8 }] : [] },
        }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    await flow.create(draft, { method: "password", password: "secret" })
    expect(await flow.reviewRecovery()).toBe(false)
    accountId = 51
    await expect(flow.reviewRecovery()).rejects.toThrow(
      "ACCOUNT_IDENTITY_MISMATCH",
    )
    accountId = 42
    present = false
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
    let validatedAccount = 51
    const issue = vi.fn(() =>
      HttpResponse.json({
        success: true,
        data: { token: "nap_retained", item: { id: 8, ...draft } },
      }),
    )
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, issue),
      http.get(`${origin}/api/user/self`, ({ request }) =>
        HttpResponse.json({
          success: true,
          data: {
            id:
              request.headers.get("Authorization") === "Bearer nap_retained"
                ? validatedAccount
                : 42,
          },
        }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    expect(
      (await flow.create(draft, { method: "password", password: "secret" }))
        .verified,
    ).toBe(false)
    await expect(flow.verifyCreated()).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    })
    const replacement = new NewApiAccessTokenCreation(
      { ...request, auth: { ...request.auth, accessToken: "fresh-session" } },
      "42",
    )
    flow.reconnect(replacement)
    validatedAccount = 42
    expect(
      await flow.create(draft, { method: "password", password: "secret" }),
    ).toEqual({
      token: "nap_retained",
      id: 8,
      verified: true,
    })
    expect(issue).toHaveBeenCalledOnce()
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

  it("cancels the initial readback and retains the issued token for a retry", async () => {
    const started = createDeferred<AbortSignal>()
    const release = createDeferred<void>()
    let checks = 0
    let issues = 0
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
        if (
          request.headers.get("Authorization") === "Bearer nap_retained" &&
          ++checks === 1
        ) {
          started.resolve(request.signal)
          await release.promise
        }
        return HttpResponse.json({ success: true, data: { id: 42 } })
      }),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    const creation = flow.create(draft, {
      method: "password",
      password: "secret",
    })
    try {
      const signal = await started.promise
      const password = { method: "password", password: "secret" } as const
      const busy = "ACCESS_TOKEN_CREATION_BUSY"
      expect(() =>
        flow.reconnect(new NewApiAccessTokenCreation(request, "42")),
      ).toThrow(busy)
      await expect(flow.acknowledgeUncertain()).rejects.toThrow(busy)
      await expect(flow.reviewRecovery()).rejects.toThrow(busy)
      await expect(flow.verifyCreated()).rejects.toThrow(busy)
      await expect(flow.revokeToken(8, password)).rejects.toThrow(busy)
      await expect(flow.create(draft, password)).rejects.toThrow(busy)
      flow.cancelVerification()
      await expect.poll(() => signal.aborted, { timeout: 1000 }).toBe(true)
      await expect(creation).resolves.toMatchObject({ verified: false })
    } finally {
      release.resolve()
      await creation
    }
    await expect(flow.verifyCreated()).resolves.toMatchObject({
      verified: true,
    })
    expect(issues).toBe(1)
  })

  it.each([
    "confirmed",
    "still-listed",
    "already-absent",
    "wrong-capability-scope",
    "wrong-proof-scope",
  ] as const)(
    "reconciles revocation of a selected token when it is %s",
    async (outcome) => {
      let revoked = outcome === "already-absent"
      const verify = vi.fn()
      const deletion = vi.fn()
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
              scope:
                outcome === "wrong-capability-scope"
                  ? "access_token.generate"
                  : new URL(request.url).searchParams.get("scope"),
              methods: [{ method: "password", available: true }],
              oauth_providers: [],
              password_encryption_enabled: false,
            },
          }),
        ),
        http.post(`${origin}/api/verify`, async ({ request }) => {
          verify()
          expect(await request.json()).toMatchObject({
            scope: "access_token.revoke",
            context: { token_id: 7 },
          })
          return HttpResponse.json({
            success: true,
            data: {
              ...proof,
              scope:
                outcome === "wrong-proof-scope"
                  ? "access_token.generate"
                  : "access_token.revoke",
            },
          })
        }),
        http.delete(`${origin}/api/user/access_tokens/7`, ({ request }) => {
          deletion()
          expect(request.headers.get("X-Security-Proof")).toBe(
            proof.proof_token,
          )
          revoked = outcome === "confirmed"
          return HttpResponse.json({ success: true, data: null })
        }),
      )
      const flow = new NewApiAccessTokenCreation(request, "42")
      const result = flow.revokeToken(7, {
        method: "password",
        password: "secret",
      })
      if (
        outcome === "wrong-proof-scope" ||
        outcome === "wrong-capability-scope"
      )
        await expect(result).rejects.toThrow("SECURITY_PROOF_INVALID")
      else if (outcome === "still-listed")
        await expect(result).rejects.toThrow("ACCESS_TOKEN_REVOKE_UNCONFIRMED")
      else await expect(result).resolves.toBe(false)
      const expectsWrite = outcome === "confirmed" || outcome === "still-listed"
      expect(verify).toHaveBeenCalledTimes(
        expectsWrite || outcome === "wrong-proof-scope" ? 1 : 0,
      )
      expect(deletion).toHaveBeenCalledTimes(expectsWrite ? 1 : 0)
      if (outcome === "confirmed")
        expect((await flow.loadRecovery()).items).toEqual([])
    },
  )
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
          name: string,
          _options: unknown,
          work: (lock: object) => Promise<unknown>,
        ) => work({ name }),
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

  it("retains the issued credential when removing its journal marker fails", async () => {
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          _options: LockOptions,
          work: (lock: object) => Promise<unknown>,
        ) => work({ name }),
      },
    })
    const remove = vi
      .spyOn(browser.storage.local, "remove")
      .mockRejectedValue(new Error("Storage unavailable"))
    const journal = createTokenIssuanceJournal(
      origin,
      "retained-on-cleanup-failure",
    )
    let ready = false
    const issue = vi.fn(() =>
      HttpResponse.json({
        success: true,
        data: { token: "nap_retained", item: { id: 8, ...draft } },
      }),
    )
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, issue),
      http.get(`${origin}/api/user/self`, ({ request }) =>
        request.headers.get("Authorization") === "Bearer nap_retained" && !ready
          ? HttpResponse.error()
          : HttpResponse.json({ success: true, data: { id: 42 } }),
      ),
    )
    const flow = new NewApiAccessTokenCreation(
      request,
      "42",
      undefined,
      journal,
    )
    const password = { method: "password", password: "secret" } as const
    try {
      await expect(flow.create(draft, password)).resolves.toMatchObject({
        id: 8,
        verified: false,
      })
      expect(await journal.pending()).toBeDefined()
      ready = true
      await expect(flow.verifyCreated()).resolves.toEqual({
        token: "nap_retained",
        id: 8,
        verified: true,
      })
      expect(issue).toHaveBeenCalledOnce()
    } finally {
      remove.mockRestore()
      await journal.resolved()
    }
  })

  it("clears the marker when cancellation interrupts storage before issuance", async () => {
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          _options: LockOptions,
          work: (lock: object) => Promise<unknown>,
        ) => work({ name }),
      },
    })
    const started = createDeferred<void>()
    const release = createDeferred<void>()
    const save = browser.storage.local.set.bind(browser.storage.local)
    const persist = vi
      .spyOn(browser.storage.local, "set")
      .mockImplementationOnce(async (data) => {
        started.resolve()
        await release.promise
        await save(data)
      })
    const issue = vi.fn(() =>
      HttpResponse.json({
        success: true,
        data: { token: "nap_retry", item: { id: 8, ...draft } },
      }),
    )
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, issue),
    )
    const journal = createTokenIssuanceJournal(origin, "cancel-before-dispatch")
    const flow = new NewApiAccessTokenCreation(
      request,
      "42",
      undefined,
      journal,
    )
    const password = { method: "password", password: "secret" } as const
    const first = flow.create(draft, password)
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" })
    try {
      await started.promise
      flow.cancelVerification()
      release.resolve()
      await rejected
      expect(issue).not.toHaveBeenCalled()
      expect(await journal.pending()).toBeUndefined()
      await expect(flow.create(draft, password)).resolves.toMatchObject({
        verified: true,
        id: 8,
      })
      expect(issue).toHaveBeenCalledOnce()
    } finally {
      release.resolve()
      await first.catch(() => undefined)
      persist.mockRestore()
      await journal.resolved()
    }
  })

  it("keeps waiting for a valid issuance response after 30 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const started = createDeferred<void>()
    const release = createDeferred<void>()
    server.use(
      http.post(`${origin}/api/verify`, () =>
        HttpResponse.json({ success: true, data: proof }),
      ),
      http.post(`${origin}/api/user/access_tokens`, async () => {
        started.resolve()
        await release.promise
        return HttpResponse.json({
          success: true,
          data: { token: "nap_delayed", item: { id: 8, ...draft } },
        })
      }),
    )
    const flow = new NewApiAccessTokenCreation(request, "42")
    const result = flow.create(draft, {
      method: "password",
      password: "secret",
    })
    let settled = false
    const observed = result.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    try {
      await started.promise
      await vi.advanceTimersByTimeAsync(30_001)
      expect(settled).toBe(false)
      release.resolve()
      await expect(result).resolves.toMatchObject({ verified: true, id: 8 })
    } finally {
      release.resolve()
      await observed
      vi.useRealTimers()
    }
  })

  it("allows a reviewed uncertain issuance to be acknowledged without waiting", async () => {
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          _options: LockOptions,
          work: (lock: object) => Promise<unknown>,
        ) => work({ name }),
      },
    })
    const owner = createTokenIssuanceJournal(origin, "uncertain-review")
    const other = createTokenIssuanceJournal(origin, "uncertain-review")
    try {
      expect(await owner.begin()).toBe(true)
      await owner.uncertain()
      const marker = (await other.pending())!
      await expect(other.acknowledge(undefined)).rejects.toThrow(
        "ACCESS_TOKEN_CREATION_BUSY",
      )
      expect(await other.begin()).toBe(false)
      await expect(other.acknowledge(marker)).resolves.toBeUndefined()
      expect(await other.pending()).toBeUndefined()
    } finally {
      await owner.resolved()
    }
  })

  it("does not let a stale review acknowledge a later uncertain issuance", async () => {
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          _options: LockOptions,
          work: (lock: object) => Promise<unknown>,
        ) => work({ name }),
      },
    })
    const journal = () => createTokenIssuanceJournal(origin, "stale-review")
    const first = journal()
    const staleView = new NewApiAccessTokenCreation(
      request,
      "42",
      undefined,
      journal(),
    )
    const freshView = new NewApiAccessTokenCreation(
      request,
      "42",
      undefined,
      journal(),
    )
    server.use(
      http.get(`${origin}/api/verify/methods`, ({ request }) =>
        HttpResponse.json({
          success: true,
          data: {
            scope: new URL(request.url).searchParams.get("scope"),
            methods: [],
            oauth_providers: [],
            password_encryption_enabled: false,
          },
        }),
      ),
      http.get(`${origin}/api/user/access_tokens`, ({ request }) => {
        expect(request.cache).toBe("no-store")
        return HttpResponse.json({ success: true, data: { items: [] } })
      }),
    )
    const start = Date.now()
    const clock = vi.spyOn(Date, "now").mockReturnValue(start)
    try {
      expect(await first.begin()).toBe(true)
      await first.uncertain()
      clock.mockReturnValue(start + 300_001)
      expect((await staleView.load()).creationUncertain).toBe(true)
      await expect(staleView.acknowledgeUncertain()).rejects.toThrow(
        "ACCESS_TOKEN_CREATION_BUSY",
      )
      await staleView.loadRecovery()
      await freshView.loadRecovery()
      await freshView.acknowledgeUncertain()
      const newer = journal()
      expect(await newer.begin()).toBe(true)
      await newer.uncertain()
      clock.mockReturnValue(start + 600_002)
      await expect(staleView.acknowledgeUncertain()).rejects.toThrow(
        "ACCESS_TOKEN_CREATION_BUSY",
      )
      expect(await journal().pending()).toBeTruthy()
      await newer.resolved()
    } finally {
      clock.mockRestore()
    }
  })

  it("rejects a second issuance and acknowledgment while the first is active", async () => {
    const locked = new Set<string>()
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          options: LockOptions,
          work: (lock: object | null) => Promise<unknown>,
        ) => {
          if (locked.has(name) && options.ifAvailable) return work(null)
          locked.add(name)
          try {
            return await work({ name })
          } finally {
            locked.delete(name)
          }
        },
      },
    })
    const journal = () => createTokenIssuanceJournal(origin, "active-review")
    const owner = journal()
    const other = journal()
    const started = createDeferred<void>()
    const finish = createDeferred<void>()
    const issuance = owner.whileIssuing(async () => {
      expect(await owner.begin()).toBe(true)
      started.resolve()
      await finish.promise
      await owner.uncertain()
    })
    try {
      await started.promise
      const observed = (await other.pending())!
      const compete = vi.fn()
      const second = other.whileIssuing(compete)
      try {
        await expect(
          Promise.race([
            second,
            new Promise((resolve) => setTimeout(() => resolve("queued"), 50)),
          ]),
        ).rejects.toThrow("ACCESS_TOKEN_CREATION_BUSY")
      } finally {
        void second.catch(() => undefined)
      }
      expect(compete).not.toHaveBeenCalled()
      await expect(other.acknowledge(observed)).rejects.toThrow()
      expect(await other.pending()).toEqual(observed)
      finish.resolve()
      await issuance
      await expect(other.acknowledge(observed)).rejects.toThrow()
      await other.acknowledge(await other.pending())
      expect(await other.pending()).toBeUndefined()
    } finally {
      finish.resolve()
      await issuance
    }
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
