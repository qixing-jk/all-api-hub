import { REQUESTY_MANAGE_API_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import {
  normalizeRequestyManagementKeyName,
  readRequestyCreatedKey,
  readRequestyDefaultGroupId,
  REQUESTY_API_KEYS_ORIGIN,
  REQUESTY_API_KEYS_PATH,
  REQUESTY_CONSOLE_API_KEY_COLLECTION_PATH,
  REQUESTY_CONSOLE_ORGANIZATION_PATH,
  REQUESTY_PROVISIONING_FAILURE_REASONS,
  type RequestyProvisioningFailureReason,
} from "~/services/apiAdapters/requesty/keys/managementKeyPageContract"
import { REQUESTY_KEY_PERMISSIONS } from "~/services/apiService/requesty/constants"

/**
 * Main-world bridge that creates a Requesty manage key inside the console.
 *
 * The console authenticates `api-v2.requesty.ai` with a short-lived Clerk JWT
 * that only exists in page memory, so the create must run here rather than in
 * the extension worker. Verified live 2026-10-23:
 *   - `window.Clerk.session.getToken()` returns the JWT the console sends
 *   - `POST /v1/apikey` on api-v2 accepts it and returns the one-time plaintext
 *   - group-budget organizations additionally require `group_id`
 *
 * The response carries only the created credential or a machine-readable
 * failure reason; provider text never leaves the page.
 */

export const REQUESTY_MANAGEMENT_KEY_CHANNEL =
  "all-api-hub:requesty-management-key:v1"
export const REQUESTY_MANAGEMENT_KEY_REQUEST_KIND = "request"
export const REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND = "response"

const BRIDGE_INSTALL_MARKER = Symbol.for(
  "all-api-hub.requesty-management-key.v1.installed",
)

export type RequestyManagementKeyBridgeRequest = {
  channel: typeof REQUESTY_MANAGEMENT_KEY_CHANNEL
  kind: typeof REQUESTY_MANAGEMENT_KEY_REQUEST_KIND
  correlationId: string
  name: string
}

export type RequestyManagementKeyBridgeResponse =
  | {
      channel: typeof REQUESTY_MANAGEMENT_KEY_CHANNEL
      kind: typeof REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND
      correlationId: string
      ok: true
      keyId: string
      accessToken: string
    }
  | {
      channel: typeof REQUESTY_MANAGEMENT_KEY_CHANNEL
      kind: typeof REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND
      correlationId: string
      ok: false
      reason: RequestyProvisioningFailureReason
    }

export type RequestyManagementKeyCreationResult =
  | { ok: true; keyId: string; accessToken: string }
  | { ok: false; reason: RequestyProvisioningFailureReason }

type ClerkLike = {
  loaded?: boolean
  session?: { getToken?: () => Promise<string | null> } | null
}

/** Reads the console's Clerk global without assuming its shape. */
function readClerk(): ClerkLike | undefined {
  return (window as unknown as { Clerk?: ClerkLike }).Clerk
}

/** Reads a fresh Clerk session JWT, or null when the console is signed out. */
async function readSessionToken(): Promise<string | null> {
  try {
    // A fresh console tab can finish navigation before Clerk restores its
    // session. Only a loaded Clerk instance can establish that it is signed out.
    // Keep this grace period below the reader's 20-second bridge deadline.
    const deadline = Date.now() + 8_000
    let clerk = readClerk()
    while (
      !clerk ||
      clerk.loaded === false ||
      (clerk.loaded !== true && !clerk.session)
    ) {
      if (Date.now() >= deadline) return null
      await new Promise((resolve) => setTimeout(resolve, 100))
      clerk = readClerk()
    }
    const token = await clerk.session?.getToken?.()
    return typeof token === "string" && token ? token : null
  } catch {
    return null
  }
}

/** Runs one authenticated console request against the management host. */
async function consoleFetch(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; payload: unknown }> {
  const response = await fetch(`${REQUESTY_MANAGE_API_ORIGIN}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    credentials: "omit",
  })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  return { status: response.status, payload }
}

/** Creates one manage key and returns the one-time plaintext. */
export async function createRequestyManagementKeyInPage(
  rawName: string,
): Promise<RequestyManagementKeyCreationResult> {
  const name = normalizeRequestyManagementKeyName(rawName)
  const token = await readSessionToken()
  if (!token) {
    return {
      ok: false,
      reason: REQUESTY_PROVISIONING_FAILURE_REASONS.SessionUnavailable,
    }
  }

  let groupId: string | null = null
  try {
    const organization = await consoleFetch(
      REQUESTY_CONSOLE_ORGANIZATION_PATH,
      token,
    )
    if (organization.status !== 200) {
      return {
        ok: false,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.OrganizationUnavailable,
      }
    }
    groupId = readRequestyDefaultGroupId(organization.payload)
  } catch {
    return {
      ok: false,
      reason: REQUESTY_PROVISIONING_FAILURE_REASONS.OrganizationUnavailable,
    }
  }

  try {
    const created = await consoleFetch(
      REQUESTY_CONSOLE_API_KEY_COLLECTION_PATH,
      token,
      {
        method: "POST",
        body: {
          name,
          ...(groupId ? { group_id: groupId } : {}),
          // The extension's whole workflow needs the management endpoints.
          permissions: {
            manage: REQUESTY_KEY_PERMISSIONS.Write,
            completions: REQUESTY_KEY_PERMISSIONS.Write,
          },
        },
      },
    )
    const credential = readRequestyCreatedKey(created.payload)
    if (created.status !== 200 || !credential) {
      // The POST already reached the provider, so a rejection or an unreadable
      // body cannot prove that no key was created.
      return {
        ok: false,
        reason: REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
      }
    }
    return {
      ok: true,
      keyId: credential.keyId,
      accessToken: credential.accessToken,
    }
  } catch {
    return {
      ok: false,
      reason: REQUESTY_PROVISIONING_FAILURE_REASONS.PlaintextMissing,
    }
  }
}

/** Validates the complete main-world request shape. */
function isBridgeRequest(
  value: unknown,
): value is RequestyManagementKeyBridgeRequest {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return (
    record.channel === REQUESTY_MANAGEMENT_KEY_CHANNEL &&
    record.kind === REQUESTY_MANAGEMENT_KEY_REQUEST_KIND &&
    typeof record.correlationId === "string" &&
    record.correlationId.length > 0 &&
    record.correlationId.length <= 128 &&
    typeof record.name === "string"
  )
}

/** Builds the wire response for one page-side result. */
function toBridgeResponse(
  correlationId: string,
  result: RequestyManagementKeyCreationResult,
): RequestyManagementKeyBridgeResponse {
  return result.ok
    ? {
        channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
        kind: REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND,
        correlationId,
        ok: true,
        keyId: result.keyId,
        accessToken: result.accessToken,
      }
    : {
        channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
        kind: REQUESTY_MANAGEMENT_KEY_RESPONSE_KIND,
        correlationId,
        ok: false,
        reason: result.reason,
      }
}

/** Installs the main-world bridge once per page. */
export function setupRequestyManagementKeyBridge() {
  if (Reflect.get(window, BRIDGE_INSTALL_MARKER) === true) return
  Reflect.defineProperty(window, BRIDGE_INSTALL_MARKER, { value: true })

  if (
    window.location.origin !== REQUESTY_API_KEYS_ORIGIN ||
    window.location.pathname !== REQUESTY_API_KEYS_PATH
  ) {
    return
  }

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return
    if (event.origin !== REQUESTY_API_KEYS_ORIGIN) return
    if (!isBridgeRequest(event.data)) return

    const { correlationId, name } = event.data
    void createRequestyManagementKeyInPage(name).then((result) => {
      window.postMessage(
        toBridgeResponse(correlationId, result),
        REQUESTY_API_KEYS_ORIGIN,
      )
    })
  })
}
