import {
  NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
  parseNewApiDashboardAuthBundleResponse,
} from "~/services/apiService/newApi/dashboardAuth"
import {
  readNewApiDashboardSessionAuth,
  rememberVerifiedNewApiDashboardSession,
} from "~/services/apiService/newApiFamily/passwordUi"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"

import {
  NEW_API_TOKEN_ENDPOINTS as ENDPOINTS,
  NEW_API_TOKEN_VERIFICATION_ERRORS as VERIFICATION_ERRORS,
} from "./protocol"
import {
  NewApiTokenSessionError,
  NEW_API_TOKEN_SESSION_ERRORS as SESSION_ERRORS,
} from "./sessionError"

const SESSION_REQUEST_TIMEOUT_MS = 15_000
const PASSKEY_PROMPT_TIMEOUT_MS = 120_000

/** Acquire only a modern session from this exact website, never a saved PAT or another identity. */
export async function prepareNewApiTokenSession(
  expectedOrigin: unknown,
  expectedIdentity: unknown,
) {
  if (
    expectedOrigin !== location.origin ||
    typeof expectedIdentity !== "string" ||
    !expectedIdentity
  )
    throw new Error(VERIFICATION_ERRORS.INVALID_CONTEXT)
  const cached = readNewApiDashboardSessionAuth(location.origin)
  const refresh = async () => {
    const response = await fetch(NEW_API_DASHBOARD_AUTH_REFRESH_PATH, {
      method: "POST",
      credentials: "include",
      redirect: "error",
      signal: AbortSignal.timeout(SESSION_REQUEST_TIMEOUT_MS),
    })
    if (response.status === 404 || response.status === 405)
      throw new NewApiTokenSessionError(SESSION_ERRORS.UNSUPPORTED)
    if (!response.ok)
      throw new NewApiTokenSessionError(SESSION_ERRORS.UNAVAILABLE)
    return response.json()
  }
  const readBundle = (envelope: unknown) => {
    const parsed = parseNewApiDashboardAuthBundleResponse(envelope)
    if (parsed.kind !== "valid" || parsed.bundle.user.id == null)
      throw new NewApiTokenSessionError(SESSION_ERRORS.UNAVAILABLE)
    if (String(parsed.bundle.user.id) !== expectedIdentity)
      throw new NewApiTokenSessionError(SESSION_ERRORS.IDENTITY_MISMATCH)
    return parsed.bundle
  }
  let session = readBundle(cached ?? (await refresh()))
  const readIdentity = (token: string) =>
    fetch(ENDPOINTS.SELF, {
      credentials: "omit",
      redirect: "error",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(SESSION_REQUEST_TIMEOUT_MS),
    })
  let response = await readIdentity(session.token)
  if (cached && response.status === 401) {
    session = readBundle(await refresh())
    response = await readIdentity(session.token)
  }
  if (!response.ok)
    throw new NewApiTokenSessionError(SESSION_ERRORS.UNAVAILABLE)
  const self = await response.json()
  if (self?.success !== true || self.data?.id == null)
    throw new NewApiTokenSessionError(SESSION_ERRORS.UNAVAILABLE)
  if (String(self.data.id) !== expectedIdentity)
    throw new NewApiTokenSessionError(SESSION_ERRORS.IDENTITY_MISMATCH)
  rememberVerifiedNewApiDashboardSession(session)
  return session
}

const passkeyRequests = new Map<string, AbortController>()

/** Release only this operation's native WebAuthn prompt. */
export function cancelNewApiTokenPasskey(
  expectedOrigin: unknown,
  requestId: unknown,
) {
  if (expectedOrigin === location.origin && typeof requestId === "string")
    passkeyRequests.get(requestId)?.abort()
}

/** WebAuthn executes in the relying party's document, not in the extension origin. */
export async function requestNewApiTokenPasskey(
  expectedOrigin: unknown,
  raw: unknown,
  requestId: unknown,
) {
  if (
    expectedOrigin !== location.origin ||
    !raw ||
    typeof raw !== "object" ||
    typeof requestId !== "string" ||
    !requestId
  )
    throw new Error("INVALID_PASSKEY_CONTEXT")
  if (passkeyRequests.size) throw new Error("PASSKEY_REQUEST_BUSY")
  const options = raw as { publicKey?: Record<string, unknown> } & Record<
    string,
    unknown
  >
  const value = options.publicKey ?? options
  const decode = (input: string) =>
    Uint8Array.from(atob(input.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    )
  const encode = (input: ArrayBuffer | null) =>
    input
      ? btoa(
          Array.from(new Uint8Array(input), (c) => String.fromCharCode(c)).join(
            "",
          ),
        )
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/g, "")
      : null
  const publicKey = {
    ...value,
    challenge: decode(String(value.challenge)),
    allowCredentials: Array.isArray(value.allowCredentials)
      ? value.allowCredentials.map((credential) => ({
          ...credential,
          id: decode(credential.id),
        }))
      : undefined,
  } as PublicKeyCredentialRequestOptions
  const controller = new AbortController()
  const abort = composeAbortSignals([
    controller.signal,
    AbortSignal.timeout(PASSKEY_PROMPT_TIMEOUT_MS),
  ])
  passkeyRequests.set(requestId, controller)
  let credential: PublicKeyCredential | null
  try {
    credential = (await navigator.credentials.get({
      publicKey,
      signal: abort.signal,
    })) as PublicKeyCredential | null
  } catch (error) {
    if (
      !abort.signal?.aborted &&
      error instanceof DOMException &&
      error.name === "NotAllowedError"
    )
      return null
    throw error
  } finally {
    abort.dispose()
    passkeyRequests.delete(requestId)
  }
  if (!credential) return null
  const assertion = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      clientDataJSON: encode(assertion.clientDataJSON),
      authenticatorData: encode(assertion.authenticatorData),
      signature: encode(assertion.signature),
      userHandle: encode(assertion.userHandle),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  }
}
