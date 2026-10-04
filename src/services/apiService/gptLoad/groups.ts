/**
 * gpt-load control routes - the gateway's "channels", which are groups.
 *
 * Route contract verified against a live v2 control plane on 2026-10-03:
 * - `GET /api/channels` is a descriptor catalogue, not an instance list: each
 *   entry carries `param_fields`/`credential_fields`/`connection` so the client
 *   renders the create form from the deployment rather than a hard-coded form.
 * - `GET /api/modern/groups` (flat view) and `GET /api/groups` (classic, with
 *   `params`) are the group inventory. `GET /api/groups/:id/settings` is the
 *   editable view.
 * - `PUT /api/groups/:id/settings` accepts a partial settings patch; omitted
 *   fields are preserved (the handler uses `optionalField`), which matches this
 *   extension's partial-edit semantics.
 * - `PUT /api/groups/:id/models` **replaces** the whole model list.
 * - `POST /api/groups` creates a group and requires an `Idempotency-Key`
 *   (UUID v4) header; `DELETE /api/groups/:id` requires an empty JSON body.
 * - Credentials: `GET .../credentials` is always masked; `POST .../reveal`
 *   returns plaintext per row; `POST .../import` adds a batch; `POST
 *   .../:cid/test` probes one; `DELETE .../:cid` removes one.
 */

import type {
  GptLoadChannelCatalogEntry,
  GptLoadCredential,
  GptLoadGroup,
  GptLoadGroupModel,
  GptLoadGroupSettings,
} from "~/types/gptLoad"
import type { GptLoadConfig } from "~/types/gptLoadConfig"

import { newGptLoadIdempotencyKey } from "./idempotency"
import {
  readGptLoadChannelCatalog,
  readGptLoadCredentialReveal,
  readGptLoadCredentials,
  readGptLoadGroup,
  readGptLoadGroupModels,
  readGptLoadGroups,
  readGptLoadGroupSettings,
} from "./parsing"
import {
  callGptLoad,
  GptLoadApiError,
  type GptLoadRequestOptions,
} from "./request"

/** Page size for inventory walks; the gateway accepts `page`/`page_size`. */
const GPT_LOAD_PAGE_SIZE = 100

/** Guards a walk against a gateway that keeps reporting the same page. */
const GPT_LOAD_MAX_PAGES = 100

/**
 * gpt-load requires a canonical UUID v4 for `Idempotency-Key` and rejects
 * anything else with `INVALID_IDEMPOTENCY_KEY`; `newGptLoadIdempotencyKey`
 * always generates one, so this alias keeps the write helpers readable.
 */
export const createGptLoadIdempotencyKey = newGptLoadIdempotencyKey

/** Reads the built-in channel catalogue (descriptor-driven form data). */
export async function listGptLoadChannelCatalog(
  config: GptLoadConfig,
  options?: GptLoadRequestOptions,
): Promise<GptLoadChannelCatalogEntry[]> {
  return readGptLoadChannelCatalog(
    await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: "/api/channels",
      method: "GET",
      managementKey: config.managementKey,
      options,
    }),
  )
}

export interface GptLoadGroupListPage {
  groups: GptLoadGroup[]
  total: number | null
}

/** Reads one page of the group inventory (classic route, which carries params). */
export async function listGptLoadGroups(
  config: GptLoadConfig,
  query: { page?: number; pageSize?: number } = {},
  options?: GptLoadRequestOptions,
): Promise<GptLoadGroupListPage> {
  const searchParams = new URLSearchParams({
    page: String(query.page ?? 1),
    page_size: String(query.pageSize ?? GPT_LOAD_PAGE_SIZE),
  })

  const payload = await callGptLoad<unknown>({
    baseUrl: config.baseUrl,
    path: "/api/groups",
    method: "GET",
    managementKey: config.managementKey,
    searchParams,
    options,
  })

  const groups = readGptLoadGroups(payload)
  const total =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { total_items?: unknown }).total_items === "number"
      ? (payload as { total_items: number }).total_items
      : typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { pagination?: { total_items?: unknown } })
            .pagination?.total_items === "number"
        ? (payload as { pagination: { total_items: number } }).pagination
            .total_items
        : null

  return { groups, total }
}

/**
 * Reads the flat inventory view.
 *
 * `GET /api/modern/groups` answers one unpaginated `items` array and is the only
 * list route that carries each group's `model_names` and resolved `endpoint`;
 * the classic `/api/groups` route carries `params.base_url` but only a
 * `model_count`. The projection needs the model names, so this is read first
 * and the paginated classic walk is the fallback.
 */
async function listGptLoadModernGroups(
  config: GptLoadConfig,
  options?: GptLoadRequestOptions,
): Promise<GptLoadGroup[]> {
  return readGptLoadGroups(
    await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: "/api/modern/groups",
      method: "GET",
      managementKey: config.managementKey,
      options,
    }),
  )
}

/** Walks the full group inventory for a complete local projection. */
export async function listAllGptLoadGroups(
  config: GptLoadConfig,
  options?: GptLoadRequestOptions,
): Promise<GptLoadGroup[]> {
  try {
    const modern = await listGptLoadModernGroups(config, options)
    if (modern.length > 0) return modern
  } catch (error) {
    if (
      !(error instanceof GptLoadApiError) ||
      (error.status !== 404 && error.status !== 405)
    )
      throw error
    // A deployment that predates the modern route falls through to the classic
    // paginated walk; the caller only needs some usable inventory shape.
  }

  const collected: GptLoadGroup[] = []
  const seen = new Set<number>()

  for (let page = 1; page <= GPT_LOAD_MAX_PAGES; page += 1) {
    const { groups, total } = await listGptLoadGroups(
      config,
      { page, pageSize: GPT_LOAD_PAGE_SIZE },
      options,
    )

    let added = 0
    for (const group of groups) {
      if (seen.has(group.id)) continue
      seen.add(group.id)
      collected.push(group)
      added += 1
    }

    if (groups.length < GPT_LOAD_PAGE_SIZE) return collected
    if (added === 0) return collected
    if (total !== null && collected.length >= total) return collected
  }

  return collected
}

/**
 * Reads the gateway's own model catalogue.
 *
 * `GET /api/models` answers the client models the deployment routes, which is
 * the authoritative model vocabulary — a group's model list is a subset of it,
 * so the editor's model options must not be derived from other groups.
 */
export async function listGptLoadModelIds(
  config: GptLoadConfig,
  options?: GptLoadRequestOptions,
): Promise<string[]> {
  const ids = new Set<string>()
  for (let page = 1; page <= GPT_LOAD_MAX_PAGES; page += 1) {
    const searchParams = new URLSearchParams({
      page: String(page),
      page_size: String(GPT_LOAD_PAGE_SIZE),
    })
    const payload = await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: "/api/models",
      method: "GET",
      managementKey: config.managementKey,
      searchParams,
      options,
    })
    const items =
      typeof payload === "object" &&
      payload !== null &&
      Array.isArray((payload as { items?: unknown }).items)
        ? (payload as { items: unknown[] }).items ?? []
        : []
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue
      const clientModel = (item as { client_model?: unknown }).client_model
      if (typeof clientModel === "string" && clientModel.trim()) {
        ids.add(clientModel.trim())
      }
    }
    if (items.length < GPT_LOAD_PAGE_SIZE)
      return [...ids].sort((left, right) => left.localeCompare(right))
  }
  throw new GptLoadApiError(
    "gpt-load model catalogue is incomplete: pagination limit reached",
  )
}

/** Reads one group's editable settings. */
export async function getGptLoadGroupSettings(
  config: GptLoadConfig,
  groupId: number,
  options?: GptLoadRequestOptions,
): Promise<GptLoadGroupSettings> {
  const settings = readGptLoadGroupSettings(
    await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: `/api/groups/${groupId}/settings`,
      method: "GET",
      managementKey: config.managementKey,
      options,
    }),
  )
  if (!settings) {
    throw new GptLoadApiError("gpt-load returned invalid group settings", 200, {
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: false,
    })
  }
  return settings
}

/** Reads one group's model list. */
export async function getGptLoadGroupModels(
  config: GptLoadConfig,
  groupId: number,
  options?: GptLoadRequestOptions,
): Promise<GptLoadGroupModel[]> {
  return readGptLoadGroupModels(
    await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: `/api/groups/${groupId}/models`,
      method: "GET",
      managementKey: config.managementKey,
      options,
    }),
  )
}

export interface GptLoadGroupCreatePayload {
  name: string
  channelId: string
  connectionType: string
  params: Record<string, unknown>
  models: readonly string[]
  credentials: readonly string[]
  priceMultiplier?: string
}

/**
 * Creates a group and its initial credential pool.
 *
 * gpt-load accepts credentials as one newline-separated text block and
 * de-duplicates them. `confirm_same_target` is sent as `true` because this path
 * always creates a fresh group; the gateway's same-target guard exists for its
 * own single-credential UI flow.
 */
export async function createGptLoadGroup(
  config: GptLoadConfig,
  payload: GptLoadGroupCreatePayload,
  options?: GptLoadRequestOptions,
): Promise<GptLoadGroup> {
  const body = await callGptLoad<unknown>({
    baseUrl: config.baseUrl,
    path: "/api/groups",
    method: "POST",
    managementKey: config.managementKey,
    idempotencyKey: createGptLoadIdempotencyKey(),
    body: {
      name: payload.name,
      price_multiplier: payload.priceMultiplier ?? "1",
      channel_id: payload.channelId,
      connection_type: payload.connectionType,
      params: payload.params,
      models: payload.models.map((id) => ({
        id,
        alias: "",
        alias_enabled: false,
      })),
      credentials: payload.credentials.join("\n"),
      confirm_same_target: true,
    },
    options,
  })

  const created = readGptLoadGroup(body)
  if (created) return created
  // The create route answers `{group_id,group_name,...}` rather than a full
  // row, so a second read is the only way to return the canonical group.
  const groupId =
    typeof body === "object" && body !== null
      ? (body as { group_id?: unknown }).group_id
      : undefined
  if (typeof groupId !== "number" || !Number.isSafeInteger(groupId)) {
    throw new GptLoadApiError("gpt-load returned an invalid group", 201, {
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: false,
      raw: body,
    })
  }
  return { id: groupId, name: payload.name, channel_id: payload.channelId }
}

export interface GptLoadGroupSettingsPatch {
  name?: string
  params?: Record<string, unknown>
  enabled?: boolean
  priceMultiplier?: string
  weightManual?: number | null
}

/** Applies a partial settings patch; omitted fields are preserved upstream. */
export async function updateGptLoadGroupSettings(
  config: GptLoadConfig,
  groupId: number,
  patch: GptLoadGroupSettingsPatch,
  options?: GptLoadRequestOptions,
): Promise<GptLoadGroupSettings> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.params !== undefined) body.params = patch.params
  if (patch.enabled !== undefined) body.enabled = patch.enabled
  if (patch.priceMultiplier !== undefined) {
    body.price_multiplier = patch.priceMultiplier
  }
  if (patch.weightManual !== undefined) body.weight_manual = patch.weightManual

  const settings = readGptLoadGroupSettings(
    await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: `/api/groups/${groupId}/settings`,
      method: "PUT",
      managementKey: config.managementKey,
      body,
      options,
    }),
  )
  if (!settings) {
    throw new GptLoadApiError("gpt-load returned invalid group settings", 200, {
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: false,
    })
  }
  return settings
}

/** Replaces a group's whole model list. */
export async function updateGptLoadGroupModels(
  config: GptLoadConfig,
  groupId: number,
  models: readonly string[],
  options?: GptLoadRequestOptions,
): Promise<GptLoadGroupModel[]> {
  return readGptLoadGroupModels(
    await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: `/api/groups/${groupId}/models`,
      method: "PUT",
      managementKey: config.managementKey,
      body: {
        models: models.map((id) => ({ id, alias: "", alias_enabled: false })),
      },
      options,
    }),
  )
}

/** Deletes one group. The route requires an empty JSON object body. */
export async function deleteGptLoadGroup(
  config: GptLoadConfig,
  groupId: number,
  options?: GptLoadRequestOptions,
): Promise<void> {
  await callGptLoad<unknown>({
    baseUrl: config.baseUrl,
    path: `/api/groups/${groupId}`,
    method: "DELETE",
    managementKey: config.managementKey,
    body: {},
    expectsJson: false,
    options,
  })
}

/** Reads the complete masked credential pool for editing and migration. */
export async function listGptLoadGroupCredentials(
  config: GptLoadConfig,
  groupId: number,
  options?: GptLoadRequestOptions,
): Promise<GptLoadCredential[]> {
  const collected: GptLoadCredential[] = []
  const seen = new Set<number>()
  for (let page = 1; page <= GPT_LOAD_MAX_PAGES; page += 1) {
    const searchParams = new URLSearchParams({
      page: String(page),
      page_size: String(GPT_LOAD_PAGE_SIZE),
    })
    const payload = await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: `/api/groups/${groupId}/credentials`,
      method: "GET",
      managementKey: config.managementKey,
      searchParams,
      options,
    })
    const credentials = readGptLoadCredentials(payload)
    let added = 0
    for (const credential of credentials) {
      if (seen.has(credential.credential_id)) continue
      seen.add(credential.credential_id)
      collected.push(credential)
      added += 1
    }
    const total =
      typeof payload === "object" && payload !== null
        ? (payload as { pagination?: { total_items?: unknown } }).pagination
            ?.total_items
        : undefined
    const hasTotal =
      typeof total === "number" && Number.isSafeInteger(total) && total >= 0
    if (hasTotal && collected.length >= total) return collected
    if (!hasTotal && credentials.length < GPT_LOAD_PAGE_SIZE) return collected
    if (added === 0) break
  }
  // A partial pool must not be used as the baseline for editing or migration.
  throw new GptLoadApiError(
    "gpt-load returned an incomplete credential pool",
    200,
    {
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: false,
    },
  )
}

/** Adds a batch of credentials to one group. */
export async function importGptLoadGroupCredentials(
  config: GptLoadConfig,
  groupId: number,
  credentials: readonly string[],
  options?: GptLoadRequestOptions,
): Promise<void> {
  await callGptLoad<unknown>({
    baseUrl: config.baseUrl,
    path: `/api/groups/${groupId}/credentials/import`,
    method: "POST",
    managementKey: config.managementKey,
    idempotencyKey: createGptLoadIdempotencyKey(),
    body: { credentials: credentials.join("\n") },
    options,
  })
}

/**
 * Reads one stored credential in plaintext.
 *
 * `POST .../reveal` answers `{credential:{<field>:<value>}}`; the field name is
 * channel-specific, so the first non-empty string value is returned. This is
 * the only plaintext read this integration performs and it is always an
 * explicit, per-row action.
 */
export async function revealGptLoadGroupCredential(
  config: GptLoadConfig,
  groupId: number,
  credentialId: number,
  options?: GptLoadRequestOptions,
): Promise<string> {
  const payload = readGptLoadCredentialReveal(
    await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: `/api/groups/${groupId}/credentials/${credentialId}/reveal`,
      method: "POST",
      managementKey: config.managementKey,
      body: {},
      options,
    }),
  )

  const credential = payload?.credential
  if (credential) {
    for (const value of Object.values(credential)) {
      if (typeof value === "string" && value.trim()) return value.trim()
    }
  }
  throw new GptLoadApiError(
    "gpt-load did not return a readable channel credential",
    200,
    {
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: false,
      raw: payload,
    },
  )
}

/** Removes one credential from a group. */
export async function deleteGptLoadGroupCredential(
  config: GptLoadConfig,
  groupId: number,
  credentialId: number,
  options?: GptLoadRequestOptions,
): Promise<void> {
  await callGptLoad<unknown>({
    baseUrl: config.baseUrl,
    path: `/api/groups/${groupId}/credentials/${credentialId}`,
    method: "DELETE",
    managementKey: config.managementKey,
    body: {},
    expectsJson: false,
    options,
  })
}
