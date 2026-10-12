import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { buildAccountKeyResourceRuntimeKeyFromFacts } from "~/services/accounts/keys/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  readDahlKeyNames,
  saveDahlKeyName,
} from "~/services/apiAdapters/dahl/keyNames"
import { syncDahlKeyNames } from "~/services/apiAdapters/dahl/keyNameSync"
import { dahlKeyNameOwner } from "~/services/apiAdapters/dahl/keyNameValue"
import { DAHL_KEY_SCOPE } from "~/services/apiAdapters/dahl/keyResources"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  createKey,
  fetchAccountData,
  fetchKeys,
  fetchModels,
  fetchUserInfo,
  revokeKey,
  transferKeyTokens,
  type DahlKey,
} from "~/services/apiService/dahl"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

import { createCheckInConfig } from "../../apiAdapters/checkInFixtures"

const origin = "https://inference.dahl.global"
const userId = "00000000-0000-4000-8000-000000000001"
const request = {
  baseUrl: origin,
  auth: { authType: AuthTypeEnum.Cookie, userId },
}
const body = {
  user: { user_id: userId, username: "sample" },
  token_balance: 90000000,
  tokens_on_keys: 10000000,
  paid: false,
}

describe("Dahl account contract", () => {
  it("reuses verified optional inventory tokens without repeating account and key requests", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [key] }),
      ),
    )
    const account = buildDisplaySiteData({
      id: "dahl-test",
      siteType: SITE_TYPES.DAHL,
      baseUrl: origin,
      authType: AuthTypeEnum.Cookie,
      userId,
      token: "",
    })
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.DAHL,
    ).account!.keyResourceManagement!.open({
      account: { id: account.id, siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: account.id },
    })
    const facts = (await (await session.openCollection(DAHL_KEY_SCOPE)).list())
      .items[0]!
    expect(facts.detailAvailability).toBe("complete")
    const runtimeKey = buildAccountKeyResourceRuntimeKeyFromFacts(
      account,
      facts,
    )
    const unexpectedRead = vi.fn(() => new HttpResponse(null, { status: 503 }))
    server.use(http.get(`${origin}/*`, unexpectedRead))
    await expect(
      resolveDisplayAccountRuntimeKeySecret(account, runtimeKey),
    ).resolves.toMatchObject({ secret: key.token })
    expect(unexpectedRead).not.toHaveBeenCalled()
    expect(facts.maskedLabel).not.toBe(key.token)
  })

  beforeEach(async () => {
    const boundary = installCookieTransport()
    const cookie = (await browser.cookies.getAll({}))[0]!
    boundary.cookies.mockResolvedValue([
      { ...cookie, domain: "inference.dahl.global", name: "dahl_session" },
    ])
  })
  afterEach(() => vi.restoreAllMocks())
  it.each([undefined, { user: {} }, { user: { user_id: "not-a-uuid" } }])(
    "rejects malformed account identities before exposing facts: %j",
    async (account) => {
      server.use(
        http.get(`${origin}/v1/account`, () =>
          HttpResponse.json(account ?? null),
        ),
      )
      await expect(fetchUserInfo(request)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )
  it("retains a verified UUID when the optional username is absent", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () =>
        HttpResponse.json({ user: { user_id: userId } }),
      ),
    )
    await expect(fetchUserInfo(request)).resolves.toMatchObject({
      id: userId,
      username: "",
    })
  })
  it.each([
    { direction: editActions.Allocate, amount: 0 },
    { direction: editActions.Return, amount: -1 },
    { direction: editActions.Allocate, amount: 1.5 },
  ])("rejects an invalid transfer without dispatch: %j", async (transfer) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(
      transferKeyTokens(request, key, transfer),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it.each([
    { direction: editActions.Allocate, amount: 90000001 },
    { direction: editActions.Return, amount: 101 },
  ])(
    "rejects a transfer above its source balance before POST: %j",
    async (transfer) => {
      const write = vi.fn(() => HttpResponse.json({ ok: true }))
      server.use(
        http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
        http.get(`${origin}/v1/account/keys`, () =>
          HttpResponse.json({ keys: [key] }),
        ),
        http.post(`${origin}/v1/account/allocate`, write),
        http.post(`${origin}/v1/account/return`, write),
      )
      await expect(
        transferKeyTokens(request, key, transfer),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      expect(write).not.toHaveBeenCalled()
    },
  )
  it("rejects duplicate key IDs rather than choosing an ambiguous target", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [key, key] }),
      ),
    )
    await expect(fetchKeys(request)).rejects.toMatchObject({
      code: "JSON_PARSE_ERROR",
    })
  })
  it("reports uncertainty after one transfer dispatch when readback disagrees", async () => {
    const write = vi.fn(() => HttpResponse.json({ ok: true }))
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [key] }),
      ),
      http.post(`${origin}/v1/account/allocate`, write),
    )
    await expect(
      transferKeyTokens(request, key, {
        direction: editActions.Allocate,
        amount: 1,
      }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
    expect(write).toHaveBeenCalledOnce()
  })
  it.each(["0", "07", "9007199254740992"])(
    "rejects an invalid revoke ID before dispatch: %s",
    async (id) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      await expect(revokeKey(request, id)).rejects.toMatchObject({
        failure: { code: "not_found" },
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )
  it("accepts acknowledged revocation without reading the key inventory", async () => {
    const read = vi.fn(() => HttpResponse.error())
    const write = vi.fn(() => HttpResponse.json({ ok: true }))
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, read),
      http.delete(`${origin}/v1/account/keys/7`, write),
    )
    await expect(revokeKey(request, "7")).resolves.toBeUndefined()
    expect(read).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledOnce()
  })
  it("surfaces server rejection for a missing revoke target", async () => {
    const write = vi.fn(() =>
      HttpResponse.json({ error: "Not found" }, { status: 404 }),
    )
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.delete(`${origin}/v1/account/keys/7`, write),
    )
    await expect(revokeKey(request, "7")).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(write).toHaveBeenCalledOnce()
  })
  it.each([{}, { data: [null] }, { data: [{ id: " " }] }])(
    "rejects a malformed public catalog: %j",
    async (catalog) => {
      server.use(
        http.get(`${origin}/v1/models`, () => HttpResponse.json(catalog)),
      )
      await expect(fetchModels(request)).rejects.toMatchObject({
        code: "JSON_PARSE_ERROR",
      })
    },
  )

  it("revokes through the native collection and removes only the acknowledged key label", async () => {
    let current = { ...key }
    const write = vi.fn(() => {
      current = { ...key, status: "revoked", available_tokens: 0 }
      return HttpResponse.json({ ok: true })
    })
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [current] }),
      ),
      http.delete(`${origin}/v1/account/keys/7`, write),
    )
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 7, incognito: false } as browser.tabs.Tab,
    ])
    vi.spyOn(browser.tabs, "sendMessage").mockResolvedValue({
      success: true,
      userId,
      labels: { "7": "" },
    })
    const capability = getSiteTypeCapabilities(SITE_TYPES.DAHL).account!
      .keyResourceManagement!
    const session = await capability.open({
      account: { id: "local", siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: "local" },
    })
    const owner = dahlKeyNameOwner(request)
    await saveDahlKeyName(owner, 7, "Work")
    await saveDahlKeyName(owner, 8, "Other key")
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    const ref = (await collection.list()).items[0]!.ref
    await collection.delete(ref)
    expect(write).toHaveBeenCalledOnce()
    expect((await collection.list()).items).toHaveLength(0)
    expect((await fetchKeys(request))[0]).toMatchObject({
      status: "revoked",
      available_tokens: 0,
    })
    expect((await readDahlKeyNames(owner))["7"]).toBeUndefined()
    expect((await readDahlKeyNames(owner))["8"]).toMatchObject({
      name: "Other key",
    })
  })

  it.each(["0", "07", "not-an-id"])(
    "rejects an invalid rename target without contacting the provider: %s",
    async (resourceId) => {
      const session = await getSiteTypeCapabilities(
        SITE_TYPES.DAHL,
      ).account!.keyResourceManagement!.open({
        account: { id: "local", siteType: SITE_TYPES.DAHL },
        request: { ...request, accountId: "local" },
      })
      const collection = await session.openCollection(DAHL_KEY_SCOPE)
      const fetchSpy = vi.spyOn(globalThis, "fetch")
      await expect(
        collection.openEditEditor(
          {
            accountId: "local",
            siteType: SITE_TYPES.DAHL,
            scopeKey: DAHL_KEY_SCOPE,
            resourceId,
          },
          undefined,
          { action: editActions.Rename },
        ),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )
  it.each(["missing-secret", "revoked"])(
    "does not expose an unusable runtime secret: %s",
    async (state) => {
      server.use(
        http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
        http.get(`${origin}/v1/account/keys`, () =>
          HttpResponse.json({
            keys: [
              {
                ...key,
                ...(state === "missing-secret"
                  ? { token: undefined }
                  : { status: "revoked" }),
              },
            ],
          }),
        ),
      )
      const session = await getSiteTypeCapabilities(
        SITE_TYPES.DAHL,
      ).account!.keyResourceManagement!.open({
        account: { id: "local", siteType: SITE_TYPES.DAHL },
        request: { ...request, accountId: "local" },
      })
      expect(
        await session.runtimeKey!.resolve({
          accountId: "local",
          siteType: SITE_TYPES.DAHL,
          scopeKey: DAHL_KEY_SCOPE,
          resourceId: "7",
        }),
      ).toMatchObject({ kind: "unavailable" })
    },
  )
  it("does not rename a revoked snapshot or send a funding mutation for a missing target", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [key] }),
      ),
    )
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.DAHL,
    ).account!.keyResourceManagement!.open({
      account: { id: "local", siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: "local" },
    })
    const collection = await session.openCollection(DAHL_KEY_SCOPE)
    const ref = {
      accountId: "local",
      siteType: SITE_TYPES.DAHL,
      scopeKey: DAHL_KEY_SCOPE,
      resourceId: "7",
    }
    const snapshot = {
      ...(await collection.get(ref)),
      actions: { canUpdate: false, canDelete: false },
    }
    await expect(
      collection.openEditEditor(ref, undefined, {
        action: editActions.Rename,
        snapshot,
      }),
    ).rejects.toMatchObject({ failure: { code: "not_found" } })
    server.use(
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [] }),
      ),
    )
    await expect(
      transferKeyTokens(request, key, {
        direction: editActions.Allocate,
        amount: 1,
      }),
    ).rejects.toMatchObject({ failure: { code: "not_found" } })
  })

  it("creates a key without asking for an allocation amount", async () => {
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.DAHL,
    ).account!.keyResourceManagement!.open({
      account: { id: "local", siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: "local" },
    })
    const editor = await session.openCreateEditor(DAHL_KEY_SCOPE)
    expect(editor.fields.map((field) => field.fieldId)).toEqual(["local_name"])
    expect(editor.initialValues).toEqual({ local_name: "" })
    expect(editor.validate({}).valid).toBe(true)
  })
  it("rejects oversized names in creation and rename before submitting a mutation", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [key] }),
      ),
    )
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.DAHL,
    ).account!.keyResourceManagement!.open({
      account: { id: "local", siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: "local" },
    })
    const creator = await session.openCreateEditor(DAHL_KEY_SCOPE)
    const collection = await session.openCollection(DAHL_KEY_SCOPE)
    const row = (await collection.list()).items[0]!
    const rename = await collection.openEditEditor(row.ref, undefined, {
      action: editActions.Rename,
      snapshot: row,
    })
    for (const editor of [creator, rename]) {
      const values = { ...editor.initialValues, local_name: "x".repeat(129) }
      expect(editor.validate(values)).toMatchObject({
        valid: false,
        issues: [{ fieldId: "local_name", code: "out_of_range" }],
      })
      await expect(editor.submit(values)).rejects.toMatchObject({
        failure: { code: "validation_failed" },
      })
    }
  })
  const key: DahlKey = {
    id: 7,
    available_tokens: 100,
    total_tokens: 150,
    created_at: "2026-10-11T00:00:00Z",
    status: "active",
    masked: "dahl_abc…xyz",
    token: "dahl_example",
  }
  it.each([
    [editActions.Allocate, 300],
    [editActions.Allocate, 50],
    [editActions.Return, 300],
    [editActions.Return, 50],
  ] as const)(
    "rejects a changed balance before submitting %s from an open editor (balance %s)",
    async (action, changedBalance) => {
      let current = { ...key }
      const write = vi.fn(() => HttpResponse.json({ ok: true }))
      server.use(
        http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
        http.get(`${origin}/v1/account/keys`, () =>
          HttpResponse.json({ keys: [current] }),
        ),
        http.post(`${origin}/v1/account/allocate`, write),
        http.post(`${origin}/v1/account/return`, write),
      )
      const session = await getSiteTypeCapabilities(
        SITE_TYPES.DAHL,
      ).account!.keyResourceManagement!.open({
        account: { id: "local", siteType: SITE_TYPES.DAHL },
        request: { ...request, accountId: "local" },
      })
      const collection = await session.openCollection(DAHL_KEY_SCOPE)
      const ref = (await collection.list()).items[0]!.ref
      const editor = await collection.openEditEditor(ref, undefined, { action })
      current = { ...current, available_tokens: changedBalance }
      await expect(
        editor.submit({ ...editor.initialValues, transfer_amount: "40" }),
      ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
      expect(write).not.toHaveBeenCalled()
    },
  )
  it.each(["malformed", "network"] as const)(
    "does not replay a dispatched creation after a %s response failure",
    async (failure) => {
      const write = vi.fn(() =>
        failure === "network"
          ? HttpResponse.error()
          : HttpResponse.json({ key: null }),
      )
      server.use(
        http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
        http.post(`${origin}/v1/account/keys`, write),
      )
      const session = await getSiteTypeCapabilities(
        SITE_TYPES.DAHL,
      ).account!.keyResourceManagement!.open({
        account: { id: "local", siteType: SITE_TYPES.DAHL },
        request: { ...request, accountId: "local" },
      })
      const editor = await session.openCreateEditor(DAHL_KEY_SCOPE)
      await expect(editor.submit(editor.initialValues)).rejects.toMatchObject({
        failure: { code: "mutation_state_uncertain" },
      })
      await expect(editor.submit(editor.initialValues)).rejects.toMatchObject({
        failure: { code: "validation_failed" },
      })
      expect(write).toHaveBeenCalledTimes(1)
    },
  )
  it.each([editActions.Allocate, editActions.Return] as const)(
    "reports an uncertain %s when readback fails after its write",
    async (action) => {
      let applied = false
      const write = vi.fn(() => {
        applied = true
        return HttpResponse.json({ ok: true })
      })
      server.use(
        http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
        http.get(`${origin}/v1/account/keys`, () =>
          applied ? HttpResponse.error() : HttpResponse.json({ keys: [key] }),
        ),
        http.post(`${origin}/v1/account/allocate`, write),
        http.post(`${origin}/v1/account/return`, write),
        http.delete(`${origin}/v1/account/keys/7`, write),
      )
      const session = await getSiteTypeCapabilities(
        SITE_TYPES.DAHL,
      ).account!.keyResourceManagement!.open({
        account: { id: "local", siteType: SITE_TYPES.DAHL },
        request: { ...request, accountId: "local" },
      })
      const collection = await session.openCollection(DAHL_KEY_SCOPE)
      const ref = (await collection.list()).items[0]!.ref
      const editor = await collection.openEditEditor(ref, undefined, { action })
      await expect(
        editor.submit({ ...editor.initialValues, transfer_amount: "40" }),
      ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
      await expect(
        editor.submit({ ...editor.initialValues, transfer_amount: "40" }),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
      expect(write).toHaveBeenCalledTimes(1)
    },
  )
  it("commits a local rename without waiting for any provider or website request", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [key] }),
      ),
    )
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.DAHL,
    ).account!.keyResourceManagement!.open({
      account: { id: "local", siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: "local" },
    })
    const collection = await session.openCollection(DAHL_KEY_SCOPE)
    const row = (await collection.list()).items[0]!
    let reads = 0
    server.use(
      http.get(`${origin}/v1/*`, ({ request }) => {
        reads++
        return HttpResponse.json(
          request.url.endsWith("/keys") ? { keys: [key] } : body,
        )
      }),
    )
    const send = vi.spyOn(browser.tabs, "sendMessage")
    const editor = await collection.openEditEditor(row.ref, undefined, {
      action: editActions.Rename,
      snapshot: row,
    })
    expect(editor.fields.map((field) => field.fieldId)).toEqual([
      "local_name",
      "name_sync",
    ])
    const result = await editor.submit({
      ...editor.initialValues,
      transfer_direction: editActions.Rename,
      local_name: "Fast rename",
    })
    expect(result.facts?.displayName).toBe("Fast rename")
    expect(reads).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
  it("imports website names and synchronizes local renames only through a verified same-profile page", async () => {
    const labels: Record<string, string> = { "7": "Website key" }
    vi.spyOn(browser.tabs, "query").mockResolvedValue([
      { id: 7, url: `${origin}/account`, incognito: false } as browser.tabs.Tab,
    ])
    const send = vi.spyOn(browser.tabs, "sendMessage").mockImplementation(
      async (
        _tabId,
        message: {
          action: string
          expectedUserId: string
          pendingLabels: Record<string, string>
        },
      ) => {
        expect(message.action).toBe("contentSyncDahlKeyNames")
        expect(message.expectedUserId).toBe(userId)
        Object.assign(labels, message.pendingLabels)
        return { success: true, userId, labels }
      },
    )
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [key] }),
      ),
    )
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.DAHL,
    ).account!.keyResourceManagement!.open({
      account: { id: "local", siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: "local" },
    })
    const collection = await session.openCollection(DAHL_KEY_SCOPE)
    const row = (await collection.list()).items[0]!
    expect(row.displayName).toBe("Website key")
    const editor = await collection.openEditEditor(row.ref, undefined, {
      action: editActions.Rename,
      snapshot: row,
    })
    await editor.submit({
      ...editor.initialValues,
      transfer_direction: editActions.Rename,
      local_name: "Extension key",
    })
    await collection.list()
    expect(labels["7"]).toBe("Extension key")
    expect(send).toHaveBeenCalled()
    labels["7"] = "Changed on website"
    expect((await collection.list()).items[0]!.displayName).toBe(
      "Changed on website",
    )
    send.mockResolvedValue({ success: false })
    const offline = await collection.openEditEditor(row.ref, undefined, {
      action: editActions.Rename,
      snapshot: row,
    })
    await offline.submit({
      ...offline.initialValues,
      transfer_direction: editActions.Rename,
      local_name: "Offline key",
    })
    expect((await collection.list()).items[0]!.displayName).toBe("Offline key")
    expect(
      (
        await collection.openEditEditor(row.ref, undefined, {
          action: editActions.Rename,
          snapshot: row,
        })
      ).initialValues.name_sync,
    ).toBe("pending")
    expect(labels["7"]).toBe("Changed on website")
  })
  it("names a zero-token key and persists a rename without sending funding or name writes to the API", async () => {
    const current = { ...key, available_tokens: 0, total_tokens: 0 }
    let serverWrites = 0
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [current] }),
      ),
      http.post(`${origin}/v1/account/keys`, async ({ request }) => {
        serverWrites++
        expect(await request.text()).toBe("")
        return HttpResponse.json({ key: current }, { status: 201 })
      }),
      http.all(`${origin}/v1/account/allocate`, () => {
        serverWrites++
        return HttpResponse.json({})
      }),
    )
    const capability = getSiteTypeCapabilities(SITE_TYPES.DAHL).account!
      .keyResourceManagement!
    const open = () =>
      capability.open({
        account: { id: "local", siteType: SITE_TYPES.DAHL },
        request: { ...request, accountId: "local" },
      })
    const session = await open()
    const creator = await session.openCreateEditor(DAHL_KEY_SCOPE)
    const result = await creator.submit({ local_name: "  Work key  " })
    expect(result.createdSecret?.displayName).toBe("Work key")
    const collection = await (await open()).openCollection(DAHL_KEY_SCOPE)
    const row = (await collection.list()).items[0]!
    expect(row.displayName).toBe("Work key")
    const editor = await collection.openEditEditor(row.ref, undefined, {
      action: editActions.Rename,
      snapshot: row,
    })
    expect(editor.initialValues.local_name).toBe("Work key")
    expect(
      editor.validate({
        ...editor.initialValues,
        transfer_direction: editActions.Rename,
        local_name: "Personal key",
      }).valid,
    ).toBe(true)
    await editor.submit({
      ...editor.initialValues,
      transfer_direction: editActions.Rename,
      local_name: "Personal key",
    })
    expect((await collection.list()).items[0]!.displayName).toBe("Personal key")
    expect(serverWrites).toBe(1)
    expect(current.available_tokens).toBe(0)
    expect(
      (
        await syncDahlKeyNames(
          {
            ...request,
            fetchContext: { kind: "browser-context", incognito: true },
          },
          [7],
        )
      ).names,
    ).toEqual({})
    const otherSession = await capability.open({
      account: { id: "other", siteType: SITE_TYPES.DAHL },
      request: {
        ...request,
        accountId: "other",
        auth: {
          ...request.auth,
          userId: "00000000-0000-4000-8000-000000000002",
        },
      },
    })
    server.use(
      http.get(`${origin}/v1/account`, () =>
        HttpResponse.json({
          ...body,
          user: {
            ...body.user,
            user_id: "00000000-0000-4000-8000-000000000002",
          },
        }),
      ),
    )
    expect(
      (await (await otherSession.openCollection(DAHL_KEY_SCOPE)).list())
        .items[0]!.displayName,
    ).toBe("Dahl #7")
  })
  it("submits K/M allocation and full return as native transfer quantities", async () => {
    let current = { ...key }
    let pool = 90000000
    const transfers: unknown[] = []
    server.use(
      http.get(`${origin}/v1/account`, () =>
        HttpResponse.json({ ...body, token_balance: pool }),
      ),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [current] }),
      ),
      http.post(`${origin}/v1/account/allocate`, async ({ request }) => {
        const command = (await request.json()) as {
          key_id: number
          amount: number
        }
        transfers.push(command)
        pool -= command.amount
        current = {
          ...current,
          available_tokens: current.available_tokens + command.amount,
          total_tokens: current.total_tokens + command.amount,
        }
        return HttpResponse.json({ key: current, token_balance: pool })
      }),
      http.post(`${origin}/v1/account/return`, async ({ request }) => {
        const command = (await request.json()) as {
          key_id: number
          amount: number
        }
        transfers.push(command)
        pool += command.amount
        current = {
          ...current,
          available_tokens: current.available_tokens - command.amount,
        }
        return HttpResponse.json({ key: current, token_balance: pool })
      }),
    )
    const session = await getSiteTypeCapabilities(
      SITE_TYPES.DAHL,
    ).account!.keyResourceManagement!.open({
      account: { id: "local", siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: "local" },
    })
    const collection = await session.openCollection(DAHL_KEY_SCOPE)
    const ref = (await collection.list()).items[0]!.ref
    const allocation = await collection.openEditEditor(ref)
    await allocation.submit({
      ...allocation.initialValues,
      transfer_amount: "1.5M",
    })
    expect(transfers).toEqual([{ key_id: 7, amount: 1500000 }])
    const returned = await collection.openEditEditor(ref, undefined, {
      action: editActions.Return,
    })
    expect(returned.initialValues).toMatchObject({
      pool_tokens: 88500000,
      key_tokens: 1500100,
    })
    await returned.submit({
      ...returned.initialValues,
      transfer_direction: editActions.Return,
      transfer_amount: "1500100",
    })
    expect(transfers).toEqual([
      { key_id: 7, amount: 1500000 },
      { key_id: 7, amount: 1500100 },
    ])
    expect(current.available_tokens).toBe(0)
    expect(pool).toBe(90000100)
  })
  it("dispatches provider pricing and a funding editor without exporting console credentials", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [key] }),
      ),
      http.get(`${origin}/v1/models`, ({ request }) => {
        expect(request.headers.get("Authorization")).toBeNull()
        return HttpResponse.json({ data: [{ id: "sample-model" }] })
      }),
    )
    const account = getSiteTypeCapabilities(SITE_TYPES.DAHL).account!
    const pricing = await account.modelPricing!.fetchPricing(request)
    expect(pricing.data[0]!.token_price_usd_per_million).toEqual({
      input: 0.03,
      output: 0.03,
      cache_read: 0.03,
    })
    expect(pricing.model_list_source?.kind).toBe("provider-catalog")
    const capability = account.keyResourceManagement!
    expect(capability.defaultCreation).toBe("requires-input")
    const session = await capability.open({
      account: { id: "local", siteType: SITE_TYPES.DAHL },
      request: { ...request, accountId: "local" },
    })
    const collection = await session.openCollection(DAHL_KEY_SCOPE)
    const ref = (await collection.list()).items[0]!.ref
    expect(await session.runtimeKey!.resolve(ref)).toEqual({
      kind: "resolved",
      secret: "dahl_example",
    })
    const editor = await collection.openEditEditor(ref)
    expect(editor.initialValues).toMatchObject({
      transfer_direction: editActions.Allocate,
      transfer_amount: "",
      pool_tokens: 90000000,
      key_tokens: 100,
    })
    const allocation = { ...editor.initialValues, transfer_amount: "2.5M" }
    expect(editor.validate(allocation).valid).toBe(true)
    expect(
      editor.validate({ ...allocation, transfer_amount: "91M" }).valid,
    ).toBe(false)
    const returned = {
      ...allocation,
      transfer_direction: editActions.Return,
      transfer_amount: "100",
    }
    expect(editor.validate(returned).valid).toBe(false)
    const returnEditor = await collection.openEditEditor(ref, undefined, {
      action: editActions.Return,
    })
    expect(returnEditor.validate(returned).valid).toBe(true)
    expect(
      returnEditor.validate({ ...returned, transfer_amount: "101" }).valid,
    ).toBe(false)
    expect(
      returnEditor.validate({ ...returned, transfer_amount: "0" }).valid,
    ).toBe(false)
    expect(
      returnEditor.validate({ ...returned, transfer_amount: "1.5" }).valid,
    ).toBe(false)
  })
  it.each([true, false])(
    "creates a zero-token key without inventing a secret when returned token is present: %s",
    async (hasToken) => {
      const accountRead = vi.fn(() => HttpResponse.json(body))
      server.use(
        http.get(`${origin}/v1/account`, accountRead),
        http.get(`${origin}/v1/account/keys`, () =>
          HttpResponse.json({ keys: [key] }),
        ),
        http.post(`${origin}/v1/account/keys`, async ({ request }) => {
          expect(await request.text()).toBe("")
          return HttpResponse.json(
            {
              key: {
                ...key,
                token: hasToken ? key.token : undefined,
                available_tokens: 0,
                total_tokens: 0,
                status: "exhausted",
              },
            },
            { status: 201 },
          )
        }),
      )
      expect(await fetchKeys(request)).toEqual([key])
      expect(await createKey(request)).toMatchObject({
        available_tokens: 0,
        status: "exhausted",
      })
      const session = await getSiteTypeCapabilities(
        SITE_TYPES.DAHL,
      ).account!.keyResourceManagement!.open({
        account: { id: "local", siteType: SITE_TYPES.DAHL },
        request: { ...request, accountId: "local" },
      })
      const creator = await session.openCreateEditor(DAHL_KEY_SCOPE)
      accountRead.mockClear()
      const result = await creator.submit({})
      expect(accountRead).toHaveBeenCalledOnce()
      expect(result.facts?.ref.resourceId).toBe(String(key.id))
      expect(result.createdSecret?.secret).toBe(
        hasToken ? "dahl_example" : undefined,
      )
    },
  )
  it("allocates only the difference and reads back the new owned-key balance", async () => {
    let current = key
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [current] }),
      ),
      http.post(`${origin}/v1/account/allocate`, async ({ request }) => {
        expect(await request.json()).toEqual({ key_id: 7, amount: 50 })
        current = { ...key, available_tokens: 150, total_tokens: 200 }
        return HttpResponse.json({ ok: true })
      }),
    )
    expect(
      await transferKeyTokens(request, key, {
        direction: editActions.Allocate,
        amount: 50,
      }),
    ).toMatchObject({
      available_tokens: 150,
      total_tokens: 200,
    })
  })
  it("returns only the difference and never transfers tokens after an obsolete key balance", async () => {
    let current = key
    let mutations = 0
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [current] }),
      ),
      http.post(`${origin}/v1/account/return`, async ({ request }) => {
        mutations++
        expect(await request.json()).toEqual({ key_id: 7, amount: 40 })
        current = { ...key, available_tokens: 60 }
        return HttpResponse.json({ ok: true })
      }),
    )
    expect(
      await transferKeyTokens(request, key, {
        direction: editActions.Return,
        amount: 40,
      }),
    ).toMatchObject({
      available_tokens: 60,
    })
    await expect(
      transferKeyTokens(request, key, {
        direction: editActions.Return,
        amount: 50,
      }),
    ).rejects.toMatchObject({
      failure: { code: "resource_changed" },
    })
    expect(mutations).toBe(1)
  })
  it("reconciles revocation without deleting unrelated keys", async () => {
    let current = key
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/keys`, () =>
        HttpResponse.json({ keys: [current] }),
      ),
      http.delete(`${origin}/v1/account/keys/7`, () => {
        current = { ...key, status: "revoked", available_tokens: 0 }
        return HttpResponse.json({ ok: true })
      }),
    )
    await expect(revokeKey(request, "7")).resolves.toBeUndefined()
  })
  it("keeps pool and key tokens in the total credit without inventing daily statistics", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      http.get(`${origin}/v1/account/usage`, () =>
        HttpResponse.json({
          daily: [],
          models: [],
          total_input_tokens: 20,
          total_output_tokens: 10,
          total_requests: 2,
        }),
      ),
    )
    const result = await fetchAccountData({
      ...request,
      checkIn: createCheckInConfig(SITE_TYPES.DAHL),
    })
    expect(result.quota).toBe(1500000) // 100M tokens * $0.03/M * 500000 quota/USD.
    expect(result.subscription).toMatchObject({ remainingTokens: 100000000 })
    expect(result.subscription?.remainingCount).toBeUndefined()
    expect(result.usage).toMatchObject({ totalTokens: 30, totalRequests: 2 })
    expect(result.todayStatsAvailability?.consumption).toMatchObject({
      status: "unavailable",
      reason: "unsupported",
    })
  })

  it.each(["", "   "])(
    "discovers identity with a blank onboarding userId %j",
    async (userId) => {
      server.use(
        http.get(`${origin}/v1/account`, () => HttpResponse.json(body)),
      )
      await expect(
        fetchUserInfo({ ...request, auth: { ...request.auth, userId } }),
      ).resolves.toMatchObject({ id: body.user.user_id })
    },
  )

  it("rejects a numeric identity instead of silently treating it as onboarding", async () => {
    server.use(http.get(`${origin}/v1/account`, () => HttpResponse.json(body)))
    await expect(
      fetchUserInfo({ ...request, auth: { ...request.auth, userId: 7 } }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })

  it("rejects a different live UUID before returning account data", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () =>
        HttpResponse.json({
          ...body,
          user: {
            ...body.user,
            user_id: "00000000-0000-4000-8000-000000000002",
          },
        }),
      ),
    )
    await expect(fetchUserInfo(request)).rejects.toMatchObject({
      code: "ACCOUNT_IDENTITY_MISMATCH",
    })
  })

  it("rejects inference credentials and other origins before network dispatch", async () => {
    await expect(
      fetchUserInfo({
        ...request,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "dahl_example",
        },
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
    await expect(
      fetchUserInfo({
        ...request,
        baseUrl: "https://inference.dahl.global.example.invalid",
      }),
    ).rejects.toMatchObject({ code: "FEATURE_UNSUPPORTED" })
  })

  it("does not turn missing balance into zero", async () => {
    server.use(
      http.get(`${origin}/v1/account`, () =>
        HttpResponse.json({ user: body.user, tokens_on_keys: 0 }),
      ),
    )
    await expect(
      fetchAccountData({
        ...request,
        checkIn: createCheckInConfig(SITE_TYPES.DAHL),
      }),
    ).rejects.toMatchObject({ code: "JSON_PARSE_ERROR" })
  })
})
