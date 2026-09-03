import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { OpenRouterManagementKeyRequiredError } from "~/services/apiService/openrouter/errors"
import {
  createOpenRouterKey,
  deleteOpenRouterKey,
  fetchOpenRouterDefaultWorkspace,
  fetchOpenRouterKey,
  fetchOpenRouterKeys,
  fetchOpenRouterWorkspaceMembers,
  fetchOpenRouterWorkspaces,
  updateOpenRouterKey,
} from "~/services/apiService/openrouter/keyManagement"
import {
  openRouterKeyInfoSchema,
  openRouterKeyListInputSchema,
  openRouterUpdateKeyInputSchema,
  openRouterWorkspaceListResponseSchema,
  openRouterWorkspaceMemberListResponseSchema,
  openRouterWorkspaceMemberSchema,
  openRouterWorkspaceSchema,
} from "~/services/apiService/openrouter/keyManagementSchemas"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const request = {
  baseUrl: "https://mirror.example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "  mgmt-example  ",
    userId: "must-not-be-sent",
  },
}

const key = {
  hash: "hash-example",
  name: "Example key",
  label: "Example key",
  disabled: false,
  limit: null,
  limit_remaining: -2,
  limit_reset: null,
  include_byok_in_limit: false,
  usage: 12,
  usage_daily: 1,
  usage_weekly: 5,
  usage_monthly: 12,
  byok_usage: 3,
  byok_usage_daily: 0,
  byok_usage_weekly: 1,
  byok_usage_monthly: 3,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
  creator_user_id: null,
  workspace_id: "workspace-example",
  expires_at: null,
  unknown_future_field: "kept",
}

const workspace = {
  id: "workspace-example",
  default_guardrail_id: "guardrail-example",
  name: "Example",
  slug: "example",
  description: null,
  default_text_model: null,
  default_image_model: null,
  default_provider_sort: null,
  is_observability_io_logging_enabled: false,
  is_observability_broadcast_enabled: false,
  is_data_discount_logging_enabled: true,
  io_logging_sampling_rate: 1,
  io_logging_api_key_ids: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
  created_by: null,
  include_byok_in_budgets: false,
}

const member = {
  id: "member-example",
  user_id: "user-example",
  workspace_id: "workspace-example",
  role: "member",
  created_at: "2026-01-01T00:00:00Z",
}

const keyRequiredFields = [
  "hash",
  "name",
  "label",
  "disabled",
  "limit",
  "limit_remaining",
  "limit_reset",
  "include_byok_in_limit",
  "usage",
  "usage_daily",
  "usage_weekly",
  "usage_monthly",
  "byok_usage",
  "byok_usage_daily",
  "byok_usage_weekly",
  "byok_usage_monthly",
  "created_at",
  "updated_at",
  "creator_user_id",
  "workspace_id",
] as const

const workspaceRequiredFields = [
  "id",
  "default_guardrail_id",
  "name",
  "slug",
  "description",
  "default_text_model",
  "default_image_model",
  "default_provider_sort",
  "is_observability_io_logging_enabled",
  "is_observability_broadcast_enabled",
  "is_data_discount_logging_enabled",
  "io_logging_sampling_rate",
  "io_logging_api_key_ids",
  "created_at",
  "updated_at",
  "created_by",
] as const

const memberRequiredFields = [
  "id",
  "workspace_id",
  "user_id",
  "role",
  "created_at",
] as const

function withoutProperty(
  input: Record<string, unknown>,
  property: string,
): Record<string, unknown> {
  const result = { ...input }
  delete result[property]
  return result
}

const mutationOperations = ["CREATE", "UPDATE", "DELETE"] as const
type MutationOperation = (typeof mutationOperations)[number]

function runMutation(
  operation: MutationOperation,
  apiRequest: ApiServiceRequest = request,
): Promise<unknown> {
  switch (operation) {
    case "CREATE":
      return createOpenRouterKey(apiRequest, { name: "Example key" })
    case "UPDATE":
      return updateOpenRouterKey(apiRequest, "hash-example", { disabled: true })
    case "DELETE":
      return deleteOpenRouterKey(apiRequest, "hash-example")
  }
}

function registerMutation(
  operation: MutationOperation,
  resolver: (request: Request) => Response | Promise<Response>,
): void {
  switch (operation) {
    case "CREATE":
      server.use(
        http.post(`${OPENROUTER_API_BASE_URL}/keys`, ({ request }) =>
          resolver(request),
        ),
      )
      return
    case "UPDATE":
      server.use(
        http.patch(
          `${OPENROUTER_API_BASE_URL}/keys/hash-example`,
          ({ request }) => resolver(request),
        ),
      )
      return
    case "DELETE":
      server.use(
        http.delete(
          `${OPENROUTER_API_BASE_URL}/keys/hash-example`,
          ({ request }) => resolver(request),
        ),
      )
  }
}

describe("OpenRouter management key API", () => {
  beforeEach(() => server.resetHandlers())

  it("lists keys at the canonical origin with management-key auth and query parameters", async () => {
    let seenRequest: Request | undefined
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/keys`, ({ request }) => {
        seenRequest = request
        return HttpResponse.json({ data: [key] })
      }),
    )

    await expect(
      fetchOpenRouterKeys(request, {
        includeDisabled: true,
        offset: 100,
        workspaceId: "workspace-example",
      }),
    ).resolves.toEqual([key])
    expect(seenRequest?.url).toBe(
      "https://openrouter.ai/api/v1/keys?include_disabled=true&offset=100&workspace_id=workspace-example",
    )
    expect(seenRequest?.headers.get("authorization")).toBe(
      "Bearer mgmt-example",
    )
    expect(seenRequest?.headers.has("new-api-user")).toBe(false)
  })

  it("creates a key once and retains only the create response plaintext", async () => {
    let calls = 0
    server.use(
      http.post(`${OPENROUTER_API_BASE_URL}/keys`, async ({ request }) => {
        calls += 1
        expect(await request.json()).toEqual({
          name: "Example key",
          limit: 0,
          limit_reset: "monthly",
          include_byok_in_limit: true,
          expires_at: "2030-01-01T00:00:00Z",
          workspace_id: "workspace-example",
          creator_user_id: "creator-example",
        })
        return HttpResponse.json(
          { data: key, key: "plaintext-example" },
          { status: 201 },
        )
      }),
    )

    await expect(
      createOpenRouterKey(request, {
        name: "Example key",
        limit: 0,
        limitReset: "monthly",
        includeByokInLimit: true,
        expiresAt: "2030-01-01T00:00:00Z",
        workspaceId: "workspace-example",
        creatorUserId: "creator-example",
      }),
    ).resolves.toEqual({ key, plaintextKey: "plaintext-example" })
    expect(calls).toBe(1)
  })

  it("maps a nullable creator user ID to OpenRouter's create field", async () => {
    server.use(
      http.post(`${OPENROUTER_API_BASE_URL}/keys`, async ({ request }) => {
        expect(await request.json()).toEqual({
          name: "Example key",
          creator_user_id: null,
        })
        return HttpResponse.json({ data: key, key: "plaintext-example" })
      }),
    )

    await expect(
      createOpenRouterKey(request, {
        name: "Example key",
        creatorUserId: null,
      }),
    ).resolves.toEqual({ key, plaintextKey: "plaintext-example" })
  })

  it("does not replay a create after malformed success", async () => {
    let calls = 0
    server.use(
      http.post(`${OPENROUTER_API_BASE_URL}/keys`, () => {
        calls += 1
        return HttpResponse.json({ data: key }, { status: 201 })
      }),
    )

    await expect(
      createOpenRouterKey(request, { name: "Example key" }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(calls).toBe(1)
  })

  it.each(["", "   "])(
    "rejects blank one-time plaintext without replaying the create",
    async (plaintextKey) => {
      let calls = 0
      server.use(
        http.post(`${OPENROUTER_API_BASE_URL}/keys`, () => {
          calls += 1
          return HttpResponse.json(
            { data: key, key: plaintextKey },
            { status: 201 },
          )
        }),
      )

      await expect(
        createOpenRouterKey(request, { name: "Example key" }),
      ).rejects.toBeInstanceOf(ApiError)
      expect(calls).toBe(1)
    },
  )

  it.each([400, 401, 403, 429, 500])(
    "maps create HTTP %i errors without repeating the mutation",
    async (status) => {
      let calls = 0
      server.use(
        http.post(`${OPENROUTER_API_BASE_URL}/keys`, () => {
          calls += 1
          return HttpResponse.json(
            { error: { code: "key_error", message: "Key request failed" } },
            { status },
          )
        }),
      )

      await expect(
        createOpenRouterKey(request, { name: "Example key" }),
      ).rejects.toMatchObject({ statusCode: status })
      expect(calls).toBe(1)
    },
  )

  it("does not replay create after network failure or abort", async () => {
    let calls = 0
    server.use(
      http.post(`${OPENROUTER_API_BASE_URL}/keys`, async ({ request }) => {
        calls += 1
        if (calls === 1) return HttpResponse.error()
        await new Promise<void>((resolve) =>
          request.signal.addEventListener("abort", () => resolve()),
        )
        return HttpResponse.json({ data: key, key: "plaintext-example" })
      }),
    )

    await expect(
      createOpenRouterKey(request, { name: "Example key" }),
    ).rejects.toThrow()

    const controller = new AbortController()
    const aborted = createOpenRouterKey(
      { ...request, abortSignal: controller.signal },
      { name: "Example key" },
    )
    await vi.waitFor(() => expect(calls).toBe(2))
    controller.abort()
    await expect(aborted).rejects.toThrow()
    expect(calls).toBe(2)
  })

  it.each(mutationOperations)(
    "dispatches %s exactly once for network, abort, malformed-success, and 500 failures",
    async (operation) => {
      let calls = 0
      registerMutation(operation, () => {
        calls += 1
        return HttpResponse.error()
      })
      await expect(runMutation(operation)).rejects.toThrow()
      expect(calls).toBe(1)

      server.resetHandlers()
      calls = 0
      registerMutation(operation, ({ signal }) => {
        calls += 1
        return new Promise<Response>((resolve) => {
          signal.addEventListener("abort", () => resolve(HttpResponse.error()))
        })
      })
      const controller = new AbortController()
      const aborted = runMutation(operation, {
        ...request,
        abortSignal: controller.signal,
      })
      await vi.waitFor(() => expect(calls).toBe(1))
      controller.abort()
      await expect(aborted).rejects.toThrow()
      expect(calls).toBe(1)

      server.resetHandlers()
      calls = 0
      registerMutation(operation, () => {
        calls += 1
        if (operation === "CREATE") {
          return HttpResponse.json({ data: key }, { status: 201 })
        }
        if (operation === "UPDATE") {
          return HttpResponse.json({
            data: withoutProperty(key, "usage"),
          })
        }
        return HttpResponse.json({ deleted: false })
      })
      await expect(runMutation(operation)).rejects.toBeInstanceOf(ApiError)
      expect(calls).toBe(1)

      server.resetHandlers()
      calls = 0
      registerMutation(operation, () => {
        calls += 1
        return HttpResponse.json(
          { error: { code: "mutation_failed", message: "Mutation failed" } },
          { status: 500 },
        )
      })
      await expect(runMutation(operation)).rejects.toMatchObject({
        statusCode: 500,
      })
      expect(calls).toBe(1)
    },
  )

  it("encodes hashes and only sends documented mutable PATCH fields", async () => {
    server.use(
      http.patch(
        `${OPENROUTER_API_BASE_URL}/keys/hash%2Fexample`,
        async ({ request }) => {
          expect(await request.json()).toEqual({
            name: "Renamed",
            disabled: true,
            limit: null,
            limit_reset: "weekly",
            include_byok_in_limit: false,
          })
          return HttpResponse.json({ data: { ...key, name: "Renamed" } })
        },
      ),
    )

    await expect(
      updateOpenRouterKey(request, "hash/example", {
        name: "Renamed",
        disabled: true,
        limit: null,
        limitReset: "weekly",
        includeByokInLimit: false,
      }),
    ).resolves.toMatchObject({ name: "Renamed" })
  })

  it("uses canonical management-key auth for every key and workspace operation", async () => {
    const seenRequests: Request[] = []
    const record = (request: Request) => seenRequests.push(request)

    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/keys`, ({ request }) => {
        record(request)
        return HttpResponse.json({ data: [key] })
      }),
      http.post(`${OPENROUTER_API_BASE_URL}/keys`, ({ request }) => {
        record(request)
        return HttpResponse.json({ data: key, key: "plaintext-example" })
      }),
      http.get(
        `${OPENROUTER_API_BASE_URL}/keys/hash-example`,
        ({ request }) => {
          record(request)
          return HttpResponse.json({ data: key })
        },
      ),
      http.patch(
        `${OPENROUTER_API_BASE_URL}/keys/hash-example`,
        ({ request }) => {
          record(request)
          return HttpResponse.json({ data: key })
        },
      ),
      http.delete(
        `${OPENROUTER_API_BASE_URL}/keys/hash-example`,
        ({ request }) => {
          record(request)
          return HttpResponse.json({ deleted: true })
        },
      ),
      http.get(
        `${OPENROUTER_API_BASE_URL}/workspaces/default`,
        ({ request }) => {
          record(request)
          return HttpResponse.json({ data: workspace })
        },
      ),
      http.get(`${OPENROUTER_API_BASE_URL}/workspaces`, ({ request }) => {
        record(request)
        return HttpResponse.json({ data: [workspace], total_count: 1 })
      }),
      http.get(
        `${OPENROUTER_API_BASE_URL}/workspaces/workspace-example/members`,
        ({ request }) => {
          record(request)
          return HttpResponse.json({ data: [member], total_count: 1 })
        },
      ),
    )

    await fetchOpenRouterKeys(request)
    await createOpenRouterKey(request, { name: "Example key" })
    await fetchOpenRouterKey(request, "hash-example")
    await updateOpenRouterKey(request, "hash-example", { disabled: true })
    await deleteOpenRouterKey(request, "hash-example")
    await fetchOpenRouterDefaultWorkspace(request)
    await fetchOpenRouterWorkspaces(request)
    await fetchOpenRouterWorkspaceMembers(request, "workspace-example")

    expect(seenRequests).toHaveLength(8)
    for (const seenRequest of seenRequests) {
      expect(new URL(seenRequest.url).origin).toBe("https://openrouter.ai")
      expect(seenRequest.headers.get("authorization")).toBe(
        "Bearer mgmt-example",
      )
    }
  })

  it("rejects expiry as an unsupported PATCH field", () => {
    expect(
      openRouterUpdateKeyInputSchema.safeParse({
        expiresAt: "2030-01-01T00:00:00Z",
      }).success,
    ).toBe(false)
  })

  it("gets and deletes a key without replaying a failed mutation", async () => {
    let deleteCalls = 0
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/keys/hash-example`, () =>
        HttpResponse.json({ data: key }),
      ),
      http.delete(`${OPENROUTER_API_BASE_URL}/keys/hash-example`, () => {
        deleteCalls += 1
        return HttpResponse.json({ deleted: true })
      }),
    )

    await expect(fetchOpenRouterKey(request, "hash-example")).resolves.toEqual(
      key,
    )
    await expect(deleteOpenRouterKey(request, "hash-example")).resolves.toEqual(
      {
        deleted: true,
      },
    )
    expect(deleteCalls).toBe(1)
  })

  it.each(keyRequiredFields)(
    "rejects a key response missing required field %s",
    (field) => {
      expect(
        openRouterKeyInfoSchema.safeParse(withoutProperty(key, field)).success,
      ).toBe(false)
    },
  )

  it.each([
    ["hash", null],
    ["name", null],
    ["label", null],
    ["disabled", "false"],
    ["limit", "0"],
    ["limit_remaining", "0"],
    ["limit_reset", 1],
    ["include_byok_in_limit", null],
    ["usage", "1"],
    ["usage_daily", "1"],
    ["usage_weekly", "1"],
    ["usage_monthly", "1"],
    ["byok_usage", "1"],
    ["byok_usage_daily", "1"],
    ["byok_usage_weekly", "1"],
    ["byok_usage_monthly", "1"],
    ["created_at", null],
    ["updated_at", 1],
    ["creator_user_id", 1],
    ["workspace_id", null],
  ])("rejects a key response with wrong %s type", (field, value) => {
    expect(
      openRouterKeyInfoSchema.safeParse({ ...key, [field]: value }).success,
    ).toBe(false)
  })

  it("retains unknown key fields after validating documented fields", () => {
    expect(openRouterKeyInfoSchema.parse(key)).toMatchObject({
      unknown_future_field: "kept",
    })
  })

  it("lists default, paged workspaces, and paged workspace members", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/workspaces/default`, () =>
        HttpResponse.json({
          data: {
            ...workspace,
            id: "workspace-default",
            name: "Default",
            slug: "default",
          },
        }),
      ),
      http.get(`${OPENROUTER_API_BASE_URL}/workspaces`, () =>
        HttpResponse.json({
          data: [{ ...workspace, future_workspace_field: "kept" }],
          total_count: 1,
        }),
      ),
      http.get(
        `${OPENROUTER_API_BASE_URL}/workspaces/workspace-example/members`,
        () =>
          HttpResponse.json({
            data: [{ ...member, future_member_field: "kept" }],
            total_count: 1,
          }),
      ),
    )

    await expect(
      fetchOpenRouterDefaultWorkspace(request),
    ).resolves.toMatchObject({
      id: "workspace-default",
    })
    await expect(
      fetchOpenRouterWorkspaces(request, { offset: 10, limit: 20 }),
    ).resolves.toEqual({
      data: [expect.objectContaining({ future_workspace_field: "kept" })],
      totalCount: 1,
    })
    await expect(
      fetchOpenRouterWorkspaceMembers(request, "workspace-example", {
        offset: 10,
        limit: 20,
      }),
    ).resolves.toEqual({
      data: [expect.objectContaining({ future_member_field: "kept" })],
      totalCount: 1,
    })
  })

  it("maps a missing key to its 404 response", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/keys/missing-example`, () =>
        HttpResponse.json(
          { error: { code: 404, message: "Key not found" } },
          { status: 404 },
        ),
      ),
    )

    await expect(
      fetchOpenRouterKey(request, "missing-example"),
    ).rejects.toMatchObject({ statusCode: 404, upstreamCode: "404" })
  })

  it("uses fixed copy for an undocumented OpenRouter error code", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/keys/missing-example`, () =>
        HttpResponse.json(
          {
            error: {
              code: "unsafe code!",
              message: "Key lookup failed",
              metadata: { internal: "not-retained" },
            },
          },
          { status: 404 },
        ),
      ),
    )

    await expect(
      fetchOpenRouterKey(request, "missing-example"),
    ).rejects.toMatchObject({
      statusCode: 404,
      upstreamCode: undefined,
      message: "请求失败: 404",
    })
  })

  it("preserves provider details until the adapter disclosure boundary", async () => {
    const opaqueHash = "hash/opaque-example"
    const managementKey = request.auth.accessToken.trim()
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/keys/hash%2Fopaque-example`, () =>
        HttpResponse.json(
          {
            error: {
              code: 403,
              message: `Access denied for ${opaqueHash} using ${managementKey}`,
            },
          },
          { status: 403 },
        ),
      ),
    )

    const error = await fetchOpenRouterKey(request, opaqueHash).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(ApiError)
    if (!(error instanceof ApiError)) throw error
    expect(error).toMatchObject({
      statusCode: 403,
      code: "HTTP_403",
      upstreamCode: "403",
      endpoint: "/keys/hash%2Fopaque-example",
    })
    expect(error.message).toBe(
      `Access denied for ${opaqueHash} using ${managementKey}`,
    )
  })

  it("preserves provider workspace details before user disclosure", async () => {
    const opaqueWorkspaceId = "workspace/opaque example"
    server.use(
      http.get(
        `${OPENROUTER_API_BASE_URL}/workspaces/workspace%2Fopaque%20example/members`,
        () =>
          HttpResponse.json(
            {
              error: {
                code: 500,
                message: `Workspace ${opaqueWorkspaceId} is unavailable`,
              },
            },
            { status: 500 },
          ),
      ),
    )

    const error = await fetchOpenRouterWorkspaceMembers(
      request,
      opaqueWorkspaceId,
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    if (!(error instanceof ApiError)) throw error
    expect(error).toMatchObject({
      statusCode: 500,
      code: "HTTP_OTHER",
      upstreamCode: "500",
      endpoint: "/workspaces/workspace%2Fopaque%20example/members",
    })
    expect(error.message).toBe(`Workspace ${opaqueWorkspaceId} is unavailable`)
  })

  it("does not replay update or delete after a failed response", async () => {
    let updateCalls = 0
    let deleteCalls = 0
    server.use(
      http.patch(`${OPENROUTER_API_BASE_URL}/keys/hash-example`, () => {
        updateCalls += 1
        return HttpResponse.json(
          { error: { code: "update_failed", message: "Update failed" } },
          { status: 500 },
        )
      }),
      http.delete(`${OPENROUTER_API_BASE_URL}/keys/hash-example`, () => {
        deleteCalls += 1
        return HttpResponse.json({ deleted: false })
      }),
    )

    await expect(
      updateOpenRouterKey(request, "hash-example", { disabled: true }),
    ).rejects.toBeInstanceOf(ApiError)
    await expect(
      deleteOpenRouterKey(request, "hash-example"),
    ).rejects.toBeInstanceOf(ApiError)
    expect(updateCalls).toBe(1)
    expect(deleteCalls).toBe(1)
  })

  it.each(workspaceRequiredFields)(
    "rejects a workspace response missing required field %s",
    (field) => {
      expect(
        openRouterWorkspaceSchema.safeParse(withoutProperty(workspace, field))
          .success,
      ).toBe(false)
    },
  )

  it.each([
    ["id", null],
    ["default_guardrail_id", null],
    ["name", null],
    ["slug", null],
    ["description", false],
    ["default_text_model", false],
    ["default_image_model", false],
    ["default_provider_sort", false],
    ["is_observability_io_logging_enabled", null],
    ["is_observability_broadcast_enabled", null],
    ["is_data_discount_logging_enabled", null],
    ["io_logging_sampling_rate", "1"],
    ["io_logging_api_key_ids", ["1"]],
    ["created_at", null],
    ["updated_at", false],
    ["created_by", false],
  ])("rejects a workspace response with wrong %s type", (field, value) => {
    expect(
      openRouterWorkspaceSchema.safeParse({ ...workspace, [field]: value })
        .success,
    ).toBe(false)
  })

  it.each(memberRequiredFields)(
    "rejects a workspace member response missing required field %s",
    (field) => {
      expect(
        openRouterWorkspaceMemberSchema.safeParse(
          withoutProperty(member, field),
        ).success,
      ).toBe(false)
    },
  )

  it.each([
    ["id", null],
    ["workspace_id", null],
    ["user_id", null],
    ["role", "owner"],
    ["created_at", null],
  ])(
    "rejects a workspace member response with wrong %s type",
    (field, value) => {
      expect(
        openRouterWorkspaceMemberSchema.safeParse({ ...member, [field]: value })
          .success,
      ).toBe(false)
    },
  )

  it("retains unknown workspace and member fields after validating known fields", () => {
    expect(
      openRouterWorkspaceSchema.parse({
        ...workspace,
        future_workspace_field: "kept",
      }),
    ).toMatchObject({ future_workspace_field: "kept" })
    expect(
      openRouterWorkspaceMemberSchema.parse({
        ...member,
        future_member_field: "kept",
      }),
    ).toMatchObject({ future_member_field: "kept" })
  })

  it.each([
    [
      "workspace list",
      openRouterWorkspaceListResponseSchema,
      { data: [workspace], total_count: 1 },
    ],
    [
      "workspace member list",
      openRouterWorkspaceMemberListResponseSchema,
      { data: [member], total_count: 1 },
    ],
  ])(
    "rejects missing or invalid %s envelope fields",
    (_name, schema, value) => {
      expect(schema.safeParse(withoutProperty(value, "data")).success).toBe(
        false,
      )
      expect(
        schema.safeParse(withoutProperty(value, "total_count")).success,
      ).toBe(false)
      expect(schema.safeParse({ ...value, total_count: null }).success).toBe(
        false,
      )
    },
  )

  it("rejects pagination limits above the documented maximum", async () => {
    let calls = 0
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/workspaces`, () => {
        calls += 1
        return HttpResponse.json({ data: [], total_count: 0 })
      }),
      http.get(
        `${OPENROUTER_API_BASE_URL}/workspaces/workspace-example/members`,
        () => {
          calls += 1
          return HttpResponse.json({ data: [], total_count: 0 })
        },
      ),
    )
    await expect(
      fetchOpenRouterWorkspaces(request, { limit: 101 }),
    ).rejects.toBeInstanceOf(ApiError)
    await expect(
      fetchOpenRouterWorkspaceMembers(request, "workspace-example", {
        limit: 101,
      }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(calls).toBe(0)
  })

  it("builds exact paginated workspace and encoded member URLs", async () => {
    let workspaceUrl = ""
    let memberUrl = ""
    const opaqueWorkspaceId = "workspace/opaque example"
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/workspaces`, ({ request }) => {
        workspaceUrl = request.url
        return HttpResponse.json({ data: [workspace], total_count: 1 })
      }),
      http.get(
        `${OPENROUTER_API_BASE_URL}/workspaces/*/members`,
        ({ request }) => {
          memberUrl = request.url
          return HttpResponse.json({ data: [member], total_count: 1 })
        },
      ),
    )

    await fetchOpenRouterWorkspaces(request, { offset: 7, limit: 11 })
    await fetchOpenRouterWorkspaceMembers(request, opaqueWorkspaceId, {
      offset: 13,
      limit: 17,
    })

    expect(workspaceUrl).toBe(
      `${OPENROUTER_API_BASE_URL}/workspaces?offset=7&limit=11`,
    )
    expect(memberUrl).toBe(
      `${OPENROUTER_API_BASE_URL}/workspaces/workspace%2Fopaque%20example/members?offset=13&limit=17`,
    )
  })

  it("accepts only documented key-list inputs", () => {
    expect(openRouterKeyListInputSchema.safeParse({ limit: 1 }).success).toBe(
      false,
    )
    expect(
      openRouterKeyListInputSchema.safeParse({ includeDisabled: true }).success,
    ).toBe(true)
  })

  it.each([undefined, "   "])(
    "requires a non-empty management key before a request: %s",
    async (accessToken) => {
      await expect(
        fetchOpenRouterKeys({
          ...request,
          auth: { ...request.auth, accessToken },
        }),
      ).rejects.toBeInstanceOf(OpenRouterManagementKeyRequiredError)
    },
  )
})
