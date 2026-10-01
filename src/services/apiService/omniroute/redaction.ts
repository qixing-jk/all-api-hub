/**
 * OmniRoute credential boundary.
 *
 * The gateway masks `apiKey` as `first8****last4` on `GET /api/providers`, but
 * only while API-key reveal is disabled for the deployment — with
 * `ALLOW_API_KEY_REVEAL` on, the same list route returns plaintext. Every
 * projection built here therefore drops the value entirely and keeps only a
 * secret *state*, so a reveal-enabled deployment cannot leak upstream
 * credentials through list rows, logs, or persisted surface data.
 *
 * The one plaintext read this integration performs is the explicit
 * `GET /api/providers/client` lookup in `providers.ts`, used only for
 * duplicate detection; it never feeds a projection.
 */

import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import type { OmniRouteConnection } from "~/types/omniroute"

export const OMNIROUTE_SECRET_STATES = {
  Available: "available",
  Masked: "masked",
  Unavailable: "unavailable",
} as const

export type OmniRouteSecretState =
  (typeof OMNIROUTE_SECRET_STATES)[keyof typeof OMNIROUTE_SECRET_STATES]

/**
 * A connection reduced to secret-free display facts.
 *
 * There is deliberately no field for the credential value: `secretState` is the
 * only thing that crosses this boundary.
 */
export interface OmniRouteSanitizedConnection {
  id: string
  provider: string
  name: string
  baseUrl: string
  nodePrefix: string
  nodeName: string
  defaultModel: string
  isActive: boolean
  /** Gateway routing rank; lower is tried first. Null when the row omits it. */
  priority: number | null
  /** Gateway connection-test state, empty before the first test. */
  testStatus: string
  /** Gateway's own diagnosis of the last failure; already sanitized upstream. */
  lastError: string
  secretState: OmniRouteSecretState
}

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

/** Reads the connection-level base URL override, if the connection has one. */
export function readOmniRouteConnectionBaseUrl(
  connection: OmniRouteConnection,
): string {
  const data = connection.providerSpecificData
  if (typeof data !== "object" || data === null) return ""
  return readString((data as Record<string, unknown>).baseUrl)
}

/** Reads the provider-node prefix snapshotted onto a compatible connection. */
function readOmniRouteConnectionNodePrefix(
  connection: OmniRouteConnection,
): string {
  const data = connection.providerSpecificData
  if (typeof data !== "object" || data === null) return ""
  return readString((data as Record<string, unknown>).prefix)
}

const readConnectionNodeName = (connection: OmniRouteConnection): string => {
  const data = connection.providerSpecificData
  if (typeof data !== "object" || data === null) return ""
  return readString((data as Record<string, unknown>).nodeName)
}

/**
 * Classifies a credential read without retaining its value.
 *
 * A usable value means the gateway returned a real secret (reveal enabled, or a
 * client-route read); a masked value means the row only carries the gateway's
 * placeholder.
 */
function toOmniRouteSecretState(rawApiKey: unknown): OmniRouteSecretState {
  const value = readString(rawApiKey)
  if (!value) return OMNIROUTE_SECRET_STATES.Unavailable
  return hasUsableManagedSiteChannelKey(value)
    ? OMNIROUTE_SECRET_STATES.Available
    : OMNIROUTE_SECRET_STATES.Masked
}

/** Reads the gateway's routing rank, keeping only a usable integer. */
function readConnectionPriority(
  connection: OmniRouteConnection,
): number | null {
  const priority = connection.priority
  return typeof priority === "number" && Number.isInteger(priority)
    ? priority
    : null
}

/** Reduces a raw connection to secret-free display facts. */
export function toOmniRouteSanitizedConnection(
  connection: OmniRouteConnection,
): OmniRouteSanitizedConnection {
  const name =
    readString(connection.name) ||
    readString(connection.displayName) ||
    connection.id
  return {
    id: connection.id,
    provider: readString(connection.provider),
    name,
    baseUrl: readOmniRouteConnectionBaseUrl(connection),
    nodePrefix: readOmniRouteConnectionNodePrefix(connection),
    nodeName: readConnectionNodeName(connection),
    defaultModel: readString(connection.defaultModel),
    isActive: connection.isActive !== false,
    priority: readConnectionPriority(connection),
    testStatus: readString(connection.testStatus),
    lastError: readString(connection.lastError),
    secretState: toOmniRouteSecretState(connection.apiKey),
  }
}
