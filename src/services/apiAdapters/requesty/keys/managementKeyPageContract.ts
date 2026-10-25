import { REQUESTY_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"

/** The console page the page action drives; it owns the Clerk session. */
export const REQUESTY_API_KEYS_ORIGIN = REQUESTY_WEB_ORIGIN
export const REQUESTY_API_KEYS_PATH = "/api-keys"
export const REQUESTY_API_KEYS_URL = `${REQUESTY_API_KEYS_ORIGIN}${REQUESTY_API_KEYS_PATH}`

/** Console-internal key routes (Clerk session), distinct from `/v1/manage/*`. */
export const REQUESTY_CONSOLE_API_KEY_COLLECTION_PATH = "/v1/apikey"
export const REQUESTY_CONSOLE_ORGANIZATION_PATH = "/v1/organization"

export const REQUESTY_MANAGEMENT_KEY_NAME_MAX_LENGTH = 96

/**
 * Creation outcomes mirror the OpenRouter bootstrap vocabulary so the shared
 * recovery UI can reason about both without a second state machine.
 */
export const REQUESTY_PROVISIONING_STATES = {
  NotDispatched: "not_dispatched",
  DispatchedUnconfirmed: "dispatched_unconfirmed",
  Created: "created",
} as const

export type TempWindowRequestyManagementKeyActionParams = {
  requestId: string
  operation: {
    kind: "create"
    name: string
  }
  suppressMinimize?: boolean
}

export type TempWindowRequestyManagementKeyActionResult =
  | {
      requestId: string
      operation: "create"
      state: typeof REQUESTY_PROVISIONING_STATES.Created
      accessToken: string
      keyId: string
      name: string
    }
  | {
      requestId: string
      operation: "create"
      state:
        | typeof REQUESTY_PROVISIONING_STATES.NotDispatched
        | typeof REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed
      /** Machine-readable cause; never carries provider text or secrets. */
      reason: RequestyProvisioningFailureReason
      name: string
    }

export const REQUESTY_PROVISIONING_FAILURE_REASONS = {
  /** The console page is not signed in (no Clerk session). */
  SessionUnavailable: "session_unavailable",
  /** The org record could not be read, so no key could be created. */
  OrganizationUnavailable: "organization_unavailable",
  /** The create request was rejected before reaching the provider. */
  CreateRejected: "create_rejected",
  /** The create was sent but no plaintext came back. */
  PlaintextMissing: "plaintext_missing",
} as const

export type RequestyProvisioningFailureReason =
  (typeof REQUESTY_PROVISIONING_FAILURE_REASONS)[keyof typeof REQUESTY_PROVISIONING_FAILURE_REASONS]

/** Builds the same secret-free failure envelope at every dispatch boundary. */
export function createRequestyManagementKeyFailure(
  requestId: string,
  name: string,
  state:
    | typeof REQUESTY_PROVISIONING_STATES.NotDispatched
    | typeof REQUESTY_PROVISIONING_STATES.DispatchedUnconfirmed,
  reason: RequestyProvisioningFailureReason,
): TempWindowRequestyManagementKeyActionResult {
  return { requestId, operation: "create", state, reason, name }
}

/** Validates the narrow runtime shape accepted by the page-action bridge. */
export function isRequestyManagementKeyActionParams(
  value: unknown,
): value is TempWindowRequestyManagementKeyActionParams {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (typeof record.requestId !== "string" || !record.requestId) return false
  const operation = record.operation
  if (!operation || typeof operation !== "object") return false
  const op = operation as Record<string, unknown>
  return op.kind === "create" && typeof op.name === "string" && op.name !== ""
}

/** Normalizes a requested key name into the provider's accepted bounds. */
export function normalizeRequestyManagementKeyName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ")
  if (!trimmed) return "All API Hub"
  return trimmed.slice(0, REQUESTY_MANAGEMENT_KEY_NAME_MAX_LENGTH)
}

/** Reads the org id that group-budget organizations require on create. */
export function readRequestyDefaultGroupId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const org = (payload as Record<string, unknown>).org
  if (!org || typeof org !== "object") return null
  const groupId = (org as Record<string, unknown>).default_group_id
  return typeof groupId === "string" && groupId ? groupId : null
}

/** Reads the one-time plaintext from a create response. */
export function readRequestyCreatedKey(
  payload: unknown,
): { keyId: string; accessToken: string } | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const keyId = record.api_key_id
  const accessToken = record.api_key
  if (typeof keyId !== "string" || !keyId) return null
  if (typeof accessToken !== "string" || !accessToken) return null
  return { keyId, accessToken }
}
