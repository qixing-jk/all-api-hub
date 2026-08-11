import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS,
  ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  createNewApiAccountKeyResources,
  createNewApiCapabilities,
} from "~/services/apiAdapters/newApi"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum, type ApiToken } from "~/types"

const {
  mockFetchAccountTokens,
  mockFetchOneHubAccountTokens,
  mockFetchCurrentUserGroup,
  mockFetchUserGroups,
  mockCreateApiToken,
  mockUpdateApiToken,
  mockDeleteApiToken,
  mockResolveApiTokenKey,
  mockResolveWongApiTokenKey,
} = vi.hoisted(() => ({
  mockFetchAccountTokens: vi.fn(),
  mockFetchOneHubAccountTokens: vi.fn(),
  mockFetchCurrentUserGroup: vi.fn(),
  mockFetchUserGroups: vi.fn(),
  mockCreateApiToken: vi.fn(),
  mockUpdateApiToken: vi.fn(),
  mockDeleteApiToken: vi.fn(),
  mockResolveApiTokenKey: vi.fn(),
  mockResolveWongApiTokenKey: vi.fn(),
}))

vi.mock(
  "~/services/apiService/newApiFamily/default/keyManagement",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("~/services/apiService/newApiFamily/default/keyManagement")
      >()
    return {
      ...original,
      defaultKeyManagementImplementation: {
        ...original.defaultKeyManagementImplementation,
        resolveApiTokenKey: mockResolveApiTokenKey,
      },
      fetchAccountTokens: mockFetchAccountTokens,
      fetchCompleteAccountTokens: mockFetchAccountTokens,
      fetchCurrentUserGroup: mockFetchCurrentUserGroup,
      fetchUserGroups: mockFetchUserGroups,
      createApiToken: mockCreateApiToken,
      updateApiToken: mockUpdateApiToken,
      deleteApiToken: mockDeleteApiToken,
    }
  },
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/oneHub",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/oneHub")
    >()),
    fetchAccountTokens: mockFetchOneHubAccountTokens,
    fetchCompleteAccountTokens: mockFetchOneHubAccountTokens,
  }),
)

vi.mock(
  "~/services/apiService/newApiFamily/variants/wong",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/newApiFamily/variants/wong")
    >()),
    resolveApiTokenKey: mockResolveWongApiTokenKey,
  }),
)

const request = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "access-token",
    userId: "user-1",
  },
}

const token = (overrides: Partial<ApiToken>): ApiToken => ({
  id: 1,
  user_id: 1,
  key: "sk-masked********test",
  status: 1,
  name: "Example token",
  created_time: 1,
  accessed_time: 1,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  used_quota: 0,
  group: "default",
  ...overrides,
})

describe("New API account key resources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchAccountTokens.mockReset()
    mockFetchOneHubAccountTokens.mockReset()
    mockFetchCurrentUserGroup.mockReset()
    mockFetchUserGroups.mockReset()
    mockCreateApiToken.mockReset()
    mockUpdateApiToken.mockReset()
    mockDeleteApiToken.mockReset()
    mockResolveApiTokenKey.mockReset()
    mockResolveWongApiTokenKey.mockReset()
  })

  it("lists the complete account token inventory with canonical numeric refs", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 1, name: "First" }),
      token({ id: 2, name: "Second" }),
    ])

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)

    const session = await capability.open({
      account: {
        id: "account-1",
        name: "Example account",
        siteType: SITE_TYPES.NEW_API,
      },
      request,
    })
    await expect(session.listScopes()).resolves.toEqual([
      expect.objectContaining({
        scopeKey: "account",
        routeKey: "account",
        isDefault: true,
      }),
    ])

    const collection = await session.openCollection("account")
    const page = await collection.list()

    expect(page.items.map((item) => item.ref)).toEqual([
      {
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "1",
      },
      {
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "2",
      },
    ])
    expect(page.total).toBe(2)
    expect(mockFetchAccountTokens).toHaveBeenCalledWith(request)
  })

  it.each([SITE_TYPES.ONE_HUB, SITE_TYPES.DONE_HUB])(
    "routes %s through its provider-owned complete-inventory transport",
    async (siteType) => {
      mockFetchOneHubAccountTokens.mockResolvedValueOnce([token({ id: 1 })])

      const capability = createNewApiAccountKeyResources(siteType)
      const session = await capability.open({
        account: { id: "account-1", siteType },
        request,
      })
      const collection = await session.openCollection("account")

      await expect(collection.list()).resolves.toMatchObject({
        items: [
          {
            ref: {
              accountId: "account-1",
              siteType,
              scopeKey: "account",
              resourceId: "1",
            },
          },
        ],
        total: 1,
      })
      expect(mockFetchOneHubAccountTokens).toHaveBeenCalledWith(request)
      expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    },
  )

  it("inspects opaque group requirements with fail-closed placement and coverage", async () => {
    mockFetchCurrentUserGroup.mockResolvedValueOnce("default")
    mockFetchUserGroups.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 1, group: "vip", status: 1, expired_time: -1 }),
      token({ id: 2, group: "", status: 1, expired_time: -1 }),
      token({ id: 3, group: "default", status: 2, expired_time: -1 }),
      token({ id: 4, group: "default", status: 9, expired_time: -1 }),
      token({ id: 5, group: "default", status: 1, expired_time: 1 }),
      token({
        id: 6,
        group: "default",
        status: 1,
        expired_time: Number.NaN,
      }),
      token({ id: 7, group: "retired", status: 1, expired_time: -1 }),
    ])

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    expect(
      snapshot.requirements.map((requirement) => requirement.displayName),
    ).toEqual(["default", "vip"])
    expect(
      snapshot.requirements.map((requirement) => requirement.requirementKey),
    ).not.toContain("vip")
    expect(snapshot.items).toEqual([
      {
        ref: expect.objectContaining({ resourceId: "1" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: [snapshot.requirements[1].requirementKey],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
      {
        ref: expect.objectContaining({ resourceId: "2" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: [snapshot.requirements[0].requirementKey],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
      {
        ref: expect.objectContaining({ resourceId: "3" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: [snapshot.requirements[0].requirementKey],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable,
      },
      {
        ref: expect.objectContaining({ resourceId: "4" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: [snapshot.requirements[0].requirementKey],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown,
      },
      {
        ref: expect.objectContaining({ resourceId: "5" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: [snapshot.requirements[0].requirementKey],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unusable,
      },
      {
        ref: expect.objectContaining({ resourceId: "6" }),
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
          requirementKeys: [snapshot.requirements[0].requirementKey],
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown,
      },
      {
        ref: expect.objectContaining({ resourceId: "7" }),
        displayName: "Example token",
        placement: {
          kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned,
          placementKey: expect.any(String),
          displayName: "retired",
        },
        coverage: ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable,
      },
    ])
  })

  it("inherits the account group for New API-family compatibility sites", async () => {
    mockFetchCurrentUserGroup.mockResolvedValueOnce("default")
    mockFetchUserGroups.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
    })
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 2, group: "", status: 1, expired_time: -1 }),
    ])

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.SUPER_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.SUPER_API },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    expect(snapshot.items[0]).toMatchObject({
      placement: {
        kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
        requirementKeys: [snapshot.requirements[0].requirementKey],
      },
    })
    expect(mockFetchCurrentUserGroup).toHaveBeenCalledOnce()
  })

  it("treats One API inventory as one opaque singleton requirement", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 1, group: undefined }),
    ])

    const capability = createNewApiAccountKeyResources(SITE_TYPES.ONE_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.ONE_API },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    expect(snapshot.requirements).toHaveLength(1)
    expect(snapshot.items[0]).toMatchObject({
      placement: {
        kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
        requirementKeys: [snapshot.requirements[0].requirementKey],
      },
    })
    expect(mockFetchUserGroups).not.toHaveBeenCalled()
  })

  it("keeps an inherited token placement explainable when the current group is unavailable", async () => {
    mockFetchUserGroups.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
    })
    mockFetchAccountTokens.mockResolvedValueOnce([token({ group: "" })])
    mockFetchCurrentUserGroup.mockRejectedValueOnce(
      new Error("invalid_current_user_group_payload"),
    )

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    await expect(session.provisioning!.inspect()).resolves.toMatchObject({
      items: [
        {
          placement: {
            kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown,
            reasonCode:
              ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS.InheritedAccountGroupUnavailable,
          },
        },
      ],
    })
  })

  it("recognizes and renames provider-owned auto templates through the provisioning facet", async () => {
    const before = token({
      id: 9,
      name: "user group (auto)",
      group: "vip",
    })
    mockFetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([{ ...before, name: "vip group (auto)" }])
    mockUpdateApiToken.mockResolvedValueOnce(true)

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const snapshot = await session.provisioning!.inspect()
    const ref = snapshot.items[0].ref

    expect(snapshot.items[0].renameSuggestion).toEqual({
      targetDisplayName: "vip group (auto)",
    })
    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "applied",
      value: undefined,
    })
    expect(mockUpdateApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      9,
      {
        name: "vip group (auto)",
        remain_quota: before.remain_quota,
        expired_time: before.expired_time,
        unlimited_quota: before.unlimited_quota,
        model_limits_enabled: before.model_limits_enabled,
        model_limits: before.model_limits,
        allow_ips: before.allow_ips,
        group: before.group,
      },
    )
  })

  it("keeps a missing provider token name from aborting inventory inspection", async () => {
    mockFetchCurrentUserGroup.mockResolvedValueOnce("vip")
    mockFetchUserGroups.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 9, name: undefined, group: "vip" }),
    ])

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    const snapshot = await session.provisioning!.inspect()
    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.items[0].renameSuggestion).toBeUndefined()
  })

  it("renames an inherited-group auto template without changing its empty group", async () => {
    const before = token({
      id: 10,
      name: "user group (auto)",
      group: "",
    })
    mockFetchCurrentUserGroup.mockResolvedValue("vip")
    mockFetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([{ ...before, name: "vip group (auto)" }])
    mockUpdateApiToken.mockResolvedValueOnce(true)

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    expect(snapshot.items[0].renameSuggestion).toEqual({
      targetDisplayName: "vip group (auto)",
    })
    await expect(
      session.provisioning!.rename!(snapshot.items[0].ref),
    ).resolves.toEqual({ certainty: "applied", value: undefined })
    expect(mockUpdateApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      10,
      {
        name: "vip group (auto)",
        remain_quota: before.remain_quota,
        expired_time: before.expired_time,
        unlimited_quota: before.unlimited_quota,
        model_limits_enabled: before.model_limits_enabled,
        model_limits: before.model_limits,
        allow_ips: before.allow_ips,
        group: "",
      },
    )
  })

  it("preserves a known rename rejection through the native factory boundary", async () => {
    const before = token({
      id: 9,
      name: "user group (auto)",
      group: "vip",
    })
    mockFetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens.mockResolvedValue([before])
    mockUpdateApiToken.mockResolvedValueOnce(false)

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const snapshot = await session.provisioning!.inspect()

    await expect(
      session.provisioning!.rename!(snapshot.items[0].ref),
    ).resolves.toEqual({
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })
  })

  it.each([
    {
      label: "ApiError 401",
      error: new ApiError(
        "Authentication expired",
        401,
        "/api/token/",
        API_ERROR_CODES.HTTP_401,
        "AUTH_EXPIRED",
      ),
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
        message: "Authentication expired",
        upstreamCode: "AUTH_EXPIRED",
      },
    },
    {
      label: "structured 403",
      error: { response: { status: 403 }, message: "Access denied" },
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied,
        message: "Access denied",
      },
    },
    {
      label: "structured 404",
      error: { status: 404, message: "Endpoint missing" },
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound,
        message: "Endpoint missing",
      },
    },
    {
      label: "structured 429",
      error: { statusCode: 429, message: "Rate limited" },
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        message: "Rate limited",
      },
    },
    {
      label: "ApiError 503",
      error: new ApiError(
        "Provider unavailable",
        503,
        "/api/token/",
        API_ERROR_CODES.HTTP_OTHER,
      ),
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
        message: "Provider unavailable",
      },
    },
    {
      label: "abort",
      error: Object.assign(new Error("Request cancelled"), {
        name: "AbortError",
      }),
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted,
        message: "Request cancelled",
      },
    },
  ])(
    "maps $label inventory failures into controlled categories",
    async ({ error, failure }) => {
      mockFetchUserGroups.mockResolvedValue({})
      mockFetchAccountTokens.mockRejectedValueOnce(error)

      const session = await createNewApiAccountKeyResources(
        SITE_TYPES.NEW_API,
      ).open({
        account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
        request,
      })

      await expect(session.provisioning!.inspect()).rejects.toMatchObject({
        failure,
      })
    },
  )

  it("provisions an exact ref only after a unique placement-matching ID diff", async () => {
    mockFetchUserGroups
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([
        token({ id: 1, group: "default" }),
        token({ id: 9, group: "vip", name: "Created" }),
      ])
    mockCreateApiToken.mockResolvedValueOnce(true)

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const inspected = await session.provisioning!.inspect()
    const requirementKey = inspected.requirements[0].requirementKey

    await expect(
      session.provisioning!.provision(requirementKey),
    ).resolves.toEqual({
      certainty: "applied",
      value: {
        ref: {
          accountId: "account-1",
          siteType: SITE_TYPES.NEW_API,
          scopeKey: "account",
          resourceId: "9",
        },
      },
    })
    expect(mockCreateApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      expect.objectContaining({ group: "vip" }),
    )
  })

  it("preserves an explicit provider rejection without marking the create uncertain", async () => {
    mockFetchUserGroups
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
    mockCreateApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      mutationRequest.observer?.onResponse()
      throw new ApiError(
        "Token limit reached",
        undefined,
        "/api/token",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    })

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const requirementKey = (await session.provisioning!.inspect())
      .requirements[0].requirementKey

    await expect(
      session.provisioning!.provision(requirementKey),
    ).resolves.toEqual({
      certainty: "not-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Token limit reached",
      },
    })
    expect(mockCreateApiToken).toHaveBeenCalledTimes(1)
    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(2)
  })

  it("preserves a false create result as a definite rejection", async () => {
    mockFetchUserGroups
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
    mockCreateApiToken.mockResolvedValueOnce(false)

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const requirementKey = (await session.provisioning!.inspect())
      .requirements[0].requirementKey

    await expect(
      session.provisioning!.provision(requirementKey),
    ).resolves.toEqual({
      certainty: "not-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
      },
    })
    expect(mockCreateApiToken).toHaveBeenCalledOnce()
    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(2)
  })

  it("does not replay an ambiguous provision mutation", async () => {
    mockFetchUserGroups
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([
        token({ id: 1, group: "default" }),
        token({ id: 9, group: "vip" }),
        token({ id: 10, group: "vip" }),
      ])
    mockCreateApiToken.mockResolvedValueOnce(true)

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const requirementKey = (await session.provisioning!.inspect())
      .requirements[0].requirementKey

    await expect(
      session.provisioning!.provision(requirementKey),
    ).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(mockCreateApiToken).toHaveBeenCalledTimes(1)
  })

  it("does not trust a unique created ref when its placement does not match", async () => {
    mockFetchUserGroups
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
      .mockResolvedValueOnce({ vip: { desc: "VIP", ratio: 2 } })
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([token({ id: 1, group: "default" })])
      .mockResolvedValueOnce([
        token({ id: 1, group: "default" }),
        token({ id: 9, group: "other" }),
      ])
    mockCreateApiToken.mockResolvedValueOnce(true)

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const requirementKey = (await session.provisioning!.inspect())
      .requirements[0].requirementKey

    await expect(
      session.provisioning!.provision(requirementKey),
    ).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(mockCreateApiToken).toHaveBeenCalledTimes(1)
  })

  it("resolves the exact referenced token through the site-type reveal transport", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 8 }),
      token({ id: 9, key: "masked-9" }),
    ])
    mockResolveWongApiTokenKey.mockResolvedValueOnce("sk-wong-revealed")

    const capability = createNewApiAccountKeyResources(SITE_TYPES.WONG_GONGYI)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.WONG_GONGYI },
      request,
    })

    await expect(
      session.runtimeKey!.resolve({
        accountId: "account-1",
        siteType: SITE_TYPES.WONG_GONGYI,
        scopeKey: "account",
        resourceId: "9",
      }),
    ).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
      secret: "sk-wong-revealed",
    })
    expect(mockResolveWongApiTokenKey).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ id: 9, key: "masked-9" }),
    )
    expect(mockResolveApiTokenKey).not.toHaveBeenCalled()
  })

  it("rejects a runtime ref from another scope before token inventory access", async () => {
    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    await expect(
      session.runtimeKey!.resolve({
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "other-account-scope",
        resourceId: "9",
      }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(mockResolveApiTokenKey).not.toHaveBeenCalled()
  })

  it("reports an unavailable runtime key when the exact ref no longer exists", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([token({ id: 8 })])

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    await expect(
      session.runtimeKey!.resolve({
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "9",
      }),
    ).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound },
    })
    expect(mockResolveApiTokenKey).not.toHaveBeenCalled()
  })

  it("reports an unavailable runtime key when provider reveal fails", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([token({ id: 9 })])
    mockResolveApiTokenKey.mockRejectedValueOnce(
      new Error("reveal unavailable"),
    )

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    await expect(
      session.runtimeKey!.resolve({
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "9",
      }),
    ).resolves.toEqual({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: "reveal unavailable",
      },
    })
  })

  it("renames the exact token while preserving its provider fields", async () => {
    const current = token({ id: 9, name: "Before", group: "vip" })
    mockFetchAccountTokens
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([{ ...current, name: "After" }])
    mockUpdateApiToken.mockResolvedValueOnce(true)

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "9",
    } as const
    const editor = await collection.openEditEditor(ref)

    expect(editor.initialValues).toEqual({ name: "Before" })
    await expect(editor.submit({ name: "After" })).resolves.toMatchObject({
      facts: { ref, displayName: "After" },
    })
    expect(mockUpdateApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      9,
      {
        name: "After",
        remain_quota: current.remain_quota,
        expired_time: current.expired_time,
        unlimited_quota: current.unlimited_quota,
        model_limits_enabled: current.model_limits_enabled,
        model_limits: current.model_limits,
        allow_ips: current.allow_ips,
        group: current.group,
      },
    )
  })

  it("deletes the exact token once without replay", async () => {
    mockDeleteApiToken.mockResolvedValueOnce(true)

    const capability = createNewApiAccountKeyResources(SITE_TYPES.NEW_API)
    const session = await capability.open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "9",
    } as const

    await expect(collection.delete(ref)).resolves.toBeUndefined()
    expect(mockDeleteApiToken).toHaveBeenCalledTimes(1)
    expect(mockDeleteApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      9,
    )
  })

  it("registers repair resources without opting into native Key Management UI", () => {
    const account = createNewApiCapabilities(SITE_TYPES.NEW_API).account

    expect(account?.keyResources).toBeDefined()
    expect(account?.keyResourceManagement).toBeUndefined()
  })
})
