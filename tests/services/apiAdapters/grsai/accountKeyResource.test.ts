import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { grsaiAccountKeyResources } from "~/services/apiAdapters/grsai/accountKeyResource"
import type { GrsaiApiKey } from "~/services/apiService/grsai/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const {
  mockFetchGrsaiKeys,
  mockCreateGrsaiKey,
  mockUpdateGrsaiKey,
  mockDeleteGrsaiKey,
} = vi.hoisted(() => ({
  mockFetchGrsaiKeys: vi.fn(),
  mockCreateGrsaiKey: vi.fn(),
  mockUpdateGrsaiKey: vi.fn(),
  mockDeleteGrsaiKey: vi.fn(),
}))

vi.mock("~/services/apiService/grsai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/grsai")>()),
  fetchGrsaiKeys: mockFetchGrsaiKeys,
  createGrsaiKey: mockCreateGrsaiKey,
  updateGrsaiKey: mockUpdateGrsaiKey,
  deleteGrsaiKey: mockDeleteGrsaiKey,
}))

const baseUrl = "https://grsai.com"

const request = {
  baseUrl,
  accountId: "account-example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "session-token",
  },
}

const openInput = {
  account: {
    id: "account-example",
    name: "Example account",
    siteType: SITE_TYPES.GRSAI,
  },
  request,
} as never

const key = (overrides: Partial<GrsaiApiKey> = {}): GrsaiApiKey => ({
  id: "6abac34421d04b1bfcf0a911",
  key: "sk-d795321b9d32446a9c161bb5a9988aee",
  name: "Example key",
  credits: 0,
  totalCost: 0,
  type: 0,
  expireTime: 0,
  createTime: "2026-09-29 03:43:00",
  ...overrides,
})

const openSession = async () => await grsaiAccountKeyResources.open(openInput)

describe("grsaiAccountKeyResources", () => {
  const ref = {
    accountId: "account-example",
    siteType: SITE_TYPES.GRSAI,
    scopeKey: "account",
    resourceId: key().id,
  }

  it("reports read failures without exposing a runtime secret", async () => {
    mockFetchGrsaiKeys.mockRejectedValue(new Error("offline"))
    const session = await openSession()
    await expect(session.runtimeKey!.resolve(ref)).resolves.toMatchObject({
      kind: "unavailable",
      failure: { code: expect.any(String) },
    })
  })

  it.each(["create", "update", "delete"])(
    "does not replay a rejected %s mutation",
    async (operation) => {
      const denied = new ApiError(
        "denied",
        undefined,
        "/keys",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
      mockFetchGrsaiKeys.mockResolvedValue([key()])
      const session = await openSession()
      const collection = await session.openCollection("account")
      if (operation === "create") {
        mockCreateGrsaiKey.mockRejectedValue(denied)
        const editor = await session.openCreateEditor("account")
        await expect(editor.submit(editor.initialValues)).rejects.toBeDefined()
        expect(mockCreateGrsaiKey).toHaveBeenCalledTimes(1)
      } else if (operation === "update") {
        mockUpdateGrsaiKey.mockRejectedValue(denied)
        const editor = await collection.openEditEditor(ref)
        await expect(
          editor.submit({ ...editor.initialValues, name: "Renamed" }),
        ).rejects.toBeDefined()
        expect(mockUpdateGrsaiKey).toHaveBeenCalledTimes(1)
      } else {
        mockDeleteGrsaiKey.mockRejectedValue(denied)
        await expect(collection.delete(ref)).rejects.toBeDefined()
        expect(mockDeleteGrsaiKey).toHaveBeenCalledTimes(1)
      }
    },
  )

  it.each(["unchanged", "missing", "offline"])(
    "retains uncertainty when update readback is %s",
    async (state) => {
      mockFetchGrsaiKeys.mockResolvedValue([key({ credits: 500 })])
      const session = await openSession()
      const collection = await session.openCollection("account")
      const editor = await collection.openEditEditor(ref)
      mockUpdateGrsaiKey.mockImplementation(async () => {
        if (state === "offline")
          mockFetchGrsaiKeys.mockRejectedValue(new Error("offline"))
        else
          mockFetchGrsaiKeys.mockResolvedValue(
            state === "missing" ? [] : [key({ credits: 500 })],
          )
      })
      await expect(
        editor.submit({ ...editor.initialValues, name: "Renamed" }),
      ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
      expect(mockUpdateGrsaiKey).toHaveBeenCalledTimes(1)
    },
  )

  it("renames an unlimited key without changing its stored credit budget", async () => {
    let inventory = [key({ credits: 500 })]
    mockFetchGrsaiKeys.mockImplementation(async () => inventory)
    mockUpdateGrsaiKey.mockImplementation(async () => {
      inventory = [key({ name: "Renamed", credits: 500 })]
    })
    const collection = await (await openSession()).openCollection("account")
    const editor = await collection.openEditEditor(ref)
    await expect(
      editor.submit({ ...editor.initialValues, name: "Renamed" }),
    ).resolves.toMatchObject({ facts: { displayName: "Renamed" } })
    expect(mockUpdateGrsaiKey).toHaveBeenCalledWith(expect.anything(), {
      apiKey: key().key,
      name: "Renamed",
      type: 0,
      expireTime: 0,
    })
  })
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("declares the inventory secret as recoverable", () => {
    expect(grsaiAccountKeyResources.inventorySecretAvailability).toBe(
      "recoverable",
    )
    expect(grsaiAccountKeyResources.defaultCreation).toBe("editor-defaults")
  })

  it("exposes one account scope named after the saved account", async () => {
    const session = await openSession()

    await expect(session.listScopes()).resolves.toEqual([
      {
        scopeKey: "account",
        routeKey: "account",
        displayName: "Example account",
        isDefault: true,
      },
    ])
  })

  it("lists keys with a masked label and the deployment's own client endpoint", async () => {
    const session = await openSession()
    mockFetchGrsaiKeys.mockResolvedValueOnce([key(), key({ id: "second" })])

    const page = await (await session.openCollection("account")).list()

    const first = atIndex(page.items, 0)
    expect(page.total).toBe(2)
    expect(first.maskedLabel).not.toContain("d795321b9d32446a")
    // Keys are used against the OpenAI-compatible host, not the console origin.
    expect(first.runtimeKey?.baseUrl).toBe("https://grsaiapi.com/v1")
  })

  it("marks a key whose expiry has passed as expired", async () => {
    const session = await openSession()
    mockFetchGrsaiKeys.mockResolvedValueOnce([
      key({ expireTime: 1_000_000_000 }),
      key({ id: "future", expireTime: 4_000_000_000 }),
    ])

    const page = await (await session.openCollection("account")).list()

    expect(atIndex(page.items, 0).status).toBe("expired")
    expect(atIndex(page.items, 1).status).toBe("enabled")
  })

  it("creates an unlimited key and keeps the secret in the inventory", async () => {
    const session = await openSession()
    const created = key({ id: "created-1", name: "Fresh key" })
    mockCreateGrsaiKey.mockResolvedValueOnce(created)

    const editor = await session.openCreateEditor("account")
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Fresh key",
    })

    expect(mockCreateGrsaiKey).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl }),
      { name: "Fresh key", type: 0, expireTime: 0 },
    )
    expect(result.facts?.ref.resourceId).toBe("created-1")
    // The list re-reveals the key, so creation must not present a one-time
    // secret the user is warned about losing.
    expect(result.createdSecret).toBeUndefined()
  })

  it("creates a limited key with an expiry", async () => {
    const session = await openSession()
    mockCreateGrsaiKey.mockResolvedValueOnce(key({ id: "created-2" }))

    const editor = await session.openCreateEditor("account")
    await editor.submit({
      ...editor.initialValues,
      name: "Budgeted key",
      unlimited_credits: false,
      credits: 500,
      expires_at: new Date("2027-01-01T00:00:00.000Z").toISOString(),
    })

    expect(mockCreateGrsaiKey).toHaveBeenCalledWith(expect.anything(), {
      name: "Budgeted key",
      type: 1,
      credits: 500,
      expireTime: 1_798_761_600,
    })
  })

  it("addresses an update by the key's plaintext secret", async () => {
    const session = await openSession()
    const existing = key()
    const renamed = key({
      name: "Renamed key",
      type: 1,
      credits: 250,
      expireTime: 1_798_761_600,
    })
    // The adapter re-reads the inventory to confirm the write, so the stub
    // tracks state rather than a fixed call count.
    let inventory = [existing]
    mockFetchGrsaiKeys.mockImplementation(async () => inventory)
    mockUpdateGrsaiKey.mockImplementation(async () => {
      inventory = [renamed]
    })

    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor(
      (
        await collection.get({
          accountId: "account-example",
          siteType: SITE_TYPES.GRSAI,
          scopeKey: "account",
          resourceId: existing.id,
        })
      ).ref,
    )
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Renamed key",
      unlimited_credits: false,
      credits: 250,
      expires_at: new Date("2027-01-01T00:00:00.000Z").toISOString(),
    })

    expect(mockUpdateGrsaiKey).toHaveBeenCalledWith(expect.anything(), {
      apiKey: existing.key,
      name: "Renamed key",
      type: 1,
      credits: 250,
      expireTime: 1_798_761_600,
    })
    expect(result.facts?.displayName).toBe("Renamed key")
  })

  it("skips the write when nothing changed", async () => {
    const session = await openSession()
    const existing = key()
    mockFetchGrsaiKeys.mockResolvedValue([existing])

    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor(
      (
        await collection.get({
          accountId: "account-example",
          siteType: SITE_TYPES.GRSAI,
          scopeKey: "account",
          resourceId: existing.id,
        })
      ).ref,
    )
    await editor.submit({ ...editor.initialValues })

    expect(mockUpdateGrsaiKey).not.toHaveBeenCalled()
  })

  it("resolves the runtime secret from the inventory", async () => {
    const session = await openSession()
    mockFetchGrsaiKeys.mockResolvedValueOnce([key()])

    const runtimeKey = session.runtimeKey
    expect(runtimeKey).toBeDefined()
    await expect(
      runtimeKey!.resolve({
        accountId: "account-example",
        siteType: SITE_TYPES.GRSAI,
        scopeKey: "account",
        resourceId: key().id,
      }),
    ).resolves.toEqual({ kind: "resolved", secret: key().key })
  })

  it("reports an unavailable secret when the key disappeared", async () => {
    const session = await openSession()
    mockFetchGrsaiKeys.mockResolvedValueOnce([])

    const resolution = await session.runtimeKey!.resolve({
      accountId: "account-example",
      siteType: SITE_TYPES.GRSAI,
      scopeKey: "account",
      resourceId: "missing",
    })

    expect(resolution.kind).toBe("unavailable")
  })

  it("deletes a key by its id", async () => {
    const session = await openSession()
    mockDeleteGrsaiKey.mockResolvedValueOnce(undefined)

    const collection = await session.openCollection("account")
    await collection.delete({
      accountId: "account-example",
      siteType: SITE_TYPES.GRSAI,
      scopeKey: "account",
      resourceId: key().id,
    })

    expect(mockDeleteGrsaiKey).toHaveBeenCalledWith(expect.anything(), key().id)
  })
})
