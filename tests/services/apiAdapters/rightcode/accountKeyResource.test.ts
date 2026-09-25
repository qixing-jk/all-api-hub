import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"
import { rightCodeAccountKeyResources } from "~/services/apiAdapters/rightcode/accountKeyResource"
import type { RightCodeApiKey } from "~/services/apiService/rightcode/type"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const {
  mockFetchRightCodeEffectiveUpstreams,
  mockFetchRightCodeKeys,
  mockFetchRightCodeKey,
  mockCreateRightCodeKey,
  mockUpdateRightCodeKey,
  mockSetRightCodeKeyExpiry,
  mockDeleteRightCodeKey,
} = vi.hoisted(() => ({
  mockFetchRightCodeEffectiveUpstreams: vi.fn(),
  mockFetchRightCodeKeys: vi.fn(),
  mockFetchRightCodeKey: vi.fn(),
  mockCreateRightCodeKey: vi.fn(),
  mockUpdateRightCodeKey: vi.fn(),
  mockSetRightCodeKeyExpiry: vi.fn(),
  mockDeleteRightCodeKey: vi.fn(),
}))

vi.mock("~/services/apiService/rightcode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/rightcode")>()),
  fetchRightCodeEffectiveUpstreams: mockFetchRightCodeEffectiveUpstreams,
  fetchRightCodeKeys: mockFetchRightCodeKeys,
  fetchRightCodeKey: mockFetchRightCodeKey,
  createRightCodeKey: mockCreateRightCodeKey,
  updateRightCodeKey: mockUpdateRightCodeKey,
  setRightCodeKeyExpiry: mockSetRightCodeKeyExpiry,
  deleteRightCodeKey: mockDeleteRightCodeKey,
}))

const baseUrl = "https://console.example.invalid"

const request = {
  baseUrl,
  accountId: "account-example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "account-token",
  },
}

const openInput = {
  account: {
    id: "account-example",
    name: "Example account",
    siteType: SITE_TYPES.RIGHT_CODE,
  },
  request,
} as never

const channels = [
  {
    upstream_id: 1,
    name: "Codex",
    prefix: "/codex",
    copy_with_v1: true,
    default_protocol: "responses",
    models: [{ model_id: 1, name: "gpt-5.5", is_available: true }],
  },
  {
    upstream_id: 2,
    name: "Claude 官方渠道",
    prefix: "/claude",
    copy_with_v1: false,
    default_protocol: "messages",
    models: [{ model_id: 2, name: "claude-sonnet-5", is_available: true }],
  },
]

const key = (overrides: Partial<RightCodeApiKey> = {}): RightCodeApiKey => ({
  id: 11,
  key: "sk-example00000000000000000000000001",
  name: "Example key",
  bound_upstream_id: 1,
  quota_limit: null,
  used_quota: 0,
  expired_at: null,
  is_active: true,
  allowed_prefixes: null,
  allowed_models: [],
  allow_wallet: true,
  allowed_item_ids: null,
  created_at: "2026-09-24T14:05:20",
  ...overrides,
})

const openSession = async () => {
  mockFetchRightCodeEffectiveUpstreams.mockResolvedValueOnce(channels)
  return await rightCodeAccountKeyResources.open(openInput)
}

describe("rightCodeAccountKeyResources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("declares the inventory secret as recoverable", () => {
    expect(rightCodeAccountKeyResources.inventorySecretAvailability).toBe(
      "recoverable",
    )
    expect(rightCodeAccountKeyResources.defaultCreation).toBe("requires-input")
  })

  it("projects the channel address onto the runtime key so exports use the right endpoint", async () => {
    const session = await openSession()
    mockFetchRightCodeKeys.mockResolvedValueOnce([
      key(),
      key({ id: 12, bound_upstream_id: 2, name: "Claude key" }),
    ])

    const page = await (await session.openCollection("account")).list()

    expect(atIndex(page.items, 0).runtimeKey?.baseUrl).toBe(
      "https://console.example.invalid/codex/v1",
    )
    expect(atIndex(page.items, 1).runtimeKey?.baseUrl).toBe(
      "https://console.example.invalid/claude",
    )
    expect(atIndex(page.items, 0).maskedLabel).not.toContain(
      "example0000000000000000",
    )
  })

  it("addresses a legacy prefix key through its allowed prefix", async () => {
    const session = await openSession()
    mockFetchRightCodeKeys.mockResolvedValueOnce([
      key({
        id: 13,
        bound_upstream_id: null,
        allowed_prefixes: ["/claude"],
        name: "Legacy key",
      }),
    ])

    const page = await (await session.openCollection("account")).list()

    expect(atIndex(page.items, 0).runtimeKey?.baseUrl).toBe(
      "https://console.example.invalid/claude",
    )
  })

  it("resolves the plaintext secret from inventory", async () => {
    const session = await openSession()
    mockFetchRightCodeKey.mockResolvedValueOnce(key())

    await expect(
      session.runtimeKey!.resolve({
        accountId: "account-example",
        siteType: SITE_TYPES.RIGHT_CODE,
        scopeKey: "account",
        resourceId: "11",
      }),
    ).resolves.toEqual({
      kind: "resolved",
      secret: "sk-example00000000000000000000000001",
    })
  })

  it("creates a channel-bound key, reporting only the inventory entry", async () => {
    const session = await openSession()
    mockCreateRightCodeKey.mockResolvedValueOnce(key({ id: 21 }))
    mockFetchRightCodeKey.mockResolvedValueOnce(
      key({ id: 21, name: "Fresh key" }),
    )

    const editor = await session.openCreateEditor("account")
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Fresh key",
      channel: "1",
      models: ["gpt-5.5"],
    })

    expect(mockCreateRightCodeKey).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl, accountId: "account-example" }),
      {
        bound_upstream_id: 1,
        allowed_models: ["gpt-5.5"],
        name: "Fresh key",
        quota_limit: null,
        allow_wallet: true,
        allowed_item_ids: null,
      },
    )
    expect(result.facts?.ref.resourceId).toBe("21")
    expect(result.facts?.runtimeKey?.baseUrl).toBe(
      "https://console.example.invalid/codex/v1",
    )
    // The key stays readable, so creation must not present a one-time secret
    // the user is warned about losing.
    expect(result.createdSecret).toBeUndefined()
    // No expiry was requested, so the dedicated endpoint must not be called.
    expect(mockSetRightCodeKeyExpiry).not.toHaveBeenCalled()
  })

  it("applies expiry through its own endpoint when one is requested", async () => {
    const session = await openSession()
    mockCreateRightCodeKey.mockResolvedValueOnce(key({ id: 22 }))
    mockSetRightCodeKeyExpiry.mockResolvedValueOnce(undefined)
    mockFetchRightCodeKey.mockResolvedValueOnce(
      key({ id: 22, expired_at: "2027-01-01T00:00:00" }),
    )

    const editor = await session.openCreateEditor("account")
    await editor.submit({
      ...editor.initialValues,
      name: "Expiring key",
      channel: "1",
      expires_at: new Date("2027-01-01T08:00:00").toISOString(),
    })

    expect(mockSetRightCodeKeyExpiry).toHaveBeenCalledWith(
      request,
      22,
      "2027-01-01T08:00:00",
    )
  })

  it("updates only the fields the editor owns and never clears unexposed restrictions", async () => {
    const session = await openSession()
    const restricted = key({
      allowed_item_ids: [5],
      allowed_prefixes: ["/codex"],
    })
    const renamed = key({
      name: "Renamed",
      allowed_item_ids: [5],
      allowed_prefixes: ["/codex"],
    })
    // The editor is built from the current detail, submit re-reads it, and the
    // successful write is verified by a third read.
    mockFetchRightCodeKey
      .mockResolvedValueOnce(restricted)
      .mockResolvedValueOnce(restricted)
      .mockResolvedValueOnce(renamed)
    mockUpdateRightCodeKey.mockResolvedValueOnce(renamed)

    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.RIGHT_CODE,
      scopeKey: "account",
      resourceId: "11",
    })
    await editor.submit({ ...editor.initialValues, name: "Renamed" })

    expect(mockUpdateRightCodeKey).toHaveBeenCalledTimes(1)
    const [, keyId, body] = atIndex(mockUpdateRightCodeKey.mock.calls, 0)
    expect(keyId).toBe(11)
    expect(body).toMatchObject({ name: "Renamed" })
    expect(body).not.toHaveProperty("allowed_item_ids")
    expect(body).not.toHaveProperty("allowed_prefixes")
  })

  it("deletes a key and surfaces upstream authentication failures", async () => {
    const session = await openSession()
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.RIGHT_CODE,
      scopeKey: "account" as const,
      resourceId: "11",
    }

    mockDeleteRightCodeKey.mockResolvedValueOnce(undefined)
    await expect(collection.delete(ref)).resolves.toBeUndefined()
    expect(mockDeleteRightCodeKey).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl }),
      11,
    )

    mockDeleteRightCodeKey.mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
    )
    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
      },
    })
  })
})
