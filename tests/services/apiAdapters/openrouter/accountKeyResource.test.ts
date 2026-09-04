import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { openRouterAccountKeyResources } from "~/services/apiAdapters/openrouter/accountKeyResource"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
} from "~/services/apiAdapters/openrouter/keyResourceFields"
import { ApiError } from "~/services/apiTransport/errors"

const {
  fetchOpenRouterDefaultWorkspace,
  fetchOpenRouterWorkspaces,
  fetchOpenRouterWorkspaceMembers,
  fetchOpenRouterKeys,
  fetchOpenRouterKey,
  createOpenRouterKey,
  updateOpenRouterKey,
  deleteOpenRouterKey,
} = vi.hoisted(() => ({
  fetchOpenRouterDefaultWorkspace: vi.fn(),
  fetchOpenRouterWorkspaces: vi.fn(),
  fetchOpenRouterWorkspaceMembers: vi.fn(),
  fetchOpenRouterKeys: vi.fn(),
  fetchOpenRouterKey: vi.fn(),
  createOpenRouterKey: vi.fn(),
  updateOpenRouterKey: vi.fn(),
  deleteOpenRouterKey: vi.fn(),
}))

vi.mock("~/services/apiService/openrouter", () => ({
  fetchOpenRouterDefaultWorkspace,
  fetchOpenRouterWorkspaces,
  fetchOpenRouterWorkspaceMembers,
  fetchOpenRouterKeys,
  fetchOpenRouterKey,
  createOpenRouterKey,
  updateOpenRouterKey,
  deleteOpenRouterKey,
}))

const REQUEST = {
  accountId: "account-example",
  baseUrl: "https://example.invalid",
  auth: { authType: "access_token", accessToken: "management-key" },
} as any

const workspace = (overrides = {}) => ({
  id: "workspace-default-id",
  default_guardrail_id: "guardrail-example",
  name: "Default workspace",
  slug: "default",
  description: null,
  default_text_model: null,
  default_image_model: null,
  default_provider_sort: null,
  is_observability_io_logging_enabled: false,
  is_observability_broadcast_enabled: false,
  is_data_discount_logging_enabled: false,
  io_logging_sampling_rate: 0,
  io_logging_api_key_ids: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
  created_by: null,
  ...overrides,
})

const key = (overrides = {}) => ({
  hash: "opaque-hash-example",
  name: "Example key",
  label: "sk-or-...example",
  disabled: false,
  limit: null,
  limit_remaining: null,
  limit_reset: null,
  include_byok_in_limit: false,
  usage: 0,
  usage_daily: 0,
  usage_weekly: 0,
  usage_monthly: 0,
  byok_usage: 0,
  byok_usage_daily: 0,
  byok_usage_weekly: 0,
  byok_usage_monthly: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
  expires_at: null,
  workspace_id: "workspace-default-id",
  creator_user_id: null,
  ...overrides,
})

const workspacePage = (
  data: ReturnType<typeof workspace>[],
  totalCount = data.length,
) => ({
  data,
  totalCount,
})

const memberPage = <
  T extends { id: string; user_id: string; workspace_id: string },
>(
  data: T[],
  totalCount = data.length,
) => ({ data, totalCount })

const openSession = async () => {
  fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
  fetchOpenRouterWorkspaces.mockResolvedValue(workspacePage([workspace()]))
  return await openRouterAccountKeyResources.open({
    account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
    request: REQUEST,
  })
}

describe("openRouterAccountKeyResources", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("opens a session with the accepted default workspace locator", async () => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValue(workspacePage([workspace()]))

    const session = await openRouterAccountKeyResources.open({
      account: {
        id: "account-example",
        siteType: SITE_TYPES.OPENROUTER,
      },
      request: REQUEST,
    })

    await expect(session.resolveDefaultScope()).resolves.toEqual({
      scopeKey: "workspace-default-id",
      routeKey: "default",
      displayName: "Default workspace",
      isDefault: true,
    })
  })

  it("fails opening the session when the accepted default locator fails", async () => {
    fetchOpenRouterDefaultWorkspace.mockRejectedValue(
      new ApiError("default unavailable", 404),
    )

    await expect(
      openRouterAccountKeyResources.open({
        account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
        request: REQUEST,
      }),
    ).rejects.toMatchObject({ failure: { code: "not_found" } })
    expect(fetchOpenRouterWorkspaces).not.toHaveBeenCalled()
  })

  it("deduplicates paged workspace inventory and sorts the default first", async () => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValueOnce(
      workspacePage([
        workspace({ id: "workspace-z", name: "Zulu", slug: "zulu" }),
        workspace(),
      ]),
    )

    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })

    await expect(session.listScopes()).resolves.toEqual([
      expect.objectContaining({
        scopeKey: "workspace-default-id",
        isDefault: true,
      }),
      expect.objectContaining({ scopeKey: "workspace-z", displayName: "Zulu" }),
    ])
    expect(fetchOpenRouterWorkspaces).toHaveBeenCalledWith(expect.anything(), {
      offset: 0,
      limit: 100,
    })
  })

  it("drains a stable workspace total before deduplicating equivalent identities", async () => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      workspace({
        id: `workspace-${index}`,
        name: `Workspace ${String(index).padStart(3, "0")}`,
        slug: `workspace-${index}`,
      }),
    )
    fetchOpenRouterWorkspaces
      .mockResolvedValueOnce(workspacePage(firstPage, 101))
      .mockResolvedValueOnce(
        workspacePage(
          [
            firstPage[99],
            workspace({
              id: "workspace-extra",
              name: "Extra",
              slug: "extra",
            }),
          ],
          101,
        ),
      )
    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })

    const scopes = await session.listScopes()
    expect(scopes).toHaveLength(102)
    expect(scopes[0]).toMatchObject({
      scopeKey: "workspace-default-id",
      isDefault: true,
    })
    expect(
      scopes.filter((scope) => scope.scopeKey === "workspace-99"),
    ).toHaveLength(1)
    expect(fetchOpenRouterWorkspaces).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { offset: 100, limit: 100 },
    )
  })

  it.each([
    ["a premature short page", workspacePage([workspace()], 2)],
    ["a premature empty page", workspacePage([], 1)],
  ])("fails workspace inventory closed for %s", async (_name, page) => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValueOnce(page)

    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })

    await expect(session.listScopes()).resolves.toEqual([
      expect.objectContaining({
        scopeKey: "workspace-default-id",
      }),
    ])
    expect(fetchOpenRouterWorkspaces).toHaveBeenCalledTimes(1)
  })

  it("rejects changing workspace totals across pages", async () => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      workspace({ id: `workspace-${index}`, slug: `workspace-${index}` }),
    )
    fetchOpenRouterWorkspaces
      .mockResolvedValueOnce(workspacePage(firstPage, 101))
      .mockResolvedValueOnce(
        workspacePage(
          [workspace({ id: "workspace-extra", slug: "workspace-extra" })],
          102,
        ),
      )

    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })

    await expect(session.listScopes()).resolves.toEqual([
      expect.objectContaining({
        scopeKey: "workspace-default-id",
      }),
    ])
  })

  it("rejects conflicting duplicate workspace identities", async () => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValueOnce(
      workspacePage(
        [workspace(), workspace({ name: "Conflicting workspace" })],
        1,
      ),
    )

    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })

    await expect(session.listScopes()).resolves.toEqual([
      expect.objectContaining({
        scopeKey: "workspace-default-id",
      }),
    ])
  })

  it("rejects an inventory workspace that conflicts with the resolved default", async () => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValueOnce(
      workspacePage([workspace({ name: "Conflicting default" })]),
    )

    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })

    await expect(session.listScopes()).resolves.toEqual([
      expect.objectContaining({
        scopeKey: "workspace-default-id",
      }),
    ])
  })

  it("keeps the accepted default workspace when inventory loading fails", async () => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockRejectedValue(
      new Error("inventory unavailable"),
    )
    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })

    await expect((session as any).listScopeInventory()).resolves.toEqual({
      scopes: [
        expect.objectContaining({
          scopeKey: "workspace-default-id",
        }),
      ],
      partialFailure: expect.objectContaining({
        code: "unexpected",
      }),
    })
    await expect(session.listScopes()).resolves.toEqual([
      expect.objectContaining({ scopeKey: "workspace-default-id" }),
    ])
    expect((await session.listScopes())[0]).not.toHaveProperty(
      "secondaryLabel",
      "Workspace inventory unavailable",
    )
  })

  it("propagates an aborted workspace inventory read instead of returning a partial inventory", async () => {
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    )
    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })

    await expect((session as any).listScopeInventory()).rejects.toMatchObject({
      failure: { code: "aborted" },
    })
  })

  it("propagates an aborted signal instead of treating it as inventory fallback", async () => {
    const controller = new AbortController()
    controller.abort()
    fetchOpenRouterDefaultWorkspace.mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    )

    await expect(
      openRouterAccountKeyResources.open(
        {
          account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
          request: REQUEST,
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ failure: { code: "aborted" } })
  })

  it("lists disabled keys with an opaque offset cursor and rejects duplicate hashes", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKeys
      .mockResolvedValueOnce(
        Array.from({ length: 101 }, (_, index) =>
          key({ hash: `hash-${index}`, disabled: index === 0 }),
        ),
      )
      .mockResolvedValueOnce([])

    const first = await collection.list()
    expect(fetchOpenRouterKeys).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includeDisabled: true, offset: 0 }),
    )
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(first.nextCursor).not.toContain("hash-0")
    expect(first.items[0].searchValues).not.toContain("hash-0")
    expect(first.items[0].searchValues).toContain("disabled")
    expect(first.items[0].fields.map((field) => field.fieldId)).toContain(
      OPENROUTER_KEY_FIELD_IDS.Usage,
    )

    fetchOpenRouterKeys.mockReset().mockResolvedValue([key(), key()])
    await expect(collection.list()).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })
  })

  it("rejects duplicate hashes across provider batches", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKeys
      .mockResolvedValueOnce(
        Array.from({ length: 100 }, (_, index) =>
          key({ hash: `hash-${index}`, disabled: index === 0 }),
        ),
      )
      .mockResolvedValueOnce([key({ hash: "hash-0" })])

    await expect(collection.list()).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })
  })

  it("drains provider batches by their actual length before public pagination", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKeys.mockImplementation(
      async (_request, input: { offset?: number }) => {
        if (input.offset === 0) {
          return [key({ hash: "hash-0" }), key({ hash: "hash-1" })]
        }
        if (input.offset === 2) {
          return [key({ hash: "hash-2" }), key({ hash: "hash-3" })]
        }
        if (input.offset === 4) return []
        throw new Error(`unexpected provider offset ${input.offset}`)
      },
    )

    const first = await collection.list({ limit: 3 })
    const second = await collection.list({
      limit: 3,
      cursor: first.nextCursor,
    })

    expect(first.items).toHaveLength(3)
    expect(second.items).toHaveLength(1)
    expect(
      [first, second].flatMap((page) =>
        page.items.map((item) => item.ref.resourceId),
      ),
    ).toEqual(Array.from({ length: 4 }, (_, index) => `hash-${index}`))
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(second.nextCursor).toBeUndefined()
    expect(fetchOpenRouterKeys).toHaveBeenCalledTimes(3)
    expect(fetchOpenRouterKeys).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ offset: 0 }),
    )
    expect(fetchOpenRouterKeys).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ offset: 2 }),
    )
    expect(fetchOpenRouterKeys).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      expect.objectContaining({ offset: 4 }),
    )
  })

  it("stops provider pagination once it has enough rows to issue a cursor", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKeys.mockResolvedValue(
      Array.from({ length: 4 }, (_, index) => key({ hash: `hash-${index}` })),
    )

    const page = await collection.list({ limit: 3 })

    expect(page.items).toHaveLength(3)
    expect(page.nextCursor).toEqual(expect.any(String))
    expect(fetchOpenRouterKeys).toHaveBeenCalledOnce()
  })

  it("rejects a forged non-progress cursor before another provider request", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")

    await expect(
      collection.list({ cursor: "or-key:999:0" }),
    ).rejects.toMatchObject({ failure: { code: "unexpected" } })
    expect(fetchOpenRouterKeys).not.toHaveBeenCalled()
  })

  it("rejects a cursor in another workspace without consuming its original chain", async () => {
    const selectedWorkspace = workspace({
      id: "workspace-selected-id",
      name: "Selected workspace",
      slug: "selected",
    })
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValue(
      workspacePage([workspace(), selectedWorkspace]),
    )
    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })
    const defaultCollection = await session.openCollection(
      "workspace-default-id",
    )
    const selectedCollection = await session.openCollection(
      "workspace-selected-id",
    )
    fetchOpenRouterKeys
      .mockResolvedValueOnce(
        Array.from({ length: 101 }, (_, index) =>
          key({ hash: `default-hash-${index}` }),
        ),
      )
      .mockResolvedValueOnce([])

    const first = await defaultCollection.list()
    await expect(
      selectedCollection.list({ cursor: first.nextCursor }),
    ).rejects.toMatchObject({ failure: { code: "unexpected" } })
    await expect(
      defaultCollection.list({ cursor: first.nextCursor }),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          ref: expect.objectContaining({ resourceId: "default-hash-100" }),
        }),
      ],
    })
    expect(fetchOpenRouterKeys).toHaveBeenCalledTimes(2)
    expect(fetchOpenRouterKeys).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        workspaceId: "workspace-default-id",
        offset: 101,
      }),
    )
  })

  it("prunes abandoned cursor chains at a bounded capacity", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKeys.mockImplementation(
      async (_request, input: { offset?: number }) =>
        input.offset === 0
          ? Array.from({ length: 101 }, (_, index) =>
              key({ hash: `hash-${index}` }),
            )
          : [],
    )

    const cursors: string[] = []
    for (let index = 0; index < 33; index += 1) {
      const page = await collection.list()
      cursors.push(page.nextCursor!)
    }

    await expect(collection.list({ cursor: cursors[0] })).rejects.toMatchObject(
      { failure: { code: "unexpected" } },
    )
    await expect(collection.list({ cursor: cursors.at(-1) })).resolves.toEqual({
      items: [
        expect.objectContaining({
          ref: expect.objectContaining({ resourceId: "hash-100" }),
        }),
      ],
    })
  })

  it("bounds each public page when the provider keeps returning full batches", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKeys.mockImplementation(
      async (_request, input: { offset?: number }) =>
        Array.from({ length: 100 }, (_, index) =>
          key({ hash: `hash-${(input.offset ?? 0) + index}` }),
        ),
    )

    await expect(collection.list()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          ref: expect.objectContaining({ resourceId: "hash-0" }),
        }),
      ]),
      nextCursor: expect.any(String),
    })
    expect(fetchOpenRouterKeys).toHaveBeenCalledTimes(2)
  })

  it("uses the selected non-default collection scope in read-only edit workspace options", async () => {
    const selectedWorkspace = workspace({
      id: "workspace-selected-id",
      name: "Selected workspace",
      slug: "selected",
    })
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValue(
      workspacePage([workspace(), selectedWorkspace]),
    )
    fetchOpenRouterKey.mockResolvedValue(
      key({ workspace_id: "workspace-selected-id" }),
    )
    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })
    const collection = await session.openCollection("workspace-selected-id")
    const editor = await collection.openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-selected-id",
      resourceId: "opaque-hash-example",
    })
    const workspaceField = editor.fields.find(
      (field) => field.fieldId === OPENROUTER_KEY_FIELD_IDS.Workspace,
    )

    expect(workspaceField).toMatchObject({
      readOnly: true,
      options: [
        {
          value: "workspace-selected-id",
          displayLabel: "Selected workspace",
        },
      ],
    })
  })

  it("keeps a post-dispatch 499 create uncertain without replaying it", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    createOpenRouterKey.mockRejectedValue(new ApiError("aborted", 499))

    await expect(
      editor.submit({ ...editor.initialValues, name: "Created key" }),
    ).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
    expect(createOpenRouterKey).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["known 4xx", new ApiError("rejected", 400), "upstream_rejected"],
    [
      "authentication",
      new ApiError("unauthorized", 401),
      "authentication_failed",
    ],
    ["permission", new ApiError("forbidden", 403), "permission_denied"],
    ["not found", new ApiError("missing", 404), "not_found"],
    [
      "request timeout",
      new ApiError("timeout", 408),
      "mutation_state_uncertain",
    ],
    ["rate limit", new ApiError("limited", 429), "mutation_state_uncertain"],
    ["network", new TypeError("fetch failed"), "mutation_state_uncertain"],
    ["server failure", new ApiError("failed", 500), "mutation_state_uncertain"],
  ] as const)(
    "classifies a %s create without retrying it",
    async (_name, error, expectedCode) => {
      const session = await openSession()
      const editor = await session.openCreateEditor("workspace-default-id")
      createOpenRouterKey.mockRejectedValue(error)

      await expect(
        editor.submit({ ...editor.initialValues, name: "Created key" }),
      ).rejects.toMatchObject({ failure: { code: expectedCode } })
      expect(createOpenRouterKey).toHaveBeenCalledTimes(1)
    },
  )

  it("fails closed when a mocked create bypasses the validated service contract", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    createOpenRouterKey.mockResolvedValue({ key: key(), plaintextKey: "" })

    await expect(
      editor.submit({ ...editor.initialValues, name: "Created key" }),
    ).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })
    expect(createOpenRouterKey).toHaveBeenCalledTimes(1)
    expect(fetchOpenRouterKeys).not.toHaveBeenCalled()
  })

  it("deduplicates members by native membership ID while submitting provider user IDs", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    fetchOpenRouterWorkspaceMembers.mockResolvedValue(
      memberPage([
        {
          id: "membership-example",
          user_id: "member-example",
          workspace_id: "workspace-default-id",
          role: "member",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "membership-newer-example",
          user_id: "member-example",
          workspace_id: "workspace-default-id",
          role: "admin",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]),
    )

    const options = await editor.loadOptions?.(
      OPENROUTER_KEY_FIELD_IDS.Creator,
      {
        ...editor.initialValues,
        workspace_id: "workspace-default-id",
      },
    )
    expect(options).toEqual([
      {
        value: expect.stringMatching(/^creator-option-/),
        displayLabel: expect.any(String),
        secondaryLabel: "member",
      },
      {
        value: expect.stringMatching(/^creator-option-/),
        displayLabel: expect.any(String),
        secondaryLabel: "admin",
      },
    ])
    expect(JSON.stringify(options)).not.toContain("member-example")

    createOpenRouterKey.mockResolvedValue({
      key: key({ creator_user_id: "member-example" }),
      plaintextKey: "sk-or-example",
    })
    await editor.submit({
      ...editor.initialValues,
      [OPENROUTER_KEY_FIELD_IDS.Name]: "Created key",
      [OPENROUTER_KEY_FIELD_IDS.Creator]: options?.[0]?.value ?? null,
    })
    expect(createOpenRouterKey).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ creatorUserId: "member-example" }),
    )
    expect(JSON.stringify(createOpenRouterKey.mock.calls)).not.toContain(
      "membership-example",
    )
  })

  it("redacts the selected workspace from creator-option failures", async () => {
    const workspaceId = "workspace-default-id"
    const session = await openSession()
    const editor = await session.openCreateEditor(workspaceId)
    fetchOpenRouterWorkspaceMembers.mockRejectedValue(
      new ApiError(`Workspace ${workspaceId} rejected the member request`, 403),
    )

    const error = await editor
      .loadOptions?.(OPENROUTER_KEY_FIELD_IDS.Creator, editor.initialValues)
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      failure: {
        code: "permission_denied",
        message: "Workspace [REDACTED] rejected the member request",
      },
    })
    expect(JSON.stringify(error)).not.toContain(workspaceId)
  })

  it("rejects incomplete and inconsistent member totals", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    fetchOpenRouterWorkspaceMembers.mockResolvedValueOnce(
      memberPage(
        [
          {
            id: "membership-example",
            user_id: "member-example",
            workspace_id: "workspace-default-id",
            role: "member",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        2,
      ),
    )

    await expect(
      editor.loadOptions?.(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      ),
    ).rejects.toMatchObject({ failure: { code: "unexpected" } })

    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      id: `membership-${index}`,
      user_id: `member-${index}`,
      workspace_id: "workspace-default-id",
      role: "member" as const,
      created_at: "2026-01-01T00:00:00Z",
    }))
    fetchOpenRouterWorkspaceMembers
      .mockResolvedValueOnce(memberPage(fullPage, 101))
      .mockResolvedValueOnce(memberPage([], 102))

    await expect(
      editor.loadOptions?.(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      ),
    ).rejects.toMatchObject({ failure: { code: "unexpected" } })
  })

  it("tolerates equivalent member duplicates but rejects conflicting native IDs", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    const member = {
      id: "membership-example",
      user_id: "member-example",
      workspace_id: "workspace-default-id",
      role: "member" as const,
      created_at: "2026-01-01T00:00:00Z",
    }
    fetchOpenRouterWorkspaceMembers.mockResolvedValueOnce(
      memberPage([member, { ...member }], 1),
    )

    await expect(
      editor.loadOptions?.(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      ),
    ).resolves.toHaveLength(1)

    fetchOpenRouterWorkspaceMembers.mockResolvedValueOnce(
      memberPage([member, { ...member, role: "admin" }], 1),
    )
    await expect(
      editor.loadOptions?.(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      ),
    ).rejects.toMatchObject({ failure: { code: "unexpected" } })
  })

  it("fails creator option loading safely instead of exposing a partial page", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    fetchOpenRouterWorkspaceMembers
      .mockResolvedValueOnce(
        memberPage(
          Array.from({ length: 100 }, (_, index) => ({
            id: `membership-${index}`,
            user_id: `member-${index}`,
            workspace_id: "workspace-default-id",
            role: "member" as const,
            created_at: "2026-01-01T00:00:00Z",
          })),
          101,
        ),
      )
      .mockRejectedValueOnce(new ApiError("member page unavailable", 503))

    await expect(
      editor.loadOptions?.(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      ),
    ).rejects.toMatchObject({ failure: { code: "unavailable" } })
  })

  it("drains members and reloads creator choices after workspace selection changes", async () => {
    const selectedWorkspace = workspace({
      id: "workspace-selected-id",
      name: "Selected workspace",
      slug: "selected",
    })
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValue(
      workspacePage([workspace(), selectedWorkspace]),
    )
    const defaultMembers = Array.from({ length: 100 }, (_, index) => ({
      id: `membership-${index}`,
      user_id: `member-${index}`,
      workspace_id: "workspace-default-id",
      role: "member" as const,
      created_at: "2026-01-01T00:00:00Z",
    }))
    fetchOpenRouterWorkspaceMembers
      .mockResolvedValueOnce(memberPage(defaultMembers))
      .mockResolvedValueOnce(
        memberPage([
          {
            id: "membership-selected",
            user_id: "member-selected",
            workspace_id: "workspace-selected-id",
            role: "admin",
            created_at: "2026-01-01T00:00:00Z",
          },
        ]),
      )
    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })
    const editor = await session.openCreateEditor("workspace-default-id")

    await expect(
      editor.loadOptions?.(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      ),
    ).resolves.toHaveLength(100)
    const selectedOptions = await editor.loadOptions?.(
      OPENROUTER_KEY_FIELD_IDS.Creator,
      {
        ...editor.initialValues,
        [OPENROUTER_KEY_FIELD_IDS.Workspace]: "workspace-selected-id",
      },
    )
    expect(selectedOptions).toEqual([
      {
        value: expect.stringMatching(/^creator-option-/),
        displayLabel: expect.any(String),
        secondaryLabel: "admin",
      },
    ])
    expect(JSON.stringify(selectedOptions)).not.toContain("member-selected")
    expect(fetchOpenRouterWorkspaceMembers).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "workspace-selected-id",
      { offset: 0, limit: 100 },
    )
  })

  it("rejects an account, site, or scope-mismatched ref before provider access", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "other-account",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }

    await expect(collection.get(ref)).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    await expect(
      collection.get({
        ...ref,
        accountId: "account-example",
        siteType: SITE_TYPES.NEW_API,
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    await expect(
      collection.get({
        ...ref,
        accountId: "account-example",
        scopeKey: "other-workspace",
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    await expect(
      session.openCollection("unknown-workspace"),
    ).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    expect(fetchOpenRouterKey).not.toHaveBeenCalled()
  })

  it("rejects malformed and previously consumed public cursors", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKeys
      .mockResolvedValueOnce(
        Array.from({ length: 101 }, (_, index) =>
          key({ hash: `hash-${index}` }),
        ),
      )
      .mockResolvedValueOnce([])
    const page = await collection.list()

    await expect(
      collection.list({ cursor: "offset:100" }),
    ).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })
    await collection.list({ cursor: page.nextCursor })
    await expect(
      collection.list({ cursor: page.nextCursor }),
    ).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })
  })

  it("creates a documented key payload and returns its one-time secret", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    createOpenRouterKey.mockResolvedValue({
      key: key({ name: "Created key", limit: 0, limit_remaining: 0 }),
      plaintextKey: "sk-or-created-example",
    })

    const result = await editor.submit({
      ...editor.initialValues,
      name: "Created key",
      limit_mode: "limited",
      limit: 0,
      limit_reset: "weekly",
      expires_at: "2030-01-01T00:00",
      include_byok_in_limit: true,
    })

    expect(createOpenRouterKey).toHaveBeenCalledTimes(1)
    expect(createOpenRouterKey).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Created key",
        limit: 0,
        limitReset: "weekly",
        includeByokInLimit: true,
        workspaceId: "workspace-default-id",
      }),
    )
    expect(result.createdSecret).toMatchObject({
      secret: "sk-or-created-example",
      secretAvailability: "create-response-only",
      correlation: { kind: "account-key-resource" },
    })
    expect(fetchOpenRouterKeys).not.toHaveBeenCalled()
  })

  it("returns the one-time secret in the selected destination workspace", async () => {
    const selectedWorkspace = workspace({
      id: "workspace-selected-id",
      name: "Selected workspace",
      slug: "selected",
    })
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces.mockResolvedValue(
      workspacePage([workspace(), selectedWorkspace]),
    )
    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })
    const editor = await session.openCreateEditor("workspace-default-id")
    createOpenRouterKey.mockResolvedValue({
      key: key({
        hash: "selected-key-hash",
        name: "Selected workspace key",
        workspace_id: "workspace-selected-id",
      }),
      plaintextKey: "sk-or-selected-example",
    })

    const result = await editor.submit({
      ...editor.initialValues,
      [OPENROUTER_KEY_FIELD_IDS.Name]: "Selected workspace key",
      [OPENROUTER_KEY_FIELD_IDS.Workspace]: "workspace-selected-id",
    })

    expect(createOpenRouterKey).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: "workspace-selected-id" }),
    )
    expect(result.facts.ref).toEqual({
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-selected-id",
      resourceId: "selected-key-hash",
    })
    expect(result.facts.fields).toContainEqual(
      expect.objectContaining({
        fieldId: OPENROUTER_KEY_FIELD_IDS.Workspace,
        value: "Selected workspace",
      }),
    )
    expect(result.createdSecret).toMatchObject({
      secret: "sk-or-selected-example",
      correlation: {
        kind: "account-key-resource",
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.OPENROUTER,
          scopeKey: "workspace-selected-id",
          resourceId: "selected-key-hash",
        },
      },
    })
  })

  it("keeps create destinations aligned with the cached partial scope inventory", async () => {
    const selectedWorkspace = workspace({
      id: "workspace-selected-id",
      name: "Selected workspace",
      slug: "selected",
    })
    fetchOpenRouterDefaultWorkspace.mockResolvedValue(workspace())
    fetchOpenRouterWorkspaces
      .mockRejectedValueOnce(new Error("initial inventory unavailable"))
      .mockResolvedValueOnce(workspacePage([workspace(), selectedWorkspace]))
    const session = await openRouterAccountKeyResources.open({
      account: { id: "account-example", siteType: SITE_TYPES.OPENROUTER },
      request: REQUEST,
    })
    const editor = await session.openCreateEditor("workspace-default-id")
    const workspaceField = editor.fields.find(
      (field) => field.fieldId === OPENROUTER_KEY_FIELD_IDS.Workspace,
    )
    createOpenRouterKey.mockResolvedValue({
      key: key({
        hash: "selected-key-hash",
        name: "Selected workspace key",
        workspace_id: "workspace-selected-id",
      }),
      plaintextKey: "sk-or-selected-example",
    })

    expect(workspaceField).toMatchObject({
      options: [expect.objectContaining({ value: "workspace-default-id" })],
    })
    await expect(
      editor.submit({
        ...editor.initialValues,
        [OPENROUTER_KEY_FIELD_IDS.Name]: "Selected workspace key",
        [OPENROUTER_KEY_FIELD_IDS.Workspace]: "workspace-selected-id",
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(createOpenRouterKey).not.toHaveBeenCalled()
  })

  it("preserves the one-time secret when the created key reports another workspace", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    createOpenRouterKey.mockResolvedValue({
      key: key({
        hash: "created-in-provider-workspace",
        name: "Created key",
        workspace_id: "workspace-provider-result",
      }),
      plaintextKey: "sk-or-created-example",
    })

    await expect(
      editor.submit({ ...editor.initialValues, name: "Created key" }),
    ).resolves.toMatchObject({
      facts: {
        ref: {
          scopeKey: "workspace-provider-result",
          resourceId: "created-in-provider-workspace",
        },
        fields: expect.arrayContaining([
          expect.objectContaining({
            fieldId: OPENROUTER_KEY_FIELD_IDS.Workspace,
            value: "keyManagement:openRouter.editor.options.workspace.unknown",
          }),
        ]),
      },
      createdSecret: {
        secret: "sk-or-created-example",
        correlation: {
          ref: {
            scopeKey: "workspace-provider-result",
            resourceId: "created-in-provider-workspace",
          },
        },
      },
    })
  })

  it("serializes unlimited and limited create payloads exactly", async () => {
    const session = await openSession()
    const unlimitedEditor = await session.openCreateEditor(
      "workspace-default-id",
    )
    createOpenRouterKey
      .mockResolvedValueOnce({
        key: key({ name: "Unlimited key" }),
        plaintextKey: "sk-or-unlimited-example",
      })
      .mockResolvedValueOnce({
        key: key({
          name: "Limited key",
          limit: 0,
          limit_reset: "weekly",
          creator_user_id: "member-example",
          expires_at: "2030-01-01T00:00:00.000Z",
        }),
        plaintextKey: "sk-or-limited-example",
      })

    await unlimitedEditor.submit({
      ...unlimitedEditor.initialValues,
      [OPENROUTER_KEY_FIELD_IDS.Name]: "Unlimited key",
      [OPENROUTER_KEY_FIELD_IDS.LimitMode]:
        OPENROUTER_KEY_LIMIT_MODES.Unlimited,
      [OPENROUTER_KEY_FIELD_IDS.Limit]: 0,
      [OPENROUTER_KEY_FIELD_IDS.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.None,
      [OPENROUTER_KEY_FIELD_IDS.ExpiresAt]: "",
      [OPENROUTER_KEY_FIELD_IDS.Creator]: null,
    })

    const limitedEditor = await session.openCreateEditor("workspace-default-id")
    fetchOpenRouterWorkspaceMembers.mockResolvedValue(
      memberPage([
        {
          id: "membership-example",
          user_id: "member-example",
          workspace_id: "workspace-default-id",
          role: "member",
          created_at: "2026-01-01T00:00:00Z",
        },
      ]),
    )
    const creatorOptions = await limitedEditor.loadOptions?.(
      OPENROUTER_KEY_FIELD_IDS.Creator,
      limitedEditor.initialValues,
    )
    const creatorOptionValue = creatorOptions?.[0]?.value ?? ""
    expect(creatorOptionValue).toMatch(/^creator-option-/)
    expect(JSON.stringify(creatorOptions)).not.toContain("member-example")
    const localExpiry = "2030-01-01T00:00:00"
    await limitedEditor.submit({
      ...limitedEditor.initialValues,
      [OPENROUTER_KEY_FIELD_IDS.Name]: "Limited key",
      [OPENROUTER_KEY_FIELD_IDS.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
      [OPENROUTER_KEY_FIELD_IDS.Limit]: 0,
      [OPENROUTER_KEY_FIELD_IDS.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.Weekly,
      [OPENROUTER_KEY_FIELD_IDS.ExpiresAt]: localExpiry,
      [OPENROUTER_KEY_FIELD_IDS.Creator]: creatorOptionValue,
      [OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit]: true,
    })

    expect(createOpenRouterKey).toHaveBeenNthCalledWith(1, expect.anything(), {
      name: "Unlimited key",
      limit: null,
      limitReset: null,
      includeByokInLimit: false,
      expiresAt: null,
      workspaceId: "workspace-default-id",
      creatorUserId: null,
    })
    expect(createOpenRouterKey).toHaveBeenNthCalledWith(2, expect.anything(), {
      name: "Limited key",
      limit: 0,
      limitReset: "weekly",
      includeByokInLimit: true,
      expiresAt: new Date(localExpiry).toISOString(),
      workspaceId: "workspace-default-id",
      creatorUserId: "member-example",
    })
  })

  it("projects safe creator display for details and search without exposing the raw member ID", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKeys
      .mockResolvedValueOnce([
        key({
          limit: 0,
          limit_remaining: 0,
          limit_reset: "daily",
          include_byok_in_limit: true,
          usage: 1,
          usage_daily: 2,
          usage_weekly: 3,
          usage_monthly: 4,
          byok_usage: 5,
          byok_usage_daily: 6,
          byok_usage_weekly: 7,
          byok_usage_monthly: 8,
          updated_at: "2026-01-02T00:00:00Z",
          expires_at: "2030-01-01T00:00:00Z",
          creator_user_id: "member-example",
        }),
      ])
      .mockResolvedValueOnce([])

    const [facts] = (await collection.list()).items
    const fields = new Map(facts.fields.map((field) => [field.fieldId, field]))
    const safeFieldIds = Object.values(OPENROUTER_KEY_FIELD_IDS)
    expect([...fields.keys()]).toEqual(expect.arrayContaining(safeFieldIds))
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.Limit)).toMatchObject({
      kind: "number",
      value: 0,
    })
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.LimitMode)).toMatchObject({
      value: "limited",
    })
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.Creator)).toEqual({
      fieldId: OPENROUTER_KEY_FIELD_IDS.Creator,
      kind: "text",
      value: "keyManagement:openRouter.editor.options.creator.unknown",
    })
    expect(JSON.stringify(facts)).not.toContain("member-example")
    expect(facts.searchValues).toContain(
      "keyManagement:openRouter.editor.options.creator.unknown",
    )
    expect(facts.searchValues).toEqual(
      expect.not.arrayContaining([
        "opaque-hash-example",
        "workspace-default-id",
        "member-example",
        "management-key",
      ]),
    )
  })

  it("describes create-only and read-only documented fields without adding disabled to create", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const createEditor = await session.openCreateEditor("workspace-default-id")
    fetchOpenRouterKey.mockResolvedValue(
      key({ creator_user_id: "member-example" }),
    )
    const editEditor = await collection.openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    })
    const createIds = createEditor.fields.map((field) => field.fieldId)
    const editFields = new Map(
      editEditor.fields.map((field) => [field.fieldId, field]),
    )

    expect(createIds).toEqual(
      expect.arrayContaining([
        OPENROUTER_KEY_FIELD_IDS.Name,
        OPENROUTER_KEY_FIELD_IDS.Workspace,
        OPENROUTER_KEY_FIELD_IDS.Creator,
        OPENROUTER_KEY_FIELD_IDS.Limit,
        OPENROUTER_KEY_FIELD_IDS.LimitReset,
        OPENROUTER_KEY_FIELD_IDS.ExpiresAt,
        OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit,
      ]),
    )
    expect(createIds).not.toContain(OPENROUTER_KEY_FIELD_IDS.Disabled)
    for (const fieldId of [
      OPENROUTER_KEY_FIELD_IDS.Workspace,
      OPENROUTER_KEY_FIELD_IDS.Creator,
      OPENROUTER_KEY_FIELD_IDS.ExpiresAt,
    ]) {
      expect(editFields.get(fieldId)).toMatchObject({ readOnly: true })
    }
  })

  it("classifies every create and edit descriptor with field dependencies", async () => {
    const session = await openSession()
    const createEditor = await session.openCreateEditor("workspace-default-id")
    const fields = new Map(
      createEditor.fields.map((field) => [field.fieldId, field]),
    )

    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.Name)).toMatchObject({
      type: "text",
      required: true,
    })
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.Workspace)).toMatchObject({
      type: "select",
      required: true,
      options: [
        {
          value: "workspace-default-id",
          displayLabel: "Default workspace",
        },
      ],
    })
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.Creator)).toMatchObject({
      type: "select",
      nullable: true,
      options: [],
      optionLoader: { dependsOn: [OPENROUTER_KEY_FIELD_IDS.Workspace] },
    })
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.LimitMode)).toMatchObject({
      type: "select",
      required: true,
      options: [
        { value: OPENROUTER_KEY_LIMIT_MODES.Unlimited },
        { value: OPENROUTER_KEY_LIMIT_MODES.Limited },
      ],
    })
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.Limit)).toMatchObject({
      type: "number",
      nullable: true,
      min: 0,
    })
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.LimitReset)).toMatchObject({
      type: "select",
      required: true,
      options: [
        { value: OPENROUTER_KEY_LIMIT_RESETS.None },
        { value: OPENROUTER_KEY_LIMIT_RESETS.Daily },
        { value: OPENROUTER_KEY_LIMIT_RESETS.Weekly },
        { value: OPENROUTER_KEY_LIMIT_RESETS.Monthly },
      ],
    })
    expect(fields.get(OPENROUTER_KEY_FIELD_IDS.ExpiresAt)).toMatchObject({
      type: "date-time",
      nullable: true,
    })
    expect(
      fields.get(OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit),
    ).toMatchObject({
      type: "boolean",
    })

    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKey.mockResolvedValue(
      key({ creator_user_id: "member-example" }),
    )
    const editEditor = await collection.openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    })
    const editFields = new Map(
      editEditor.fields.map((field) => [field.fieldId, field]),
    )

    expect([...editFields.keys()]).toEqual([
      OPENROUTER_KEY_FIELD_IDS.Name,
      OPENROUTER_KEY_FIELD_IDS.Workspace,
      OPENROUTER_KEY_FIELD_IDS.Creator,
      OPENROUTER_KEY_FIELD_IDS.LimitMode,
      OPENROUTER_KEY_FIELD_IDS.Limit,
      OPENROUTER_KEY_FIELD_IDS.LimitReset,
      OPENROUTER_KEY_FIELD_IDS.ExpiresAt,
      OPENROUTER_KEY_FIELD_IDS.Disabled,
      OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit,
    ])
    expect(editFields.get(OPENROUTER_KEY_FIELD_IDS.Name)).toMatchObject({
      type: "text",
      required: true,
    })
    expect(editFields.get(OPENROUTER_KEY_FIELD_IDS.Workspace)).toMatchObject({
      type: "select",
      readOnly: true,
    })
    expect(editFields.get(OPENROUTER_KEY_FIELD_IDS.Creator)).toMatchObject({
      type: "select",
      nullable: true,
      readOnly: true,
    })
    expect(JSON.stringify(editEditor)).not.toContain("member-example")
    expect(editFields.get(OPENROUTER_KEY_FIELD_IDS.LimitMode)).toMatchObject({
      type: "select",
      required: true,
    })
    expect(editFields.get(OPENROUTER_KEY_FIELD_IDS.Limit)).toMatchObject({
      type: "number",
      nullable: true,
      min: 0,
    })
    expect(editFields.get(OPENROUTER_KEY_FIELD_IDS.LimitReset)).toMatchObject({
      type: "select",
      required: true,
    })
    expect(editFields.get(OPENROUTER_KEY_FIELD_IDS.ExpiresAt)).toMatchObject({
      type: "date-time",
      nullable: true,
      readOnly: true,
    })
    expect(editFields.get(OPENROUTER_KEY_FIELD_IDS.Disabled)).toMatchObject({
      type: "boolean",
    })
    expect(
      editFields.get(OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit),
    ).toMatchObject({
      type: "boolean",
    })
  })

  it("reports every invalid documented create and edit field before mutation", async () => {
    const session = await openSession()
    const createEditor = await session.openCreateEditor("workspace-default-id")
    const invalidCreate = createEditor.validate({
      ...createEditor.initialValues,
      [OPENROUTER_KEY_FIELD_IDS.Name]: " ",
      [OPENROUTER_KEY_FIELD_IDS.Workspace]: "workspace-unknown",
      [OPENROUTER_KEY_FIELD_IDS.Creator]: "creator-unknown",
      [OPENROUTER_KEY_FIELD_IDS.LimitMode]: "provider-unknown",
      [OPENROUTER_KEY_FIELD_IDS.LimitReset]: "provider-unknown",
      [OPENROUTER_KEY_FIELD_IDS.ExpiresAt]: "not-a-date",
      [OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit]: "yes",
    })

    expect(invalidCreate).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(
        [
          OPENROUTER_KEY_FIELD_IDS.Name,
          OPENROUTER_KEY_FIELD_IDS.Workspace,
          OPENROUTER_KEY_FIELD_IDS.Creator,
          OPENROUTER_KEY_FIELD_IDS.LimitMode,
          OPENROUTER_KEY_FIELD_IDS.LimitReset,
          OPENROUTER_KEY_FIELD_IDS.ExpiresAt,
          OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit,
        ].map((fieldId) => expect.objectContaining({ fieldId })),
      ),
    })
    expect(
      createEditor.validate({
        ...createEditor.initialValues,
        [OPENROUTER_KEY_FIELD_IDS.Name]: "Limited key",
        [OPENROUTER_KEY_FIELD_IDS.LimitMode]:
          OPENROUTER_KEY_LIMIT_MODES.Limited,
        [OPENROUTER_KEY_FIELD_IDS.Limit]: -1,
      }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ fieldId: OPENROUTER_KEY_FIELD_IDS.Limit }),
      ]),
    })

    fetchOpenRouterKey.mockResolvedValue(key())
    const collection = await session.openCollection("workspace-default-id")
    const editEditor = await collection.openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    })
    const invalidEdit = editEditor.validate({
      ...editEditor.initialValues,
      [OPENROUTER_KEY_FIELD_IDS.Name]: " ",
      [OPENROUTER_KEY_FIELD_IDS.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
      [OPENROUTER_KEY_FIELD_IDS.Limit]: -1,
      [OPENROUTER_KEY_FIELD_IDS.LimitReset]: "provider-unknown",
      [OPENROUTER_KEY_FIELD_IDS.Disabled]: "no",
      [OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit]: "yes",
    })

    expect(invalidEdit).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(
        [
          OPENROUTER_KEY_FIELD_IDS.Name,
          OPENROUTER_KEY_FIELD_IDS.Limit,
          OPENROUTER_KEY_FIELD_IDS.LimitReset,
          OPENROUTER_KEY_FIELD_IDS.Disabled,
          OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit,
        ].map((fieldId) => expect.objectContaining({ fieldId })),
      ),
    })
    expect(createOpenRouterKey).not.toHaveBeenCalled()
    expect(updateOpenRouterKey).not.toHaveBeenCalled()
  })

  it("patches only changed documented mutable fields", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    fetchOpenRouterKey.mockResolvedValue(key())
    updateOpenRouterKey.mockResolvedValue(
      key({ name: "Renamed", disabled: true }),
    )
    const editor = await collection.openEditEditor(ref)

    await editor.submit({
      ...editor.initialValues,
      name: "Renamed",
      disabled: true,
    })

    expect(updateOpenRouterKey).toHaveBeenCalledTimes(1)
    expect(updateOpenRouterKey).toHaveBeenCalledWith(
      expect.anything(),
      "opaque-hash-example",
      { name: "Renamed", disabled: true },
    )
  })

  it("patches limit, reset, and BYOK transitions without read-only fields", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    const initialKey = key()
    const limitedKey = key({
      limit: 0,
      limit_reset: "weekly",
      include_byok_in_limit: true,
    })
    fetchOpenRouterKey
      .mockResolvedValueOnce(initialKey)
      .mockResolvedValueOnce(initialKey)
      .mockResolvedValueOnce(limitedKey)
      .mockResolvedValueOnce(limitedKey)
    updateOpenRouterKey
      .mockResolvedValueOnce(limitedKey)
      .mockResolvedValueOnce(initialKey)

    const limitedEditor = await collection.openEditEditor(ref)
    await limitedEditor.submit({
      ...limitedEditor.initialValues,
      [OPENROUTER_KEY_FIELD_IDS.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
      [OPENROUTER_KEY_FIELD_IDS.Limit]: 0,
      [OPENROUTER_KEY_FIELD_IDS.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.Weekly,
      [OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit]: true,
    })

    const unlimitedEditor = await collection.openEditEditor(ref)
    await unlimitedEditor.submit({
      ...unlimitedEditor.initialValues,
      [OPENROUTER_KEY_FIELD_IDS.LimitMode]:
        OPENROUTER_KEY_LIMIT_MODES.Unlimited,
      [OPENROUTER_KEY_FIELD_IDS.Limit]: null,
      [OPENROUTER_KEY_FIELD_IDS.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.None,
      [OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit]: false,
    })

    expect(updateOpenRouterKey).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "opaque-hash-example",
      { limit: 0, limitReset: "weekly", includeByokInLimit: true },
    )
    expect(updateOpenRouterKey).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "opaque-hash-example",
      { limit: null, limitReset: null, includeByokInLimit: false },
    )
  })

  it("redacts hashes and management credentials from provider failures", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    fetchOpenRouterKey.mockRejectedValue(
      new ApiError("management-key opaque-hash-example failed", 403),
    )

    await expect(collection.get(ref)).rejects.toMatchObject({
      failure: {
        code: "permission_denied",
        message: "[REDACTED] [REDACTED] failed",
      },
    })
  })

  it("reconciles an uncertain update with exactly one matching read", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    fetchOpenRouterKey
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(key({ name: "Recovered" }))
    updateOpenRouterKey.mockRejectedValue(new TypeError("fetch failed"))
    const editor = await collection.openEditEditor(ref)

    await expect(
      editor.submit({ ...editor.initialValues, name: "Recovered" }),
    ).resolves.toMatchObject({
      facts: { displayName: "Recovered" },
    })
    expect(updateOpenRouterKey).toHaveBeenCalledTimes(1)
    expect(fetchOpenRouterKey).toHaveBeenCalledTimes(3)
  })

  it("keeps an uncertain update observable but unresolved when reconciliation differs", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    fetchOpenRouterKey
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(key({ name: "Different result" }))
    updateOpenRouterKey.mockRejectedValue(new TypeError("fetch failed"))
    const editor = await collection.openEditEditor(ref)

    await expect(
      editor.submit({ ...editor.initialValues, name: "Requested result" }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
    expect(updateOpenRouterKey).toHaveBeenCalledTimes(1)
    expect(fetchOpenRouterKey).toHaveBeenCalledTimes(3)
  })

  it.each(["create", "update", "delete"] as const)(
    "never replays an abort-like %s mutation",
    async (operation) => {
      const session = await openSession()
      const collection = await session.openCollection("workspace-default-id")
      const ref = {
        accountId: "account-example",
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "workspace-default-id",
        resourceId: "opaque-hash-example",
      }
      const abortError = new ApiError("aborted", 499)

      if (operation === "create") {
        const editor = await session.openCreateEditor("workspace-default-id")
        createOpenRouterKey.mockRejectedValue(abortError)
        await expect(
          editor.submit({ ...editor.initialValues, name: "Created key" }),
        ).rejects.toMatchObject({
          failure: { code: "mutation_state_uncertain" },
        })
        expect(createOpenRouterKey).toHaveBeenCalledTimes(1)
        return
      }

      fetchOpenRouterKey
        .mockResolvedValueOnce(key())
        .mockResolvedValueOnce(key())
        .mockResolvedValueOnce(key())
      if (operation === "update") {
        updateOpenRouterKey.mockRejectedValue(abortError)
        const editor = await collection.openEditEditor(ref)
        await expect(
          editor.submit({ ...editor.initialValues, name: "Changed" }),
        ).rejects.toMatchObject({
          failure: { code: "mutation_state_uncertain" },
        })
        expect(updateOpenRouterKey).toHaveBeenCalledTimes(1)
        expect(fetchOpenRouterKey).toHaveBeenCalledTimes(2)
        return
      }

      deleteOpenRouterKey.mockRejectedValue(abortError)
      await expect(collection.delete(ref)).rejects.toMatchObject({
        failure: { code: "mutation_state_uncertain" },
      })
      expect(deleteOpenRouterKey).toHaveBeenCalledTimes(1)
      expect(fetchOpenRouterKey).toHaveBeenCalledTimes(1)
    },
  )

  it.each(["update", "delete"] as const)(
    "stops %s reconciliation after an AbortError",
    async (operation) => {
      const session = await openSession()
      const collection = await session.openCollection("workspace-default-id")
      const ref = {
        accountId: "account-example",
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "workspace-default-id",
        resourceId: "opaque-hash-example",
      }
      const abortError = new DOMException("Aborted", "AbortError")

      if (operation === "update") {
        fetchOpenRouterKey
          .mockResolvedValueOnce(key())
          .mockResolvedValueOnce(key())
        updateOpenRouterKey.mockRejectedValue(abortError)
        const editor = await collection.openEditEditor(ref)
        await expect(
          editor.submit({ ...editor.initialValues, name: "Changed" }),
        ).rejects.toMatchObject({
          failure: { code: "mutation_state_uncertain" },
        })
        expect(fetchOpenRouterKey).toHaveBeenCalledTimes(2)
        return
      }

      fetchOpenRouterKey.mockResolvedValueOnce(key())
      deleteOpenRouterKey.mockRejectedValue(abortError)
      await expect(collection.delete(ref)).rejects.toMatchObject({
        failure: { code: "mutation_state_uncertain" },
      })
      expect(fetchOpenRouterKey).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    ["update", 408],
    ["update", 429],
    ["delete", 408],
    ["delete", 429],
  ] as const)(
    "keeps a %s HTTP %i response uncertain without reconciliation",
    async (operation, status) => {
      const session = await openSession()
      const collection = await session.openCollection("workspace-default-id")
      const ref = {
        accountId: "account-example",
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "workspace-default-id",
        resourceId: "opaque-hash-example",
      }
      const uncertainError = new ApiError("uncertain", status)

      if (operation === "update") {
        fetchOpenRouterKey
          .mockResolvedValueOnce(key())
          .mockResolvedValueOnce(key())
        updateOpenRouterKey.mockRejectedValue(uncertainError)
        const editor = await collection.openEditEditor(ref)
        await expect(
          editor.submit({ ...editor.initialValues, name: "Changed" }),
        ).rejects.toMatchObject({
          failure: { code: "mutation_state_uncertain" },
        })
        expect(fetchOpenRouterKey).toHaveBeenCalledTimes(2)
        return
      }

      fetchOpenRouterKey.mockResolvedValueOnce(key())
      deleteOpenRouterKey.mockRejectedValue(uncertainError)
      await expect(collection.delete(ref)).rejects.toMatchObject({
        failure: { code: "mutation_state_uncertain" },
      })
      expect(fetchOpenRouterKey).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    ["update", "network", new TypeError("fetch failed")],
    ["update", "server", new ApiError("failed", 500)],
    ["delete", "network", new TypeError("fetch failed")],
    ["delete", "server", new ApiError("failed", 500)],
  ] as const)(
    "keeps an unconfirmed %s %s failure uncertain after one reconciliation read",
    async (operation, _failureKind, error) => {
      const session = await openSession()
      const collection = await session.openCollection("workspace-default-id")
      const ref = {
        accountId: "account-example",
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "workspace-default-id",
        resourceId: "opaque-hash-example",
      }

      if (operation === "update") {
        fetchOpenRouterKey.mockResolvedValue(key())
        updateOpenRouterKey.mockRejectedValue(error)
        const editor = await collection.openEditEditor(ref)
        await expect(
          editor.submit({ ...editor.initialValues, name: "Changed" }),
        ).rejects.toMatchObject({
          failure: { code: "mutation_state_uncertain" },
        })
        expect(fetchOpenRouterKey).toHaveBeenCalledTimes(3)
        return
      }

      fetchOpenRouterKey.mockResolvedValue(key())
      deleteOpenRouterKey.mockRejectedValue(error)
      await expect(collection.delete(ref)).rejects.toMatchObject({
        failure: { code: "mutation_state_uncertain" },
      })
      expect(fetchOpenRouterKey).toHaveBeenCalledTimes(2)
    },
  )

  it("confirms an uncertain delete only when its single reconciliation read is 404", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    deleteOpenRouterKey.mockRejectedValue(new TypeError("fetch failed"))
    fetchOpenRouterKey
      .mockResolvedValueOnce(key())
      .mockRejectedValueOnce(new ApiError("missing", 404))

    await expect(collection.delete(ref)).resolves.toBeUndefined()
    expect(deleteOpenRouterKey).toHaveBeenCalledTimes(1)
    expect(fetchOpenRouterKey).toHaveBeenCalledTimes(2)
  })

  it("verifies the referenced key workspace before deleting it", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const substitutedRef = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "other-workspace-key-hash",
    }
    fetchOpenRouterKey.mockResolvedValue(
      key({
        hash: "other-workspace-key-hash",
        workspace_id: "workspace-other-id",
      }),
    )

    await expect(collection.delete(substitutedRef)).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })
    expect(fetchOpenRouterKey).toHaveBeenCalledTimes(1)
    expect(deleteOpenRouterKey).not.toHaveBeenCalled()
  })

  it("verifies the fetched key locator before deleting it", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const requestedHash = "requested-key-hash"
    const returnedHash = "different-key-hash"
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: requestedHash,
    }
    fetchOpenRouterKey.mockResolvedValue(
      key({ hash: returnedHash, workspace_id: "workspace-default-id" }),
    )

    let deleteError: unknown
    try {
      await collection.delete(ref)
    } catch (error) {
      deleteError = error
    }

    expect(deleteError).toMatchObject({ failure: { code: "unexpected" } })
    expect(JSON.stringify(deleteError)).not.toContain(requestedHash)
    expect(JSON.stringify(deleteError)).not.toContain(returnedHash)
    expect(fetchOpenRouterKey).toHaveBeenCalledTimes(1)
    expect(deleteOpenRouterKey).not.toHaveBeenCalled()
  })

  it("deduplicates equivalent nested provider metadata", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")
    const nestedMember = {
      id: "member-nested",
      user_id: "user-nested",
      workspace_id: "workspace-default-id",
      role: "member",
      created_at: "2026-01-01T00:00:00Z",
      provider_metadata: [{ regions: ["east", "west"] }],
    }
    fetchOpenRouterWorkspaceMembers.mockResolvedValue(
      memberPage([nestedMember, structuredClone(nestedMember)] as any, 1),
    )

    await expect(
      editor.loadOptions?.(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      ),
    ).resolves.toHaveLength(1)
  })

  it("rejects invalid list limits, oversized pages, and foreign member pages", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")

    await expect(collection.list({ limit: 0 })).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })

    fetchOpenRouterKeys.mockResolvedValue(
      Array.from({ length: 10_001 }, (_, index) =>
        key({ hash: `oversized-${index}` }),
      ),
    )
    await expect(collection.list()).rejects.toMatchObject({
      failure: { code: "unexpected" },
    })

    const editor = await session.openCreateEditor("workspace-default-id")
    fetchOpenRouterWorkspaceMembers.mockResolvedValue(
      memberPage(
        [
          {
            id: "member-foreign",
            user_id: "user-foreign",
            workspace_id: "workspace-foreign",
            role: "member",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        1,
      ),
    )
    await expect(
      editor.loadOptions?.(
        OPENROUTER_KEY_FIELD_IDS.Creator,
        editor.initialValues,
      ),
    ).rejects.toMatchObject({ failure: { code: "unexpected" } })
  })

  it("short-circuits a no-op edit without dispatching a provider update", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    fetchOpenRouterKey.mockResolvedValue(key())
    const editor = await collection.openEditEditor({
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    })

    await expect(editor.submit(editor.initialValues)).resolves.toMatchObject({
      facts: { displayName: "Example key" },
    })
    expect(updateOpenRouterKey).not.toHaveBeenCalled()
  })

  it("maps deterministic update and delete rejections without reconciliation", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    fetchOpenRouterKey.mockResolvedValue(key())
    let readsWhenUpdateWasDispatched = 0
    updateOpenRouterKey.mockImplementationOnce(async () => {
      readsWhenUpdateWasDispatched = fetchOpenRouterKey.mock.calls.length
      throw new ApiError("invalid", 400)
    })
    const editor = await collection.openEditEditor(ref)
    const readsAfterEditorOpen = fetchOpenRouterKey.mock.calls.length

    await expect(
      editor.submit({ ...editor.initialValues, name: "Rejected" }),
    ).rejects.toMatchObject({ failure: { code: "upstream_rejected" } })
    expect(readsWhenUpdateWasDispatched).toBe(readsAfterEditorOpen + 1)
    expect(fetchOpenRouterKey).toHaveBeenCalledTimes(
      readsWhenUpdateWasDispatched,
    )

    let readsWhenDeleteWasDispatched = 0
    deleteOpenRouterKey.mockImplementationOnce(async () => {
      readsWhenDeleteWasDispatched = fetchOpenRouterKey.mock.calls.length
      throw new ApiError("forbidden", 403)
    })
    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: { code: "permission_denied" },
    })
    expect(readsWhenDeleteWasDispatched).toBe(readsWhenUpdateWasDispatched + 1)
    expect(fetchOpenRouterKey).toHaveBeenCalledTimes(
      readsWhenDeleteWasDispatched,
    )
  })

  it("reconciles every mutable field after an uncertain update", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    const reconciled = key({
      name: "Reconciled",
      disabled: true,
      limit: 25,
      limit_reset: "monthly",
      include_byok_in_limit: true,
    })
    fetchOpenRouterKey
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(reconciled)
    updateOpenRouterKey.mockRejectedValue(new TypeError("fetch failed"))
    const editor = await collection.openEditEditor(ref)

    await expect(
      editor.submit({
        ...editor.initialValues,
        [OPENROUTER_KEY_FIELD_IDS.Name]: "Reconciled",
        [OPENROUTER_KEY_FIELD_IDS.Disabled]: true,
        [OPENROUTER_KEY_FIELD_IDS.LimitMode]:
          OPENROUTER_KEY_LIMIT_MODES.Limited,
        [OPENROUTER_KEY_FIELD_IDS.Limit]: 25,
        [OPENROUTER_KEY_FIELD_IDS.LimitReset]:
          OPENROUTER_KEY_LIMIT_RESETS.Monthly,
        [OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit]: true,
      }),
    ).resolves.toMatchObject({
      facts: {
        displayName: "Reconciled",
        status: "disabled",
        fields: expect.arrayContaining([
          expect.objectContaining({
            fieldId: OPENROUTER_KEY_FIELD_IDS.LimitMode,
            value: OPENROUTER_KEY_LIMIT_MODES.Limited,
          }),
          expect.objectContaining({
            fieldId: OPENROUTER_KEY_FIELD_IDS.Limit,
            value: 25,
          }),
          expect.objectContaining({
            fieldId: OPENROUTER_KEY_FIELD_IDS.LimitReset,
            value: OPENROUTER_KEY_LIMIT_RESETS.Monthly,
          }),
          expect.objectContaining({
            fieldId: OPENROUTER_KEY_FIELD_IDS.Disabled,
            value: true,
          }),
          expect.objectContaining({
            fieldId: OPENROUTER_KEY_FIELD_IDS.IncludeByokInLimit,
            value: true,
          }),
        ]),
      },
    })
  })

  it("keeps a delete uncertain when its reconciliation read fails without 404", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    fetchOpenRouterKey
      .mockResolvedValueOnce(key())
      .mockRejectedValueOnce(new ApiError("still unavailable", 500))
    deleteOpenRouterKey.mockRejectedValue(new TypeError("fetch failed"))

    await expect(collection.delete(ref)).rejects.toMatchObject({
      failure: { code: "mutation_state_uncertain" },
    })
  })

  it("rejects creator loading for a workspace outside the editor inventory", async () => {
    const session = await openSession()
    const editor = await session.openCreateEditor("workspace-default-id")

    await expect(
      editor.loadOptions?.(OPENROUTER_KEY_FIELD_IDS.Creator, {
        ...editor.initialValues,
        [OPENROUTER_KEY_FIELD_IDS.Workspace]: "workspace-unknown",
      }),
    ).rejects.toMatchObject({ failure: { code: "unexpected" } })
    expect(fetchOpenRouterWorkspaceMembers).not.toHaveBeenCalled()
  })

  it("keeps an update uncertain when its reconciliation read itself fails", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    fetchOpenRouterKey
      .mockResolvedValueOnce(key())
      .mockResolvedValueOnce(key())
      .mockRejectedValueOnce(new ApiError("read unavailable", 500))
    updateOpenRouterKey.mockRejectedValue(new TypeError("fetch failed"))
    const editor = await collection.openEditEditor(ref)

    await expect(
      editor.submit({ ...editor.initialValues, name: "Unconfirmed" }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
  })

  it("reports a deterministic provider delete as applied", async () => {
    const session = await openSession()
    const collection = await session.openCollection("workspace-default-id")
    const ref = {
      accountId: "account-example",
      siteType: SITE_TYPES.OPENROUTER,
      scopeKey: "workspace-default-id",
      resourceId: "opaque-hash-example",
    }
    fetchOpenRouterKey.mockResolvedValue(key())
    deleteOpenRouterKey.mockResolvedValue(undefined)

    await expect(collection.delete(ref)).resolves.toBeUndefined()
    expect(deleteOpenRouterKey).toHaveBeenCalledOnce()
  })
})
