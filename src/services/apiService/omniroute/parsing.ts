/**
 * OmniRoute response envelope readers.
 *
 * These turn untrusted JSON into the shapes this extension projects. OmniRoute
 * answers collection routes with a `{ connections }` envelope and a single
 * resource with `{ connection }`; the readers tolerate a bare array/object so a
 * shape change degrades into "empty" instead of throwing mid-render.
 */

import type {
  OmniRouteConnection,
  OmniRouteMintedToken,
  OmniRouteModelEntry,
  OmniRouteWhoAmI,
} from "~/types/omniroute"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isConnection = (value: unknown): value is OmniRouteConnection => {
  if (!isRecord(value)) return false
  return typeof value.id === "string" && value.id.length > 0
}

/** Reads the `connections` array from a list or client route response. */
export function readOmniRouteConnections(
  payload: unknown,
): OmniRouteConnection[] {
  if (Array.isArray(payload)) {
    return payload.filter(isConnection)
  }
  if (!isRecord(payload)) return []
  const connections = payload.connections
  return Array.isArray(connections) ? connections.filter(isConnection) : []
}

/** Reads one connection from a create/update/detail response. */
export function readOmniRouteConnection(
  payload: unknown,
): OmniRouteConnection | null {
  if (isConnection(payload)) return payload
  if (!isRecord(payload)) return null
  return isConnection(payload.connection) ? payload.connection : null
}

/**
 * Reads the model catalogue entries from `GET /api/models`.
 *
 * Entries are also the deployment's only view of which built-in provider ids it
 * serves, because the gateway exposes no provider-catalogue route.
 */
export function readOmniRouteModelEntries(
  payload: unknown,
): OmniRouteModelEntry[] {
  const entries = isRecord(payload)
    ? payload.models
    : Array.isArray(payload)
      ? payload
      : undefined
  if (!Array.isArray(entries)) return []
  return entries.filter(isRecord) as OmniRouteModelEntry[]
}

/** Reads `GET /api/cli/whoami`. */
export function readOmniRouteWhoAmI(payload: unknown): OmniRouteWhoAmI | null {
  return isRecord(payload) ? (payload as OmniRouteWhoAmI) : null
}

/** Reads the one-time plaintext token from `POST /api/cli/connect`. */
export function readOmniRouteMintedToken(
  payload: unknown,
): OmniRouteMintedToken | null {
  if (!isRecord(payload)) return null
  const token = payload.token
  if (typeof token !== "string" || !token.trim()) return null
  return payload as OmniRouteMintedToken
}
