/**
 * OmniRoute provider-connection routes — the gateway's "channels".
 *
 * The list envelope, the create envelope, the credential masking, and the
 * connection-level `baseUrl` override were observed on a live deployment of the
 * `release/v3.8.51` line on 2026-09-29; the remaining points below come from
 * reading the same revision's route handler, and the partial-update path was not
 * exercised live.
 * - `GET /api/providers` masks `apiKey` unless the deployment sets
 *   `ALLOW_API_KEY_REVEAL`, and answers `{ connections, total }`.
 * - `POST /api/providers` answers 201 `{ connection }` with `apiKey` removed.
 *   It performs no reachability check at all (unlike `/bulk` and `/import`,
 *   which validate every key), so an import never depends on the gateway being
 *   able to reach the source. The handler also forces `isActive: false` and
 *   fire-and-forgets a connection test that may flip it to true afterwards.
 * - `providerSpecificData.baseUrl` is the connection-level endpoint override and
 *   wins over the provider's static configuration at request time.
 * - A compatible provider node is only needed for a dedicated model prefix; the
 *   connection snapshots the node's `baseUrl`/`prefix`/`nodeName` at creation.
 * That revision's docs/openapi.yaml incorrectly requires `url` for creation;
 * the handler requires `apiKey` and carries overrides in `providerSpecificData`.
 * Follow the linked handler when changing this transport.
 * https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/app/api/providers/route.ts
 */

import type { OmniRouteConnection } from "~/types/omniroute"
import type { OmniRouteConfig } from "~/types/omnirouteConfig"

import { readOmniRouteConnection, readOmniRouteConnections } from "./parsing"
import {
  callOmniRoute,
  OmniRouteApiError,
  type OmniRouteRequestOptions,
} from "./request"

/** Page size for inventory walks; the gateway accepts `limit`/`offset`. */
const OMNIROUTE_PAGE_SIZE = 200

/** Guards a walk against a gateway that keeps reporting the same page. */
const OMNIROUTE_MAX_PAGES = 200

export interface OmniRouteConnectionListPage {
  connections: OmniRouteConnection[]
  total: number | null
}

/** Reads one page of the connection inventory (masked projection). */
export async function listOmniRouteConnections(
  config: OmniRouteConfig,
  query: { limit?: number; offset?: number; provider?: string } = {},
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteConnectionListPage> {
  const searchParams = new URLSearchParams()
  if (query.limit !== undefined) searchParams.set("limit", String(query.limit))
  if (query.offset !== undefined)
    searchParams.set("offset", String(query.offset))
  const provider = query.provider?.trim()
  if (provider) searchParams.set("provider", provider)

  const payload = await callOmniRoute<unknown>({
    baseUrl: config.baseUrl,
    path: "/api/providers",
    method: "GET",
    token: config.token,
    searchParams,
    options,
  })

  const connections = readOmniRouteConnections(payload)
  const total =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { total?: unknown }).total === "number"
      ? (payload as { total: number }).total
      : null

  return { connections, total }
}

/** Walks the full connection inventory for a complete local projection. */
export async function listAllOmniRouteConnections(
  config: OmniRouteConfig,
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteConnection[]> {
  const collected: OmniRouteConnection[] = []
  const seen = new Set<string>()

  for (let page = 0; page < OMNIROUTE_MAX_PAGES; page += 1) {
    const offset = page * OMNIROUTE_PAGE_SIZE
    const { connections, total } = await listOmniRouteConnections(
      config,
      { limit: OMNIROUTE_PAGE_SIZE, offset },
      options,
    )

    let added = 0
    for (const connection of connections) {
      if (seen.has(connection.id)) continue
      seen.add(connection.id)
      collected.push(connection)
      added += 1
    }

    if (connections.length < OMNIROUTE_PAGE_SIZE) return collected
    if (added === 0) return collected
    if (total !== null && collected.length >= total) return collected
  }

  return collected
}

/** Reads one connection. */
export async function getOmniRouteConnection(
  config: OmniRouteConfig,
  connectionId: string,
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteConnection> {
  const payload = await callOmniRoute<unknown>({
    baseUrl: config.baseUrl,
    path: `/api/providers/${encodeURIComponent(connectionId)}`,
    method: "GET",
    token: config.token,
    options,
  })

  const connection = readOmniRouteConnection(payload)
  if (!connection) {
    throw new OmniRouteApiError(
      "OmniRoute returned an invalid connection",
      200,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
        raw: payload,
      },
    )
  }
  return connection
}

/**
 * Create payload for `POST /api/providers`.
 *
 * `isActive` is deliberately absent: the route does not accept it and always
 * persists `false`, letting its own connection test decide when the connection
 * is advertised.
 */
export interface OmniRouteConnectionCreatePayload {
  provider: string
  name: string
  apiKey: string
  defaultModel?: string | null
  providerSpecificData?: Record<string, unknown> | null
}

/** Update payload for `PATCH /api/providers/{id}`; only listed fields change. */
export interface OmniRouteConnectionUpdatePayload {
  name?: string
  apiKey?: string
  defaultModel?: string | null
  isActive?: boolean
  /** Routing rank; the update route accepts `1..100_000` only. */
  priority?: number
  providerSpecificData?: Record<string, unknown>
}

/** Creates one connection. */
export async function createOmniRouteConnection(
  config: OmniRouteConfig,
  payload: OmniRouteConnectionCreatePayload,
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteConnection> {
  const body = await callOmniRoute<unknown>({
    baseUrl: config.baseUrl,
    path: "/api/providers",
    method: "POST",
    token: config.token,
    body: {
      provider: payload.provider,
      name: payload.name,
      apiKey: payload.apiKey,
      ...(payload.defaultModel ? { defaultModel: payload.defaultModel } : {}),
      ...(payload.providerSpecificData
        ? { providerSpecificData: payload.providerSpecificData }
        : {}),
    },
    options,
  })

  const connection = readOmniRouteConnection(body)
  if (!connection) {
    throw new OmniRouteApiError(
      "OmniRoute returned an invalid connection",
      201,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
        raw: body,
      },
    )
  }
  return connection
}

/** Applies an explicit partial update. */
export async function updateOmniRouteConnection(
  config: OmniRouteConfig,
  connectionId: string,
  payload: OmniRouteConnectionUpdatePayload,
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteConnection> {
  const body = await callOmniRoute<unknown>({
    baseUrl: config.baseUrl,
    path: `/api/providers/${encodeURIComponent(connectionId)}`,
    method: "PATCH",
    token: config.token,
    body: payload,
    options,
  })

  const connection = readOmniRouteConnection(body)
  if (!connection) {
    throw new OmniRouteApiError(
      "OmniRoute returned an invalid connection",
      200,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
        raw: body,
      },
    )
  }
  return connection
}

/** Deletes one connection. */
export async function deleteOmniRouteConnection(
  config: OmniRouteConfig,
  connectionId: string,
  options?: OmniRouteRequestOptions,
): Promise<void> {
  await callOmniRoute<unknown>({
    baseUrl: config.baseUrl,
    path: `/api/providers/${encodeURIComponent(connectionId)}`,
    method: "DELETE",
    token: config.token,
    expectsJson: false,
    options,
  })
}

export interface OmniRouteProviderNodeCreatePayload {
  name: string
  prefix: string
  apiType: "chat" | "responses"
  baseUrl: string
  type: "openai-compatible"
}

/**
 * Creates a compatible provider node so a connection can carry its own model
 * prefix. Only the advanced import path needs this; a plain connection-level
 * `providerSpecificData.baseUrl` override covers the default path.
 */
export async function createOmniRouteProviderNode(
  config: OmniRouteConfig,
  payload: OmniRouteProviderNodeCreatePayload,
  options?: OmniRouteRequestOptions,
): Promise<string> {
  const body = await callOmniRoute<unknown>({
    baseUrl: config.baseUrl,
    path: "/api/provider-nodes",
    method: "POST",
    token: config.token,
    body: payload,
    options,
  })

  const node =
    typeof body === "object" && body !== null
      ? (body as { node?: unknown }).node ?? body
      : undefined
  const id =
    typeof node === "object" && node !== null
      ? (node as { id?: unknown }).id
      : undefined
  if (typeof id !== "string" || !id.trim()) {
    throw new OmniRouteApiError(
      "OmniRoute returned an invalid provider node",
      201,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
        raw: body,
      },
    )
  }
  return id.trim()
}

/** Deletes a provider node; used to compensate a failed node-backed create. */
export async function deleteOmniRouteProviderNode(
  config: OmniRouteConfig,
  nodeId: string,
  options?: OmniRouteRequestOptions,
): Promise<void> {
  await callOmniRoute<unknown>({
    baseUrl: config.baseUrl,
    path: `/api/provider-nodes/${encodeURIComponent(nodeId)}`,
    method: "DELETE",
    token: config.token,
    expectsJson: false,
    options,
  })
}

/**
 * Reads connection credentials in plaintext.
 *
 * `GET /api/providers/client` returns `{...connection}` unchanged — it is not
 * field-whitelisted the way the same route is on 9router, so it is the only
 * place a stored channel credential can be read back. Its own comment claims it
 * is "only accessible from same origin", which the implementation does not
 * enforce; this integration therefore treats it as an optional enhancement that
 * can be tightened upstream at any time. It is never a list data source: only
 * the explicit duplicate-detection flow calls it, and its result is discarded
 * after comparison.
 */
export async function listOmniRouteConnectionSecrets(
  config: OmniRouteConfig,
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteConnection[]> {
  const payload = await callOmniRoute<unknown>({
    baseUrl: config.baseUrl,
    path: "/api/providers/client",
    method: "GET",
    token: config.token,
    options,
  })
  return readOmniRouteConnections(payload)
}
