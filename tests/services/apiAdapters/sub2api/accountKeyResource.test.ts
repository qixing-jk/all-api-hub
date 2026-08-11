import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { sub2ApiCapabilities } from "~/services/apiAdapters/sub2api"
import { sub2ApiAccountKeyResources } from "~/services/apiAdapters/sub2api/accountKeyResource"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, type ApiToken } from "~/types"

const {
  mockCreateSub2ApiTokenForGroupId,
  mockDeleteApiToken,
  mockFetchAccountTokens,
  mockFetchSub2ApiGroupDescriptors,
  mockFetchTokenById,
  mockResolveApiTokenKey,
  mockUpdateApiToken,
} = vi.hoisted(() => ({
  mockCreateSub2ApiTokenForGroupId: vi.fn(),
  mockDeleteApiToken: vi.fn(),
  mockFetchAccountTokens: vi.fn(),
  mockFetchSub2ApiGroupDescriptors: vi.fn(),
  mockFetchTokenById: vi.fn(),
  mockResolveApiTokenKey: vi.fn(),
  mockUpdateApiToken: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/sub2api")>()),
  createSub2ApiTokenForGroupId: mockCreateSub2ApiTokenForGroupId,
  deleteApiToken: mockDeleteApiToken,
  fetchAccountTokens: mockFetchAccountTokens,
  fetchSub2ApiGroupDescriptors: mockFetchSub2ApiGroupDescriptors,
  fetchTokenById: mockFetchTokenById,
  resolveApiTokenKey: mockResolveApiTokenKey,
  updateApiToken: mockUpdateApiToken,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-example",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "access-token",
    userId: "user-example",
  },
}

const token = (overrides: Partial<ApiToken>): ApiToken => ({
  id: 1,
  user_id: 1,
  key: "sk-masked-example",
  status: 1,
  name: "Example key",
  created_time: 1,
  accessed_time: 1,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  used_quota: 0,
  group: "Example group",
  sub2api_group_id: 9,
  ...overrides,
})

describe("Sub2API account key resources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSub2ApiTokenForGroupId.mockReset()
    mockDeleteApiToken.mockReset()
    mockFetchAccountTokens.mockReset()
    mockFetchSub2ApiGroupDescriptors.mockReset()
    mockFetchTokenById.mockReset()
    mockResolveApiTokenKey.mockReset()
    mockUpdateApiToken.mockReset()
  })

  it("maps structured inventory authorization failures at the session boundary", async () => {
    mockFetchSub2ApiGroupDescriptors.mockRejectedValueOnce(
      new ApiError(
        "Admin access denied",
        403,
        "/api/v1/groups/available",
        API_ERROR_CODES.HTTP_403,
        "ADMIN_REQUIRED",
      ),
    )
    mockFetchAccountTokens.mockResolvedValueOnce([])

    const session = await sub2ApiAccountKeyResources.open({
      account: {
        id: "account-example",
        name: "Example account",
        siteType: SITE_TYPES.SUB2API,
      },
      request,
    })

    await expect(session.provisioning!.inspect()).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied,
        message: "Admin access denied",
        upstreamCode: "ADMIN_REQUIRED",
      },
    })
  })

  it("lists the complete account inventory with canonical numeric resource refs", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 7, name: "First" }),
      token({ id: 11, name: "Second" }),
    ])

    const session = await sub2ApiAccountKeyResources.open({
      account: {
        id: "account-example",
        name: "Example account",
        siteType: SITE_TYPES.SUB2API,
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
        siteType: SITE_TYPES.SUB2API,
        scopeKey: "account",
        resourceId: "7",
      },
      {
        accountId: "account-example",
        siteType: SITE_TYPES.SUB2API,
        scopeKey: "account",
        resourceId: "11",
      },
    ])
    expect(page.total).toBe(2)
    expect(page.items.map(({ actions }) => actions)).toEqual([
      { canUpdate: false, canDelete: true },
      { canUpdate: false, canDelete: true },
    ])
    expect(mockFetchAccountTokens).toHaveBeenCalledWith(request)
  })

  it("keeps duplicate group names distinct by native group id and fails closed for incomplete placement", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
      { id: 10, displayName: "Shared", description: "Second", ratio: 2 },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 1, sub2api_group_id: 9, group: "Shared" }),
      token({ id: 2, sub2api_group_id: 10, group: "Shared" }),
      token({ id: 3, sub2api_group_id: 9, group: "" }),
      token({ id: 4, sub2api_group_id: undefined, group: "" }),
      token({ id: 5, sub2api_group_id: 99, group: "Retired" }),
      token({ id: 6, sub2api_group_id: undefined, group: "Missing id" }),
    ])

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    expect(snapshot.requirements).toEqual([
      {
        requirementKey: "9",
        displayName: "Shared",
        provisioning: { kind: "automatic" },
      },
      {
        requirementKey: "10",
        displayName: "Shared",
        provisioning: { kind: "automatic" },
      },
    ])
    expect(snapshot.items).toEqual([
      {
        ref: expect.objectContaining({ resourceId: "1" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: ["9"],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
      {
        ref: expect.objectContaining({ resourceId: "2" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: ["10"],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
      {
        ref: expect.objectContaining({ resourceId: "3" }),
        placement: { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
      {
        ref: expect.objectContaining({ resourceId: "4" }),
        placement: { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unmanaged },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
      {
        ref: expect.objectContaining({ resourceId: "5" }),
        displayName: "Example key",
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
          placementKey: "99",
          displayName: "Retired",
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
      {
        ref: expect.objectContaining({ resourceId: "6" }),
        placement: { kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
    ])
  })

  it("suggests provider-owned auto-template renames only for known requirement placements", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({
        id: 1,
        name: "user group (auto)",
        sub2api_group_id: 9,
        group: "Premium",
      }),
      token({
        id: 2,
        name: "My custom key",
        sub2api_group_id: 9,
        group: "Premium",
      }),
      token({
        id: 3,
        name: "user group (auto)",
        sub2api_group_id: 99,
        group: "Premium",
      }),
    ])

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    expect(snapshot.items[0].renameSuggestion).toEqual({
      targetDisplayName: "Premium group (auto)",
    })
    expect(snapshot.items[1].renameSuggestion).toBeUndefined()
    expect(snapshot.items[2].renameSuggestion).toBeUndefined()
  })

  it("renames the exact provider-owned template while preserving native token configuration", async () => {
    const before = token({
      id: 9,
      name: "user group (auto)",
      group: "Premium",
      sub2api_group_id: 42,
      remain_quota: 123,
      expired_time: 4_000_000_000,
      unlimited_quota: false,
      model_limits_enabled: true,
      model_limits: "model-a,model-b",
      allow_ips: "192.0.2.1",
    })
    mockFetchSub2ApiGroupDescriptors.mockResolvedValue([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([before])
    mockFetchTokenById
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce({ ...before, name: "Premium group (auto)" })
    mockUpdateApiToken.mockResolvedValueOnce(true)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const ref = (await session.provisioning!.inspect()).items[0].ref

    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "applied",
      value: undefined,
    })
    expect(mockFetchTokenById).toHaveBeenCalledTimes(2)
    expect(mockFetchTokenById).toHaveBeenNthCalledWith(1, request, 9)
    expect(mockFetchTokenById).toHaveBeenNthCalledWith(2, request, 9)
    expect(mockUpdateApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      9,
      {
        name: "Premium group (auto)",
        remain_quota: 123,
        expired_time: 4_000_000_000,
        unlimited_quota: false,
        model_limits_enabled: true,
        model_limits: "model-a,model-b",
        allow_ips: "192.0.2.1",
        group: "Premium",
      },
    )
  })

  it("reports a definite rename rejection without replaying the mutation", async () => {
    const current = token({
      id: 9,
      name: "user group (auto)",
      group: "Premium",
      sub2api_group_id: 42,
    })
    mockFetchTokenById.mockResolvedValueOnce(current)
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockUpdateApiToken.mockResolvedValueOnce(false)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })
    expect(mockUpdateApiToken).toHaveBeenCalledOnce()
    expect(mockFetchTokenById).toHaveBeenCalledOnce()
  })

  it("does not treat a matching group display name as requirement identity", async () => {
    mockFetchTokenById.mockResolvedValueOnce(
      token({
        id: 9,
        name: "user group (auto)",
        group: "Premium",
        sub2api_group_id: 99,
      }),
    )
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    expect(mockUpdateApiToken).not.toHaveBeenCalled()
  })

  it("keeps a thrown rename uncertain without replay or blind confirmation", async () => {
    const current = token({
      id: 9,
      name: "user group (auto)",
      group: "Premium",
      sub2api_group_id: 42,
    })
    mockFetchTokenById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockUpdateApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("update timed out")
    })

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "update timed out",
      },
    })
    expect(mockUpdateApiToken).toHaveBeenCalledOnce()
    expect(mockFetchTokenById).toHaveBeenCalledTimes(2)
  })

  it("keeps an unconfirmed rename uncertain after one read-only check", async () => {
    const current = token({
      id: 9,
      name: "user group (auto)",
      group: "Premium",
      sub2api_group_id: 42,
    })
    mockFetchTokenById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockUpdateApiToken.mockResolvedValueOnce(true)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(mockUpdateApiToken).toHaveBeenCalledOnce()
    expect(mockFetchTokenById).toHaveBeenCalledTimes(2)
  })

  it("provisions an exact ref from a native create DTO correlated to the requested group id", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([token({ id: 1 })])
    mockCreateSub2ApiTokenForGroupId.mockResolvedValueOnce(
      token({ id: 12, sub2api_group_id: 9, group: "Shared" }),
    )

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "applied",
      value: {
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.SUB2API,
          scopeKey: "account",
          resourceId: "12",
        },
      },
    })
    expect(mockCreateSub2ApiTokenForGroupId).toHaveBeenCalledWith(
      expect.objectContaining(request),
      expect.objectContaining({ group: "" }),
      9,
    )
    expect(mockFetchAccountTokens).toHaveBeenCalledOnce()
  })

  it("preserves an explicit native create rejection without marking it uncertain", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchAccountTokens.mockResolvedValueOnce([token({ id: 1 })])
    mockCreateSub2ApiTokenForGroupId.mockImplementationOnce(
      async (mutationRequest) => {
        mutationRequest.observer?.onDispatch()
        mutationRequest.observer?.onResponse()
        throw new ApiError(
          "Key limit reached",
          undefined,
          "/api/v1/keys",
          API_ERROR_CODES.BUSINESS_ERROR,
        )
      },
    )

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "not-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Key limit reached",
      },
    })
    expect(mockCreateSub2ApiTokenForGroupId).toHaveBeenCalledOnce()
    expect(mockFetchAccountTokens).toHaveBeenCalledOnce()
  })

  it("provisions an exact ref from one unique native group id inventory diff", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockResolvedValueOnce([
        token({ id: 1 }),
        token({ id: 12, sub2api_group_id: 9, group: "Shared" }),
      ])
    mockCreateSub2ApiTokenForGroupId.mockResolvedValueOnce(true)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "applied",
      value: {
        ref: expect.objectContaining({ resourceId: "12" }),
      },
    })
    expect(mockCreateSub2ApiTokenForGroupId).toHaveBeenCalledOnce()
    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(2)
  })

  it("keeps an ambiguous native inventory diff uncertain without replaying create", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockResolvedValueOnce([
        token({ id: 1 }),
        token({ id: 12, sub2api_group_id: 9, group: "Shared" }),
        token({ id: 13, sub2api_group_id: 9, group: "Shared" }),
      ])
    mockCreateSub2ApiTokenForGroupId.mockResolvedValueOnce(true)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(mockCreateSub2ApiTokenForGroupId).toHaveBeenCalledOnce()
  })

  it("keeps a malformed create DTO uncertain when inventory cannot prove one ref", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockRejectedValueOnce(new Error("inventory unavailable"))
    mockCreateSub2ApiTokenForGroupId.mockResolvedValueOnce(
      token({ id: Number.NaN, sub2api_group_id: 9 }),
    )

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "inventory unavailable",
      },
    })
    expect(mockCreateSub2ApiTokenForGroupId).toHaveBeenCalledOnce()
  })

  it("preserves a false create result as a definite rejection", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockRejectedValueOnce(new Error("inventory unavailable"))
    mockCreateSub2ApiTokenForGroupId.mockResolvedValueOnce(false)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "not-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
      },
    })
    expect(mockCreateSub2ApiTokenForGroupId).toHaveBeenCalledOnce()
    expect(mockFetchAccountTokens).toHaveBeenCalledOnce()
  })

  it("rejects a non-canonical group requirement before inventory or mutation", async () => {
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("09")).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
    expect(mockFetchSub2ApiGroupDescriptors).not.toHaveBeenCalled()
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(mockCreateSub2ApiTokenForGroupId).not.toHaveBeenCalled()
  })

  it("resolves only the exact referenced key through Sub2API native detail and secret transport", async () => {
    const detail = token({ id: 9, key: "sk-masked-example" })
    mockFetchTokenById.mockResolvedValueOnce(detail)
    mockResolveApiTokenKey.mockResolvedValueOnce("sub2api-full-secret")

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(session.runtimeKey!.resolve(ref)).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "sub2api-full-secret",
    })
    expect(mockFetchTokenById).toHaveBeenCalledWith(request, 9)
    expect(mockResolveApiTokenKey).toHaveBeenCalledWith(request, detail)
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
  })

  it("rejects a runtime ref from another scope before native detail access", async () => {
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(
      session.runtimeKey!.resolve({
        accountId: "account-example",
        siteType: SITE_TYPES.SUB2API,
        scopeKey: "other-account-scope",
        resourceId: "9",
      }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    expect(mockFetchTokenById).not.toHaveBeenCalled()
    expect(mockResolveApiTokenKey).not.toHaveBeenCalled()
  })

  it("deletes the exact referenced key once without replay", async () => {
    mockDeleteApiToken.mockResolvedValueOnce(true)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(collection.delete(ref)).resolves.toBeUndefined()
    expect(mockDeleteApiToken).toHaveBeenCalledOnce()
    expect(mockDeleteApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      9,
    )
  })

  it("surfaces a definite delete rejection without replay", async () => {
    mockDeleteApiToken.mockResolvedValueOnce(false)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })
    expect(mockDeleteApiToken).toHaveBeenCalledOnce()
  })

  it("surfaces a thrown delete as uncertain without replay", async () => {
    mockDeleteApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("delete timed out")
    })

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(mockDeleteApiToken).toHaveBeenCalledOnce()
  })

  it("registers the orchestration resource seam without replacing ordinary Key Management routing", () => {
    expect(sub2ApiCapabilities.account?.keyResources).toBe(
      sub2ApiAccountKeyResources,
    )
    expect(sub2ApiCapabilities.account?.keyResourceManagement).toBeUndefined()
    expect(sub2ApiCapabilities.account?.keyManagement).toBeDefined()
  })
})
