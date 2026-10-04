import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import {
  normalizeAccountSiteProfileUrlForManagedChannel,
  normalizeAccountSiteProfileUrlForStorage,
} from "~/services/accounts/accountSiteProfile/urls"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { ACCOUNT_BOOTSTRAP_ROUTE_KINDS } from "~/services/apiAdapters/contracts/accountBootstrap"
import { resolveFreeModelRoutes } from "~/services/apiAdapters/freemodel/routes"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { captureProfileFromAccountToken } from "~/services/apiCredentialProfiles/accountTokenImport"
import {
  createKey,
  deleteKey,
  fetchAccountData,
  fetchKeys,
  fetchUserInfo,
} from "~/services/apiService/freemodel"
import { fetchFreeModelNodes } from "~/services/apiService/freemodel/nodes"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

import {
  createAccountCompletionHelpersMock,
  createCheckInConfig,
} from "../../apiAdapters/checkInFixtures"

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }))
vi.mock("~/services/apiCredentialProfiles/apiCredentialProfileLinks", () => ({
  apiCredentialProfileLinks: {
    capture: (...args: unknown[]) => captureMock(...args),
  },
}))

const origin = "https://freemodel.dev"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
}
const publicNodes = [
  {
    id: 1,
    display_name: "Tier 0",
    url: "https://api.freemodel.dev",
    format: "openai",
    is_enabled: 1,
  },
  {
    id: 6,
    display_name: "Tier 0",
    url: "https://cc.freemodel.dev",
    format: "anthropic",
    is_enabled: 1,
  },
  {
    id: 11,
    display_name: "High Quality",
    url: "https://cc-hq.freemodel.dev",
    format: "anthropic",
    is_enabled: 1,
  },
]
const user = { id: 7, name: "Example", email: "example@example.invalid" }

describe("FreeModel integration", () => {
  it("bootstraps a cookie account from the verified identity with check-in disabled", async () => {
    const account = getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account!
    const bootstrap = account.bootstrap!
    await expect(
      bootstrap.getOrCreateAccessToken(request),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    await expect(bootstrap.loadBootstrapFacts(request)).resolves.toMatchObject({
      displayName: "FreeModel",
      checkInSupported: false,
    })
    await expect(bootstrap.fetchCheckInSupport(request, {})).resolves.toBe(
      false,
    )
    await expect(
      bootstrap.resolveRoutePath(
        { baseUrl: origin, siteType: SITE_TYPES.FREEMODEL },
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.CheckIn,
      ),
    ).resolves.toBeNull()
    const { helpers, captureRecoveryData } = createAccountCompletionHelpersMock(
      SITE_TYPES.FREEMODEL,
      { automaticExecutionEnabled: true },
    )
    await expect(
      account.completion!.complete(
        {
          url: origin,
          requestedAuthType: AuthTypeEnum.Cookie,
          detected: { userId: "7", siteType: SITE_TYPES.FREEMODEL },
          context: {},
        },
        helpers,
      ),
    ).resolves.toMatchObject({
      userId: "7",
      username: "Example",
      authType: AuthTypeEnum.Cookie,
      accessToken: "",
      siteName: "FreeModel",
    })
    expect(captureRecoveryData).toHaveBeenCalledWith({
      userId: "7",
      username: "Example",
      authType: AuthTypeEnum.Cookie,
    })
  })

  it("reports an expired console session as an unhealthy refresh", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    )
    await expect(
      getSiteTypeCapabilities(
        SITE_TYPES.FREEMODEL,
      ).account!.refresh!.refreshAccount({
        ...request,
        checkIn: createCheckInConfig(SITE_TYPES.FREEMODEL),
      }),
    ).resolves.toMatchObject({ success: false })
  })

  it.each([-1, "125", null])(
    "rejects invalid stored credits: %s",
    async (creditCents) => {
      server.use(
        http.get(`${origin}/api/billing`, () =>
          HttpResponse.json({
            creditCents,
            signupCreditCents: 0,
            subscription: {},
          }),
        ),
        http.get(`${origin}/api/usage`, () =>
          HttpResponse.json({
            window5h: { limitCents: 0, usedCents: 0 },
            windowWeek: { limitCents: 0, usedCents: 0 },
          }),
        ),
      )
      await expect(
        fetchAccountData({
          ...request,
          checkIn: createCheckInConfig(SITE_TYPES.FREEMODEL),
        }),
      ).rejects.toMatchObject({
        endpoint: "/api/billing",
        code: "JSON_PARSE_ERROR",
      })
    },
  )

  it("keeps absent optional plan metadata unset on a valid account snapshot", async () => {
    server.use(
      http.get(`${origin}/api/billing`, () =>
        HttpResponse.json({
          creditCents: 0,
          signupCreditCents: 0,
          subscription: {},
        }),
      ),
      http.get(`${origin}/api/usage`, () =>
        HttpResponse.json({
          window5h: { limitCents: 0, usedCents: 0 },
          windowWeek: { limitCents: 0, usedCents: 0 },
        }),
      ),
    )
    const data = await fetchAccountData({
      ...request,
      checkIn: createCheckInConfig(SITE_TYPES.FREEMODEL),
    })
    expect(data.subscription).toMatchObject({
      name: undefined,
      periodResetTime: undefined,
      isActive: false,
      remainingAmount: 0,
    })
    expect(data.quota).toBe(0)
  })

  it.each([{ keys: [{ id: 0, name: "bad", suffix: "abcd" }] }, { keys: null }])(
    "rejects malformed key inventory: %j",
    async (body) => {
      server.use(http.get(`${origin}/api/keys`, () => HttpResponse.json(body)))
      await expect(fetchKeys(request)).rejects.toMatchObject({
        endpoint: "/api/keys",
        code: "JSON_PARSE_ERROR",
      })
    },
  )

  it.each([undefined, "", "   "])(
    "rejects a creation response without a usable one-time secret: %s",
    async (secret) => {
      server.use(
        http.post(`${origin}/api/keys`, () =>
          HttpResponse.json({
            key: { id: 12, name: "Example", suffix: "abcd" },
            secret,
          }),
        ),
      )
      await expect(createKey(request, "Example")).rejects.toMatchObject({
        endpoint: "/api/keys",
        code: "JSON_PARSE_ERROR",
      })
    },
  )

  it.each([{ id: 0 }, { id: 1, url: "not a URL" }])(
    "rejects an invalid enabled node: %j",
    async (overrides) => {
      server.use(
        http.get(`${origin}/api/nodes-public`, () =>
          HttpResponse.json({ nodes: [{ ...publicNodes[0], ...overrides }] }),
        ),
      )
      await expect(fetchFreeModelNodes(request)).rejects.toMatchObject({
        endpoint: "/api/nodes-public",
        code: "JSON_PARSE_ERROR",
      })
    },
  )

  it("uses the node name when display_name is absent", async () => {
    server.use(
      http.get(`${origin}/api/nodes-public`, () =>
        HttpResponse.json({
          nodes: [
            { ...publicNodes[0], display_name: null, name: " Custom " },
            { ...publicNodes[1], display_name: null },
          ],
        }),
      ),
    )
    const nodes = await fetchFreeModelNodes(request)
    expect(nodes.map((node) => node.label)).toEqual([
      "OpenAI · Custom · api.freemodel.dev",
      "Claude · cc.freemodel.dev",
    ])
    expect(() =>
      resolveFreeModelRoutes(nodes, "https://api.freemodel.dev?key=private"),
    ).toThrow("Invalid FreeModel route")
  })

  it.each([
    ["subscription", "/api/billing"],
    ["window5h", "/api/usage"],
    ["windowWeek", "/api/usage"],
  ])("attributes malformed %s to %s", async (field, endpoint) => {
    server.use(
      http.get(`${origin}/api/billing`, () =>
        HttpResponse.json({
          creditCents: 0,
          signupCreditCents: 0,
          subscription: field === "subscription" ? null : { status: "active" },
        }),
      ),
      http.get(`${origin}/api/usage`, () =>
        HttpResponse.json({
          window5h:
            field === "window5h" ? null : { limitCents: 0, usedCents: 0 },
          windowWeek:
            field === "windowWeek" ? null : { limitCents: 0, usedCents: 0 },
        }),
      ),
    )
    await expect(
      fetchAccountData({
        ...request,
        checkIn: createCheckInConfig(SITE_TYPES.FREEMODEL),
      }),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR", endpoint })
  })

  beforeEach(() => {
    server.use(
      http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
      http.get(`${origin}/api/nodes-public`, ({ request: wire }) => {
        expect(wire.headers.get("Authorization")).toBeNull()
        expect(wire.headers.get("Cookie")).toBeNull()
        return HttpResponse.json({ nodes: publicNodes })
      }),
    )
  })

  it.each([
    { nodes: null },
    {
      nodes: [{ ...publicNodes[0], url: "https://user:pass@example.invalid" }],
    },
    { nodes: [{ ...publicNodes[0], url: "https://example.invalid?secret=1" }] },
    { nodes: [publicNodes[0], publicNodes[0]] },
  ])(
    "rejects malformed routing metadata without a static fallback: %j",
    async (body) => {
      server.use(
        http.get(`${origin}/api/nodes-public`, () => HttpResponse.json(body)),
      )
      await expect(fetchFreeModelNodes(request)).rejects.toThrow(
        "Invalid FreeModel node catalog",
      )
    },
  )

  it("requires the matching console session before reading nodes", async () => {
    let reads = 0
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ user: { ...user, id: 8 } }),
      ),
      http.get(`${origin}/api/nodes-public`, () => {
        reads++
        return HttpResponse.json({ nodes: publicNodes })
      }),
    )
    await expect(fetchFreeModelNodes(request)).rejects.toThrow(
      "FreeModel account identity mismatch",
    )
    expect(reads).toBe(0)
  })

  it.each([401, 503, "malformed", "empty"] as const)(
    "uses known HQ routing with a notice when nodes return %s",
    async (status) => {
      server.use(
        http.get(`${origin}/api/nodes-public`, () =>
          status === "malformed"
            ? HttpResponse.json({ nodes: null })
            : status === "empty"
              ? HttpResponse.json({ nodes: [] })
              : new HttpResponse(null, { status }),
        ),
        http.get(
          "https://cc-hq.freemodel.dev/v1/models",
          ({ request: wire }) => {
            expect(wire.headers.get("x-api-key")).toBe("sk-private")
            expect(wire.headers.get("Cookie")).toBeNull()
            return HttpResponse.json({
              data: [{ id: "claude-live" }],
              has_more: false,
            })
          },
        ),
      )
      await expect(
        getSiteTypeCapabilities(
          SITE_TYPES.FREEMODEL,
        ).account!.modelCatalog!.fetchModels(
          {
            baseUrl: "https://cc-hq.freemodel.dev",
            auth: { authType: AuthTypeEnum.AccessToken, apiKey: "sk-private" },
          },
          { accountRequest: request },
        ),
      ).resolves.toEqual({
        models: [{ id: "claude-live" }],
        inferenceRouteFallback: true,
      })
    },
  )

  it("uses default protocol roots without requiring a console discovery context", async () => {
    server.use(
      http.get("https://api.freemodel.dev/v1/models", () =>
        HttpResponse.json({ data: [{ id: "gpt-live" }] }),
      ),
      http.get("https://cc.freemodel.dev/v1/models", () =>
        HttpResponse.json({ data: [{ id: "claude-live" }], has_more: false }),
      ),
    )
    await expect(
      getSiteTypeCapabilities(
        SITE_TYPES.FREEMODEL,
      ).account!.modelCatalog!.fetchModels({
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.AccessToken, apiKey: "sk-private" },
      }),
    ).resolves.toEqual({
      models: [{ id: "gpt-live" }, { id: "claude-live" }],
      inferenceRouteFallback: true,
    })
  })

  it("preserves cancellation instead of starting fallback inference requests", async () => {
    const controller = new AbortController()
    controller.abort()
    let sends = 0
    server.use(
      http.get("https://cc-hq.freemodel.dev/v1/models", () => {
        sends++
        return HttpResponse.json({ data: [] })
      }),
    )
    await expect(
      getSiteTypeCapabilities(
        SITE_TYPES.FREEMODEL,
      ).account!.modelCatalog!.fetchModels(
        {
          baseUrl: "https://cc-hq.freemodel.dev",
          auth: { authType: AuthTypeEnum.AccessToken, apiKey: "sk-private" },
          abortSignal: controller.signal,
        },
        { accountRequest: request },
      ),
    ).rejects.toThrow()
    expect(sends).toBe(0)
  })

  it("discovers a newly published endpoint using its protocol and path", async () => {
    server.use(
      http.get(`${origin}/api/nodes-public`, () =>
        HttpResponse.json({
          nodes: [
            {
              id: 12,
              display_name: "New",
              format: "openai",
              is_enabled: 1,
              url: "https://new-route.freemodel.dev/gateway/v1",
            },
          ],
        }),
      ),
      http.get(
        "https://new-route.freemodel.dev/gateway/v1/models",
        ({ request: wire }) => {
          expect(wire.headers.get("Authorization")).toBe("Bearer sk-new-route")
          expect(wire.headers.get("Cookie")).toBeNull()
          return HttpResponse.json({ data: [{ id: "gpt-new" }] })
        },
      ),
    )
    const models = await getSiteTypeCapabilities(
      SITE_TYPES.FREEMODEL,
    ).account!.modelCatalog!.fetchModels(
      {
        baseUrl: "https://new-route.freemodel.dev/gateway",
        auth: { authType: AuthTypeEnum.AccessToken, apiKey: "sk-new-route" },
      },
      { accountRequest: request },
    )
    expect(
      (Array.isArray(models) ? models : models.models).map((model) => model.id),
    ).toEqual(["gpt-new"])
  })

  it("creates a name-only key without reading nodes even when node discovery is unavailable", async () => {
    let nodeReads = 0
    server.use(
      http.get(`${origin}/api/nodes-public`, () => {
        nodeReads++
        return new HttpResponse(null, { status: 503 })
      }),
      http.post(`${origin}/api/keys`, async ({ request: wire }) => {
        expect(await wire.json()).toEqual({ name: "Example" })
        return HttpResponse.json({
          key: { id: 12, name: "Example", suffix: "abcd" },
          secret: "sk-created",
        })
      }),
    )
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.FREEMODEL,
    ).account!.keyResourceManagement!.open({
      account: { id: "local", siteType: SITE_TYPES.FREEMODEL },
      request: { ...request, accountId: "local" },
    })
    const editor = await session.openCreateEditor(
      (await session.resolveDefaultScope()).scopeKey,
    )
    expect(editor.fields.map((field) => field.fieldId)).toEqual(["name"])
    await expect(editor.submit({ name: "Example" })).resolves.toMatchObject({
      createdSecret: { secret: "sk-created" },
    })
    expect(nodeReads).toBe(0)
  })

  it("rejects disabled or undeclared inference addresses before sending the key", async () => {
    let sends = 0
    server.use(
      http.get("https://unknown.freemodel.dev/v1/models", () => {
        sends++
        return HttpResponse.json({ data: [] })
      }),
    )
    await expect(
      getSiteTypeCapabilities(
        SITE_TYPES.FREEMODEL,
      ).account!.modelCatalog!.fetchModels(
        {
          baseUrl: "https://unknown.freemodel.dev",
          auth: { authType: AuthTypeEnum.AccessToken, apiKey: "sk-private" },
        },
        { accountRequest: request },
      ),
    ).rejects.toThrow()
    expect(sends).toBe(0)
  })

  it("keeps model discovery available without publishing static pricing", () => {
    const account = getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account!
    expect(account.modelCatalog?.fetchModels).toBeTypeOf("function")
    expect(account.modelCatalog?.enrichPricing).toBeUndefined()
    expect(account.modelPricing).toBeUndefined()
  })

  it("discovers only HQ models when the saved credential selects HQ", async () => {
    server.use(
      http.get("https://api.freemodel.dev/v1/models", () => {
        throw new Error("HQ must not request OpenAI")
      }),
      http.get("https://cc.freemodel.dev/v1/models", () => {
        throw new Error("HQ must not request default Claude")
      }),
      http.get("https://cc-hq.freemodel.dev/v1/models", () =>
        HttpResponse.json({
          data: [{ id: "claude-fable-5" }],
          has_more: false,
        }),
      ),
    )
    const models = await getSiteTypeCapabilities(
      SITE_TYPES.FREEMODEL,
    ).account!.modelCatalog!.fetchModels(
      {
        baseUrl: "https://cc-hq.freemodel.dev",
        auth: { authType: AuthTypeEnum.AccessToken, apiKey: "sk-hq-probe" },
      },
      { accountRequest: request },
    )
    expect(
      (Array.isArray(models) ? models : models.models).map((model) => model.id),
    ).toEqual(["claude-fable-5"])
  })

  it("saves the one-time secret with the default inference profile", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
      http.get(`${origin}/api/keys`, () => HttpResponse.json({ keys: [] })),
      http.post(`${origin}/api/keys`, async ({ request: wire }) => {
        expect(await wire.json()).toEqual({ name: "Example" })
        return HttpResponse.json({
          key: { id: 12, name: "Example", suffix: "abcd" },
          secret: "sk-created-secret",
        })
      }),
    )
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.FREEMODEL,
    ).account!.keyResourceManagement!.open({
      account: { id: "local", siteType: SITE_TYPES.FREEMODEL },
      request: { ...request, accountId: "local" },
    })
    const scope = await session.resolveDefaultScope()
    const editor = await session.openCreateEditor(scope.scopeKey)
    expect(editor.fields.map((field) => field.fieldId)).toEqual(["name"])
    expect(editor.validate({ name: "" }).valid).toBe(false)
    const result = await editor.submit({
      name: "Example",
    })
    expect(result.createdSecret?.credential).toMatchObject({
      baseUrl: "https://api.freemodel.dev",
      apiType: "openai-compatible",
    })
    const createdSecret = result.createdSecret!
    await captureProfileFromAccountToken({
      ...createdSecret.credential,
      tagIds: [...createdSecret.credential.tagIds],
      token: { key: createdSecret.secret, name: createdSecret.displayName },
    })
    expect(captureMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          apiType: "openai-compatible",
          baseUrl: "https://api.freemodel.dev",
        }),
      }),
    )
    expect(result.createdSecret?.correlation).toMatchObject({
      ref: { scopeKey: "default", resourceId: "12" },
    })
  })
  it("merges key-visible models from both default protocol origins", async () => {
    server.use(
      http.get("https://api.freemodel.dev/v1/models", ({ request: wire }) => {
        expect(wire.headers.get("Authorization")).toBe("Bearer sk-model-probe")
        return HttpResponse.json({
          object: "list",
          data: [{ id: "example-model", object: "model" }],
        })
      }),
      http.get("https://cc.freemodel.dev/v1/models", ({ request: wire }) => {
        expect(wire.headers.get("x-api-key")).toBe("sk-model-probe")
        expect(wire.headers.get("Cookie")).toBeNull()
        expect(new URL(wire.url).searchParams.get("limit")).toBe("200")
        return HttpResponse.json({
          data: [{ id: "claude-example" }, { id: "example-model" }],
          has_more: false,
        })
      }),
    )
    const models = await getSiteTypeCapabilities(
      SITE_TYPES.FREEMODEL,
    ).account!.modelCatalog!.fetchModels(
      {
        ...request,
        auth: { ...request.auth, apiKey: "sk-model-probe" },
      },
      { accountRequest: request },
    )
    expect(
      (Array.isArray(models) ? models : models.models).map((model) => model.id),
    ).toEqual(["example-model", "claude-example"])
  })
  it("does not silently report a complete catalog when a protocol fails", async () => {
    server.use(
      http.get("https://api.freemodel.dev/v1/models", () =>
        HttpResponse.json({ data: [{ id: "gpt-example" }] }),
      ),
      http.get("https://cc.freemodel.dev/v1/models", () =>
        HttpResponse.json(
          { error: { message: "Unavailable" } },
          { status: 503 },
        ),
      ),
    )
    await expect(
      getSiteTypeCapabilities(
        SITE_TYPES.FREEMODEL,
      ).account!.modelCatalog!.fetchModels(
        {
          ...request,
          auth: { ...request.auth, apiKey: "sk-model-probe" },
        },
        { accountRequest: request },
      ),
    ).rejects.toMatchObject({ statusCode: 503 })
  })

  it("loads the native invite link with cookie identity verification", async () => {
    const capability = getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account!
      .inviteLink
    expect(capability).toBeDefined()
    server.use(
      http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
      http.get(`${origin}/api/referral`, ({ request: wire }) => {
        expect(wire.headers.get("Authorization")).toBeNull()
        return HttpResponse.json({ code: " FRE-example " })
      }),
    )
    await expect(capability!.fetchInviteLink({ request })).resolves.toBe(
      `${origin}/invite/FRE-example`,
    )
  })

  it.each([undefined, null, "", "   ", 12])(
    "rejects missing or malformed referral code %j",
    async (code) => {
      const capability = getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account!
        .inviteLink
      expect(capability).toBeDefined()
      server.use(
        http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
        http.get(`${origin}/api/referral`, () => HttpResponse.json({ code })),
      )
      await expect(
        capability!.fetchInviteLink({ request }),
      ).rejects.toMatchObject({
        reason: "invite_data_missing",
      })
    },
  )

  it("encodes an invite code as one path segment", async () => {
    const capability = getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account!
      .inviteLink
    expect(capability).toBeDefined()
    server.use(
      http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
      http.get(`${origin}/api/referral`, () =>
        HttpResponse.json({ code: "FRE-a/b?next=#test" }),
      ),
    )
    await expect(capability!.fetchInviteLink({ request })).resolves.toBe(
      `${origin}/invite/FRE-a%2Fb%3Fnext%3D%23test`,
    )
  })

  it("rejects mismatched identity before accessing referral data", async () => {
    const capability = getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account!
      .inviteLink
    expect(capability).toBeDefined()
    let referralReads = 0
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ user: { ...user, id: 8 } }),
      ),
      http.get(`${origin}/api/referral`, () => {
        referralReads += 1
        return HttpResponse.json({ code: "FRE-example" })
      }),
    )
    await expect(
      capability!.fetchInviteLink({ request }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_IDENTITY_MISMATCH",
    })
    expect(referralReads).toBe(0)
  })
  it("does not report a rejected delete as successful", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
      http.delete(`${origin}/api/keys/12`, () =>
        HttpResponse.json({ ok: false }),
      ),
    )
    await expect(deleteKey(request, "12")).rejects.toThrow()
  })
  it("registers an account-only cookie provider with separate inference origins", () => {
    expect(
      normalizeAccountSiteProfileUrlForManagedChannel({
        siteType: SITE_TYPES.FREEMODEL,
        url: origin,
      }),
    ).toBe("https://api.freemodel.dev/v1")
    expect(
      normalizeAccountSiteProfileUrlForStorage({
        siteType: SITE_TYPES.FREEMODEL,
        url: `${origin}/dashboard/keys`,
      }),
    ).toBe(origin)
    expect(
      getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account?.bootstrap
        ?.fetchUserInfo,
    ).toBeDefined()
    const definition = getAccountSiteDefinition(SITE_TYPES.FREEMODEL)
    expect(definition?.scopes).toEqual(["account"])
    expect(definition?.productProfile?.auth?.allowedAuthTypes).toEqual([
      AuthTypeEnum.Cookie,
    ])
    expect(definition?.productProfile?.urls?.inferenceApiBaseUrls).toEqual({
      openAiCompatible: "https://api.freemodel.dev/v1",
      anthropic: "https://cc.freemodel.dev",
    })
    expect(
      getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account
        ?.keyResourceManagement,
    ).toBeDefined()
    expect(
      getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).managedSites,
    ).toBeUndefined()
  })

  it("verifies the numeric browser identity without treating an inference key as login", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, ({ request: wire }) => {
        expect(wire.headers.get("Authorization")).toBeNull()
        return HttpResponse.json({ user })
      }),
    )
    await expect(fetchUserInfo(request)).resolves.toEqual({
      id: "7",
      username: "Example",
      access_token: null,
    })
  })

  it("converts only stored USD cents to balance and keeps rolling plan limits separate", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
      http.get(`${origin}/api/billing`, () =>
        HttpResponse.json({
          creditCents: 125,
          signupCreditCents: 50,
          subscription: { planId: "pro", status: "active" },
        }),
      ),
      http.get(`${origin}/api/usage`, () =>
        HttpResponse.json({
          window5h: { usedCents: 100, limitCents: 500, resetsAt: 1791073073 },
          windowWeek: { usedCents: 200, limitCents: 3300 },
        }),
      ),
    )
    const data = await fetchAccountData({
      ...request,
      checkIn: createCheckInConfig(SITE_TYPES.FREEMODEL),
    })
    expect(data.quota).toBe(1.75 * QUOTA_PER_USD)
    expect(data.subscription).toMatchObject({
      name: "pro",
      amountLimit: 5,
      usedAmount: 1,
      remainingAmount: 4,
      period: "5h",
      isActive: true,
    })
    expect(data.todayStatsAvailability?.requests.status).toBe("unavailable")
    expect(data.today_requests_count).toBe(0)
  })

  it("rejects another signed-in account before requesting account data", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ user: { ...user, id: 8 } }),
      ),
    )
    await expect(
      fetchAccountData({
        ...request,
        checkIn: createCheckInConfig(SITE_TYPES.FREEMODEL),
      }),
    ).rejects.toThrow()
  })

  it("propagates an expired session instead of using cached browser user data", async () => {
    server.use(
      http.get(`${origin}/api/auth/me`, () =>
        HttpResponse.json({ error: "Unauthorized" }, { status: 401 }),
      ),
    )
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it("keeps list suffixes non-exportable and reads plaintext only from create", async () => {
    const key = {
      id: 12,
      name: "Example",
      suffix: "abcd",
      created: "2026-10-04",
    }
    server.use(
      http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
      http.get(`${origin}/api/keys`, () => HttpResponse.json({ keys: [key] })),
      http.post(`${origin}/api/keys`, async ({ request: wire }) => {
        expect(await wire.json()).toEqual({ name: "Example" })
        return HttpResponse.json({ key, secret: "sk-example-secret" })
      }),
      http.delete(`${origin}/api/keys/12`, () =>
        HttpResponse.json({ ok: true }),
      ),
    )
    expect(await fetchKeys(request)).toEqual([key])
    expect(await createKey(request, "Example")).toEqual({
      key,
      secret: "sk-example-secret",
    })
    await expect(deleteKey(request, "12")).resolves.toBeUndefined()
  })

  it("connects native key management to the response-only secret and disables unsupported edits", async () => {
    const key = { id: 12, name: "Example", suffix: "abcd" }
    server.use(
      http.get(`${origin}/api/auth/me`, () => HttpResponse.json({ user })),
      http.get(`${origin}/api/keys`, () => HttpResponse.json({ keys: [key] })),
      http.post(`${origin}/api/keys`, () =>
        HttpResponse.json({ key, secret: "sk-example-secret" }),
      ),
      http.delete(`${origin}/api/keys/12`, () =>
        HttpResponse.json({ ok: true }),
      ),
    )
    const capability = getSiteTypeCapabilities(SITE_TYPES.FREEMODEL).account!
      .keyResourceManagement!
    const session = await capability.open({
      account: { id: "local", siteType: SITE_TYPES.FREEMODEL },
      request: { ...request, accountId: "local" },
    })
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    const inventory = await collection.list()
    expect(inventory.items[0]).toMatchObject({
      maskedLabel: "fe_oa_••••••••••••abcd",
      actions: { canUpdate: false, canDelete: true },
      runtimeKey: { baseUrl: "https://api.freemodel.dev/v1" },
    })
    expect(
      await session.runtimeKey!.resolve(inventory.items[0]!.ref),
    ).toMatchObject({ kind: "unavailable" })
    await expect(
      collection.openEditEditor(inventory.items[0]!.ref),
    ).rejects.toThrow()
    const editor = await session.openCreateEditor(scope.scopeKey)
    expect(editor.validate({ name: " " }).valid).toBe(false)
    const created = await editor.submit({ name: "Example" })
    expect(created.createdSecret).toMatchObject({ secret: "sk-example-secret" })
    expect(JSON.stringify(created.facts)).not.toContain("sk-example-secret")
    await expect(
      collection.delete(inventory.items[0]!.ref),
    ).resolves.toBeUndefined()
    server.use(
      http.get(`${origin}/api/keys`, () => HttpResponse.json({ keys: [] })),
    )
    await expect(collection.get(inventory.items[0]!.ref)).rejects.toMatchObject(
      { failure: { code: "not_found" } },
    )
  })

  it.each([{}, { user: { id: "7" } }, { user: { id: 0 } }])(
    "rejects malformed user payload %j",
    async (body) => {
      server.use(
        http.get(`${origin}/api/auth/me`, () => HttpResponse.json(body)),
      )
      await expect(fetchUserInfo(request)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )

  it("does not send console credentials to an inference host", async () => {
    await expect(
      fetchUserInfo({ ...request, baseUrl: "https://api.freemodel.dev" }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    await expect(
      fetchUserInfo({
        ...request,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "inference-key",
        },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })
})
