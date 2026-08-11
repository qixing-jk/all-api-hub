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
  mockCreateVoApiV2Token,
  mockDeleteVoApiV2Token,
  mockFetchAllVoApiV2RawKeys,
  mockFetchVoApiV2KeyGroupDescriptors,
  mockRenameVoApiV2Key,
  mockResolveVoApiV2KeySecretById,
} = vi.hoisted(() => ({
  mockCreateVoApiV2Token: vi.fn(),
  mockDeleteVoApiV2Token: vi.fn(),
  mockFetchAllVoApiV2RawKeys: vi.fn(),
  mockFetchVoApiV2KeyGroupDescriptors: vi.fn(),
  mockRenameVoApiV2Key: vi.fn(),
  mockResolveVoApiV2KeySecretById: vi.fn(),
}))

vi.mock("~/services/apiService/voapiV2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/voapiV2")>()),
  createVoApiV2Token: mockCreateVoApiV2Token,
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
    mockCreateVoApiV2Token.mockReset()
    mockDeleteVoApiV2Token.mockReset()
    mockFetchAllVoApiV2RawKeys.mockReset()
    mockFetchVoApiV2KeyGroupDescriptors.mockReset()
    mockRenameVoApiV2Key.mockReset()
    mockResolveVoApiV2KeySecretById.mockReset()
  })

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
    expect(mockCreateVoApiV2Token).not.toHaveBeenCalled()
    expect(mockFetchAllVoApiV2RawKeys).not.toHaveBeenCalled()
  })

  it("verifies the exact resource ref before native secret reveal", async () => {
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
    expect(mockFetchAllVoApiV2RawKeys).toHaveBeenCalledWith(request)
    expect(mockResolveVoApiV2KeySecretById).toHaveBeenCalledWith(request, 9)
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

  it("registers native key resources without replacing legacy key management", () => {
    expect(voApiV2Capabilities.account?.keyResources).toBe(
      voApiV2AccountKeyResources,
    )
    expect(voApiV2Capabilities.account?.keyResourceManagement).toBeUndefined()
    expect(voApiV2Capabilities.account?.keyManagement).toBeDefined()
  })
})
