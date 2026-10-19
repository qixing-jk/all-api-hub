import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { prepareDefaultAccountKeyCreationInSession } from "~/services/accounts/keys/accountKeyCreation"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { KRILL_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { krillContentSessionExtractor } from "~/services/accountSiteOnboarding/contentSession/krill"
import { krillBrowserIdentity } from "~/services/apiAdapters/krill/browserIdentity"
import { createKrillKeyEditor } from "~/services/apiAdapters/krill/keyEditor"
import { krillKeyResources } from "~/services/apiAdapters/krill/keyResources"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://www.krill-code.com"
const channels = [
  {
    id: 55,
    name: "国产模型官渠",
    billing_multiplier: "0.3500",
    default_routed: true,
  },
  {
    id: 35,
    name: "Kiro 渠道",
    billing_multiplier: "0.3800",
    default_routed: false,
  },
  {
    id: 1,
    name: "Openai 官渠",
    billing_multiplier: "1.0000",
    default_routed: true,
  },
]
const tokens = [
  {
    id: 71750,
    name: "native",
    token_prefix: "nb_522MZ",
    last_used_at: "2026-10-14T16:40:00Z",
    revoked_at: null,
    allow_balance_fallback: true,
    ip_whitelist: null,
    created_at: "2026-10-14T17:23:37Z",
    enterprise_id: null,
  },
  {
    id: 71751,
    name: "retired",
    token_prefix: "nb_AbCdE",
    last_used_at: null,
    revoked_at: "2026-10-14T18:00:00Z",
    allow_balance_fallback: false,
    ip_whitelist: "203.0.113.4",
    created_at: "2026-10-13T10:00:00Z",
    enterprise_id: null,
  },
]
const calls: { method: string; url: string; body?: unknown }[] = []

function useHandlers() {
  server.use(
    http.get(`${origin}/api/auth/me`, () =>
      HttpResponse.json({
        success: true,
        code: 0,
        data: {
          id: 47044,
          email: "kai@example.com",
          credit_balance_usd: "12.500000",
          enterprise_memberships: [],
        },
      }),
    ),
    http.get(`${origin}/api/tokens`, () =>
      HttpResponse.json({ success: true, code: 0, data: tokens }),
    ),
    http.get(`${origin}/api/my/channels`, () =>
      HttpResponse.json({ success: true, code: 0, data: channels }),
    ),
    http.get(`${origin}/api/tokens/:id/channels`, ({ params }) =>
      HttpResponse.json({
        success: true,
        code: 0,
        // The unrestricted key selects every channel upstream.
        data: { channel_ids: params.id === "71750" ? [] : [55] },
      }),
    ),
    http.post(`${origin}/api/tokens`, async ({ request }) => {
      calls.push({
        method: "POST",
        url: "/api/tokens",
        body: await request.json(),
      })
      return HttpResponse.json({
        success: true,
        code: 0,
        data: {
          token: "nb_created-secret-value",
          item: { ...tokens[0], id: 90001, name: "created" },
        },
      })
    }),
    http.put(`${origin}/api/tokens/:id`, async ({ request, params }) => {
      calls.push({
        method: "PUT",
        url: `/api/tokens/${params.id}`,
        body: await request.json(),
      })
      return HttpResponse.json({ success: true, code: 0, data: null })
    }),
    http.put(
      `${origin}/api/tokens/:id/channels`,
      async ({ request, params }) => {
        calls.push({
          method: "PUT",
          url: `/api/tokens/${params.id}/channels`,
          body: await request.json(),
        })
        return HttpResponse.json({ success: true, code: 0, data: null })
      },
    ),
    http.delete(`${origin}/api/tokens/:id/destroy`, ({ params }) => {
      calls.push({ method: "DELETE", url: `/api/tokens/${params.id}/destroy` })
      return HttpResponse.json({ success: true, code: 0, data: null })
    }),
  )
}

const openSession = () =>
  krillKeyResources.open({
    account: { id: "acc-1", name: "Krill", siteType: "krill" },
    request: {
      baseUrl: origin,
      accountId: "acc-1",
      auth: { authType: AuthTypeEnum.Cookie, userId: "47044" },
    } as never,
  })

describe("Krill AI registration", () => {
  it("registers one account-only family with cookie onboarding and console-bound storage", () => {
    expect(getAccountSiteDefinition("krill")).toMatchObject({
      adapterFamily: "krill",
      scopes: ["account"],
      onboarding: {
        detection: { hostnames: ["www.krill-code.com", "www.krill-ai.net"] },
        routes: {
          loginPath: "/login",
          adminCredentialsPath: "/app/keys",
          checkInPath: null,
          accessTokenPath: null,
          redeemPath: "/app",
        },
      },
      productProfile: {
        auth: {
          usesBrowserCookieSession: true,
          defaultAuthType: "cookie",
        },
        urls: { storageOrigin: origin },
      },
    })
  })

  it("offers keys, models, invitation, announcements and redemption but no check-in", () => {
    const account = getSiteTypeCapabilities("krill").account!
    expect(Object.keys(account).sort()).toEqual([
      "bootstrap",
      "completion",
      "data",
      "inviteLink",
      "keyResourceManagement",
      "modelCatalog",
      "modelPricing",
      "redemption",
      "refresh",
    ])
    expect(account.keyResourceManagement?.inventorySecretAvailability).toBe(
      "create-response-only",
    )
  })

  it("detects the console origin only", () => {
    expect(
      krillContentSessionExtractor.canExtract({
        siteTypeHint: "krill",
        url: "https://www.krill-ai.net/app",
      }),
    ).toBe(true)
    expect(
      krillContentSessionExtractor.canExtract({
        siteTypeHint: "krill",
        url: `${origin}/app`,
      }),
    ).toBe(true)
    expect(
      krillContentSessionExtractor.canExtract({
        siteTypeHint: "krill",
        url: "https://api.krill-ai.net/v1",
      }),
    ).toBe(false)
  })
})

describe("Krill browser identity", () => {
  afterEach(() => vi.unstubAllGlobals())
  it.each([
    undefined,
    "invalid",
    "http://www.krill-code.com",
    "https://www.krill-code.com:444",
    "https://evil.example",
  ])("ignores unsupported page %s", (url) => {
    expect(
      krillContentSessionExtractor.canExtract({ siteTypeHint: "krill", url }),
    ).toBe(false)
    expect(
      krillContentSessionExtractor.canExtract({
        siteTypeHint: "new-api",
        url: origin,
      }),
    ).toBe(false)
  })
  it("extracts only a verified live identity without copying the credential", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 47044,
            email: "kai@example.com",
            credit_balance_usd: "0",
            enterprise_memberships: [],
          },
        }),
      ),
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      krillContentSessionExtractor.extract({} as never),
    ).resolves.toEqual({
      userId: "47044",
      user: { id: "47044", username: "kai@example.com" },
      siteTypeHint: "krill",
    })
    expect(fetch).toHaveBeenCalledWith(`${origin}/api/auth/me`, {
      credentials: "include",
      cache: "no-store",
    })
  })
  it.each([new Response("", { status: 401 }), new Response("{}")])(
    "returns no session for unreadable identity",
    async (response) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))
      await expect(
        krillContentSessionExtractor.extract({} as never),
      ).resolves.toBeNull()
    },
  )
  it("does not cache failed browser verification", async () => {
    expect(
      krillBrowserIdentity.canObserve({ siteType: "krill", origin } as never),
    ).toBe(true)
    expect(
      krillBrowserIdentity.canObserve({
        siteType: "krill",
        origin: "https://evil.example",
      } as never),
    ).toBe(false)
    const observation = (await krillBrowserIdentity.observe({
      origin,
    } as never))!
    expect(observation.cacheResult).toBe(false)
    const read = vi.fn().mockResolvedValue({
      data: {
        id: 47044,
        email: "kai@example.com",
        credit_balance_usd: "0",
        enterprise_memberships: [],
      },
    })
    expect(await observation.verify(read)).toBe("47044")
    expect(read).toHaveBeenCalledWith({ url: `${origin}/api/auth/me` })
    read.mockRejectedValue(new Error("expired"))
    expect(await observation.verify(read)).toBeNull()
  })
})

describe("Krill AI key editor", () => {
  const catalogue = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    billingMultiplier: Number(channel.billing_multiplier),
    defaultRouted: channel.default_routed,
  }))

  it("defaults creation to the console's default-routed channels", () => {
    const editor = createKrillKeyEditor({ channels: catalogue })
    expect(editor.initialValues.channels).toEqual(["55", "1"])
    expect(editor.initialValues.allow_balance_fallback).toBe(true)
  })

  it("labels each channel with its billing multiplier", async () => {
    const editor = createKrillKeyEditor({ channels: catalogue })
    expect(await editor.loadOptions!("channels", editor.initialValues)).toEqual(
      [
        {
          value: "55",
          displayLabel: "国产模型官渠",
          secondaryLabel: "×0.3500",
        },
        { value: "35", displayLabel: "Kiro 渠道", secondaryLabel: "×0.3800" },
        { value: "1", displayLabel: "Openai 官渠", secondaryLabel: "×1.0000" },
      ],
    )
  })

  it("shows the native default channels for an empty stored selection and preserves its sentinel", () => {
    const editor = createKrillKeyEditor({
      channels: catalogue,
      detail: {
        name: "native",
        channelIds: [],
        allowBalanceFallback: true,
        ipWhitelist: [],
      },
    })
    expect(editor.initialValues.channels).toEqual(["55", "1"])
    expect(editor.validate(editor.initialValues).valid).toBe(true)
    expect(editor.buildCommand(editor.initialValues).channelIds).toEqual([])
  })

  it("requires at least one channel while allowing an unnamed key", () => {
    const editor = createKrillKeyEditor({ channels: catalogue })
    const result = editor.validate({ ...editor.initialValues, channels: [] })
    expect(result).toEqual({
      valid: false,
      issues: [{ fieldId: "channels", code: "required" }],
    })
  })

  it("rejects channel combinations that the native console makes exclusive", () => {
    const editor = createKrillKeyEditor({
      channels: [
        ...catalogue,
        {
          id: 37,
          name: "Max 官渠高可用",
          billingMultiplier: 2.083,
          defaultRouted: true,
        },
      ],
    })
    expect(
      editor.validate({ ...editor.initialValues, channels: ["35", "37"] }),
    ).toMatchObject({
      valid: false,
      issues: [{ fieldId: "channels", code: "inconsistent_value" }],
    })
  })

  it("validates unsupported channels and malformed editor values", async () => {
    const editor = createKrillKeyEditor({
      channels: catalogue,
      detail: {
        name: "",
        channelIds: [55],
        allowBalanceFallback: true,
        ipWhitelist: [],
        ipWhitelistGrey: true,
      },
    })
    expect(
      editor.validate({
        ...editor.initialValues,
        name: 4,
        channels: ["999"],
        ip_whitelist: [],
      }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "name", code: "invalid_value" },
        { fieldId: "channels", code: "unsupported_option" },
        { fieldId: "ip_whitelist", code: "invalid_value" },
      ]),
    })
    expect(await editor.loadOptions!("name", editor.initialValues)).toEqual([])
    const loader = vi.fn().mockResolvedValue(catalogue)
    const dynamic = createKrillKeyEditor({ channels: [], loadChannels: loader })
    expect(
      await dynamic.loadOptions!("channels", dynamic.initialValues),
    ).toHaveLength(3)
    expect(loader).toHaveBeenCalledTimes(1)
  })
  it("round-trips the IP whitelist through its comma-separated form", () => {
    const editor = createKrillKeyEditor({
      channels: catalogue,
      detail: {
        name: "native",
        channelIds: [55],
        allowBalanceFallback: false,
        ipWhitelist: ["203.0.113.4", "198.51.100.0/24"],
      },
    })
    expect(editor.initialValues.ip_whitelist).toBe(
      "203.0.113.4, 198.51.100.0/24",
    )
    expect(editor.buildCommand(editor.initialValues)).toMatchObject({
      name: "native",
      allowBalanceFallback: false,
      ipWhitelist: ["203.0.113.4", "198.51.100.0/24"],
      channelIds: [55],
    })
  })

  it("retains IP protection state and validates the native grey-mode requirement", () => {
    const editor = createKrillKeyEditor({
      channels: catalogue,
      detail: {
        name: "",
        channelIds: [55],
        allowBalanceFallback: true,
        ipWhitelist: [],
        ipWhitelistGrey: true,
        ipWhitelistDisabled: true,
      },
    })
    expect(editor.initialValues.ip_whitelist_disabled).toBe(true)
    expect(editor.validate(editor.initialValues).valid).toBe(true)
    expect(editor.buildCommand(editor.initialValues).ipWhitelistDisabled).toBe(
      true,
    )
    expect(
      editor.validate({
        ...editor.initialValues,
        ip_whitelist_disabled: false,
      }),
    ).toMatchObject({
      valid: false,
      issues: [{ fieldId: "ip_whitelist", code: "required" }],
    })
  })
})

describe("Krill AI key resources", () => {
  it.each(["second write", "readback"])(
    "keeps a confirmed first write uncertain when %s is rejected",
    async (stage) => {
      const collection = await (await openSession()).openCollection("account")
      const editor = await collection.openEditEditor(
        (await collection.list()).items[0]!.ref,
      )
      let settingsApplied = false
      server.use(
        http.put(`${origin}/api/tokens/:id`, () => {
          settingsApplied = true
          return HttpResponse.json({ success: true })
        }),
        http.put(`${origin}/api/tokens/:id/channels`, () =>
          HttpResponse.json(
            stage === "second write"
              ? { success: false, message: "channel rejected" }
              : { success: true },
          ),
        ),
        http.get(`${origin}/api/tokens`, () =>
          HttpResponse.json(
            settingsApplied && stage === "readback"
              ? { success: false, message: "readback rejected" }
              : { success: true, code: 0, data: tokens },
          ),
        ),
      )
      await expect(
        editor.submit({ ...editor.initialValues, name: "changed" }),
      ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
      expect(settingsApplied).toBe(true)
    },
  )

  it("updates a key with fresh detail and reads back its channel selection", async () => {
    const collection = await (await openSession()).openCollection("account")
    const editor = await collection.openEditEditor(
      (await collection.list()).items[0]!.ref,
    )
    const result = await editor.submit({
      ...editor.initialValues,
      name: "updated",
    })
    expect(result.facts?.displayName).toBe("native")
    expect(calls.map((call) => call.url)).toEqual([
      "/api/tokens/71750",
      "/api/tokens/71750/channels",
    ])
    expect(calls[0]!.body).toMatchObject({
      name: "updated",
      ip_whitelist_disabled: false,
    })
  })
  it("reports uncertain revocation when the server still lists an enabled key", async () => {
    server.use(
      http.delete(`${origin}/api/tokens/:id`, () =>
        HttpResponse.json({ success: true }),
      ),
    )
    const collection = await (await openSession()).openCollection("account")
    await expect(
      collection.revoke!((await collection.list()).items[0]!.ref),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
  })
  it("surfaces a create business rejection instead of an uncertain state", async () => {
    server.use(
      http.post(`${origin}/api/tokens`, () =>
        HttpResponse.json(
          { success: false, code: 409, message: "名称已存在" },
          { status: 200 },
        ),
      ),
    )
    const editor = await (await openSession()).openCreateEditor("account")
    await expect(
      editor.submit({ ...editor.initialValues, name: "duplicate" }),
    ).rejects.toMatchObject({
      failure: { code: "upstream_rejected", message: "名称已存在" },
    })
  })
  it.each([undefined, { ...tokens[0], ip_whitelist: [] }, { id: 90001 }])(
    "delivers the confirmed secret when creation metadata drifts: %j",
    async (item) => {
      let creates = 0
      server.use(
        http.post(`${origin}/api/tokens`, () => {
          creates++
          return HttpResponse.json({
            success: true,
            data: { token: "nb_saved-secret", item },
          })
        }),
      )
      const editor = await (await openSession()).openCreateEditor("account")
      const result = await editor.submit({
        ...editor.initialValues,
        name: "safe",
      })
      expect(result.facts).toBeNull()
      expect(result.createdSecret).toMatchObject({
        correlation: { kind: "account-create", accountId: "acc-1" },
        displayName: "safe",
        secret: "nb_saved-secret",
      })
      expect(creates).toBe(1)
    },
  )
  it("revokes without destroying the record and rejects foreign references", async () => {
    let revoked = false
    server.use(
      http.delete(`${origin}/api/tokens/:id`, ({ params }) => {
        calls.push({ method: "DELETE", url: `/api/tokens/${params.id}` })
        revoked = true
        return HttpResponse.json({ success: true, code: 0, data: null })
      }),
      http.get(`${origin}/api/tokens`, () =>
        HttpResponse.json({
          success: true,
          code: 0,
          data: tokens.map((token) =>
            token.id === 71750 && revoked
              ? { ...token, revoked_at: "2026-10-15T00:00:00Z" }
              : token,
          ),
        }),
      ),
    )
    const collection = await (await openSession()).openCollection("account")
    const ref = (await collection.list()).items[0]!.ref
    await expect(
      collection.revoke!({ ...ref, accountId: "foreign" }),
    ).rejects.toThrow()
    expect(calls).toEqual([])
    const result = await collection.revoke!(ref)
    expect(result.status).toBe("disabled")
    expect(result.actions.canRevoke).toBe(false)
    expect(result.actions.canDelete).toBe(true)
    expect(calls).toEqual([{ method: "DELETE", url: "/api/tokens/71750" }])
    expect((await collection.list()).items).toHaveLength(2)
  })
  let browserBoundary: ReturnType<typeof installCookieTransport>
  beforeEach(() => {
    calls.length = 0
    useHandlers()
    browserBoundary = installCookieTransport()
    browserBoundary.cookies.mockResolvedValue([
      {
        name: "krill_jwt",
        value: "console-session",
        domain: "www.krill-code.com",
        path: "/",
        secure: true,
        httpOnly: false,
        hostOnly: true,
        session: false,
        sameSite: "lax",
        storeId: "0",
        firstPartyDomain: "",
        expirationDate: Date.now() / 1000 + 3600,
      },
    ])
  })
  afterEach(() => vi.restoreAllMocks())

  it("masks inventory keys by their prefix and marks revoked keys disabled", async () => {
    const session = await openSession()
    const page = await (await session.openCollection("account")).list()

    expect(page.items.map((item) => item.maskedLabel)).toEqual([
      "nb_522MZ••••",
      "nb_AbCdE••••",
    ])
    expect(page.items.map((item) => item.status)).toEqual([
      "enabled",
      "disabled",
    ])
    expect(page.items.every((item) => item.runtimeSecret === undefined)).toBe(
      true,
    )
    expect(page.items[0]!.runtimeKey?.baseUrl).toBe(KRILL_API_BASE_URL)
  })

  it("never claims a recoverable plaintext from the inventory", async () => {
    const session = await openSession()
    const runtimeKey = session.runtimeKey!
    await expect(
      runtimeKey.resolve({
        accountId: "acc-1",
        siteType: "krill",
        scopeKey: "account",
        resourceId: "71750",
      }),
    ).resolves.toMatchObject({ kind: "unavailable" })
  })

  it("publishes complete detail with human-readable channels without marking lean inventory complete", async () => {
    const collection = await (await openSession()).openCollection("account")
    const item = (await collection.list()).items[1]!
    expect(item.detailAvailability).toBeUndefined()
    const detail = await collection.get(item.ref)
    expect(detail.detailAvailability).toBe("complete")
    expect(detail.displayFacts).toContainEqual({
      fieldId: "channels",
      kind: "channels",
      value: ["国产模型官渠"],
      usesDefault: false,
    })
    const defaults = await collection.get(
      (await collection.list()).items[0]!.ref,
    )
    expect(defaults.displayFacts).toContainEqual({
      fieldId: "channels",
      kind: "channels",
      usesDefault: true,
      value: ["国产模型官渠", "Openai 官渠"],
    })
    expect(defaults.runtimeKey?.modelAccess.groups).toBeNull()
  })

  it("hydrates the channel catalogue when opening the editor", async () => {
    const session = await openSession()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-1",
      siteType: "krill",
      scopeKey: "account",
      resourceId: "71750",
    })
    expect(editor.initialValues).toMatchObject({
      name: "native",
      channels: ["55", "1"],
      allow_balance_fallback: true,
      ip_whitelist: "",
    })
  })

  it("returns the one-time secret after name-only creation without fallible follow-up writes", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("account")
    const values = { ...editor.initialValues, name: "cli" }
    const result = await editor.submit(values)

    expect(calls.map((call) => call.url)).toEqual(["/api/tokens"])
    expect(calls[0]!.body).toEqual({ name: "cli" })
    expect(result.createdSecret).toMatchObject({
      secret: "nb_created-secret-value",
      secretAvailability: "create-response-only",
      // The credential address is the provider's OpenAI-compatible protocol root.
      credential: { baseUrl: "https://api.krill-ai.net" },
    })
  })

  it("creates a named key when submitting the default editor values", async () => {
    const session = await openSession()
    const plan = await prepareDefaultAccountKeyCreationInSession(
      session,
      "editor-defaults",
    )
    expect(plan.kind).toBe("ready")
    if (plan.kind !== "ready")
      throw new Error("Default creation requires input")
    await plan.create()

    expect(calls[0]!.body).toEqual({ name: DEFAULT_AUTO_PROVISION_KEY_NAME })
  })

  it("still permits explicitly clearing the optional creation name", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("account")
    await editor.submit({ ...editor.initialValues, name: "" })

    expect(calls[0]!.body).toEqual({ name: null })
  })

  it("deletes through the destroy route", async () => {
    const session = await openSession()
    const collection = await session.openCollection("account")
    await collection.delete({
      accountId: "acc-1",
      siteType: "krill",
      scopeKey: "account",
      resourceId: "71750",
    })
    expect(calls).toContainEqual({
      method: "DELETE",
      url: "/api/tokens/71750/destroy",
    })
  })
})
