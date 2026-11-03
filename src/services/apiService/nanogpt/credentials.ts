import { NANOGPT_MANAGEMENT_TOKEN_PREFIX } from "~/services/apiService/nanogpt/constants"
import { isRecord } from "~/utils/core/object"

const PAIRED_PREFIX = "nanogpt-credentials:"
export type NanoGptCredentials = { apiKey: string; managementToken: string }

/** Atomic account credential value: old inference-only accounts need no migration. */
export function parseNanoGptCredentials(
  value: string | undefined,
): NanoGptCredentials {
  const credential = value?.trim() ?? ""
  if (credential.startsWith(PAIRED_PREFIX)) {
    try {
      const parsed: unknown = JSON.parse(credential.slice(PAIRED_PREFIX.length))
      if (
        isRecord(parsed) &&
        typeof parsed.apiKey === "string" &&
        typeof parsed.managementToken === "string"
      )
        return {
          apiKey: parsed.apiKey.trim(),
          managementToken: parsed.managementToken.trim(),
        }
    } catch {
      /* Never send a malformed envelope as an authorization secret. */
    }
    return { apiKey: "", managementToken: "" }
  }
  return credential.startsWith(NANOGPT_MANAGEMENT_TOKEN_PREFIX)
    ? { apiKey: "", managementToken: credential }
    : { apiKey: credential, managementToken: "" }
}

/** Preserves each input role while keeping compatible single-credential values unwrapped. */
export function encodeNanoGptCredentials({
  apiKey,
  managementToken,
}: NanoGptCredentials): string {
  apiKey = apiKey.trim()
  managementToken = managementToken.trim()
  if (
    !apiKey &&
    (!managementToken ||
      managementToken.startsWith(NANOGPT_MANAGEMENT_TOKEN_PREFIX))
  )
    return managementToken
  if (!managementToken && !apiKey.startsWith(NANOGPT_MANAGEMENT_TOKEN_PREFIX))
    return apiKey
  return PAIRED_PREFIX + JSON.stringify({ apiKey, managementToken })
}
