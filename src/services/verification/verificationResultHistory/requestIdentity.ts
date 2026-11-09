import {
  API_VERIFICATION_MODES,
  API_VERIFICATION_REQUEST_PROFILES,
} from "~/services/verification/aiApiVerification/types"

import type { ContextHistoryRequest } from "./contextCapacityHistory"
import {
  API_VERIFICATION_HISTORY_TARGET_KINDS,
  type ApiVerificationHistoryTarget,
} from "./types"

/** Hash the complete request identity; neither credentials nor the URL are stored. */
export async function getVerificationScopeKey(request: ContextHistoryRequest) {
  return digestIdentity(getVerificationRequestIdentity(request))
}

/** In-memory equality only; never persist the unhashed request identity. */
export function getVerificationRequestIdentity(request: ContextHistoryRequest) {
  const headers = Object.entries(request.requestHeaders ?? {})
    .map(([name, value]) => [name.toLowerCase(), value])
    .sort()
  return JSON.stringify([
    request.apiType,
    request.baseUrl.trim().replace(/\/+$/, ""),
    request.apiKey,
    request.modelId.trim(),
    request.mode ?? API_VERIFICATION_MODES.Streaming,
    request.requestProfile ?? API_VERIFICATION_REQUEST_PROFILES.Default,
    request.requestProfileEnhanced ?? false,
    headers,
  ])
}

/** Only digests are persisted; the unhashed connection identity stays in memory. */
export async function digestIdentity(identity: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Bind profile-level entry points to the model actually tested. */
export function modelTarget(
  target: ApiVerificationHistoryTarget | undefined,
  modelId: string,
) {
  return target?.kind === API_VERIFICATION_HISTORY_TARGET_KINDS.Profile
    ? ({
        kind: API_VERIFICATION_HISTORY_TARGET_KINDS.ProfileModel,
        profileId: target.profileId,
        modelId,
      } as const)
    : target
}
