import { beforeEach, describe, expect, it, vi } from "vitest"

import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/accountKeyNames"
import { aihubmixAccountKeyResources } from "~/services/apiAdapters/aihubmix/accountKeyResource"
import type { AIHubMixKey } from "~/services/apiService/aihubmix/keyTypes"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))
vi.mock("~/services/apiService/aihubmix", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/aihubmix")>()),
  fetchAIHubMixKeys: mocks.list,
  fetchAIHubMixKey: mocks.get,
  createAIHubMixKey: mocks.create,
  updateAIHubMixKey: mocks.update,
  deleteApiToken: mocks.remove,
}))

const input = {
  account: { id: "a1", name: "AIHubMix", siteType: SITE_TYPES.AIHUBMIX },
  request: {
    baseUrl: "https://console.aihubmix.com",
    accountId: "a1",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: "dashboard-token",
      userId: "1",
    },
  },
}
const ref = {
  accountId: "a1",
  siteType: SITE_TYPES.AIHUBMIX,
  scopeKey: "account",
  resourceId: "1",
} as const
const key = (overrides: Partial<AIHubMixKey> = {}): AIHubMixKey => ({
  id: 1,
  name: "Example",
  key: "sk-secret-from-list",
  status: 1,
  unlimited_quota: true,
  remain_quota: -1,
  expired_time: -1,
  models: "model-a",
  subnet: "192.0.2.0/24",
  ...overrides,
})

describe("AIHubMix native account keys", () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()))

  it("projects native restrictions without exposing inventory secrets", async () => {
    mocks.list.mockResolvedValueOnce([key()])
    const session = await aihubmixAccountKeyResources.open(input)
    const page = await (await session.openCollection("account")).list()
    expect(atIndex(page.items, 0).runtimeKey?.modelAccess).toEqual({
      groups: null,
      allowedModelIds: ["model-a"],
      suggestedModelIds: ["model-a"],
    })
    expect(JSON.stringify(page)).not.toContain("sk-secret-from-list")
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: AIHUBMIX_API_ORIGIN }),
    )
    await expect(session.runtimeKey!.resolve(ref)).resolves.toMatchObject({
      kind: "unavailable",
    })
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it("hands the one-time create secret to an exact native resource", async () => {
    mocks.list.mockResolvedValueOnce([])
    mocks.create.mockResolvedValueOnce(
      key({ id: 9, name: "Created", full_key: "sk-once-only", key: "sk-****" }),
    )
    const session = await aihubmixAccountKeyResources.open(input)
    const editor = await session.openCreateEditor("account")
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Created",
    })
    expect(result.facts?.ref.resourceId).toBe("9")
    expect(result.createdSecret).toMatchObject({
      secret: "sk-once-only",
      correlation: {
        kind: "account-key-resource",
        ref: { ...ref, resourceId: "9" },
      },
      credential: { baseUrl: AIHUBMIX_API_ORIGIN },
    })
    expect(JSON.stringify(result.facts)).not.toContain("sk-once-only")
    expect(editor.fields.map((field) => field.fieldId)).not.toContain("group")
  })

  it("retains a confirmed response-only secret when its ID cannot be attributed", async () => {
    mocks.list
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("inventory unavailable"))
    mocks.create.mockResolvedValueOnce({
      full_key: "sk-save-before-close",
      name: "Created",
    })
    const session = await aihubmixAccountKeyResources.open(input)
    const editor = await session.openCreateEditor("account")
    const values = { ...editor.initialValues, name: "Created" }
    await expect(editor.submit(values)).resolves.toMatchObject({
      facts: null,
      createdSecret: {
        secret: "sk-save-before-close",
        correlation: { kind: "account-create", accountId: "a1" },
      },
    })
    await expect(editor.submit(values)).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it("does not attach a response secret to a pre-existing resource ID", async () => {
    mocks.list.mockResolvedValue([key()])
    mocks.create.mockResolvedValueOnce(
      key({ full_key: "sk-conflicting-secret" }),
    )
    const editor = await (
      await aihubmixAccountKeyResources.open(input)
    ).openCreateEditor("account")
    await expect(editor.submit(editor.initialValues)).resolves.toMatchObject({
      facts: null,
      createdSecret: { correlation: { kind: "account-create" } },
    })
  })

  it("confirms an acknowledgement with one uniquely matching new resource", async () => {
    mocks.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        key({ name: DEFAULT_AUTO_PROVISION_KEY_NAME, models: "", subnet: "" }),
      ])
    mocks.create.mockResolvedValueOnce(undefined)
    const editor = await (
      await aihubmixAccountKeyResources.open(input)
    ).openCreateEditor("account")
    const result = await editor.submit(editor.initialValues)
    expect(result.facts?.ref).toEqual(ref)
    expect(result.createdSecret).toBeUndefined()
  })

  it("reports an ambiguous acknowledgement without replay", async () => {
    mocks.list.mockResolvedValue([])
    mocks.create.mockResolvedValueOnce(undefined)
    const editor = await (
      await aihubmixAccountKeyResources.open(input)
    ).openCreateEditor("account")
    await expect(editor.submit(editor.initialValues)).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it("preserves fresh quota, model, and subnet values during a rename", async () => {
    const original = key({ unlimited_quota: false, remain_quota: 1000000 })
    const latest = { ...original, remain_quota: 900000 }
    mocks.get
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(latest)
      .mockResolvedValueOnce({ ...latest, name: "Renamed" })
    const editor = await (
      await (
        await aihubmixAccountKeyResources.open(input)
      ).openCollection("account")
    ).openEditEditor(ref)
    await editor.submit({ ...editor.initialValues, name: "Renamed" })
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: AIHUBMIX_API_ORIGIN }),
      1,
      expect.objectContaining({
        name: "Renamed",
        remain_quota: 900000,
        models: "model-a",
        subnet: "192.0.2.0/24",
      }),
    )
  })

  it("rejects a concurrent edit to the same field", async () => {
    mocks.get
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(key({ name: "Remote" }))
    const editor = await (
      await (
        await aihubmixAccountKeyResources.open(input)
      ).openCollection("account")
    ).openEditEditor(ref)
    await expect(
      editor.submit({ ...editor.initialValues, name: "Local" }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

it.each([
  {
    lostResponse: false,
    editQuota: false,
    readName: "Renamed",
    succeeds: true,
  },
  { lostResponse: true, editQuota: false, readName: "Renamed", succeeds: true },
  { lostResponse: false, editQuota: true, readName: "Renamed", succeeds: true },
  { lostResponse: true, editQuota: true, readName: "Renamed", succeeds: false },
  {
    lostResponse: true,
    editQuota: false,
    readName: "Original",
    succeeds: false,
  },
])(
  "reconciles consumed quota without guessing uncertain edits: %j",
  async ({ lostResponse, editQuota, readName, succeeds }) => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    const original = key({
      name: "Original",
      unlimited_quota: false,
      remain_quota: 1000000,
    })
    mocks.get
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce({
        ...original,
        name: readName,
        remain_quota: 900000,
      })
    mocks.update.mockImplementation(async (request) => {
      request.observer?.onDispatch()
      if (lostResponse) throw new Error("response lost")
    })
    const collection = await (
      await aihubmixAccountKeyResources.open(input)
    ).openCollection("account")
    const editor = await collection.openEditEditor(ref)
    const result = editor.submit({
      ...editor.initialValues,
      name: "Renamed",
      ...(editQuota ? { quotaUsd: 4 } : {}),
    })
    if (succeeds) await expect(result).resolves.toBeDefined()
    else
      await expect(result).rejects.toMatchObject({
        failure: { code: "mutation_state_uncertain" },
      })
    expect(mocks.update).toHaveBeenCalledTimes(1)
  },
)

it("preserves the last-use timestamp in safe resource facts", async () => {
  mocks.list.mockReset()
  mocks.list.mockResolvedValue([key({ accessed_time: 1750000000 })])
  const page = await (
    await (
      await aihubmixAccountKeyResources.open(input)
    ).openCollection("account")
  ).list()
  expect(atIndex(page.items, 0).fields).toContainEqual({
    fieldId: "accessed_time",
    kind: "number",
    value: 1750000000,
  })
})

describe("AIHubMix native mutation recovery", () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()))

  it.each([
    { status: 2, expected: "disabled" },
    { status: 7, expected: "unknown" },
    { status: 1, expired_time: 1, expected: "expired" },
  ])("preserves provider availability %j", async ({ expected, ...status }) => {
    mocks.list.mockResolvedValue([key(status)])
    const collection = await (
      await aihubmixAccountKeyResources.open(input)
    ).openCollection("account")
    expect(atIndex((await collection.list()).items, 0).status).toBe(expected)
  })

  it.each(["0", "01", "9007199254740992"])(
    "rejects an invalid locator %s before a read",
    async (resourceId) => {
      const collection = await (
        await aihubmixAccountKeyResources.open(input)
      ).openCollection("account")
      await expect(
        collection.openEditEditor({ ...ref, resourceId }),
      ).rejects.toBeDefined()
      expect(mocks.get).not.toHaveBeenCalled()
    },
  )

  it("does not write unchanged fields", async () => {
    mocks.get.mockResolvedValue(key())
    const collection = await (
      await aihubmixAccountKeyResources.open(input)
    ).openCollection("account")
    const editor = await collection.openEditEditor(ref)
    await expect(editor.submit(editor.initialValues)).resolves.toMatchObject({
      facts: { displayName: "Example" },
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("retains uncertainty when the post-update read fails without replaying", async () => {
    mocks.get
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(key())
      .mockRejectedValueOnce(new Error("read unavailable"))
    const collection = await (
      await aihubmixAccountKeyResources.open(input)
    ).openCollection("account")
    const editor = await collection.openEditEditor(ref)
    await expect(
      editor.submit({ ...editor.initialValues, name: "Renamed" }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })

  it.each(["create", "update", "delete"])(
    "does not retry a definite %s rejection",
    async (operation) => {
      const denied = new ApiError(
        "denied",
        undefined,
        "/api/token/",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
      mocks.list.mockResolvedValue([])
      mocks.get.mockResolvedValue(key())
      const session = await aihubmixAccountKeyResources.open(input)
      const collection = await session.openCollection("account")
      if (operation === "create") {
        mocks.create.mockRejectedValueOnce(denied)
        const editor = await session.openCreateEditor("account")
        await expect(editor.submit(editor.initialValues)).rejects.toBeDefined()
        expect(mocks.create).toHaveBeenCalledTimes(1)
        expect(mocks.list).toHaveBeenCalledTimes(1)
      } else if (operation === "update") {
        mocks.update.mockRejectedValueOnce(denied)
        const editor = await collection.openEditEditor(ref)
        await expect(
          editor.submit({ ...editor.initialValues, name: "Renamed" }),
        ).rejects.toBeDefined()
        expect(mocks.update).toHaveBeenCalledTimes(1)
        expect(mocks.get).toHaveBeenCalledTimes(2)
      } else {
        mocks.remove.mockRejectedValueOnce(denied)
        await expect(collection.delete(ref)).rejects.toBeDefined()
        expect(mocks.remove).toHaveBeenCalledTimes(1)
      }
    },
  )

  it("deletes only the selected identity", async () => {
    const collection = await (
      await aihubmixAccountKeyResources.open(input)
    ).openCollection("account")
    await expect(collection.delete(ref)).resolves.toBeUndefined()
    expect(mocks.remove).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: AIHUBMIX_API_ORIGIN }),
      1,
    )
  })
})
