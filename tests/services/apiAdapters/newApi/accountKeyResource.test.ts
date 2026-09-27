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
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const {
  mockFetchAccountTokens,
  mockFetchTokenById,
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
  mockFetchTokenById: vi.fn(),
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
      fetchTokenById: mockFetchTokenById,
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
    fetchUserGroups: mockFetchUserGroups,
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

const token = (overrides: Partial<NewApiToken>): NewApiToken => ({
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
    mockFetchTokenById.mockReset()
    mockFetchOneHubAccountTokens.mockReset()
    mockFetchCurrentUserGroup.mockReset()
    mockFetchUserGroups.mockReset()
    mockCreateApiToken.mockReset()
    mockUpdateApiToken.mockReset()
    mockDeleteApiToken.mockReset()
    mockResolveApiTokenKey.mockReset()
    mockResolveWongApiTokenKey.mockReset()
  })

  it("clamps a sentinel unlimited quota before switching to a limited quota", async () => {
    mockFetchAccountTokens.mockResolvedValue([
      token({ id: 1, remain_quota: -1, unlimited_quota: true }),
    ])
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "1",
    })
    expect(editor.initialValues.quotaUsd).toBe(0)
    expect(editor.initialValues.unlimited_quota).toBe(true)
  })

  it("creates a native key and attributes the matching new resource after an acknowledgement", async () => {
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ id: 1 })])
      .mockResolvedValueOnce([
        token({ id: 1 }),
        token({
          id: 2,
          name: "Created",
          remain_quota: 1250000,
          unlimited_quota: false,
          model_limits_enabled: true,
          model_limits: "model-a",
          allow_ips: "127.0.0.1",
        }),
      ])
    mockCreateApiToken.mockResolvedValueOnce(true)
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const editor = await session.openCreateEditor("account")
    const result = await editor.submit({
      ...editor.initialValues,
      name: "Created",
      quotaUsd: 2.5,
      unlimited_quota: false,
      group: "default",
      model_limits_enabled: true,
      model_limits: ["model-a"],
      allow_ips: "127.0.0.1",
    })
    expect(result.facts?.ref.resourceId).toBe("2")
    expect(mockCreateApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      expect.objectContaining({
        remain_quota: 1250000,
        model_limits: "model-a",
        group: "default",
      }),
    )
    expect(JSON.stringify(result.facts)).not.toContain("sk-masked********test")
  })

  it("preserves fresh unrelated quota and advanced settings when editing a name", async () => {
    const original = token({
      group: "auto",
      cross_group_retry: true,
      auto_groups: ["fast"],
    })
    const latest = {
      ...original,
      remain_quota: 1250000,
      auto_groups: ["fast", "economy"],
    }
    mockFetchAccountTokens
      .mockResolvedValueOnce([original])
      .mockResolvedValueOnce([latest])
      .mockResolvedValueOnce([{ ...latest, name: "Renamed" }])
    mockUpdateApiToken.mockResolvedValueOnce(true)
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "1",
    })
    await editor.submit({ ...editor.initialValues, name: "Renamed" })
    expect(mockUpdateApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      1,
      expect.objectContaining({
        name: "Renamed",
        remain_quota: 1250000,
        cross_group_retry: true,
        auto_groups: ["fast", "economy"],
      }),
    )
  })

  it("rejects concurrent edits to the same field before dispatch", async () => {
    mockFetchAccountTokens
      .mockResolvedValueOnce([token({ name: "Original" })])
      .mockResolvedValueOnce([token({ name: "Remote" })])
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "1",
    })
    await expect(
      editor.submit({ ...editor.initialValues, name: "Local" }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(mockUpdateApiToken).not.toHaveBeenCalled()
  })

  it("does not retry an ambiguous native create", async () => {
    mockFetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        token({ id: 2, name: "Created" }),
        token({ id: 3, name: "Created" }),
      ])
    mockCreateApiToken.mockResolvedValueOnce(true)
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const editor = await session.openCreateEditor("account")
    const values = {
      ...editor.initialValues,
      name: "Created",
      group: "default",
    }
    await expect(editor.submit(values)).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    await expect(editor.submit(values)).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    expect(mockCreateApiToken).toHaveBeenCalledTimes(1)
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

  it("rejects duplicate token IDs at the native inventory boundary", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([
      token({ id: 1, name: "First" }),
      token({ id: 1, name: "Duplicate" }),
    ])

    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")

    await expect(collection.list()).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: "duplicate_token_id",
      },
    })
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

  it("keeps empty-group placement unknown for a provider that does not inherit the account group", async () => {
    mockFetchOneHubAccountTokens.mockResolvedValueOnce([token({ group: "" })])
    mockFetchUserGroups.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
    })
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.ONE_HUB,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.ONE_HUB },
      request,
    })

    await expect(session.provisioning!.inspect()).resolves.toMatchObject({
      items: [
        {
          placement: {
            kind: ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown,
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

  it("resolves listed keys without reading the full inventory again", async () => {
    const tokens = [token({ id: 8 }), token({ id: 9 })]
    mockFetchAccountTokens.mockResolvedValue(tokens)
    mockFetchTokenById.mockImplementation(async (_request, id) =>
      tokens.find((item) => item.id === id),
    )
    mockResolveApiTokenKey.mockImplementation(
      async (_request, item) => `secret-${item.id}`,
    )
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")
    const page = await collection.list()
    for (const item of page.items) {
      await expect(
        session.runtimeKey!.resolve(item.ref),
      ).resolves.toMatchObject({
        kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
        secret: `secret-${item.ref.resourceId}`,
      })
    }
    expect(mockFetchAccountTokens).toHaveBeenCalledTimes(1)
  })

  it("resolves the exact referenced token through the site-type reveal transport", async () => {
    mockFetchTokenById.mockResolvedValueOnce(token({ id: 9, key: "masked-9" }))
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
    expect(mockFetchTokenById).toHaveBeenCalledWith(request, 9)
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
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

  it("rejects a mismatched detail instead of revealing another token", async () => {
    mockFetchTokenById.mockResolvedValueOnce(token({ id: 8 }))
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
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
    ).resolves.toMatchObject({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })
    expect(mockResolveApiTokenKey).not.toHaveBeenCalled()
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
  })

  it("reports an unavailable runtime key when the exact ref no longer exists", async () => {
    mockFetchTokenById.mockRejectedValueOnce({ status: 404 })

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
    mockFetchTokenById.mockResolvedValueOnce(token({ id: 9 }))
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

    expect(editor.initialValues).toMatchObject({ name: "Before" })
    await expect(
      editor.submit({ ...editor.initialValues, name: "After" }),
    ).resolves.toMatchObject({
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

  it("propagates operation cancellation and rejects invalid or missing token locators", async () => {
    const controller = new AbortController()
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    await expect(session.resolveDefaultScope()).resolves.toMatchObject({
      scopeKey: "account",
    })
    const collection = await session.openCollection("account")

    mockFetchAccountTokens.mockResolvedValueOnce([])
    await collection.list(undefined, { signal: controller.signal })
    expect(mockFetchAccountTokens).toHaveBeenLastCalledWith({
      ...request,
      abortSignal: controller.signal,
    })

    await expect(
      collection.get({
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "0",
      }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })

    mockFetchAccountTokens.mockResolvedValueOnce([])
    await expect(
      collection.get({
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "9",
      }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })

    mockFetchAccountTokens.mockResolvedValueOnce([token({ id: 0 })])
    await expect(collection.list()).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
    })

    for (const resourceId of ["01", "9007199254740992"]) {
      await expect(
        collection.get({
          accountId: "account-1",
          siteType: SITE_TYPES.NEW_API,
          scopeKey: "account",
          resourceId,
        }),
      ).rejects.toMatchObject({
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
      })
    }

    for (const id of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
      mockFetchAccountTokens.mockResolvedValueOnce([token({ id })])
      await expect(collection.list()).rejects.toMatchObject({
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected },
      })
    }
  })

  it("decodes an opaque requirement key back to its exact group", async () => {
    mockFetchUserGroups.mockResolvedValue({
      "vip/%": { desc: "Encoded", ratio: 2 },
    })
    mockFetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([token({ id: 9, group: "vip/%" })])
    mockCreateApiToken.mockResolvedValueOnce(true)
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
    ).resolves.toMatchObject({ certainty: "applied" })
    expect(mockCreateApiToken).toHaveBeenCalledWith(
      expect.objectContaining(request),
      expect.objectContaining({ group: "vip/%" }),
    )
  })

  it("rejects duplicate normalized group requirements before reconciliation", async () => {
    mockFetchAccountTokens.mockResolvedValueOnce([])
    mockFetchUserGroups.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
      " vip ": { desc: "Duplicate VIP", ratio: 2 },
    })
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    await expect(session.provisioning!.inspect()).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        message: "duplicate_group_requirement",
      },
    })
  })

  it("marks a create uncertain when the required post-write inventory fails", async () => {
    const before = [token({ id: 1, group: "default" })]
    mockFetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before)
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    mockCreateApiToken.mockResolvedValueOnce(true)
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
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "refresh unavailable",
      },
    })
  })

  it("reports detail failure before runtime secret reveal", async () => {
    mockFetchTokenById.mockRejectedValueOnce(new Error("detail unavailable"))
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
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
        message: "detail unavailable",
      },
    })
    expect(mockResolveApiTokenKey).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: "missing ref",
      groups: { vip: { desc: "VIP", ratio: 2 } },
      tokens: [],
      failureCode: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound,
    },
    {
      label: "orphaned group",
      groups: { default: { desc: "Default", ratio: 1 } },
      tokens: [token({ id: 9, name: "user group (auto)", group: "vip" })],
      failureCode: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
    },
    {
      label: "provider-owned custom name",
      groups: { vip: { desc: "VIP", ratio: 2 } },
      tokens: [token({ id: 9, name: "Custom key", group: "vip" })],
      failureCode: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
    },
  ])(
    "rejects rename for $label before mutation",
    async ({ groups, tokens, failureCode }) => {
      mockFetchAccountTokens.mockResolvedValueOnce(tokens)
      mockFetchUserGroups.mockResolvedValueOnce(groups)
      const session = await createNewApiAccountKeyResources(
        SITE_TYPES.NEW_API,
      ).open({
        account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
        request,
      })

      await expect(
        session.provisioning!.rename!({
          accountId: "account-1",
          siteType: SITE_TYPES.NEW_API,
          scopeKey: "account",
          resourceId: "9",
        }),
      ).resolves.toEqual({
        certainty: "not-applied",
        failure: { code: failureCode },
      })
      expect(mockUpdateApiToken).not.toHaveBeenCalled()
    },
  )

  it("preserves rejected and unverifiable provisioning renames without replay", async () => {
    const before = token({ id: 9, name: "user group (auto)", group: "vip" })
    const ref = {
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "9",
    } as const
    mockFetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 2 },
    })
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    mockFetchAccountTokens.mockResolvedValueOnce([before])
    mockUpdateApiToken.mockImplementationOnce(async (mutationRequest) => {
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

    mockFetchAccountTokens
      .mockResolvedValueOnce([before])
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    mockUpdateApiToken.mockResolvedValueOnce(true)
    await expect(session.provisioning!.rename!(ref)).resolves.toEqual({
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "refresh unavailable",
      },
    })
    expect(mockUpdateApiToken).toHaveBeenCalledTimes(2)
  })

  it("keeps edit validation and false or failed updates explicit", async () => {
    const current = token({ id: 9, name: "Before", group: "vip" })
    const ref = {
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "9",
    } as const
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")

    mockFetchAccountTokens.mockResolvedValueOnce([current])
    const invalidEditor = await collection.openEditEditor(ref)
    await expect(
      invalidEditor.submit({ ...invalidEditor.initialValues, name: "   " }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })

    mockFetchAccountTokens
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([current])
    const falseEditor = await collection.openEditEditor(ref)
    mockUpdateApiToken.mockResolvedValueOnce(false)
    await expect(
      falseEditor.submit({ ...falseEditor.initialValues, name: "After" }),
    ).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })

    mockFetchAccountTokens
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([current])
    const rejectedEditor = await collection.openEditEditor(ref)
    mockUpdateApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      mutationRequest.observer?.onResponse()
      throw new ApiError(
        "Update rejected",
        undefined,
        "/api/token",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    })
    await expect(
      rejectedEditor.submit({ ...rejectedEditor.initialValues, name: "After" }),
    ).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Update rejected",
      },
    })

    mockFetchAccountTokens
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([current])
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    const uncertainEditor = await collection.openEditEditor(ref)
    mockUpdateApiToken.mockResolvedValueOnce(true)
    await expect(
      uncertainEditor.submit({
        ...uncertainEditor.initialValues,
        name: "After",
      }),
    ).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "refresh unavailable",
      },
    })
  })

  it("keeps false and explicit delete rejections definite", async () => {
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
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

    mockDeleteApiToken.mockResolvedValueOnce(false)
    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })

    mockDeleteApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      mutationRequest.observer?.onResponse()
      throw new ApiError(
        "Delete rejected",
        undefined,
        "/api/token",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    })
    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Delete rejected",
      },
    })
    expect(mockDeleteApiToken).toHaveBeenCalledTimes(2)
  })

  it("opens the native create editor", async () => {
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    await expect(session.openCreateEditor("account")).resolves.toMatchObject({
      initialValues: { name: "user group (auto)", unlimited_quota: true },
    })
  })

  it("prefers the dispatched create failure when post-write inventory also fails", async () => {
    const before = [token({ id: 1, group: "default" })]
    mockFetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before)
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    mockCreateApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("create timed out")
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
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "create timed out",
      },
    })
  })

  it("keeps an ambiguous create uncertain when the confirming inventory is unchanged", async () => {
    const before = [token({ id: 1, group: "default" })]
    mockFetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens.mockResolvedValue(before)
    mockCreateApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("create timed out")
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
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "create timed out",
      },
    })
  })

  it("preserves an ambiguous create failure when the new token has the wrong placement", async () => {
    mockFetchUserGroups.mockResolvedValue({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockFetchAccountTokens
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([token({ id: 9, group: "default" })])
    mockCreateApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("create timed out")
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
      certainty: "possibly-applied",
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "create timed out",
      },
    })
  })

  it("confirms a One API singleton create by exact inventory diff", async () => {
    const before = [token({ id: 1, group: "" })]
    mockFetchAccountTokens
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce([...before, token({ id: 9, group: "" })])
    mockCreateApiToken.mockResolvedValueOnce(true)
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.ONE_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.ONE_API },
      request,
    })
    const requirementKey = (await session.provisioning!.inspect())
      .requirements[0].requirementKey

    await expect(
      session.provisioning!.provision(requirementKey),
    ).resolves.toMatchObject({
      certainty: "applied",
      value: { ref: { resourceId: "9" } },
    })
  })

  it("rejects inherited-template rename when the effective group is unavailable", async () => {
    const before = token({ id: 9, name: "user group (auto)", group: "" })
    mockFetchAccountTokens.mockResolvedValueOnce([before])
    mockFetchCurrentUserGroup.mockRejectedValueOnce(
      new Error("current group unavailable"),
    )
    mockFetchUserGroups.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
    })
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    await expect(
      session.provisioning!.rename!({
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "9",
      }),
    ).resolves.toEqual({
      certainty: "not-applied",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
    expect(mockUpdateApiToken).not.toHaveBeenCalled()
  })

  it.each([
    { label: "applied update", updateThrows: false },
    { label: "dispatched ambiguous update", updateThrows: true },
  ])(
    "keeps a mismatched rename confirmation uncertain after $label",
    async ({ updateThrows }) => {
      const before = token({ id: 9, name: "user group (auto)", group: "vip" })
      mockFetchAccountTokens
        .mockResolvedValueOnce([before])
        .mockResolvedValueOnce([before])
      mockFetchUserGroups.mockResolvedValueOnce({
        vip: { desc: "VIP", ratio: 2 },
      })
      if (updateThrows) {
        mockUpdateApiToken.mockImplementationOnce(async (mutationRequest) => {
          mutationRequest.observer?.onDispatch()
          throw new Error("rename timed out")
        })
      } else {
        mockUpdateApiToken.mockResolvedValueOnce(true)
      }
      const session = await createNewApiAccountKeyResources(
        SITE_TYPES.NEW_API,
      ).open({
        account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
        request,
      })

      await expect(
        session.provisioning!.rename!({
          accountId: "account-1",
          siteType: SITE_TYPES.NEW_API,
          scopeKey: "account",
          resourceId: "9",
        }),
      ).resolves.toEqual({
        certainty: "possibly-applied",
        failure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
          ...(updateThrows ? { message: "rename timed out" } : {}),
        },
      })
    },
  )

  it("preserves an ambiguous editor failure when confirmation also fails", async () => {
    const current = token({ id: 9, name: "Before", group: "vip" })
    mockFetchAccountTokens
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([current])
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    mockUpdateApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("update timed out")
    })
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "9",
    })

    await expect(
      editor.submit({ ...editor.initialValues, name: "After" }),
    ).rejects.toMatchObject({
      failure: {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: "update timed out",
      },
    })
  })

  it("preserves an ambiguous rename failure when confirmation also fails", async () => {
    const current = token({
      id: 9,
      name: "user group (auto)",
      group: "vip",
    })
    mockFetchAccountTokens
      .mockResolvedValueOnce([current])
      .mockRejectedValueOnce(new Error("refresh unavailable"))
    mockFetchUserGroups.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
    })
    mockUpdateApiToken.mockImplementationOnce(async (mutationRequest) => {
      mutationRequest.observer?.onDispatch()
      throw new Error("rename timed out")
    })
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })

    await expect(
      session.provisioning!.rename!({
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
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
  })

  it.each([
    { label: "applied update", updateThrows: false },
    { label: "dispatched ambiguous update", updateThrows: true },
  ])(
    "keeps a mismatched editor confirmation uncertain after $label",
    async ({ updateThrows }) => {
      const current = token({ id: 9, name: "Before", group: "vip" })
      mockFetchAccountTokens
        .mockResolvedValueOnce([current])
        .mockResolvedValueOnce([current])
        .mockResolvedValueOnce([current])
      if (updateThrows) {
        mockUpdateApiToken.mockImplementationOnce(async (mutationRequest) => {
          mutationRequest.observer?.onDispatch()
          throw new Error("update timed out")
        })
      } else {
        mockUpdateApiToken.mockResolvedValueOnce(true)
      }
      const session = await createNewApiAccountKeyResources(
        SITE_TYPES.NEW_API,
      ).open({
        account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
        request,
      })
      const collection = await session.openCollection("account")
      const editor = await collection.openEditEditor({
        accountId: "account-1",
        siteType: SITE_TYPES.NEW_API,
        scopeKey: "account",
        resourceId: "9",
      })

      await expect(
        editor.submit({ ...editor.initialValues, name: "After" }),
      ).rejects.toMatchObject({
        failure: {
          code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
          ...(updateThrows ? { message: "update timed out" } : {}),
        },
      })
    },
  )

  it("confirms leaving automatic groups after the provider resets retry settings", async () => {
    const before = token({
      id: 9,
      group: "auto",
      cross_group_retry: true,
      auto_groups: ["vip"],
    })
    const after = {
      ...before,
      group: "vip",
      cross_group_retry: false,
      auto_groups: null,
    }
    mockFetchAccountTokens
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([after])
    mockUpdateApiToken.mockResolvedValueOnce(true)
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const editor = await (
      await session.openCollection("account")
    ).openEditEditor({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "9",
    })

    await expect(
      editor.submit({ ...editor.initialValues, group: "vip" }),
    ).resolves.toMatchObject({ facts: { ref: { resourceId: "9" } } })
    expect(mockUpdateApiToken).toHaveBeenCalledWith(
      expect.anything(),
      9,
      expect.objectContaining({
        group: "vip",
        cross_group_retry: false,
        auto_groups: null,
      }),
    )
  })

  it("does not rewrite untouched model restrictions or overwrite fresh advanced settings", async () => {
    const before = token({
      id: 9,
      group: "auto",
      model_limits: "gpt-a, gpt-b",
      cross_group_retry: false,
      auto_groups: ["default"],
    })
    const latest = { ...before, cross_group_retry: true, auto_groups: ["vip"] }
    mockFetchAccountTokens
      .mockResolvedValueOnce([before])
      .mockResolvedValueOnce([latest])
      .mockResolvedValueOnce([{ ...latest, name: "Renamed" }])
    mockUpdateApiToken.mockResolvedValueOnce(true)
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const editor = await (
      await session.openCollection("account")
    ).openEditEditor({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "9",
    })

    await editor.submit({ ...editor.initialValues, name: "Renamed" })
    expect(mockUpdateApiToken).toHaveBeenCalledWith(
      expect.anything(),
      9,
      expect.objectContaining({
        name: "Renamed",
        model_limits: "gpt-a, gpt-b",
        cross_group_retry: true,
        auto_groups: ["vip"],
      }),
    )
  })

  it("registers one native resource capability for management and repair", () => {
    const account = createNewApiCapabilities(SITE_TYPES.NEW_API).account

    expect(account?.keyResourceManagement).toBeDefined()
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
    mockFetchAccountTokens.mockReset()
    mockUpdateApiToken.mockReset()
    const original = token({
      name: "Original",
      unlimited_quota: false,
      remain_quota: 1000000,
    })
    mockFetchAccountTokens
      .mockResolvedValueOnce([original])
      .mockResolvedValueOnce([original])
      .mockResolvedValueOnce([
        { ...original, name: readName, remain_quota: 900000 },
      ])
    mockUpdateApiToken.mockImplementation(async (request) => {
      request.observer?.onDispatch()
      if (lostResponse) throw new Error("response lost")
      return true
    })
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.NEW_API,
    ).open({
      account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
      request,
    })
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      scopeKey: "account",
      resourceId: "1",
    })
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
    expect(mockUpdateApiToken).toHaveBeenCalledTimes(1)
  },
)

it("preserves the last-use timestamp in safe resource facts", async () => {
  mockFetchAccountTokens.mockReset()
  mockFetchAccountTokens.mockResolvedValue([
    token({ accessed_time: 1750000000 }),
  ])
  const session = await createNewApiAccountKeyResources(
    SITE_TYPES.NEW_API,
  ).open({
    account: { id: "account-1", siteType: SITE_TYPES.NEW_API },
    request,
  })
  const page = await (await session.openCollection("account")).list()
  expect(page.items[0].fields).toContainEqual({
    fieldId: "accessed_time",
    kind: "number",
    value: 1750000000,
  })
})
