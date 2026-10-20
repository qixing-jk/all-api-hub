import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildAccountKeyResourceRuntimeKey,
  isAccountRuntimeKeyCompatibleWithModel,
} from "~/services/accounts/keys/accountRuntimeKeys"
import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/accountKeyResource"
import { relayForAccountKeyResources } from "~/services/apiAdapters/relayfor/accountKeyResource"
import {
  createRelayForToken,
  deleteRelayForToken,
  fetchRelayForTokens,
  rotateRelayForToken,
  updateRelayForToken,
} from "~/services/apiService/relayfor"
import { AuthTypeEnum } from "~/types"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

vi.mock("~/services/apiService/relayfor", () => ({
  fetchRelayForTokens: vi.fn(),
  createRelayForToken: vi.fn(),
  deleteRelayForToken: vi.fn(),
  updateRelayForToken: vi.fn(),
  rotateRelayForToken: vi.fn(),
}))

const account = {
  id: "acc-1",
  name: "RelayFor Test",
  siteType: SITE_TYPES.RELAYFOR,
}

const request = {
  baseUrl: "https://relayfor.xyz",
  accountId: "acc-1",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token-abc" },
}

describe("relayForAccountKeyResources", () => {
  it.each([
    { model_limits: null },
    { model_limits: [] },
    { model_limits: ["gpt-4o"] },
  ])(
    "enforces native model restrictions for a resolved runtime secret: $model_limits",
    async ({ model_limits }) => {
      vi.mocked(fetchRelayForTokens).mockResolvedValueOnce([
        {
          id: 1,
          name: "Key",
          key: "sk-masked...****",
          status: 1,
          remain_quota: -1,
          used_quota: 0,
          unlimited_quota: false,
          model_limits,
        },
      ])
      const session = await relayForAccountKeyResources.open({
        account,
        request,
      })
      const page = await (await session.openCollection("default")).list()
      const item = atIndex(page.items, 0)
      const runtime = buildAccountKeyResourceRuntimeKey(
        buildDisplaySiteData({ id: account.id, siteType: SITE_TYPES.RELAYFOR }),
        {
          ref: item.ref,
          label: item.displayName,
          secret: "sk-associated-plaintext-secret",
          modelAccess: item.runtimeKey?.modelAccess,
        },
      )
      expect(
        isAccountRuntimeKeyCompatibleWithModel(runtime, { id: "gpt-4o" }),
      ).toBe(true)
      expect(
        isAccountRuntimeKeyCompatibleWithModel(runtime, { id: "other-model" }),
      ).toBe(!model_limits?.length)
    },
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("declares CreateResponseOnly secret availability and EditorDefaults creation", () => {
    expect(relayForAccountKeyResources.inventorySecretAvailability).toBe(
      "create-response-only",
    )
    expect(relayForAccountKeyResources.defaultCreation).toBe("editor-defaults")
  })

  it("lists keys with masked labels and exports baseUrl https://relayfor.xyz/v1", async () => {
    vi.mocked(fetchRelayForTokens).mockResolvedValueOnce([
      {
        id: 1,
        name: "My Key",
        key: "sk-masked...****",
        status: 1,
        remain_quota: 500000,
        used_quota: 0,
        unlimited_quota: false,
      },
    ])

    const session = await relayForAccountKeyResources.open({ account, request })
    const collection = await session.openCollection("default")
    const page = await collection.list()

    expect(page.items).toHaveLength(1)
    const item = atIndex(page.items, 0)
    expect(item.displayName).toBe("My Key")
    expect(item.maskedLabel).toBe("sk-masked...****")
    expect(item.runtimeKey?.baseUrl).toBe("https://relayfor.xyz/v1")
  })

  it("creates key and returns createdSecret with plaintext key", async () => {
    vi.mocked(createRelayForToken).mockResolvedValueOnce({
      id: 2,
      name: "New Key",
      key: "sk-plaintext-secret-123",
      status: 1,
      remain_quota: 500000,
      used_quota: 0,
      unlimited_quota: false,
    })

    const session = await relayForAccountKeyResources.open({ account, request })
    const editor = await session.openCreateEditor("default")
    const result = await editor.submit({ name: "New Key" })

    expect(result.createdSecret?.secret).toBe("sk-plaintext-secret-123")
    expect(createRelayForToken).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://relayfor.xyz" }),
      expect.objectContaining({ name: "New Key" }),
    )
  })

  it("deletes key via deleteRelayForToken", async () => {
    vi.mocked(deleteRelayForToken).mockResolvedValueOnce(undefined)

    const session = await relayForAccountKeyResources.open({ account, request })
    const collection = await session.openCollection("default")
    const ref = {
      accountId: "acc-1",
      siteType: SITE_TYPES.RELAYFOR,
      scopeKey: "default",
      resourceId: "1",
    }
    await collection.delete(ref)

    expect(deleteRelayForToken).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://relayfor.xyz" }),
      "1",
    )
  })

  it("does not expose reversible disabling as permanent revocation", async () => {
    const session = await relayForAccountKeyResources.open({ account, request })
    const collection = await session.openCollection("default")
    expect(collection.revoke).toBeUndefined()
  })

  it("rotates independently without rewriting settings or losing the one-time secret to a list failure", async () => {
    const token = {
      id: 1,
      name: "Existing",
      key: "sk-masked...****",
      status: 2,
      remain_quota: 123,
      used_quota: 456,
      unlimited_quota: false,
    }
    vi.mocked(fetchRelayForTokens)
      .mockResolvedValueOnce([token])
      .mockRejectedValue(new Error("offline"))
    vi.mocked(rotateRelayForToken).mockResolvedValue({
      key: "sk-rotated-response-secret",
    })
    const session = await relayForAccountKeyResources.open({ account, request })
    const collection = await session.openCollection("default")
    const ref = {
      accountId: account.id,
      siteType: SITE_TYPES.RELAYFOR,
      scopeKey: "default",
      resourceId: "1",
    }
    const editor = await collection.openEditEditor(ref, undefined, {
      action: "rotate",
    })
    const result = await editor.submit(editor.initialValues)
    expect(updateRelayForToken).not.toHaveBeenCalled()
    expect(result.createdSecret?.secret).toBe("sk-rotated-response-secret")
    expect(result.facts?.status).toBe("disabled")
  })

  it("re-enables a disabled key without rewriting its restrictions", async () => {
    const token = {
      id: 1,
      name: "Existing",
      key: "sk-masked...****",
      status: 2,
      remain_quota: 123,
      used_quota: 456,
      unlimited_quota: false,
    }
    vi.mocked(fetchRelayForTokens).mockResolvedValue([token])
    const session = await relayForAccountKeyResources.open({ account, request })
    const collection = await session.openCollection("default")
    const ref = {
      accountId: account.id,
      siteType: SITE_TYPES.RELAYFOR,
      scopeKey: "default",
      resourceId: "1",
    }
    const editor = await collection.openEditEditor(ref, undefined, {
      action: "enable",
    })
    const result = await editor.submit(editor.initialValues)
    expect(updateRelayForToken).toHaveBeenCalledWith(expect.anything(), 1, {
      status: 1,
    })
    expect(result.facts?.status).toBe("enabled")
    expect(rotateRelayForToken).not.toHaveBeenCalled()
  })

  it("supports full native fields and rotation in edit editor", async () => {
    const token = {
      id: 1,
      name: "Existing Key",
      key: "sk-old-secret",
      status: 1,
      remain_quota: 1000000, // 2 USD
      used_quota: 500000,
      unlimited_quota: false,
      expired_at: "2026-12-31T23:59:59.000Z",
      ip_limits: ["1.1.1.1", "2.2.2.2"],
      model_limits: ["gpt-4o", "claude-3-5-sonnet"],
    }
    vi.mocked(fetchRelayForTokens).mockResolvedValue([token])

    const session = await relayForAccountKeyResources.open({ account, request })
    const collection = await session.openCollection("default")
    const ref = {
      accountId: "acc-1",
      siteType: SITE_TYPES.RELAYFOR,
      scopeKey: "default",
      resourceId: "1",
    }
    const editor = await collection.openEditEditor(ref)

    expect(editor.fields.map((f) => f.fieldId)).toEqual(
      expect.arrayContaining([
        "name",
        "unlimited_quota",
        "quota",
        "expired_at",
        "ip_limits",
        "model_limits",
      ]),
    )

    vi.mocked(rotateRelayForToken).mockResolvedValueOnce({
      key: "sk-new-rotated-secret",
    })
    vi.mocked(updateRelayForToken).mockResolvedValueOnce(undefined)

    await editor.submit({
      name: "Renamed Key",
      unlimited_quota: true,
    })

    const rotationEditor = await collection.openEditEditor(ref, undefined, {
      action: "rotate",
    })
    const result = await rotationEditor.submit(rotationEditor.initialValues)
    expect(result.createdSecret?.secret).toBe("sk-new-rotated-secret")
    expect(rotateRelayForToken).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://relayfor.xyz" }),
      1,
    )
    expect(updateRelayForToken).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://relayfor.xyz" }),
      1,
      expect.objectContaining({
        name: "Renamed Key",
        unlimited_quota: true,
      }),
    )
  })
})

it("preserves follow-account quota and maps native IP and expiry fields on edit", async () => {
  const token = {
    id: 1,
    name: "Follow account",
    key: "sk-masked...****",
    status: 1,
    remain_quota: -1,
    used_quota: 0,
    unlimited_quota: false,
    ip_limits: "10.0.0.0/8,1.1.1.1",
    expired_at: "2027-01-01T00:00:00Z",
    model_limits: ["gpt-4o"],
  }
  vi.mocked(fetchRelayForTokens).mockResolvedValue([token])
  const session = await relayForAccountKeyResources.open({ account, request })
  const collection = await session.openCollection("default")
  const ref = {
    accountId: account.id,
    siteType: SITE_TYPES.RELAYFOR,
    scopeKey: "default",
    resourceId: "1",
  }
  const editor = await collection.openEditEditor(ref)
  await editor.submit({ ...editor.initialValues, name: "Renamed" })
  expect(updateRelayForToken).toHaveBeenLastCalledWith(
    expect.anything(),
    1,
    expect.objectContaining({
      name: "Renamed",
      remain_quota: -1,
      ip_limits: "10.0.0.0/8,1.1.1.1",
      expires_at: "2027-01-01T00:00:00.000Z",
    }),
  )
})

it("reopens and updates native budgets and request limits without clearing unknown settings", async () => {
  const token = {
    id: 1,
    name: "Budget",
    key: "sk-masked...****",
    status: 1,
    remain_quota: -1,
    used_quota: 0,
    unlimited_quota: false,
    limits: {
      budget_5h: 500000,
      budget_day: 1000000,
      budget_week: 0,
      budget_month: 0,
      requests_per_minute: 20,
      concurrent_requests: 3,
      future_setting: 9,
    },
  }
  vi.mocked(fetchRelayForTokens).mockResolvedValue([token])
  const session = await relayForAccountKeyResources.open({ account, request })
  const collection = await session.openCollection("default")
  const ref = {
    accountId: account.id,
    siteType: SITE_TYPES.RELAYFOR,
    scopeKey: "default",
    resourceId: "1",
  }
  const editor = await collection.openEditEditor(ref)
  expect(editor.initialValues.budget_5h).toBe(1)
  expect(editor.initialValues.requests_per_minute).toBe(20)
  await editor.submit({ ...editor.initialValues, budget_day: 3 })
  expect(updateRelayForToken).toHaveBeenLastCalledWith(
    expect.anything(),
    1,
    expect.objectContaining({
      limits: { ...token.limits, budget_day: 1500000 },
    }),
  )
})

it("rejects invalid limits before sending an edit", async () => {
  vi.mocked(fetchRelayForTokens).mockResolvedValue([
    {
      id: 1,
      name: "Key",
      key: "sk-masked...****",
      status: 1,
      remain_quota: -1,
      used_quota: 0,
      unlimited_quota: false,
    },
  ])
  const session = await relayForAccountKeyResources.open({ account, request })
  const collection = await session.openCollection("default")
  const editor = await collection.openEditEditor({
    accountId: account.id,
    siteType: SITE_TYPES.RELAYFOR,
    scopeKey: "default",
    resourceId: "1",
  })
  const invalidValues: EditableResourceProjection[] = [
    { quota: -0.5 },
    { requests_per_minute: 1.5 },
    { budget_day: -1 },
    { expired_at: "invalid" },
  ]
  for (const invalid of invalidValues) {
    expect(editor.validate({ ...editor.initialValues, ...invalid }).valid).toBe(
      false,
    )
  }
})

it("does not replay a rotation when its response is lost", async () => {
  vi.clearAllMocks()
  vi.mocked(fetchRelayForTokens).mockResolvedValue([
    {
      id: 1,
      name: "Key",
      key: "sk-masked...****",
      status: 1,
      remain_quota: -1,
      used_quota: 0,
      unlimited_quota: false,
    },
  ])
  vi.mocked(rotateRelayForToken).mockRejectedValue(
    new TypeError("Failed to fetch"),
  )
  const session = await relayForAccountKeyResources.open({ account, request })
  const collection = await session.openCollection("default")
  const editor = await collection.openEditEditor(
    {
      accountId: account.id,
      siteType: SITE_TYPES.RELAYFOR,
      scopeKey: "default",
      resourceId: "1",
    },
    undefined,
    { action: "rotate" },
  )
  await expect(editor.submit({})).rejects.toMatchObject({
    failure: { code: "mutation_state_uncertain" },
  })
  await expect(editor.submit({})).rejects.toBeDefined()
  expect(rotateRelayForToken).toHaveBeenCalledOnce()
})
