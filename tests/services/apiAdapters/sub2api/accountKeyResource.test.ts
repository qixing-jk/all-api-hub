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
import type { Sub2ApiNativeKey } from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const {
  mockCreateSub2ApiKey,
  mockDeleteApiToken,
  mockFetchSub2ApiKeys,
  mockFetchSub2ApiGroupDescriptors,
  mockFetchSub2ApiKey,
  mockUpdateSub2ApiKey,
} = vi.hoisted(() => ({
  mockCreateSub2ApiKey: vi.fn(),
  mockDeleteApiToken: vi.fn(),
  mockFetchSub2ApiKeys: vi.fn(),
  mockFetchSub2ApiGroupDescriptors: vi.fn(),
  mockFetchSub2ApiKey: vi.fn(),
  mockUpdateSub2ApiKey: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/sub2api")>()),
  createSub2ApiKey: mockCreateSub2ApiKey,
  deleteApiToken: mockDeleteApiToken,
  fetchSub2ApiKeys: mockFetchSub2ApiKeys,
  fetchSub2ApiGroupDescriptors: mockFetchSub2ApiGroupDescriptors,
  fetchSub2ApiKey: mockFetchSub2ApiKey,
  updateSub2ApiKey: mockUpdateSub2ApiKey,
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

const token = (overrides: Partial<Sub2ApiNativeKey>): Sub2ApiNativeKey => ({
  id: 1,
  user_id: 1,
  key: "sk-masked-example",
  status: 1,
  name: "Example key",
  created_at: 1,
  updated_at: 1,
  expires_at: -1,
  quota: 0,
  ip_whitelist: [],
  quota_used: 0,
  group_name: "Example group",
  group_id: 9,
  ...overrides,
})

describe("Sub2API account key resources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSub2ApiKey.mockReset()
    mockDeleteApiToken.mockReset()
    mockFetchSub2ApiKeys.mockReset()
    mockFetchSub2ApiGroupDescriptors.mockReset()
    mockFetchSub2ApiKey.mockReset()
    mockUpdateSub2ApiKey.mockReset()
  })

  it.each(["reconciled", "missing", "read-failed", "rejected"])(
    "reconciles native creation without replay: %s",
    async (outcome) => {
      mockFetchSub2ApiKeys.mockResolvedValueOnce([token({ id: 1 })])
      if (outcome === "read-failed")
        mockFetchSub2ApiKeys.mockRejectedValueOnce(
          new Error("inventory offline"),
        )
      else
        mockFetchSub2ApiKeys.mockResolvedValueOnce(
          outcome === "reconciled"
            ? [token({ id: 2, name: "Recovered", group_id: undefined })]
            : [],
        )
      mockCreateSub2ApiKey.mockImplementationOnce(async (request) => {
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
      const session = await sub2ApiAccountKeyResources.open({
        account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
        request,
      })
      const editor = await session.openCreateEditor("account")
      const result = editor.submit({
        ...editor.initialValues,
        name: "Recovered",
      })
      if (outcome === "reconciled")
        await expect(result).resolves.toMatchObject({
          facts: { ref: { resourceId: "2" } },
        })
      else await expect(result).rejects.toBeDefined()
      expect(mockCreateSub2ApiKey).toHaveBeenCalledTimes(1)
      expect(mockFetchSub2ApiKeys).toHaveBeenCalledTimes(
        outcome === "rejected" ? 1 : 2,
      )
    },
  )

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
    mockFetchSub2ApiKeys.mockResolvedValueOnce([])

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
    mockFetchSub2ApiKeys.mockResolvedValueOnce([
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
      { canUpdate: true, canDelete: true },
      { canUpdate: true, canDelete: true },
    ])
    expect(mockFetchSub2ApiKeys).toHaveBeenCalledWith(request)
  })

  it("keeps duplicate group names distinct by native group id and fails closed for incomplete placement", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
      { id: 10, displayName: "Shared", description: "Second", ratio: 2 },
    ])
    mockFetchSub2ApiKeys.mockResolvedValueOnce([
      token({ id: 1, group_id: 9, group_name: "Shared" }),
      token({ id: 2, group_id: 10, group_name: "Shared" }),
      token({ id: 3, group_id: 9, group_name: "" }),
      token({ id: 4, group_id: undefined, group_name: "" }),
      token({ id: 5, group_id: 99, group_name: "Retired" }),
      token({ id: 6, group_id: undefined, group_name: "Missing id" }),
      token({ id: 7, group_id: 9, group_name: "Shared", status: 9 }),
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
      {
        ref: expect.objectContaining({ resourceId: "7" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: ["9"],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown,
      },
    ])
  })

  it("suggests provider-owned auto-template renames only for known requirement placements", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockFetchSub2ApiKeys.mockResolvedValueOnce([
      token({
        id: 1,
        name: "user group (auto)",
        group_id: 9,
        group_name: "Premium",
      }),
      token({
        id: 2,
        name: "My custom key",
        group_id: 9,
        group_name: "Premium",
      }),
      token({
        id: 3,
        name: "user group (auto)",
        group_id: 99,
        group_name: "Premium",
      }),
      token({
        id: 4,
        name: undefined,
        group_id: 9,
        group_name: "Premium",
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
    expect(snapshot.items[3].renameSuggestion).toBeUndefined()
  })

  it("renames the exact provider-owned template while preserving native token configuration", async () => {
    const before = token({
      id: 9,
      name: "user group (auto)",
      group_name: "Premium",
      group_id: 42,
      quota: 123,
      expires_at: 4_000_000_000,
      ip_whitelist: ["192.0.2.1"],
    })
    mockFetchSub2ApiGroupDescriptors.mockResolvedValue([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockFetchSub2ApiKeys.mockResolvedValueOnce([before])
    mockFetchSub2ApiKey
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce({ ...before, name: "Premium group (auto)" })
    mockUpdateSub2ApiKey.mockResolvedValueOnce(true)

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const ref = (await session.provisioning!.inspect()).items[0].ref

    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "applied",
      value: undefined,
    })
    expect(mockFetchSub2ApiKey).toHaveBeenCalledTimes(2)
    expect(mockFetchSub2ApiKey).toHaveBeenNthCalledWith(1, request, 9)
    expect(mockFetchSub2ApiKey).toHaveBeenNthCalledWith(2, request, 9)
    expect(mockUpdateSub2ApiKey).toHaveBeenCalledWith(
      expect.objectContaining(request),
      9,
      {
        name: "Premium group (auto)",
      },
    )
  })

  it("reports a definite rename rejection without replaying the mutation", async () => {
    const current = token({
      id: 9,
      name: "user group (auto)",
      group_name: "Premium",
      group_id: 42,
    })
    mockFetchSub2ApiKey.mockResolvedValueOnce(current)
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockUpdateSub2ApiKey.mockRejectedValueOnce(
      new ApiError(
        "Rejected",
        undefined,
        "/api/v1/keys/9",
        API_ERROR_CODES.BUSINESS_ERROR,
      ),
    )

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
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Rejected",
      },
    })
    expect(mockUpdateSub2ApiKey).toHaveBeenCalledOnce()
    expect(mockFetchSub2ApiKey).toHaveBeenCalledOnce()
  })

  it("does not treat a matching group display name as requirement identity", async () => {
    mockFetchSub2ApiKey.mockResolvedValueOnce(
      token({
        id: 9,
        name: "user group (auto)",
        group_name: "Premium",
        group_id: 99,
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
    expect(mockUpdateSub2ApiKey).not.toHaveBeenCalled()
  })

  it("keeps a thrown rename uncertain without replay or blind confirmation", async () => {
    const current = token({
      id: 9,
      name: "user group (auto)",
      group_name: "Premium",
      group_id: 42,
    })
    mockFetchSub2ApiKey
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockUpdateSub2ApiKey.mockImplementationOnce(async (mutationRequest) => {
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
    expect(mockUpdateSub2ApiKey).toHaveBeenCalledOnce()
    expect(mockFetchSub2ApiKey).toHaveBeenCalledTimes(2)
  })

  it("keeps an unconfirmed rename uncertain after one read-only check", async () => {
    const current = token({
      id: 9,
      name: "user group (auto)",
      group_name: "Premium",
      group_id: 42,
    })
    mockFetchSub2ApiKey
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 42, displayName: "Premium", description: "Current", ratio: 1 },
    ])
    mockUpdateSub2ApiKey.mockResolvedValueOnce(true)

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
    expect(mockUpdateSub2ApiKey).toHaveBeenCalledOnce()
    expect(mockFetchSub2ApiKey).toHaveBeenCalledTimes(2)
  })

  it("provisions an exact ref from a native create DTO correlated to the requested group id", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchSub2ApiKeys.mockResolvedValueOnce([token({ id: 1 })])
    mockCreateSub2ApiKey.mockResolvedValueOnce(
      token({ id: 12, group_id: 9, group_name: "Shared" }),
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
    expect(mockCreateSub2ApiKey).toHaveBeenCalledWith(
      expect.objectContaining(request),
      expect.objectContaining({ group_id: 9, quota: 0 }),
    )
    expect(mockFetchSub2ApiKeys).toHaveBeenCalledOnce()
  })

  it("preserves an explicit native create rejection without marking it uncertain", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchSub2ApiKeys.mockResolvedValueOnce([token({ id: 1 })])
    mockCreateSub2ApiKey.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      mutationRequest.observer?.onResponse()
      throw new ApiError(
        "Key limit reached",
        undefined,
        "/api/v1/keys",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    })

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
    expect(mockCreateSub2ApiKey).toHaveBeenCalledOnce()
    expect(mockFetchSub2ApiKeys).toHaveBeenCalledOnce()
  })

  it("provisions an exact ref from one unique native group id inventory diff", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchSub2ApiKeys
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockResolvedValueOnce([
        token({ id: 1 }),
        token({ id: 12, group_id: 9, group_name: "Shared" }),
      ])
    mockCreateSub2ApiKey.mockResolvedValueOnce(true)

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
    expect(mockCreateSub2ApiKey).toHaveBeenCalledOnce()
    expect(mockFetchSub2ApiKeys).toHaveBeenCalledTimes(2)
  })

  it("keeps an ambiguous native inventory diff uncertain without replaying create", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchSub2ApiKeys
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockResolvedValueOnce([
        token({ id: 1 }),
        token({ id: 12, group_id: 9, group_name: "Shared" }),
        token({ id: 13, group_id: 9, group_name: "Shared" }),
      ])
    mockCreateSub2ApiKey.mockResolvedValueOnce(true)

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
    expect(mockCreateSub2ApiKey).toHaveBeenCalledOnce()
  })

  it("keeps a malformed create DTO uncertain when inventory cannot prove one ref", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchSub2ApiKeys
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockRejectedValueOnce(new Error("inventory unavailable"))
    mockCreateSub2ApiKey.mockResolvedValueOnce(
      token({ id: Number.NaN, group_id: 9 }),
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
    expect(mockCreateSub2ApiKey).toHaveBeenCalledOnce()
  })

  it("prefers a dispatched create failure when reconciliation also fails", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchSub2ApiKeys
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockRejectedValueOnce(new Error("inventory unavailable"))
    mockCreateSub2ApiKey.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("create timed out")
    })
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "create timed out",
      },
    })
    expect(mockCreateSub2ApiKey).toHaveBeenCalledOnce()
  })

  it("preserves a rejected native create without retry", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Shared", description: "First", ratio: 1 },
    ])
    mockFetchSub2ApiKeys.mockResolvedValueOnce([token({ id: 1 })])
    mockCreateSub2ApiKey.mockRejectedValueOnce(
      new ApiError(
        "Rejected",
        undefined,
        "/api/v1/keys",
        API_ERROR_CODES.BUSINESS_ERROR,
      ),
    )

    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.provision("9")).resolves.toEqual({
      certainty: "not-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Rejected",
      },
    })
    expect(mockCreateSub2ApiKey).toHaveBeenCalledOnce()
    expect(mockFetchSub2ApiKeys).toHaveBeenCalledOnce()
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
    expect(mockFetchSub2ApiKeys).not.toHaveBeenCalled()
    expect(mockCreateSub2ApiKey).not.toHaveBeenCalled()
  })

  it("resolves only the exact referenced key through Sub2API native detail and secret transport", async () => {
    const detail = token({ id: 9, key: "sub2api-full-secret" })
    mockFetchSub2ApiKey.mockResolvedValueOnce(detail)

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
    expect(mockFetchSub2ApiKey).toHaveBeenCalledWith(request, 9)
    expect(mockFetchSub2ApiKeys).not.toHaveBeenCalled()
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
    expect(mockFetchSub2ApiKey).not.toHaveBeenCalled()
    expect(mockFetchSub2ApiKeys).not.toHaveBeenCalled()
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

  it("classifies disabled, expired, and malformed token states", async () => {
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Example group" },
    ])
    mockFetchSub2ApiKeys.mockResolvedValueOnce([
      token({ id: 1, status: 2 }),
      token({ id: 2, expires_at: Math.floor(Date.now() / 1000) - 1 }),
      token({ id: 3, expires_at: -2 }),
      token({ id: 4, status: 99 }),
    ])
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(session.provisioning!.inspect()).resolves.toMatchObject({
      items: [
        { coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable },
        { coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable },
        { coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown },
        { coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown },
      ],
    })
  })

  it("rejects malformed or duplicate native group requirements", async () => {
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "First" },
      { id: 9, displayName: "Duplicate" },
    ])
    await expect(session.provisioning!.inspect()).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: "invalid_group_requirement",
      },
    })

    await expect(
      session.provisioning!.provision("9007199254740992"),
    ).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: "invalid_group_requirement",
      },
    })

    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 10, displayName: "Other" },
    ])
    await expect(session.provisioning!.provision("9")).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: "invalid_group_requirement",
      },
    })
    expect(mockCreateSub2ApiKey).not.toHaveBeenCalled()
  })

  it("rejects missing or provider-owned rename targets before mutation", async () => {
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

    mockFetchSub2ApiKey.mockResolvedValueOnce(token({ id: 8 }))
    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    })

    mockFetchSub2ApiKey.mockResolvedValueOnce(
      token({ id: 9, name: "Custom key", group_name: "Example group" }),
    )
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Example group" },
    ])
    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    expect(mockUpdateSub2ApiKey).not.toHaveBeenCalled()
  })

  it("preserves explicit and unverifiable rename outcomes without replay", async () => {
    const before = token({
      id: 9,
      name: "user group (auto)",
      group_name: "Example group",
    })
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    } as const
    const groups = [{ id: 9, displayName: "Example group" }]
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    mockFetchSub2ApiKey.mockResolvedValueOnce(before)
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce(groups)
    mockUpdateSub2ApiKey.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      mutationRequest.observer?.onResponse()
      throw new ApiError(
        "Rename rejected",
        undefined,
        "/api/token",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    })
    await expect(session.provisioning!.rename!(ref)).resolves.toMatchObject({
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })

    mockFetchSub2ApiKey
      .mockResolvedValueOnce(before)
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce(groups)
    mockUpdateSub2ApiKey.mockResolvedValueOnce(true)
    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "refresh unavailable",
      },
    })
    expect(mockUpdateSub2ApiKey).toHaveBeenCalledTimes(2)
  })

  it("prefers a dispatched rename failure when confirmation also fails", async () => {
    const before = token({
      id: 9,
      name: "user group (auto)",
      group_name: "Example group",
      group_id: 9,
    })
    mockFetchSub2ApiKey
      .mockResolvedValueOnce(before)
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    mockFetchSub2ApiGroupDescriptors.mockResolvedValueOnce([
      { id: 9, displayName: "Example group" },
    ])
    mockUpdateSub2ApiKey.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("rename timed out")
    })
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })

    await expect(
      session.provisioning!.rename!({
        accountId: "account-example",
        siteType: SITE_TYPES.SUB2API,
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
    expect(mockUpdateSub2ApiKey).toHaveBeenCalledOnce()
  })

  it("reports mismatched and failed runtime detail lookups as unavailable", async () => {
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

    mockFetchSub2ApiKey.mockResolvedValueOnce(token({ id: 8 }))
    await expect(session.runtimeKey!.resolve(ref)).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })

    mockFetchSub2ApiKey.mockRejectedValueOnce(new Error("detail unavailable"))
    await expect(session.runtimeKey!.resolve(ref)).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: "detail unavailable",
      },
    })
    expect(mockFetchSub2ApiKeys).not.toHaveBeenCalled()
  })

  it("propagates list cancellation and rejects invalid or missing locators", async () => {
    const controller = new AbortController()
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const collection = await session.openCollection("account")

    mockFetchSub2ApiKeys.mockResolvedValueOnce([])
    await collection.list(undefined, { signal: controller.signal })
    expect(mockFetchSub2ApiKeys).toHaveBeenLastCalledWith({
      ...request,
      abortSignal: controller.signal,
    })

    await expect(
      collection.get({
        accountId: "account-example",
        siteType: SITE_TYPES.SUB2API,
        scopeKey: "account",
        resourceId: "0",
      }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })

    mockFetchSub2ApiKey.mockRejectedValueOnce(new Error("key_not_found"))
    await expect(
      collection.get({
        accountId: "account-example",
        siteType: SITE_TYPES.SUB2API,
        scopeKey: "account",
        resourceId: "9",
      }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })

    mockFetchSub2ApiKeys.mockResolvedValueOnce([token({ id: 0 })])
    await expect(collection.list()).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
  })

  it("opens native create and edit editors", async () => {
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

    await expect(session.openCreateEditor("account")).resolves.toMatchObject({
      initialValues: { quota: 0, unlimited: true },
    })
    mockFetchSub2ApiKey.mockResolvedValueOnce(token({ id: 9 }))
    await expect(collection.openEditEditor(ref)).resolves.toMatchObject({
      initialValues: { group_id: "9" },
    })
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

  it("creates with an exact group, total USD quota and whole-day expiry", async () => {
    mockFetchSub2ApiKeys.mockResolvedValueOnce([])
    mockCreateSub2ApiKey.mockResolvedValueOnce(
      token({ id: 23, name: "Native key", group_id: 12, quota: 7.25 }),
    )
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const editor = await session.openCreateEditor("account")

    await expect(
      editor.submit({
        ...editor.initialValues,
        name: "Native key",
        group_id: "12",
        unlimited: false,
        quota: 7.25,
        expires_in_days: 5,
        ip_whitelist: "192.0.2.1\n198.51.100.0/24",
      }),
    ).resolves.toMatchObject({ facts: { ref: { resourceId: "23" } } })
    expect(mockCreateSub2ApiKey).toHaveBeenCalledWith(expect.anything(), {
      name: "Native key",
      group_id: 12,
      quota: 7.25,
      expires_in_days: 5,
      ip_whitelist: ["192.0.2.1", "198.51.100.0/24"],
    })
  })

  it("renames using a partial update and preserves fresh native quota, expiry and status", async () => {
    const before = token({
      id: 9,
      quota: 10,
      status: "quota_exhausted",
      expires_at: "2030-01-01T00:00:31Z",
    })
    const latest = { ...before, quota: 18, group_id: 12 }
    mockFetchSub2ApiKey
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(latest)
      .mockResolvedValueOnce({ ...latest, name: "Renamed" })
    const session = await sub2ApiAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
      request,
    })
    const editor = await (
      await session.openCollection("account")
    ).openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.SUB2API,
      scopeKey: "account",
      resourceId: "9",
    })

    await editor.submit({ ...editor.initialValues, name: "Renamed" })
    expect(mockUpdateSub2ApiKey).toHaveBeenCalledWith(expect.anything(), 9, {
      name: "Renamed",
    })
  })

  it.each([false, true])(
    "avoids writes for unchanged fields or conflicting concurrent edits (conflict=%s)",
    async (conflict) => {
      const before = token({ id: 9 })
      mockFetchSub2ApiKey
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, name: "Remote rename" })
      const session = await sub2ApiAccountKeyResources.open({
        account: { id: "account-example", siteType: SITE_TYPES.SUB2API },
        request,
      })
      const editor = await (
        await session.openCollection("account")
      ).openEditEditor({
        accountId: "account-example",
        siteType: SITE_TYPES.SUB2API,
        scopeKey: "account",
        resourceId: "9",
      })
      const submitted = editor.submit({
        ...editor.initialValues,
        ...(conflict ? { name: "Local rename" } : {}),
      })

      if (conflict)
        await expect(submitted).rejects.toMatchObject({
          failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ResourceChanged },
        })
      else
        await expect(submitted).resolves.toMatchObject({
          facts: { displayName: "Remote rename" },
        })
      expect(mockUpdateSub2ApiKey).not.toHaveBeenCalled()
    },
  )

  it("registers native resources for ordinary Key Management", () => {
    expect(sub2ApiCapabilities.account?.keyResourceManagement).toBe(
      sub2ApiAccountKeyResources,
    )
  })
})
