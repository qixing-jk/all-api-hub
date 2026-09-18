import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS,
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { voApiV2Capabilities } from "~/services/apiAdapters/voapiV2"
import { voApiV2AccountKeyResources } from "~/services/apiAdapters/voapiV2/accountKeyResource"
import type { VoApiV2Key } from "~/services/apiService/voapiV2/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const {
  mockCreateVoApiV2Key,
  mockUpdateVoApiV2Key,
  mockDeleteVoApiV2Token,
  mockFetchAllVoApiV2RawKeys,
  mockFetchVoApiV2KeyGroupDescriptors,
  mockRenameVoApiV2Key,
  mockResolveVoApiV2KeySecretById,
} = vi.hoisted(() => ({
  mockCreateVoApiV2Key: vi.fn(),
  mockUpdateVoApiV2Key: vi.fn(),
  mockDeleteVoApiV2Token: vi.fn(),
  mockFetchAllVoApiV2RawKeys: vi.fn(),
  mockFetchVoApiV2KeyGroupDescriptors: vi.fn(),
  mockRenameVoApiV2Key: vi.fn(),
  mockResolveVoApiV2KeySecretById: vi.fn(),
}))

vi.mock("~/services/apiService/voapiV2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/voapiV2")>()),
  createVoApiV2Key: mockCreateVoApiV2Key,
  updateVoApiV2Key: mockUpdateVoApiV2Key,
  deleteVoApiV2Token: mockDeleteVoApiV2Token,
  fetchAllVoApiV2RawKeys: mockFetchAllVoApiV2RawKeys,
  fetchVoApiV2KeyGroupDescriptors: mockFetchVoApiV2KeyGroupDescriptors,
  renameVoApiV2Key: mockRenameVoApiV2Key,
  resolveVoApiV2KeySecretById: mockResolveVoApiV2KeySecretById,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "access-token",
    userId: 7,
  },
}

const rawKey = (overrides: Partial<VoApiV2Key>): VoApiV2Key => ({
  id: 1,
  name: "Example key",
  tokenMasked: "sk-example****0001",
  groups: [9],
  enable: true,
  expireTime: -1,
  boundlessAmount: false,
  amount: "10",
  used: "1",
  ...overrides,
})

describe("VoAPI v2 account key resources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateVoApiV2Key.mockReset()
    mockUpdateVoApiV2Key.mockReset()
    mockDeleteVoApiV2Token.mockReset()
    mockFetchAllVoApiV2RawKeys.mockReset()
    mockFetchVoApiV2KeyGroupDescriptors.mockReset()
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValue([])
    mockRenameVoApiV2Key.mockReset()
    mockResolveVoApiV2KeySecretById.mockReset()
  })

  it.each(["reconciled", "missing", "read-failed", "rejected"])(
    "reconciles native creation without replay: %s",
    async (outcome) => {
      mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([rawKey({ id: 1 })])
      if (outcome === "read-failed")
        mockFetchAllVoApiV2RawKeys.mockRejectedValueOnce(
          new Error("inventory offline"),
        )
      else
        mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce(
          outcome === "reconciled"
            ? [
                rawKey({
                  id: 2,
                  name: "Recovered",
                  groups: [9],
                  amount: "1",
                  used: "0",
                  note: "",
                }),
              ]
            : [],
        )
      mockCreateVoApiV2Key.mockImplementationOnce(async (request) => {
        request.observer?.onDispatch()
        if (outcome === "rejected")
          throw new ApiError(
            "denied",
            undefined,
            "/keys",
            API_ERROR_CODES.BUSINESS_ERROR,
          )
        throw new Error("response lost")
      })
      const session = await voApiV2AccountKeyResources.open({
        account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
        request,
      })
      const editor = await session.openCreateEditor("account")
      const result = editor.submit({
        ...editor.initialValues,
        name: "Recovered",
        groups: ["9"],
        amount: 1,
      })
      if (outcome === "reconciled")
        await expect(result).resolves.toMatchObject({
          facts: { ref: { resourceId: "2" } },
        })
      else await expect(result).rejects.toBeDefined()
      expect(mockCreateVoApiV2Key).toHaveBeenCalledTimes(1)
      expect(mockFetchAllVoApiV2RawKeys).toHaveBeenCalledTimes(
        outcome === "rejected" ? 1 : 2,
      )
    },
  )

  it("maps structured upstream outages at the provisioning session boundary", async () => {
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([])
    mockFetchAllVoApiV2RawKeys.mockRejectedValueOnce({
      response: { status: 503 },
      message: "VoAPI key inventory unavailable",
      upstreamCode: "KEYS_UNAVAILABLE",
    })

    const session = await voApiV2AccountKeyResources.open({
      account: {
        id: "account-example",
        name: "Example account",
        siteType: SITE_TYPES.VO_API_V2,
      },
      request,
    })

    await expect(session.provisioning!.inspect()).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        message: "VoAPI key inventory unavailable",
        upstreamCode: "KEYS_UNAVAILABLE",
      },
    })
  })

  it("lists the account inventory with canonical numeric resource refs", async () => {
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([
      rawKey({ id: 7, name: "First" }),
      rawKey({ id: 11, name: "Second" }),
    ])

    const session = await voApiV2AccountKeyResources.open({
      account: {
        id: "account-example",
        name: "Example account",
        siteType: SITE_TYPES.VO_API_V2,
      },
      request,
    })
    const scope = await session.resolveDefaultScope()
    const page = await (await session.openCollection(scope.scopeKey)).list()

    expect(scope).toEqual({
      scopeKey: "account",
      routeKey: "account",
      displayName: "Example account",
      isDefault: true,
    })
    expect(page.items.map(({ ref }) => ref)).toEqual([
      {
        accountId: "account-example",
        siteType: SITE_TYPES.VO_API_V2,
        scopeKey: "account",
        resourceId: "7",
      },
      {
        accountId: "account-example",
        siteType: SITE_TYPES.VO_API_V2,
        scopeKey: "account",
        resourceId: "11",
      },
    ])
    expect(page.total).toBe(2)
    expect(mockFetchAllVoApiV2RawKeys).toHaveBeenCalledWith(request)
  })

  it("keeps inventory available when group metadata fails and defaults ungrouped keys", async () => {
    mockFetchVoApiV2KeyGroupDescriptors.mockRejectedValueOnce(
      new Error("metadata unavailable"),
    )
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([
      rawKey({ groups: [] }),
      rawKey({ id: 2, groups: [9] }),
    ])
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const page = await (await session.openCollection("account")).list()
    expect(page.items.map((item) => item.ref.resourceId)).toEqual(["1", "2"])
    expect(page.items[0].runtimeKey?.modelAccess.groups).toEqual(["default"])
    expect(page.items[1].runtimeKey?.modelAccess.groups).toEqual(["9"])
  })

  it("keeps duplicate group names distinct as finite-quota requirements", async () => {
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([
      { id: 9, requirementKey: "9", displayName: "Shared" },
      { id: 10, requirementKey: "10", displayName: "Shared" },
    ])
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([])

    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })

    await expect(session.provisioning!.inspect()).resolves.toEqual({
      requirements: [
        {
          requirementKey: "9",
          displayName: "Shared",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired,
            reasonCode: "finite-quota-required",
          },
        },
        {
          requirementKey: "10",
          displayName: "Shared",
          provisioning: {
            kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired,
            reasonCode: "finite-quota-required",
          },
        },
      ],
      items: [],
    })
  })

  it("maps every known native group id and fails closed for incomplete placement", async () => {
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([
      { id: 9, requirementKey: "9", displayName: "First" },
      { id: 10, requirementKey: "10", displayName: "Second" },
    ])
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([
      rawKey({ id: 1, groups: [9, 10] }),
      rawKey({ id: 2, groups: undefined }),
      rawKey({ id: 3, groups: [9, "09"] }),
      rawKey({ id: 4, groups: [9, 9] }),
      rawKey({ id: 5, groups: [99] }),
    ])

    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    expect(snapshot.items).toEqual([
      {
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.VO_API_V2,
          scopeKey: "account",
          resourceId: "1",
        },
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: ["9", "10"],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
      ...["2", "3", "4"].map((resourceId) => ({
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.VO_API_V2,
          scopeKey: "account",
          resourceId,
        },
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown,
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      })),
      {
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.VO_API_V2,
          scopeKey: "account",
          resourceId: "5",
        },
        displayName: "Example key",
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
          placementKey: "99",
          displayName: "99",
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
    ])
  })

  it("renames a recognized single-group auto template without flattening its identity", async () => {
    const before = rawKey({ id: 9, name: "user group (auto)", groups: [9] })
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValue([
      { id: 9, requirementKey: "9", displayName: "Priority" },
    ])
    mockFetchAllVoApiV2RawKeys
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([{ ...before, name: "Priority group (auto)" }])
    mockRenameVoApiV2Key.mockResolvedValueOnce(true)

    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    expect(snapshot.items[0].renameSuggestion).toEqual({
      targetDisplayName: "Priority group (auto)",
    })
    await expect(
      session.provisioning!.rename!(snapshot.items[0].ref),
    ).resolves.toEqual({ certainty: "applied", value: undefined })
    expect(mockRenameVoApiV2Key).toHaveBeenCalledWith(
      expect.objectContaining(request),
      9,
      "Priority group (auto)",
    )
  })

  it("preserves an explicit native rename rejection", async () => {
    const before = rawKey({ id: 9, name: "user group (auto)", groups: [9] })
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([
      { id: 9, requirementKey: "9", displayName: "Priority" },
    ])
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([before])
    mockRenameVoApiV2Key.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      mutationRequest.observer?.onResponse()
      throw new ApiError(
        "Rename rejected",
        undefined,
        "/api/keys/9",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    })

    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })

    await expect(
      session.provisioning!.rename!({
        accountId: "account-example",
        siteType: SITE_TYPES.VO_API_V2,
        scopeKey: "account",
        resourceId: "9",
      }),
    ).resolves.toEqual({
      certainty: "not-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Rename rejected",
      },
    })
  })

  it("keeps future second-based expirations usable", async () => {
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([
      { id: 9, requirementKey: "9", displayName: "First" },
    ])
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([
      rawKey({
        id: 1,
        groups: [9],
        expireTime: Math.floor(Date.now() / 1000) + 3600,
      }),
    ])

    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })

    await expect(session.provisioning!.inspect()).resolves.toMatchObject({
      items: [{ coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable }],
    })
  })

  it("classifies disabled, expired, and malformed native key states", async () => {
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([
      { id: 9, requirementKey: "9", displayName: "First" },
    ])
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([
      rawKey({ id: 1, enable: false }),
      rawKey({ id: 2, expireTime: Date.now() - 1 }),
      rawKey({ id: 3, expireTime: Number.NaN }),
      rawKey({ id: 4, enable: undefined }),
    ])

    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })

    await expect(session.provisioning!.inspect()).resolves.toMatchObject({
      items: [
        {
          ref: { resourceId: "1" },
          coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable,
        },
        {
          ref: { resourceId: "2" },
          coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable,
        },
        {
          ref: { resourceId: "3" },
          coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown,
        },
        {
          ref: { resourceId: "4" },
          coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown,
        },
      ],
    })
  })

  it("keeps multiple unknown native groups as one explainable orphan placement", async () => {
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([])
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([
      rawKey({ id: 1, groups: [98, 99] }),
    ])

    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })

    await expect(session.provisioning!.inspect()).resolves.toMatchObject({
      items: [
        {
          placement: {
            kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
            placementKey: '["98","99"]',
            displayName: "98, 99",
          },
        },
      ],
    })
  })

  it("does not provision without validated finite-quota input", async () => {
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "not-applied",
      failure: {
        code: "configuration_required",
      },
    })
    expect(mockCreateVoApiV2Key).not.toHaveBeenCalled()
    expect(mockFetchAllVoApiV2RawKeys).not.toHaveBeenCalled()
  })

  it("reveals the exact resource without loading the inventory", async () => {
    const referencedKey = rawKey({ id: 9, tokenMasked: "masked-nine" })
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([
      rawKey({ id: 8, tokenMasked: "masked-eight" }),
      referencedKey,
    ])
    mockResolveVoApiV2KeySecretById.mockResolvedValueOnce("voapi-full-secret")

    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.VO_API_V2,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(session.runtimeKey!.resolve(ref)).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "voapi-full-secret",
    })
    expect(mockFetchAllVoApiV2RawKeys).not.toHaveBeenCalled()
    expect(mockResolveVoApiV2KeySecretById).toHaveBeenCalledWith(request, 9)
  })

  it("reports missing and failed native secret lookups as unavailable", async () => {
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.VO_API_V2,
      scopeKey: "account",
      resourceId: "9",
    } as const

    mockResolveVoApiV2KeySecretById.mockRejectedValueOnce({ status: 404 })
    await expect(session.runtimeKey!.resolve(ref)).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    })

    mockResolveVoApiV2KeySecretById.mockRejectedValueOnce(
      new Error("reveal unavailable"),
    )
    await expect(session.runtimeKey!.resolve(ref)).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: "reveal unavailable",
      },
    })
  })

  it.each([
    {
      label: "missing ref",
      groups: [{ id: 9, requirementKey: "9", displayName: "Priority" }],
      keys: [],
      failureCode: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound,
    },
    {
      label: "ambiguous group placement",
      groups: [{ id: 9, requirementKey: "9", displayName: "Priority" }],
      keys: [rawKey({ id: 9, name: "user group (auto)", groups: [9, 10] })],
      failureCode: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
    },
    {
      label: "provider-owned custom name",
      groups: [{ id: 9, requirementKey: "9", displayName: "Priority" }],
      keys: [rawKey({ id: 9, name: "Custom key", groups: [9] })],
      failureCode: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
    },
  ])(
    "rejects rename for $label before mutation",
    async ({ groups, keys, failureCode }) => {
      mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce(groups)
      mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce(keys)
      const session = await voApiV2AccountKeyResources.open({
        account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
        request,
      })

      await expect(
        session.provisioning!.rename!({
          accountId: "account-example",
          siteType: SITE_TYPES.VO_API_V2,
          scopeKey: "account",
          resourceId: "9",
        }),
      ).resolves.toEqual({
        certainty: "not-applied",
        failure: { code: failureCode },
      })
      expect(mockRenameVoApiV2Key).not.toHaveBeenCalled()
    },
  )

  it("preserves false and unconfirmed native rename outcomes without replay", async () => {
    const before = rawKey({ id: 9, name: "user group (auto)", groups: [9] })
    const groups = [{ id: 9, requirementKey: "9", displayName: "Priority" }]
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.VO_API_V2,
      scopeKey: "account",
      resourceId: "9",
    } as const
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })

    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce(groups)
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([before])
    mockRenameVoApiV2Key.mockResolvedValueOnce(false)
    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })

    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce(groups)
    mockFetchAllVoApiV2RawKeys
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([before])
    mockRenameVoApiV2Key.mockResolvedValueOnce(true)
    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })

    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce(groups)
    mockFetchAllVoApiV2RawKeys
      .mockResolvedValueOnce([before])
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    mockRenameVoApiV2Key.mockResolvedValueOnce(true)
    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "refresh unavailable",
      },
    })
    expect(mockRenameVoApiV2Key).toHaveBeenCalledTimes(3)
  })

  it("deletes the exact native ref once", async () => {
    mockDeleteVoApiV2Token.mockResolvedValueOnce(true)
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.VO_API_V2,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(collection.delete(ref)).resolves.toBeUndefined()
    expect(mockDeleteVoApiV2Token).toHaveBeenCalledOnce()
    expect(mockDeleteVoApiV2Token).toHaveBeenCalledWith(
      expect.objectContaining(request),
      9,
    )
  })

  it("keeps false and explicit delete rejections definite", async () => {
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.VO_API_V2,
      scopeKey: "account",
      resourceId: "9",
    } as const

    mockDeleteVoApiV2Token.mockResolvedValueOnce(false)
    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })

    mockDeleteVoApiV2Token.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      mutationRequest.observer?.onResponse()
      throw new ApiError(
        "Delete rejected",
        undefined,
        "/api/keys/9",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    })
    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Delete rejected",
      },
    })
    expect(mockDeleteVoApiV2Token).toHaveBeenCalledTimes(2)
  })

  it("opens native editors and rejects missing collection resources", async () => {
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.VO_API_V2,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(session.openCreateEditor("account")).resolves.toMatchObject({
      initialValues: { boundlessAmount: false },
    })
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([rawKey({ id: 9 })])
    await expect(collection.openEditEditor(ref)).resolves.toMatchObject({
      initialValues: { amount: 10 },
    })
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([])
    await expect(collection.get(ref)).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
  })

  it("propagates cancellation and fails closed for unsafe IDs and mixed group placement", async () => {
    const controller = new AbortController()
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const collection = await session.openCollection("account")

    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([])
    await collection.list(undefined, { signal: controller.signal })
    expect(mockFetchAllVoApiV2RawKeys).toHaveBeenLastCalledWith({
      ...request,
      abortSignal: controller.signal,
    })

    await expect(
      collection.get({
        accountId: "account-example",
        siteType: SITE_TYPES.VO_API_V2,
        scopeKey: "account",
        resourceId: "9007199254740992",
      }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })

    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([
      { id: 9, requirementKey: "9", displayName: "Known" },
    ])
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([
      rawKey({ id: 9, groups: [9, 99] }),
      rawKey({ id: 10, groups: ["9007199254740992"] }),
    ])
    await expect(session.provisioning!.inspect()).resolves.toMatchObject({
      items: [
        {
          placement: { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown },
        },
        {
          placement: { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown },
        },
      ],
    })

    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([rawKey({ id: 0 })])
    await expect(collection.list()).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
  })

  it.each([
    { label: "mismatched confirmation", refreshFails: false },
    { label: "failed confirmation", refreshFails: true },
  ])(
    "preserves an ambiguous rename through a $label",
    async ({ refreshFails }) => {
      const before = rawKey({ id: 9, name: "user group (auto)", groups: [9] })
      mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValueOnce([
        { id: 9, requirementKey: "9", displayName: "Priority" },
      ])
      mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([before])
      if (refreshFails) {
        mockFetchAllVoApiV2RawKeys.mockRejectedValueOnce(
          new Error("refresh unavailable"),
        )
      } else {
        mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([before])
      }
      mockRenameVoApiV2Key.mockImplementationOnce(async (mutationRequest) => {
        mutationRequest.observer?.onDispatch()
        throw new Error("rename timed out")
      })
      const session = await voApiV2AccountKeyResources.open({
        account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
        request,
      })

      await expect(
        session.provisioning!.rename!({
          accountId: "account-example",
          siteType: SITE_TYPES.VO_API_V2,
          scopeKey: "account",
          resourceId: "9",
        }),
      ).resolves.toEqual({
        certainty: "possibly-applied",
        failure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
          message: "rename timed out",
        },
      })
      expect(mockRenameVoApiV2Key).toHaveBeenCalledOnce()
      expect(mockFetchAllVoApiV2RawKeys).toHaveBeenCalledTimes(2)
    },
  )

  it("creates finite native quota with multiple exact groups and returns runtime names", async () => {
    mockFetchAllVoApiV2RawKeys.mockResolvedValueOnce([]).mockResolvedValueOnce([
      rawKey({
        id: 23,
        name: "Native key",
        groups: [9, 12],
        amount: "7.25",
        used: "0",
      }),
    ])
    mockFetchVoApiV2KeyGroupDescriptors.mockResolvedValue([
      { id: 9, displayName: "Default" },
      { id: 12, displayName: "Premium" },
    ])
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const editor = await session.openCreateEditor("account")

    await expect(
      editor.submit({
        ...editor.initialValues,
        name: "Native key",
        groups: ["9", "12"],
        amount: 7.25,
      }),
    ).resolves.toMatchObject({
      facts: {
        ref: { resourceId: "23" },
        runtimeKey: { modelAccess: { groups: ["Default", "Premium"] } },
      },
    })
    expect(mockCreateVoApiV2Key).toHaveBeenCalledWith(expect.anything(), {
      name: "Native key",
      groups: [9, 12],
      amount: "7.25",
      used: "0",
      boundlessAmount: false,
      expireTime: -1,
      enable: true,
      note: "",
    })
  })

  it("preserves all groups, unchanged monetary precision and fresh usage while renaming", async () => {
    const before = rawKey({
      id: 9,
      groups: [9, 12],
      amount: "10.000000",
      used: "1",
      note: "Original",
      expireTime: 1893456031000,
    })
    const latest = { ...before, used: "3", note: "Remote note" }
    mockFetchAllVoApiV2RawKeys
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([latest])
      .mockResolvedValueOnce([{ ...latest, name: "Renamed" }])
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const editor = await (
      await session.openCollection("account")
    ).openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.VO_API_V2,
      scopeKey: "account",
      resourceId: "9",
    })

    await editor.submit({ ...editor.initialValues, name: "Renamed" })
    expect(mockUpdateVoApiV2Key).toHaveBeenCalledWith(
      expect.anything(),
      9,
      expect.objectContaining({
        name: "Renamed",
        groups: [9, 12],
        amount: "10.000000",
        used: "3",
        note: "Remote note",
        expireTime: 1893456031000,
      }),
    )
  })

  it("blocks conflicting edits and never retries an uncertain creation", async () => {
    const before = rawKey({ id: 9 })
    mockFetchAllVoApiV2RawKeys
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([{ ...before, name: "Remote rename" }])
    const session = await voApiV2AccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.VO_API_V2 },
      request,
    })
    const editor = await (
      await session.openCollection("account")
    ).openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.VO_API_V2,
      scopeKey: "account",
      resourceId: "9",
    })
    await expect(
      editor.submit({ ...editor.initialValues, name: "Local rename" }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ResourceChanged },
    })
    expect(mockUpdateVoApiV2Key).not.toHaveBeenCalled()

    mockFetchAllVoApiV2RawKeys.mockResolvedValue([before])
    const creator = await session.openCreateEditor("account")
    const values = { ...creator.initialValues, groups: ["9"], amount: 10 }
    await expect(creator.submit(values)).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    await expect(creator.submit(values)).rejects.toBeDefined()
    expect(mockCreateVoApiV2Key).toHaveBeenCalledTimes(1)
  })

  it("registers native key management", () => {
    expect(voApiV2Capabilities.account?.keyResourceManagement).toBe(
      voApiV2AccountKeyResources,
    )
  })
})
