import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RESOURCE_SECRET_EDIT_INTENT_KINDS } from "~/services/apiAdapters/contracts/resourceNative"
import { dayaKeyResources } from "~/services/apiAdapters/daya/keyResources"
import { DAYA_KEY_STATUSES } from "~/services/apiService/daya/constants"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://api.dayaai.com"
const envelope = (data: unknown) => ({ code: 0, message: "success", data })
const keyRow = {
  id: 1303,
  user_id: 615,
  key: "sk-daya-plaintext",
  name: "默认密钥",
  group_id: 2,
  group_ids: [2, 21],
  status: DAYA_KEY_STATUSES.Active,
  ip_whitelist: null,
  ip_blacklist: null,
  last_used_at: "2026-10-19T10:00:00+08:00",
  quota: 0,
  quota_used: 1.5,
  expires_at: null,
  created_at: "2026-10-19T01:19:56+08:00",
  updated_at: "2026-10-19T01:19:56+08:00",
  rate_limit_5h: 0,
  rate_limit_1d: 3,
  rate_limit_7d: 0,
  usage_5h: 0,
  usage_1d: 0,
  usage_7d: 0,
}

const openSession = async () =>
  await dayaKeyResources.open({
    account: { id: "daya-account", name: "Daya", siteType: SITE_TYPES.DAYA },
    request: {
      accountId: "daya-account",
      baseUrl: origin,
      auth: { authType: AuthTypeEnum.Cookie, userId: "615" },
    },
  })
const openCollection = async () =>
  (await openSession()).openCollection("account")
const ref = {
  accountId: "daya-account",
  siteType: SITE_TYPES.DAYA,
  scopeKey: "account",
  resourceId: "1303",
}
describe("Daya key resources", () => {
  it("resolves runtime secrets with cancellation propagated to the detail read", async () => {
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(keyRow)),
      ),
    )
    const session = await openSession()
    await expect(session.resolveDefaultScope()).resolves.toMatchObject({
      scopeKey: "account",
    })
    await expect(
      session.runtimeKey!.resolve(ref, {
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ kind: "resolved", secret: "sk-daya-plaintext" })
    const controller = new AbortController()
    controller.abort()
    await expect(
      session.runtimeKey!.resolve(ref, { signal: controller.signal }),
    ).rejects.toBeDefined()
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope({ ...keyRow, key: "sk-****masked" })),
      ),
    )
    await expect(session.runtimeKey!.resolve(ref)).resolves.toMatchObject({
      kind: "unavailable",
    })
  })

  it("reports an update transport failure through the native mutation contract", async () => {
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(keyRow)),
      ),
      http.put(
        `${origin}/api/v1/keys/1303`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    const editor = await (await openCollection()).openEditEditor(ref)
    await expect(
      editor.submit({ ...editor.initialValues, name: "renamed" }),
    ).rejects.toMatchObject({ failure: { code: expect.any(String) } })
  })

  it("saves a changed expiry as ISO while preserving untouched settings", async () => {
    let written: unknown
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(keyRow)),
      ),
      http.put(`${origin}/api/v1/keys/1303`, async ({ request }) => {
        written = await request.json()
        return HttpResponse.json(
          envelope({ ...keyRow, ...(written as object) }),
        )
      }),
    )
    const editor = await (await openCollection()).openEditEditor(ref)
    await editor.submit({
      ...editor.initialValues,
      expiresAt: "2026-11-01T08:00:00+08:00",
    })
    expect(written).toMatchObject({
      expires_at: "2026-11-01T00:00:00.000Z",
      group_ids: [2, 21],
      rate_limit_1d: 3,
    })
  })
  it.each([
    DAYA_KEY_STATUSES.Active,
    DAYA_KEY_STATUSES.Inactive,
    DAYA_KEY_STATUSES.Expired,
  ])(
    "projects native %s keys and revokes active keys without touching their restrictions",
    async (status) => {
      let row = {
        ...keyRow,
        status,
        name: "",
        expires_at: "2026-11-01T00:00:00Z",
        ip_whitelist: ["192.0.2.1"],
        ip_blacklist: ["203.0.113.0/24"],
      }
      const put = vi.fn(async ({ request }: { request: Request }) => {
        const body = (await request.json()) as object
        row = { ...row, ...body }
        return HttpResponse.json(envelope(row))
      })
      server.use(
        http.get(`${origin}/api/v1/keys`, () =>
          HttpResponse.json(envelope({ items: [row], total: 1 })),
        ),
        http.get(`${origin}/api/v1/keys/1303`, () =>
          HttpResponse.json(envelope(row)),
        ),
        http.put(`${origin}/api/v1/keys/1303`, put),
      )
      const collection = await openCollection()
      const listed = (await collection.list()).items[0]!
      expect(listed.displayName).toBe("Daya #1303")
      expect(listed.status).toBe(
        status === "active"
          ? "enabled"
          : status === "expired"
            ? "expired"
            : "disabled",
      )
      expect(listed.displayFacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "restriction",
            role: "ip",
            value: ["192.0.2.1"],
          }),
          expect.objectContaining({
            kind: "restriction",
            role: "subnet",
            value: ["203.0.113.0/24"],
          }),
        ]),
      )
      if (status !== DAYA_KEY_STATUSES.Expired) {
        await collection.revoke!(ref)
        expect(row.status).toBe(DAYA_KEY_STATUSES.Inactive)
        expect(put).toHaveBeenCalledTimes(
          status === DAYA_KEY_STATUSES.Active ? 1 : 0,
        )
        expect(row.ip_whitelist).toEqual(["192.0.2.1"])
      }
    },
  )

  it("deletes a key through the collection and reads the empty inventory", async () => {
    let rows = [keyRow]
    server.use(
      http.get(`${origin}/api/v1/keys`, () =>
        HttpResponse.json(envelope({ items: rows, total: rows.length })),
      ),
      http.delete(`${origin}/api/v1/keys/1303`, () => {
        rows = []
        return HttpResponse.json(envelope(null))
      }),
    )
    const collection = await openCollection()
    await collection.delete(ref)
    expect((await collection.list()).items).toEqual([])
  })
  it("fails opening instead of exposing an empty routing form when its catalogue cannot load", async () => {
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(keyRow)),
      ),
      http.get(
        `${origin}/api/v1/groups/available`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    await expect(
      (await openCollection()).openEditEditor(ref),
    ).rejects.toMatchObject({ failure: { code: expect.any(String) } })
  })
  it("opens editing with complete routing options and the saved priority order", async () => {
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope({ ...keyRow, group_ids: [21, 2] })),
      ),
    )
    const editor = await (await openCollection()).openEditEditor(ref)
    const routes = editor.fields.find((field) => field.fieldId === "groupIds")
    expect(routes).toMatchObject({
      options: [
        { value: "2", displayLabel: "Group 2" },
        { value: "21", displayLabel: "Group 21" },
      ],
    })
    expect(routes).not.toHaveProperty("optionLoader")
    expect(editor.initialValues.groupIds).toEqual(["21", "2"])
  })
  it("opens creation with ready routing cards instead of loading the same catalogue again", async () => {
    server.use(
      http.get(`${origin}/api/v1/groups/default-api-key-groups`, () =>
        HttpResponse.json(envelope([])),
      ),
    )
    const editor = await (await openSession()).openCreateEditor("account")
    const routes = editor.fields.find((field) => field.fieldId === "groupIds")
    expect(routes).toMatchObject({
      options: [
        { value: "2", displayLabel: "Group 2", secondaryLabel: "×1" },
        { value: "21", displayLabel: "Group 21", secondaryLabel: "×1" },
      ],
    })
    expect(routes).not.toHaveProperty("optionLoader")
  })
  it.each([false, true])(
    "saves Fast=%s without overwriting a concurrent unrelated edit",
    async (allowFast) => {
      let row = { ...keyRow, allow_fast: !allowFast }
      let written: unknown
      server.use(
        http.get(`${origin}/api/v1/keys/1303`, () =>
          HttpResponse.json(envelope(row)),
        ),
        http.put(`${origin}/api/v1/keys/1303`, async ({ request }) => {
          written = await request.json()
          row = { ...row, ...(written as object) }
          return HttpResponse.json(envelope(row))
        }),
      )
      const collection = await openCollection()
      const editor = await collection.openEditEditor(ref)
      row = { ...row, name: "concurrent rename" }
      await editor.submit({ ...editor.initialValues, allowFast })
      expect(written).toMatchObject({
        allow_fast: allowFast,
        name: "concurrent rename",
      })
      const reopened = await collection.openEditEditor(ref)
      expect(reopened.initialValues.allowFast).toBe(allowFast)
    },
  )
  it("preserves a concurrent Fast change when renaming a key", async () => {
    let row = { ...keyRow, allow_fast: true }
    let written: unknown
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(row)),
      ),
      http.put(`${origin}/api/v1/keys/1303`, async ({ request }) => {
        written = await request.json()
        return HttpResponse.json(envelope({ ...row, ...(written as object) }))
      }),
    )
    const editor = await (await openCollection()).openEditEditor(ref)
    row = { ...row, allow_fast: false }
    await editor.submit({ ...editor.initialValues, name: "my rename" })
    expect(written).toMatchObject({ allow_fast: false, name: "my rename" })
  })
  it("creates a key with Fast disabled and restores that choice when editing", async () => {
    let row = { ...keyRow, allow_fast: true }
    let written: unknown
    server.use(
      http.get(`${origin}/api/v1/groups/default-api-key-groups`, () =>
        HttpResponse.json(envelope([])),
      ),
      http.post(`${origin}/api/v1/keys`, async ({ request }) => {
        written = await request.json()
        row = { ...row, ...(written as object) }
        return HttpResponse.json(envelope(row))
      }),
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(row)),
      ),
    )
    const session = await openSession()
    const create = await session.openCreateEditor("account")
    expect(create.initialValues.allowFast).toBe(true)
    await create.submit({
      ...create.initialValues,
      groupIds: ["2"],
      allowFast: false,
    })
    expect(written).toMatchObject({ allow_fast: false })
    const edit = await (
      await session.openCollection("account")
    ).openEditEditor(ref)
    expect(edit.initialValues.allowFast).toBe(false)
  })
  beforeEach(() => {
    installCookieTransport("daya_sid", "api.dayaai.com")
    server.use(
      http.get(`${origin}/api/v1/auth/me`, () =>
        HttpResponse.json(envelope({ id: 615, username: "test", balance: 4 })),
      ),
      http.get(`${origin}/api/v1/groups/available`, () =>
        HttpResponse.json(
          envelope(
            [2, 21].map((id) => ({
              id,
              name: `Group ${id}`,
              platform: "openai",
              rate_multiplier: 1,
            })),
          ),
        ),
      ),
    )
  })
  afterEach(() => vi.restoreAllMocks())
  it("preselects official defaults in routing order and excludes unavailable groups", async () => {
    server.use(
      http.get(`${origin}/api/v1/groups/default-api-key-groups`, () =>
        HttpResponse.json(
          envelope(
            [21, 99, 2].map((id) => ({
              id,
              name: `Group ${id}`,
              platform: "openai",
              rate_multiplier: 1,
            })),
          ),
        ),
      ),
    )
    const editor = await (await openSession()).openCreateEditor("account")
    expect(editor.initialValues.groupIds).toEqual(["21", "2"])
    expect(editor.validate(editor.initialValues)).toEqual({ valid: true })
  })
  it("creates a custom key with ordered routes, IP restrictions and window budgets", async () => {
    let written: unknown
    server.use(
      http.get(`${origin}/api/v1/groups/default-api-key-groups`, () =>
        HttpResponse.json(envelope([])),
      ),
      http.post(`${origin}/api/v1/keys`, async ({ request }) => {
        written = await request.json()
        return HttpResponse.json(
          envelope({ ...keyRow, ...(written as object) }),
        )
      }),
    )
    const editor = await (await openSession()).openCreateEditor("account")
    await editor.submit({
      ...editor.initialValues,
      groupIds: ["21", "2"],
      customKey: {
        kind: RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: "sk-disposable-custom-key",
      },
      ipWhitelist: "192.0.2.1\n198.51.100.0/24",
      ipBlacklist: "203.0.113.1",
      rateLimit5h: 1.25,
      rateLimit1d: 3,
      rateLimit7d: 12,
    })
    expect(written).toMatchObject({
      group_ids: [21, 2],
      group_id: 21,
      custom_key: "sk-disposable-custom-key",
      ip_whitelist: ["192.0.2.1", "198.51.100.0/24"],
      ip_blacklist: ["203.0.113.1"],
      rate_limit_5h: 1.25,
      rate_limit_1d: 3,
      rate_limit_7d: 12,
    })
  })
  it("edits and clears restrictions and budgets while preserving a concurrent rename", async () => {
    let row = { ...keyRow, ip_whitelist: ["192.0.2.1"] }
    let written: unknown
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(row)),
      ),
      http.put(`${origin}/api/v1/keys/1303`, async ({ request }) => {
        written = await request.json()
        return HttpResponse.json(envelope({ ...row, ...(written as object) }))
      }),
    )
    const editor = await (await openCollection()).openEditEditor(ref)
    row = { ...row, name: "concurrent name" }
    await editor.submit({
      ...editor.initialValues,
      ipWhitelist: "",
      ipBlacklist: "203.0.113.1",
      rateLimit5h: 2,
      rateLimit1d: 0,
      rateLimit7d: 7,
    })
    expect(written).toMatchObject({
      name: "concurrent name",
      ip_whitelist: [],
      ip_blacklist: ["203.0.113.1"],
      rate_limit_5h: 2,
      rate_limit_1d: 0,
      rate_limit_7d: 7,
    })
  })
  it("rejects conflicting changes to the same field before dispatch", async () => {
    let row = { ...keyRow }
    const put = vi.fn(() => HttpResponse.json(envelope(row)))
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(row)),
      ),
      http.put(`${origin}/api/v1/keys/1303`, put),
    )
    const editor = await (await openCollection()).openEditEditor(ref)
    row = { ...row, name: "console rename" }
    await expect(
      editor.submit({ ...editor.initialValues, name: "plugin rename" }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(put).not.toHaveBeenCalled()
  })
  it("rejects conflicting budget edits rather than overwriting a console change", async () => {
    let row = { ...keyRow }
    const put = vi.fn(() => HttpResponse.json(envelope(row)))
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(row)),
      ),
      http.put(`${origin}/api/v1/keys/1303`, put),
    )
    const editor = await (await openCollection()).openEditEditor(ref)
    row = { ...row, rate_limit_1d: 8 }
    await expect(
      editor.submit({ ...editor.initialValues, rateLimit1d: 4 }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(put).not.toHaveBeenCalled()
  })
  it("preserves concurrent console changes when saving a different field", async () => {
    let row = {
      ...keyRow,
      quota: 10,
      ip_whitelist: ["192.0.2.1"],
      rate_limit_1d: 3,
      expires_at: "2026-11-20T00:10:29.545096+08:00",
    }
    let written: unknown
    server.use(
      http.get(`${origin}/api/v1/keys/1303`, () =>
        HttpResponse.json(envelope(row)),
      ),
      http.put(`${origin}/api/v1/keys/1303`, async ({ request }) => {
        written = await request.json()
        return HttpResponse.json(envelope({ ...row, ...(written as object) }))
      }),
    )
    const editor = await (await openCollection()).openEditEditor(ref)
    row = { ...row, quota: 20, ip_whitelist: ["192.0.2.2"], rate_limit_1d: 7 }
    await editor.submit({ ...editor.initialValues, name: "renamed" })
    expect(written).toMatchObject({
      name: "renamed",
      quota: 20,
      ip_whitelist: ["192.0.2.2"],
      rate_limit_1d: 7,
      expires_at: "2026-11-20T00:10:29.545096+08:00",
    })
  })
  it("shows a finite cap minus used spending as remaining", async () => {
    server.use(
      http.get(`${origin}/api/v1/keys`, () =>
        HttpResponse.json(
          envelope({
            items: [{ ...keyRow, quota: 10, quota_used: 3 }],
            total: 1,
          }),
        ),
      ),
    )
    const items = (await (await openCollection()).list()).items
    expect(items[0]?.displayFacts).toContainEqual(
      expect.objectContaining({
        role: "remaining",
        amountUsd: 7,
        unlimited: false,
      }),
    )
  })
})
