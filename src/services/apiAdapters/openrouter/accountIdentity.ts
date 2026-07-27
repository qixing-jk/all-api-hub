import { SITE_TYPES } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { safeRandomUUID } from "~/utils/core/identifier"

import type { OpenRouterClerkSessionIdentity } from "./types"

type OpenRouterBootstrapIdentity = {
  userId: string
  username: string
}

const OPENROUTER_LOCAL_ID_PREFIX = `${SITE_TYPES.OPENROUTER}:`
const GENERATED_OPENROUTER_ID_SUFFIX =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\d{10,}-[a-z0-9]{1,8})$/i

/** Returns whether an identity was generated locally for OpenRouter. */
function isGeneratedOpenRouterFallback(value: string): boolean {
  return (
    value.startsWith(OPENROUTER_LOCAL_ID_PREFIX) &&
    GENERATED_OPENROUTER_ID_SUFFIX.test(
      value.slice(OPENROUTER_LOCAL_ID_PREFIX.length),
    )
  )
}

/** Creates an extension-local fallback identity for OpenRouter. */
export function createOpenRouterFallbackUserId(): string {
  return `${OPENROUTER_LOCAL_ID_PREFIX}${safeRandomUUID()}`
}

/** Resolves editable metadata while preserving only extension-generated fallbacks. */
export function resolveOpenRouterAccountUserId(input: {
  enteredUserId: unknown
  creatorUserId?: unknown
  existingUserId?: unknown
}): string {
  const entered = normalizeAccountIdentity(input.enteredUserId)
  if (entered) return entered

  const creator = normalizeAccountIdentity(input.creatorUserId)
  if (creator) return creator

  const existing = normalizeAccountIdentity(input.existingUserId)
  if (existing && isGeneratedOpenRouterFallback(existing)) return existing

  return createOpenRouterFallbackUserId()
}

/** Resolves trusted bootstrap defaults from page and credential evidence. */
export function resolveOpenRouterBootstrapIdentity({
  sessionIdentity,
  creatorUserId,
}: {
  sessionIdentity?: OpenRouterClerkSessionIdentity
  creatorUserId: unknown
}): OpenRouterBootstrapIdentity {
  const sessionUserId = normalizeAccountIdentity(sessionIdentity?.userId)
  const creatorIdentity = normalizeAccountIdentity(creatorUserId)
  const sessionUsername = sessionIdentity?.username.trim() ?? ""

  if (
    sessionUserId &&
    (!creatorIdentity || sessionUserId === creatorIdentity)
  ) {
    return { userId: sessionUserId, username: sessionUsername }
  }

  if (creatorIdentity) {
    // A mismatch may represent another signed-in account, so its display name
    // must not be attached to the credential creator.
    return { userId: creatorIdentity, username: "" }
  }

  return {
    userId: createOpenRouterFallbackUserId(),
    username: "",
  }
}
