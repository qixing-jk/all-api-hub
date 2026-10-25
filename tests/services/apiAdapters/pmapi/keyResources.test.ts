import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions } from "~/services/apiAdapters/contracts/accountKeyResource"
import { PMAPI_KEY_EDITOR_FIELDS as pmFields } from "~/services/apiAdapters/pmapi/keyResourceFields"
import { pmApiKeyResources } from "~/services/apiAdapters/pmapi/keyResources"
import { PMAPI_KEY_STATUSES } from "~/services/apiService/pmapi/constants"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const origin = "https://pmcat.top"
const envelope = (data: unknown) => ({ data, message: "", success: true })

const identity = {
  id: 10171,
  username: "pm-test-user",
  display_name: "PM Test",
  quota: 1_250_000,
  used_quota: 125_000,
  request_count: 4,
  checked_in_today: false,
  aff_code: "ABCD",
  group: "default",
  grp: "default",
  group_ratio: 1,
  status: 1,
  totp_enabled: false,
  linuxdo_bound: true,
}

/** The raw wire row the console list route answers with. */
const wireRow = {
  id: 6741,
  name: "user group (auto)",
  key: "sk-pm-plaintext-key-value",
  status: PMAPI_KEY_STATUSES.Enabled,
  unlimited: true,
  remain_quota: 0,
  used_quota: 250_000,
  expired_at: -1,
  models: "",
  subnet: "",
  rpm: 0,
  grp: "default",
  created_at: 1760000000,
  accessed_at: 1760000000,
  request_count: 0,
  user_id: 10171,
}

const openSession = async () =>
  await pmApiKeyResources.open({
    account: {
      id: "pmapi-account",
      name: "PM-API",
      siteType: SITE_TYPES.PMAPI,
    },
    request: {
      accountId: "pmapi-account",
      baseUrl: origin,
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "10171",
        accessToken: "pm-test-token",
      },
    },
  })
const openCollection = async () =>
  (await openSession()).openCollection("account")
const ref = {
  accountId: "pmapi-account",
  siteType: SITE_TYPES.PMAPI,
  scopeKey: "account",
  resourceId: "6741",
}

const mockTokens = (rows: object[]) =>
  server.use(
    http.get(`${origin}/api/tokens`, () =>
      HttpResponse.json(
        envelope({
          items: rows.map((row) => ({ ...wireRow, ...row })),
          total: rows.length,
        }),
      ),
    ),
  )

describe("PM-API key resources", () => {
  beforeEach(() => {
    server.use(
      http.get(`${origin}/api/me`, () => HttpResponse.json(envelope(identity))),
      http.get(`${origin}/api/token-groups`, () =>
        HttpResponse.json(
          envelope([
            { name: "default", ratio: 1 },
            { name: "Free", ratio: 0 },
          ]),
        ),
      ),
      // The editor joins the token form's usable groups with the pricing
      // catalogue's labels; unmocked, this would reach the real deployment.
      http.get(`${origin}/api/pricing`, () =>
        HttpResponse.json(
          envelope({
            groups: [
              { name: "default", desc: "默认分组", ratio: 1 },
              { name: "Free", desc: "神秘免费分组喵", ratio: 0 },
            ],
            models: [],
          }),
        ),
      ),
      http.get(`${origin}/api/me/models`, () =>
        HttpResponse.json(envelope(["glm-5.3", "grok-4.7"])),
      ),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  it("opens the create editor with the console's own group metadata", async () => {
    const editor = await (await openSession()).openCreateEditor("account")
    const groupField = editor.fields.find(
      (field): field is Extract<typeof field, { options: unknown }> =>
        "options" in field && field.fieldId === pmFields.Group,
    )
    expect(groupField?.options).toEqual([
      { value: "default", displayLabel: "默认分组", secondaryLabel: "×1" },
      { value: "Free", displayLabel: "神秘免费分组喵", secondaryLabel: "×0" },
    ])
  })

  it("projects the console's own status semantics", async () => {
    mockTokens([{}])
    const collection = await openCollection()
    const enabled = await collection.get(ref)
    expect(enabled.status).toBe("enabled")
    expect(enabled.maskedLabel).toBeTypeOf("string")
    expect(enabled.displayFacts).toContainEqual({
      fieldId: "quota",
      kind: "money",
      role: "remaining",
      amountUsd: 0,
      unlimited: true,
    })
    expect(enabled.displayFacts).toContainEqual({
      fieldId: "grp",
      kind: "group",
      value: "default",
      emptyValue: "account-group",
    })
  })

  it("maps an expired budget to the expired status like the console does", async () => {
    mockTokens([
      { status: PMAPI_KEY_STATUSES.Expired },
      {
        status: PMAPI_KEY_STATUSES.Enabled,
        expired_at: Math.floor(Date.now() / 1000) - 3600,
      },
      { status: PMAPI_KEY_STATUSES.QuotaExhausted, unlimited: false },
      {
        status: PMAPI_KEY_STATUSES.Enabled,
        unlimited: false,
        remain_quota: QUOTA_PER_USD,
      },
    ])
    const collection = await openCollection()
    const page = await collection.list()
    expect(page.items.map((item) => item.status)).toEqual([
      "expired",
      "expired",
      "disabled",
      "enabled",
    ])
  })

  it("resolves runtime secrets from the recoverable inventory", async () => {
    mockTokens([{}])
    const session = await openSession()
    await expect(
      session.runtimeKey!.resolve(ref, {
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({
      kind: "resolved",
      secret: "sk-pm-plaintext-key-value",
    })
  })

  it("creates a key and hands the response-only secret to the credential flow", async () => {
    mockIdentityForCreate()
    const editor = await (await openSession()).openCreateEditor("account")
    const result = await editor.submit({
      ...editor.initialValues,
      name: "disposable",
    })
    expect(result.createdSecret).toMatchObject({
      secret: "sk-pm-created-secret",
    })
    expect(result.facts?.displayName).toBe("disposable")
  })

  it("sends the console's own edit payload without a status field", async () => {
    mockTokens([
      { name: "renamed", unlimited: false, remain_quota: QUOTA_PER_USD },
    ])
    const written: unknown[] = []
    server.use(
      http.put(`${origin}/api/tokens/6741`, async (info) => {
        written.push(await info.request.json())
        return HttpResponse.json(envelope(null))
      }),
    )
    const collection = await openCollection()
    const editor = await collection.openEditEditor(ref)
    const result = await editor.submit({
      ...editor.initialValues,
      name: "renamed",
      unlimited: false,
      [pmFields.Quota]: 1,
    })
    expect(result.facts?.status).toBe("enabled")
    expect(written[0]).toMatchObject({
      name: "renamed",
      unlimited: false,
      remain_quota: QUOTA_PER_USD,
    })
    expect(written[0]).not.toHaveProperty("status")
  })

  it("refuses a full-form write when the resource moved under the dialog", async () => {
    mockTokens([{}])
    const written = vi.fn(() => HttpResponse.json(envelope(null)))
    server.use(http.put(`${origin}/api/tokens/6741`, written))
    const collection = await openCollection()
    const editor = await collection.openEditEditor(ref)
    // The fresh read now differs from the dialog's baseline.
    server.use(
      http.get(`${origin}/api/tokens`, () =>
        HttpResponse.json(
          envelope({
            items: [{ ...wireRow, name: "changed elsewhere" }],
            total: 1,
          }),
        ),
      ),
    )
    await expect(
      editor.submit({ ...editor.initialValues, name: "renamed" }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(written).not.toHaveBeenCalled()
  })

  it.each([
    {
      action: editActions.Enable,
      status: PMAPI_KEY_STATUSES.Enabled,
      wireStatus: 1,
      factStatus: "enabled",
    },
    {
      action: editActions.Disable,
      status: PMAPI_KEY_STATUSES.Disabled,
      wireStatus: 2,
      factStatus: "disabled",
    },
  ])(
    "toggles $action through the console's minimal status write",
    async ({ action, status, wireStatus, factStatus }) => {
      mockTokens([{ status }])
      const written: unknown[] = []
      server.use(
        http.put(`${origin}/api/tokens/6741`, async (info) => {
          written.push(await info.request.json())
          return HttpResponse.json(envelope(null))
        }),
      )
      const collection = await openCollection()
      const editor = await collection.openEditEditor(ref, undefined, {
        action,
      })
      const result = await editor.submit({})
      expect(written[0]).toEqual({ status: wireStatus })
      expect(result.facts?.status).toBe(factStatus)
    },
  )

  it("rotates the secret and surfaces it through createdSecret", async () => {
    mockTokens([{ key: "sk-pm-rotated-secret" }])
    server.use(
      http.post(`${origin}/api/tokens/6741/regenerate`, () =>
        HttpResponse.json(envelope("sk-pm-rotated-secret")),
      ),
    )
    const collection = await openCollection()
    const editor = await collection.openEditEditor(ref, undefined, {
      action: editActions.Rotate,
    })
    const result = await editor.submit({})
    expect(result.createdSecret).toMatchObject({
      secret: "sk-pm-rotated-secret",
    })
  })

  it("deletes a key through the collection", async () => {
    mockTokens([])
    const deleted = vi.fn(() => HttpResponse.json(envelope(null)))
    server.use(http.delete(`${origin}/api/tokens/6741`, deleted))
    const collection = await openCollection()
    await collection.delete(ref)
    expect(deleted).toHaveBeenCalled()
  })
})

function mockIdentityForCreate() {
  const created = {
    ...wireRow,
    id: 6800,
    name: "disposable",
    key: "sk-pm-created-secret",
  }
  server.use(
    http.post(`${origin}/api/tokens`, async (info) => {
      expect(await info.request.json()).toMatchObject({ count: 1 })
      return HttpResponse.json(envelope({ keys: ["sk-pm-created-secret"] }))
    }),
    http.get(`${origin}/api/tokens`, () =>
      HttpResponse.json(envelope({ items: [created, wireRow], total: 2 })),
    ),
  )
}
