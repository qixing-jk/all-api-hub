import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { buildAccountKeyResourceRuntimeKeyFromFacts } from "~/services/accounts/keys/accountRuntimeKeys"
import { cubenceCapabilities } from "~/services/apiAdapters/cubence"
import { cubenceKeyResources } from "~/services/apiAdapters/cubence/keyResources"
import {
  cubenceModelCatalog,
  cubenceModelPricing,
} from "~/services/apiAdapters/cubence/modelCatalog"
import type { CubenceKey } from "~/services/apiService/cubence/keys"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

import { createCheckInConfig } from "./checkInFixtures"

const origin = "https://cubence.com"
const request = {
  accountId: "test",
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId: 7 },
}
const key: CubenceKey = {
  id: 17,
  user_id: 7,
  key: "sk-example",
  name: "Example",
  status: "active",
  share_type: "public",
  share_group_id: 72,
  quota_limit: 10_000_000,
  quota_used: 0,
  usage_count: 0,
  last_used_at: null,
}
const group = {
  id: 72,
  name: "Premium",
  multiplier: 1,
  is_active: true,
  supported_protocols: [],
}
const model = {
  model_name: "Example",
  is_active: true,
  billing_mode: "token",
  input_price: 1,
  output_price: 2,
  cache_read_price: 0,
  cache_write_price: 0,
  group_ids: [72],
  groups: [{ id: 72, base_multiplier: 1, schedule_enabled: false }],
  pricing_tiers: [],
}

describe("Cubence account capabilities", () => {
  let current: CubenceKey[]
  beforeEach(() => {
    installCookieTransport()
    current = [key]
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({
          user: {
            id: 7,
            username: "Example",
            active: true,
            normal_balance: 1_000_000,
          },
        }),
      ),
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({ success: true, data: current }),
      ),
      http.get(`${origin}/api/v1/share-groups/available`, () =>
        HttpResponse.json({ data: [group] }),
      ),
      http.get(`${origin}/api/model-plaza`, () =>
        HttpResponse.json({ success: true, data: { models: [model] } }),
      ),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  const open = () =>
    cubenceKeyResources.open({
      account: { id: "test", name: "Cubence", siteType: "cubence" },
      request,
    })

  it("supports native key creation, editing, secret resolution and confirmed deletion", async () => {
    server.use(
      http.post(`${origin}/api/v1/user/apikeys`, async ({ request }) => {
        const input = (await request.json()) as Pick<
          CubenceKey,
          "name" | "quota_limit" | "share_group_id"
        >
        const created = { ...key, ...input, id: 18 }
        current.push(created)
        return HttpResponse.json({ success: true, data: created })
      }),
      http.patch(
        `${origin}/api/v1/user/apikeys/:id/:field`,
        async ({ params, request }) => {
          const input = (await request.json()) as object
          current = current.map((item) =>
            item.id === Number(params.id) ? { ...item, ...input } : item,
          )
          return HttpResponse.json({ success: true })
        },
      ),
      http.delete(`${origin}/api/v1/user/apikeys/:id`, ({ params }) => {
        current = current.filter((item) => item.id !== Number(params.id))
        return HttpResponse.json({ success: true })
      }),
    )
    const session = await open()
    expect((await session.resolveDefaultScope()).scopeKey).toBe("account")
    const collection = await session.openCollection("account")
    const page = await collection.list()
    const ref = page.items[0]!.ref
    expect(await collection.get(ref)).toMatchObject({
      displayName: "Example",
      status: "enabled",
    })
    expect(await session.runtimeKey!.resolve(ref)).toMatchObject({
      kind: "resolved",
      secret: "sk-example",
    })
    const creator = await session.openCreateEditor("account")
    await creator.loadOptions!("group", creator.initialValues)
    const created = await creator.submit({
      ...creator.initialValues,
      group: "72",
      name: "Created",
    })
    expect(current.find((item) => item.id === 18)?.quota_limit).toBe(-1)
    expect(created.facts).toMatchObject({ displayName: "Created" })
    const editor = await collection.openEditEditor(ref)
    await editor.loadOptions!("group", editor.initialValues)
    await editor.submit({
      ...editor.initialValues,
      unlimited: true,
      enabled: false,
    })
    expect(await collection.get(ref)).toMatchObject({
      status: "disabled",
      displayFacts: expect.arrayContaining([
        expect.objectContaining({ fieldId: "quota", unlimited: true }),
      ]),
    })
    await collection.delete(ref)
    await expect(collection.get(ref)).rejects.toMatchObject({
      failure: { code: "not_found" },
    })
    expect(current.map((item) => item.name)).toEqual(["Created"])
  })
  it.each(["", "sk-***"])(
    "refuses unavailable inventory secrets %j",
    async (secret) => {
      current = [{ ...key, key: secret }]
      const session = await open()
      const page = await (await session.openCollection("account")).list()
      expect(
        await session.runtimeKey!.resolve(page.items[0]!.ref),
      ).toMatchObject({ kind: "unavailable" })
    },
  )
  it("marks unconfirmed writes uncertain", async () => {
    const session = await open()
    const collection = await session.openCollection("account")
    const ref = (await collection.list()).items[0]!.ref
    const editor = await collection.openEditEditor(ref)
    await editor.loadOptions!("group", editor.initialValues)
    server.use(
      http.patch(`${origin}/api/v1/user/apikeys/:id/quota`, () =>
        HttpResponse.json({ success: true }),
      ),
    )
    await expect(
      editor.submit({ ...editor.initialValues, unlimited: false, quota: 3 }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
  })
  it("rejects a concurrent quota change without applying a write", async () => {
    const collection = await (await open()).openCollection("account")
    const ref = (await collection.list()).items[0]!.ref
    const editor = await collection.openEditEditor(ref)
    await editor.loadOptions!("group", editor.initialValues)
    let reads = 0
    const write = vi.fn(() => HttpResponse.json({ success: true }))
    server.use(
      http.get(`${origin}/api/v1/user/apikeys`, () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              ...key,
              quota_limit: ++reads === 1 ? key.quota_limit : 2_000_000,
            },
          ],
        }),
      ),
      http.patch(`${origin}/api/v1/user/apikeys/:id/quota`, write),
    )
    await expect(
      editor.submit({ ...editor.initialValues, quota: 3 }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(write).not.toHaveBeenCalled()
  })
  it("loads console pricing and enriches only the selected model", async () => {
    const pricing = await cubenceModelPricing.fetchPricing(request)
    expect(pricing.data.map((row) => row.model_name)).toEqual(["Example"])
    const collection = await (await open()).openCollection("account")
    const facts = (await collection.list()).items[0]!
    const runtimeKey = buildAccountKeyResourceRuntimeKeyFromFacts(
      {
        id: "test",
        name: "Cubence",
        siteType: "cubence",
        baseUrl: origin,
        userId: "7",
        authType: AuthTypeEnum.Cookie,
        token: "",
      },
      facts,
      "sk-example",
    )
    const enriched = await cubenceModelCatalog.enrichPricing!({
      accountRequest: request,
      runtimeKey,
      models: [{ id: "different" }],
    })
    expect(enriched.data).toEqual([])
    server.use(
      http.get(`${origin}/api/model-plaza`, () =>
        HttpResponse.json({
          success: true,
          data: { models: [{ ...model, vendor: { name: "Publisher" } }] },
        }),
      ),
    )
    expect(
      await cubenceModelCatalog.fetchModels(
        { ...request, auth: { ...request.auth, apiKey: "sk-example" } },
        { accountRequest: request },
      ),
    ).toEqual([
      {
        id: "Example",
        vendorEvidence: { kind: "publisher", name: "Publisher" },
      },
    ])
    await expect(
      cubenceModelCatalog.fetchModels({
        baseUrl: origin,
        auth: { authType: AuthTypeEnum.AccessToken, apiKey: "sk-example" },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })
  it("exposes Cookie-only bootstrap and reports failed account refreshes", async () => {
    const account = cubenceCapabilities.account!
    expect(await account.bootstrap!.fetchCheckInSupport!(request, {})).toBe(
      false,
    )
    await expect(
      account.bootstrap!.getOrCreateAccessToken!(request),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json({}, { status: 401 }),
      ),
    )
    expect(
      await account.refresh!.refreshAccount({
        ...request,
        checkIn: createCheckInConfig("cubence"),
      }),
    ).toMatchObject({ success: false })
  })
  it("completes a detected browser account from live identity and exposes console routes", async () => {
    const capture = vi.fn()
    const completed = await completeAutoDetectedAccount({
      url: origin,
      requestedAuthType: AuthTypeEnum.Cookie,
      detected: { siteType: "cubence", userId: "7" },
      onRecoveryData: capture,
    })
    expect(completed).toMatchObject({
      siteName: "Cubence",
      username: "Example",
      accessToken: "",
      authType: AuthTypeEnum.Cookie,
      userId: "7",
    })
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "7", username: "Example" }),
    )
    const bootstrap = cubenceCapabilities.account!.bootstrap!
    expect(await bootstrap.loadBootstrapFacts(request)).toMatchObject({
      displayName: "Cubence",
      checkInSupported: false,
    })
    expect(
      await bootstrap.resolveRoutePath(
        { baseUrl: origin, siteType: "cubence" },
        "login",
      ),
    ).toBe("/auth/login")
    server.use(
      http.get(`${origin}/api/v1/invite/my-code`, () =>
        HttpResponse.json({ data: { invite_code: "invite" } }),
      ),
    )
    expect(
      await cubenceCapabilities.account!.inviteLink!.fetchInviteLink({
        request,
      }),
    ).toContain("invite")
  })
})
