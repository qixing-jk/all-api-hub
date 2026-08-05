import type { BrowserContext, Route } from "@playwright/test"

import type {
  OpenRouterKeyInfo,
  OpenRouterWorkspace,
  OpenRouterWorkspaceMember,
} from "~/services/apiService/openrouter"

const OPENROUTER_MANAGEMENT_API = "https://openrouter.ai/api/v1"
const KEY_PAGE_SIZE = 100
const CREATED_SECRET_FIXTURE = "sk-or-v1-created-example"

export const OPENROUTER_KEY_MANAGEMENT_E2E = {
  accountId: "account-example",
  managementKey: "sk-or-management-example",
  defaultWorkspaceId: "workspace-default",
  teamWorkspaceId: "workspace-team",
  teamWorkspaceSlug: "team",
  memberUserId: "user-team-member",
} as const

type SafeRequestFact = {
  operation:
    | "default-workspace"
    | "list-workspaces"
    | "list-members"
    | "list-keys"
    | "create-key"
    | "get-key"
    | "update-key"
    | "delete-key"
  authenticated: boolean
  offset?: number
  limit?: number
  includeDisabled?: boolean
  workspaceScope?: string
}

type OpenRouterKeyManagementRouteState = {
  getSafeRequests: () => readonly SafeRequestFact[]
  getSafeKeys: () => readonly {
    name: string
    disabled: boolean
    limit: number | null
    limitReset: string | null
    includeByokInLimit: boolean
    expiresAt: string | null
    workspaceId: string
    creatorUserId: string | null
  }[]
  getCreatedSecretIssueCount: () => number
}

const createWorkspace = (
  id: string,
  slug: string,
  name: string,
): OpenRouterWorkspace => ({
  id,
  default_guardrail_id: `guardrail-${slug}`,
  name,
  slug,
  description: null,
  default_text_model: null,
  default_image_model: null,
  default_provider_sort: null,
  is_observability_io_logging_enabled: false,
  is_observability_broadcast_enabled: false,
  is_data_discount_logging_enabled: false,
  io_logging_sampling_rate: 0,
  io_logging_api_key_ids: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: null,
  created_by: null,
  include_byok_in_budgets: false,
})

const createKey = (
  index: number,
  overrides: Partial<OpenRouterKeyInfo> = {},
): OpenRouterKeyInfo => ({
  hash: `opaque-hash-${index}`,
  name: `Paged active key ${index}`,
  label: `sk-or-v1-••••${String(index).padStart(4, "0")}`,
  disabled: false,
  limit: null,
  limit_remaining: null,
  limit_reset: null,
  include_byok_in_limit: false,
  usage: index,
  usage_daily: 0,
  usage_weekly: 0,
  usage_monthly: 0,
  byok_usage: 0,
  byok_usage_daily: 0,
  byok_usage_weekly: 0,
  byok_usage_monthly: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: null,
  expires_at: null,
  workspace_id: OPENROUTER_KEY_MANAGEMENT_E2E.teamWorkspaceId,
  creator_user_id: null,
  ...overrides,
})

const fulfillJson = async (route: Route, body: unknown, status = 200) => {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

const parseNonNegativeInteger = (value: string | null, fallback: number) => {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

/** Installs a stateful, fail-closed OpenRouter Management API boundary. */
export async function installOpenRouterKeyManagementRoutes(
  context: BrowserContext,
): Promise<OpenRouterKeyManagementRouteState> {
  const defaultWorkspace = createWorkspace(
    OPENROUTER_KEY_MANAGEMENT_E2E.defaultWorkspaceId,
    "default",
    "Default workspace",
  )
  const teamWorkspace = createWorkspace(
    OPENROUTER_KEY_MANAGEMENT_E2E.teamWorkspaceId,
    OPENROUTER_KEY_MANAGEMENT_E2E.teamWorkspaceSlug,
    "Team workspace",
  )
  const workspaces = [defaultWorkspace, teamWorkspace]
  const members: OpenRouterWorkspaceMember[] = [
    {
      id: "membership-team-member",
      user_id: OPENROUTER_KEY_MANAGEMENT_E2E.memberUserId,
      workspace_id: OPENROUTER_KEY_MANAGEMENT_E2E.teamWorkspaceId,
      role: "member",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ]
  const keys = Array.from({ length: KEY_PAGE_SIZE }, (_, index) =>
    createKey(index + 1),
  )
  keys.push(
    createKey(KEY_PAGE_SIZE + 1, {
      name: "Paged disabled key",
      disabled: true,
      limit: 25,
      limit_remaining: 8,
      limit_reset: "monthly",
    }),
  )
  const safeRequests: SafeRequestFact[] = []
  let createdSecretIssueCount = 0
  let createdSequence = 0

  await context.route(`${OPENROUTER_MANAGEMENT_API}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const authenticated =
      request.headers()["authorization"] ===
      `Bearer ${OPENROUTER_KEY_MANAGEMENT_E2E.managementKey}`

    if (!authenticated) {
      await fulfillJson(
        route,
        {
          error: {
            code: "authentication_failed",
            message: "Mocked Management API authentication failed",
          },
        },
        401,
      )
      return
    }

    if (method === "GET" && url.pathname === "/api/v1/workspaces/default") {
      safeRequests.push({ operation: "default-workspace", authenticated })
      await fulfillJson(route, { data: defaultWorkspace })
      return
    }

    if (method === "GET" && url.pathname === "/api/v1/workspaces") {
      const offset = parseNonNegativeInteger(url.searchParams.get("offset"), 0)
      const limit = parseNonNegativeInteger(url.searchParams.get("limit"), 100)
      if (offset === null || limit === null || limit === 0) {
        await fulfillJson(route, { error: { code: "invalid_pagination" } }, 400)
        return
      }
      safeRequests.push({
        operation: "list-workspaces",
        authenticated,
        offset,
        limit,
      })
      await fulfillJson(route, {
        data: workspaces.slice(offset, offset + limit),
        total_count: workspaces.length,
      })
      return
    }

    const memberMatch = url.pathname.match(
      /^\/api\/v1\/workspaces\/([^/]+)\/members$/,
    )
    if (method === "GET" && memberMatch) {
      const workspaceId = decodeURIComponent(memberMatch[1]!)
      const offset = parseNonNegativeInteger(url.searchParams.get("offset"), 0)
      const limit = parseNonNegativeInteger(url.searchParams.get("limit"), 100)
      if (offset === null || limit === null || limit === 0) {
        await fulfillJson(route, { error: { code: "invalid_pagination" } }, 400)
        return
      }
      const workspaceMembers = members.filter(
        (member) => member.workspace_id === workspaceId,
      )
      safeRequests.push({
        operation: "list-members",
        authenticated,
        offset,
        limit,
        workspaceScope: workspaceId,
      })
      await fulfillJson(route, {
        data: workspaceMembers.slice(offset, offset + limit),
        total_count: workspaceMembers.length,
      })
      return
    }

    if (url.pathname === "/api/v1/keys" && method === "GET") {
      const offset = parseNonNegativeInteger(url.searchParams.get("offset"), 0)
      const includeDisabled =
        url.searchParams.get("include_disabled") === "true"
      const workspaceId = url.searchParams.get("workspace_id")
      if (offset === null || !workspaceId) {
        await fulfillJson(route, { error: { code: "invalid_key_query" } }, 400)
        return
      }
      const matching = keys.filter(
        (key) =>
          key.workspace_id === workspaceId &&
          (includeDisabled || !key.disabled),
      )
      safeRequests.push({
        operation: "list-keys",
        authenticated,
        offset,
        includeDisabled,
        workspaceScope: workspaceId,
      })
      await fulfillJson(route, {
        data: matching.slice(offset, offset + KEY_PAGE_SIZE),
      })
      return
    }

    if (url.pathname === "/api/v1/keys" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>
      const workspaceId =
        typeof body.workspace_id === "string"
          ? body.workspace_id
          : defaultWorkspace.id
      const created = createKey(10_000 + ++createdSequence, {
        name: typeof body.name === "string" ? body.name : "",
        disabled: false,
        limit: typeof body.limit === "number" ? body.limit : null,
        limit_remaining: typeof body.limit === "number" ? body.limit : null,
        limit_reset:
          typeof body.limit_reset === "string" ? body.limit_reset : null,
        include_byok_in_limit: body.include_byok_in_limit === true,
        expires_at:
          typeof body.expires_at === "string" ? body.expires_at : null,
        workspace_id: workspaceId,
        creator_user_id:
          typeof body.creator_user_id === "string"
            ? body.creator_user_id
            : null,
      })
      keys.push(created)
      createdSecretIssueCount += 1
      safeRequests.push({
        operation: "create-key",
        authenticated,
        workspaceScope: workspaceId,
      })
      await fulfillJson(
        route,
        { data: created, key: CREATED_SECRET_FIXTURE },
        201,
      )
      return
    }

    const keyMatch = url.pathname.match(/^\/api\/v1\/keys\/([^/]+)$/)
    if (keyMatch) {
      const hash = decodeURIComponent(keyMatch[1]!)
      const index = keys.findIndex((key) => key.hash === hash)
      if (index < 0) {
        await fulfillJson(
          route,
          { error: { code: "not_found", message: "Key not found" } },
          404,
        )
        return
      }

      if (method === "GET") {
        safeRequests.push({ operation: "get-key", authenticated })
        await fulfillJson(route, { data: keys[index] })
        return
      }

      if (method === "PATCH") {
        const body = request.postDataJSON() as Record<string, unknown>
        const current = keys[index]!
        const next: OpenRouterKeyInfo = {
          ...current,
          ...(typeof body.name === "string" ? { name: body.name } : {}),
          ...(typeof body.disabled === "boolean"
            ? { disabled: body.disabled }
            : {}),
          ...(body.limit === null || typeof body.limit === "number"
            ? {
                limit: body.limit as number | null,
                limit_remaining: body.limit as number | null,
              }
            : {}),
          ...(body.limit_reset === null || typeof body.limit_reset === "string"
            ? { limit_reset: body.limit_reset as string | null }
            : {}),
          ...(typeof body.include_byok_in_limit === "boolean"
            ? { include_byok_in_limit: body.include_byok_in_limit }
            : {}),
          updated_at: "2026-01-02T00:00:00.000Z",
        }
        keys[index] = next
        safeRequests.push({ operation: "update-key", authenticated })
        await fulfillJson(route, { data: next })
        return
      }

      if (method === "DELETE") {
        keys.splice(index, 1)
        safeRequests.push({ operation: "delete-key", authenticated })
        await fulfillJson(route, { deleted: true })
        return
      }
    }

    throw new Error("Unhandled mocked OpenRouter Management API route")
  })

  return {
    getSafeRequests: () => safeRequests.map((request) => ({ ...request })),
    getSafeKeys: () =>
      keys.map((key) => ({
        name: key.name,
        disabled: key.disabled,
        limit: key.limit,
        limitReset: key.limit_reset,
        includeByokInLimit: key.include_byok_in_limit,
        expiresAt: key.expires_at ?? null,
        workspaceId: key.workspace_id,
        creatorUserId: key.creator_user_id,
      })),
    getCreatedSecretIssueCount: () => createdSecretIssueCount,
  }
}
