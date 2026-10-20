import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createEmRankKeyEditor,
  EMRANK_EXPIRATION_MODES,
} from "~/services/apiAdapters/emrank/keyEditor"
import { emrankKeyFields } from "~/services/apiAdapters/emrank/keyResourceFields"
import { emRankKeyResources } from "~/services/apiAdapters/emrank/keyResources"
import {
  EMRANK_SESSION_COOKIE_NAME,
  EMRANK_TOKEN_ASSET,
} from "~/services/apiService/emrank/constants"
import { EMRANK_KEY_STATUS } from "~/services/apiService/emrank/keys"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { installCookieTransport } from "~~/tests/test-utils/cookieTransport"

const origin = "https://emrank.tech"
const request = {
  baseUrl: origin,
  accountId: "acc-emrank",
  auth: { authType: AuthTypeEnum.Cookie, userId: "6088" },
} satisfies ApiServiceRequest
const session = {
  authenticated: true,
  user: { id: 6088, username: "ld_ko_c803", display_name: "Qi_xing_jk" },
}
const keyRow = {
  can_copy: true,
  created_at: 1792156887,
  enabled: true,
  expires_at: null,
  id: 1791750033754549,
  migration_blocked: false,
  name: "native",
  owner_id: 6088,
  remaining_quota: "2500000",
  revoked_at: null,
  status: EMRANK_KEY_STATUS.Enabled,
  suffix: "_IvA",
  total_quota: "2500000",
  used_quota: "0",
}
const list = (rows: unknown[] = [keyRow]) =>
  http.get(`${origin}/api/access-keys`, () =>
    HttpResponse.json({
      can_manage_all: false,
      data: rows,
      total: rows.length,
    }),
  )

const openSession = () =>
  emRankKeyResources.open({
    account: { id: "acc-emrank", name: "EMRank", siteType: SITE_TYPES.EMRANK },
    request,
  })

describe("EMRank key resources", () => {
  const ref = {
    accountId: "acc-emrank",
    siteType: SITE_TYPES.EMRANK,
    scopeKey: "account",
    resourceId: String(keyRow.id),
  }

  it("keeps exhausted and migration-blocked statuses unknown", async () => {
    server.use(
      list([
        { ...keyRow, status: EMRANK_KEY_STATUS.Exhausted },
        { ...keyRow, id: 8, status: EMRANK_KEY_STATUS.MigrationBlocked },
      ]),
    )
    const collection = await (await openSession()).openCollection("account")
    const items = (await collection.list()).items
    expect(items.map((item) => item.status)).toEqual(["unknown", "unknown"])
    expect(items[1]!.actions.canUpdate).toBe(false)
  })
  it("reports unavailable secrets and missing keys without leaking plaintext", async () => {
    server.use(
      list(),
      http.post(`${origin}/api/access-keys/secrets`, () =>
        HttpResponse.json({ data: [] }),
      ),
    )
    const session = await openSession()
    await expect(session.resolveDefaultScope()).resolves.toMatchObject({
      scopeKey: "account",
    })
    await expect(session.runtimeKey!.resolve(ref)).resolves.toMatchObject({
      kind: "unavailable",
    })
    await expect(
      session.runtimeKey!.resolve({ ...ref, resourceId: "99" }),
    ).resolves.toMatchObject({
      kind: "unavailable",
      failure: { code: "not_found" },
    })
  })
  it("keeps an explicitly refused update unapplied", async () => {
    server.use(
      list(),
      http.put(`${origin}/api/access-keys/:id`, () =>
        HttpResponse.json(
          { error: { message: "duplicate name", code: "conflict" } },
          { status: 409 },
        ),
      ),
    )
    const editor = await (
      await (await openSession()).openCollection("account")
    ).openEditEditor(ref)
    await expect(
      editor.submit({
        ...editor.initialValues,
        [emrankKeyFields.Name]: "duplicate",
      }),
    ).rejects.toMatchObject({
      failure: { code: "upstream_rejected", message: "duplicate name" },
    })
  })
  it("submits a status and custom-expiry update and confirms the native result", async () => {
    let row: Omit<typeof keyRow, "expires_at" | "status"> & {
      expires_at: number | null
      status: string
    } = { ...keyRow, expires_at: 1900000000 }
    server.use(
      http.get(`${origin}/api/access-keys`, () =>
        HttpResponse.json({ data: [row], total: 1 }),
      ),
      http.put(`${origin}/api/access-keys/:id`, async ({ request }) => {
        expect(await request.json()).toEqual({
          enabled: false,
          expiration: { mode: "custom", at: 1930000000 },
        })
        row = {
          ...row,
          enabled: false,
          status: EMRANK_KEY_STATUS.Disabled,
          expires_at: 1930000000,
        }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const collection = await (await openSession()).openCollection("account")
    const editor = await collection.openEditEditor(ref)
    expect(editor.initialValues[emrankKeyFields.ExpiresAt]).toBe(
      new Date(1900000000 * 1000).toISOString(),
    )
    const result = await editor.submit({
      ...editor.initialValues,
      [emrankKeyFields.Enabled]: false,
      [emrankKeyFields.ExpirationMode]: EMRANK_EXPIRATION_MODES.Custom,
      [emrankKeyFields.ExpiresAt]: new Date(1930000000 * 1000).toISOString(),
    })
    expect(result.facts).toMatchObject({ status: "disabled" })
  })
  it("rejects invalid and elapsed expiry choices before mutation", () => {
    const editor = createEmRankKeyEditor()
    for (const changes of [
      {
        [emrankKeyFields.ExpirationMode]: "invalid",
        [emrankKeyFields.ExpiresAt]: null,
      },
      {
        [emrankKeyFields.ExpirationMode]: EMRANK_EXPIRATION_MODES.Custom,
        [emrankKeyFields.ExpiresAt]: null,
      },
      {
        [emrankKeyFields.ExpirationMode]: EMRANK_EXPIRATION_MODES.Custom,
        [emrankKeyFields.ExpiresAt]: "2000-01-01T00:00:00Z",
      },
    ])
      expect(
        editor.validate({ ...editor.initialValues, ...changes }),
      ).toMatchObject({ valid: false })
  })
  it("deletes a native key exactly once and refreshes the collection", async () => {
    let rows = [keyRow]
    const remove = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ ids: [keyRow.id] })
      rows = []
      return new HttpResponse(null, { status: 204 })
    })
    server.use(
      http.get(`${origin}/api/access-keys`, () =>
        HttpResponse.json({ data: rows, total: rows.length }),
      ),
      http.post(`${origin}/api/access-keys/batch-delete`, remove),
    )
    const collection = await (await openSession()).openCollection("account")
    await collection.delete(ref)
    expect(remove).toHaveBeenCalledTimes(1)
    expect((await collection.list()).items).toEqual([])
  })
  beforeEach(() => {
    installCookieTransport(EMRANK_SESSION_COOKIE_NAME, "emrank.tech")
    server.use(
      http.get(`${origin}/api/auth/session`, () => HttpResponse.json(session)),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  it("projects native quota in M Token without claiming a dollar value", async () => {
    server.use(list())
    const session = await openSession()
    const page = await (await session.openCollection("account")).list()
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      displayName: "native",
      maskedLabel: "sk-emr-••••_IvA",
      status: "enabled",
      runtimeSecret: undefined,
      actions: { canUpdate: true, canDelete: true },
    })
    expect(
      page.items[0]!.displayFacts?.filter((fact) => fact.kind === "quota"),
    ).toEqual([
      {
        fieldId: "quota",
        kind: "quota",
        role: "total",
        asset: EMRANK_TOKEN_ASSET,
        value: 2500000,
        unlimited: false,
      },
      {
        fieldId: "remaining",
        kind: "quota",
        role: "remaining",
        asset: EMRANK_TOKEN_ASSET,
        value: 2500000,
        unlimited: false,
      },
      {
        fieldId: "used",
        kind: "quota",
        role: "used",
        asset: EMRANK_TOKEN_ASSET,
        value: 0,
      },
    ])
    expect(page.items[0]!.runtimeKey?.baseUrl).toBe("https://emrank.tech/v1")
  })

  it("shows the provider's remaining quota instead of deriving it from total and used", async () => {
    server.use(
      list([
        {
          ...keyRow,
          total_quota: "2500000",
          used_quota: "1000000",
          remaining_quota: "1200000",
        },
      ]),
    )
    const session = await openSession()
    const items = (await (await session.openCollection("account")).list()).items
    expect(items[0]?.displayFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "quota",
          role: "remaining",
          asset: EMRANK_TOKEN_ASSET,
          value: 1200000,
          unlimited: false,
        }),
      ]),
    )
  })

  it("marks unlimited keys and the console's disabled status", async () => {
    server.use(
      list([
        {
          ...keyRow,
          id: 2,
          name: "open",
          total_quota: null,
          remaining_quota: null,
          status: EMRANK_KEY_STATUS.Disabled,
          enabled: false,
        },
        {
          ...keyRow,
          id: 3,
          name: "old",
          can_copy: false,
          status: EMRANK_KEY_STATUS.Expired,
        },
      ]),
    )
    const session = await openSession()
    const items = (await (await session.openCollection("account")).list()).items
    expect(items.map((item) => item.status)).toEqual(["disabled", "expired"])
    expect(
      items[0]!.displayFacts?.find((fact) => fact.fieldId === "quota"),
    ).toMatchObject({ unlimited: true, value: 0 })
    // A legacy row keeps its own reveal gate; the mask never claims plaintext.
    expect(items[1]!.maskedLabel).toBe("sk-emr-••••_IvA")
    expect(items[1]!.runtimeSecret).toBeUndefined()
  })

  it("reveals the plaintext only for rows the console marks as copyable", async () => {
    server.use(
      list([{ ...keyRow, id: 4, name: "old", can_copy: false }, keyRow]),
      http.post(`${origin}/api/access-keys/secrets`, () =>
        HttpResponse.json({
          data: [{ id: keyRow.id, secret: "sk-emr-value" }],
        }),
      ),
    )
    const session = await openSession()
    const runtimeKey = session.runtimeKey!
    await expect(
      runtimeKey.resolve({
        accountId: "acc-emrank",
        siteType: SITE_TYPES.EMRANK,
        scopeKey: "account",
        resourceId: "4",
      }),
    ).resolves.toMatchObject({ kind: "unavailable" })
    await expect(
      runtimeKey.resolve({
        accountId: "acc-emrank",
        siteType: SITE_TYPES.EMRANK,
        scopeKey: "account",
        resourceId: String(keyRow.id),
      }),
    ).resolves.toMatchObject({ kind: "resolved", secret: "sk-emr-value" })
  })

  it("builds a create editor with the console's own defaults", async () => {
    const definition = createEmRankKeyEditor(undefined, {
      nameHint: undefined,
    })
    expect(definition.fields.map((field) => field.fieldId)).toEqual([
      emrankKeyFields.Name,
      emrankKeyFields.Unlimited,
      emrankKeyFields.Quota,
      emrankKeyFields.ExpirationMode,
      emrankKeyFields.ExpiresAt,
    ])
    expect(definition.initialValues).toMatchObject({
      [emrankKeyFields.Unlimited]: true,
      [emrankKeyFields.ExpirationMode]: "never",
    })
    // A blank name, a decimal beyond six places and a custom expiry without a
    // timestamp are all rejected before dispatch.
    expect(
      definition.validate({
        ...definition.initialValues,
        [emrankKeyFields.Name]: "  ",
      }),
    ).toMatchObject({ valid: false })
    expect(
      definition.validate({
        ...definition.initialValues,
        [emrankKeyFields.Name]: "key",
        [emrankKeyFields.Unlimited]: false,
        [emrankKeyFields.Quota]: 1.1234567,
      }),
    ).toMatchObject({ valid: false })
    expect(
      definition.validate({
        ...definition.initialValues,
        [emrankKeyFields.Name]: "key",
        [emrankKeyFields.Unlimited]: false,
        [emrankKeyFields.Quota]: 1.5,
        [emrankKeyFields.ExpirationMode]: EMRANK_EXPIRATION_MODES.Custom,
      }),
    ).toMatchObject({ valid: false })
    expect(
      definition.buildCommand({
        ...definition.initialValues,
        [emrankKeyFields.Name]: "  key  ",
        [emrankKeyFields.Unlimited]: false,
        [emrankKeyFields.Quota]: 1.5,
      }),
    ).toMatchObject({
      name: "key",
      unlimited: false,
      quota: 1.5,
      expirationMode: "never",
    })
    // A custom expiry carries its timestamp through to the wire.
    expect(
      definition.buildCommand({
        ...definition.initialValues,
        [emrankKeyFields.Name]: "key",
        [emrankKeyFields.ExpirationMode]: EMRANK_EXPIRATION_MODES.Custom,
        [emrankKeyFields.ExpiresAt]: "2027-01-02T03:04:05.000Z",
      }),
    ).toMatchObject({
      expirationMode: "custom",
      expiresAt: Math.floor(Date.parse("2027-01-02T03:04:05.000Z") / 1000),
    })
  })

  it("carries an edited name into the update command", async () => {
    const definition = createEmRankKeyEditor({
      name: "baseline",
      totalQuota: null,
      expiresAt: null,
      enabled: true,
    })
    expect(definition.initialValues).toMatchObject({
      [emrankKeyFields.Name]: "baseline",
      [emrankKeyFields.ExpirationMode]: "keep",
    })
    expect(
      definition.buildCommand({
        ...definition.initialValues,
        [emrankKeyFields.Name]: "  renamed  ",
      }),
    ).toMatchObject({
      name: "renamed",
      unlimited: true,
      expirationMode: "keep",
    })
    // The console merges writes, so an unchanged expiry sends no timestamp.
    expect(
      definition.buildCommand(definition.initialValues),
    ).not.toHaveProperty("expiresAt")
  })

  it("preserves a disabled key when only its name is edited", async () => {
    let row = { ...keyRow, enabled: false, status: EMRANK_KEY_STATUS.Disabled }
    let written: unknown
    server.use(
      http.get(`${origin}/api/access-keys`, () =>
        HttpResponse.json({ data: [row], total: 1 }),
      ),
      http.put(`${origin}/api/access-keys/:id`, async ({ request }) => {
        written = await request.json()
        row = { ...row, ...(written as object) }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const collection = await (await openSession()).openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-emrank",
      siteType: SITE_TYPES.EMRANK,
      scopeKey: "account",
      resourceId: String(keyRow.id),
    })
    expect(editor.initialValues[emrankKeyFields.Enabled]).toBe(false)
    const result = await editor.submit({
      ...editor.initialValues,
      [emrankKeyFields.Name]: "renamed",
    })
    expect(written).not.toMatchObject({ enabled: true })
    expect(result.facts).toMatchObject({
      displayName: "renamed",
      status: "disabled",
    })
  })

  it("creates a key without surfacing a one-time secret", async () => {
    server.use(
      http.post(`${origin}/api/access-keys`, async ({ request: native }) => {
        expect(native.headers.get("X-Gateway-CSRF")).toBe("1")
        expect(await native.json()).toEqual({
          name: "new-key",
          expiration: { mode: "never" },
        })
        return HttpResponse.json(
          { key: { ...keyRow, id: 9, name: "new-key" }, secret: "sk-emr-new" },
          { status: 201 },
        )
      }),
    )
    const session = await openSession()
    const editor = await session.openCreateEditor("account")
    const result = await editor.submit({
      ...editor.initialValues,
      [emrankKeyFields.Name]: "new-key",
    })
    // The console re-reveals can_copy keys, so like the other re-viewable
    // sites the create result carries no one-time secret and no dialog.
    expect(result.createdSecret).toBeUndefined()
    expect(result.facts).toMatchObject({ displayName: "new-key" })
  })

  it("keeps a concurrently changed quota when only the name is edited", async () => {
    let row = { ...keyRow }
    let written: unknown
    server.use(
      http.get(`${origin}/api/access-keys`, () =>
        HttpResponse.json({ data: [row], total: 1 }),
      ),
      http.put(`${origin}/api/access-keys/:id`, async ({ request }) => {
        written = await request.json()
        row = { ...row, ...(written as object) }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const collection = await (await openSession()).openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-emrank",
      siteType: SITE_TYPES.EMRANK,
      scopeKey: "account",
      resourceId: String(keyRow.id),
    })
    row = { ...row, total_quota: "20000000" }
    await editor.submit({
      ...editor.initialValues,
      [emrankKeyFields.Name]: "renamed",
    })
    expect(written).toEqual({ name: "renamed" })
    const after = await collection.get({
      accountId: "acc-emrank",
      siteType: SITE_TYPES.EMRANK,
      scopeKey: "account",
      resourceId: String(keyRow.id),
    })
    expect(after.displayFacts).toContainEqual({
      fieldId: "quota",
      kind: "quota",
      role: "total",
      asset: EMRANK_TOKEN_ASSET,
      value: 20000000,
      unlimited: false,
    })
  })

  it("reports a console rejection as not-applied with its message", async () => {
    server.use(
      http.post(`${origin}/api/access-keys`, () =>
        HttpResponse.json(
          {
            error: {
              message: "已存在同名令牌",
              type: "invalid_request_error",
              param: null,
              code: "conflict",
            },
          },
          { status: 409 },
        ),
      ),
    )
    const session = await openSession()
    const editor = await session.openCreateEditor("account")
    await expect(
      editor.submit({
        ...editor.initialValues,
        [emrankKeyFields.Name]: "duplicate",
      }),
    ).rejects.toMatchObject({
      failure: {
        code: "upstream_rejected",
        message: "已存在同名令牌",
        upstreamCode: "conflict",
      },
    })
  })

  it("rejects a conflicting edit before overwriting the latest name", async () => {
    let row = { ...keyRow }
    const write = vi.fn(() => new HttpResponse(null, { status: 204 }))
    server.use(
      http.get(`${origin}/api/access-keys`, () =>
        HttpResponse.json({ data: [row], total: 1 }),
      ),
      http.put(`${origin}/api/access-keys/:id`, write),
    )
    const collection = await (await openSession()).openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-emrank",
      siteType: SITE_TYPES.EMRANK,
      scopeKey: "account",
      resourceId: String(keyRow.id),
    })
    row = { ...row, name: "changed-on-site" }
    await expect(
      editor.submit({
        ...editor.initialValues,
        [emrankKeyFields.Name]: "extension-name",
      }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(write).not.toHaveBeenCalled()
  })

  it("accepts an unchanged editor without dispatching an empty update", async () => {
    const write = vi.fn(() => new HttpResponse(null, { status: 204 }))
    server.use(list(), http.put(`${origin}/api/access-keys/:id`, write))
    const collection = await (await openSession()).openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-emrank",
      siteType: SITE_TYPES.EMRANK,
      scopeKey: "account",
      resourceId: String(keyRow.id),
    })
    await expect(editor.submit(editor.initialValues)).resolves.toMatchObject({
      facts: { displayName: "native" },
    })
    expect(write).not.toHaveBeenCalled()
  })

  it("rejects a quota the console would refuse before dispatching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const session = await openSession()
    const editor = await session.openCreateEditor("account")
    expect(
      editor.validate({
        ...editor.initialValues,
        [emrankKeyFields.Unlimited]: false,
        [emrankKeyFields.Quota]: -1,
      }),
    ).toMatchObject({ valid: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("does not call an accepted update unapplied when its readback is rejected", async () => {
    let applied = false
    server.use(
      http.get(`${origin}/api/access-keys`, () =>
        applied
          ? HttpResponse.json(
              {
                error: {
                  message: "readback rejected",
                  code: "invalid_request",
                },
              },
              { status: 400 },
            )
          : HttpResponse.json({ data: [keyRow], total: 1 }),
      ),
      http.put(`${origin}/api/access-keys/:id`, () => {
        applied = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const collection = await (await openSession()).openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-emrank",
      siteType: SITE_TYPES.EMRANK,
      scopeKey: "account",
      resourceId: String(keyRow.id),
    })
    await expect(
      editor.submit({
        ...editor.initialValues,
        [emrankKeyFields.Name]: "renamed",
      }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
    expect(applied).toBe(true)
  })

  it.each([408, 499])(
    "keeps a %s timeout or cancellation uncertain",
    async (status) => {
      server.use(
        http.post(`${origin}/api/access-keys`, () =>
          HttpResponse.json(
            { error: { message: "request interrupted", code: "interrupted" } },
            { status },
          ),
        ),
      )
      const editor = await (await openSession()).openCreateEditor("account")
      await expect(
        editor.submit({
          ...editor.initialValues,
          [emrankKeyFields.Name]: "new-key",
        }),
      ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
    },
  )
})
