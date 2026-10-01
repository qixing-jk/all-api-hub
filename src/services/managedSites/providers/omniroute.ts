import {
  isOmniRouteAccessToken,
  OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
  resolveOmniRouteBuiltinProvider,
} from "~/constants/omniroute"
import type { ManagedSiteChannelDraftRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  classifyOmniRouteAuthFailure,
  fetchOmniRouteWhoAmI,
  hasOmniRouteAdminScope,
  listOmniRouteConnections,
  listOmniRouteConnectionSecrets,
  mintOmniRouteAccessToken,
  OMNIROUTE_AUTH_FAILURE_REASONS,
  readOmniRouteFailureMessage,
  readOmniRouteScopeShortfall,
} from "~/services/apiService/omniroute"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"
import {
  normalizeOmniRouteBaseUrl,
  type OmniRouteConfig,
} from "~/types/omnirouteConfig"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("OmniRouteProvider")

/**
 * Label recorded on the gateway when a password is exchanged for a token, so the
 * user can find and revoke it later under Settings → Access Tokens.
 */
const OMNIROUTE_TOKEN_NAME = "All API Hub"

/**
 * OmniRoute requires the `admin` scope for channel writes, because
 * `/api/providers` is listed in the gateway's `ADMIN_MUTATION_PREFIXES` while
 * plain reads only need `read`. Validating with the scope the integration
 * actually needs keeps a read-only token from looking configured.
 */
const OMNIROUTE_REQUIRED_SCOPE = "admin"

/**
 * Built-in providers that speak a non-OpenAI protocol, keyed by the protocol a
 * source account declares.
 */
const OMNIROUTE_PROTOCOL_PROVIDER_IDS: Partial<
  Record<ApiVerificationApiType, string>
> = {
  [API_TYPES.ANTHROPIC]: "anthropic",
  [API_TYPES.GOOGLE]: "gemini",
}

export type OmniRouteCredentialValidation =
  | { status: "valid"; token: string; scope: string }
  | { status: "invalid-credential"; message: string }
  | {
      status: "insufficient-scope"
      have: string
      need: string
      message: string
    }
  | { status: "default-password-rejected"; message: string }
  | { status: "unreachable"; message: string }

export interface OmniRouteCredentialInput {
  baseUrl: string
  /** Either an `oma_` access token or the panel password to exchange for one. */
  credential: string
}

/** Returns a detached error safe for user-facing and local-log disclosure. */
export function toOmniRouteDisclosureError(
  error: unknown,
  config: Pick<OmniRouteConfig, "token">,
  extraSecrets: readonly string[] = [],
): Error {
  const message = toSanitizedErrorSummary(error, [
    config.token,
    ...extraSecrets,
  ])
  return new Error(message || "OmniRoute request failed")
}

const toUnreachable = (
  error: unknown,
  input: OmniRouteCredentialInput,
): OmniRouteCredentialValidation => ({
  status: "unreachable",
  message: toOmniRouteDisclosureError(error, { token: "" }, [input.credential])
    .message,
})

/**
 * Validates one credential against an OmniRoute deployment.
 *
 * A password input is exchanged for a token first, and only the token is
 * returned; callers must never persist the password. The three rejection
 * reasons stay distinct so the settings form can tell a wrong credential from a
 * token that is merely under-scoped, and both from a deployment that has not
 * rotated its well-known default password yet.
 */
export async function validateOmniRouteCredential(
  input: OmniRouteCredentialInput,
  options?: { signal?: AbortSignal },
): Promise<OmniRouteCredentialValidation> {
  const baseUrl = normalizeOmniRouteBaseUrl(input.baseUrl)
  const credential = input.credential.trim()
  if (!baseUrl || !credential) {
    return {
      status: "invalid-credential",
      message: "OmniRoute deployment URL and credential are required",
    }
  }

  let token = credential
  if (!isOmniRouteAccessToken(credential)) {
    // The public exchange route mints an admin-scoped token by default; the
    // password itself is never stored.
    try {
      const minted = await mintOmniRouteAccessToken(
        {
          baseUrl,
          password: credential,
          name: OMNIROUTE_TOKEN_NAME,
          scope: OMNIROUTE_REQUIRED_SCOPE,
        },
        options,
      )
      token = minted.token
    } catch (error) {
      const reason = classifyOmniRouteAuthFailure(error, "password")
      if (reason === OMNIROUTE_AUTH_FAILURE_REASONS.DefaultPasswordRejected) {
        return {
          status: "default-password-rejected",
          message: readOmniRouteFailureMessage(error),
        }
      }
      if (reason === OMNIROUTE_AUTH_FAILURE_REASONS.InvalidCredential) {
        return {
          status: "invalid-credential",
          message: readOmniRouteFailureMessage(error),
        }
      }
      return toUnreachable(error, { ...input, credential })
    }
  }

  try {
    const whoAmI = await fetchOmniRouteWhoAmI({ baseUrl, token }, options)
    const scope = whoAmI?.scope?.trim() ?? ""
    if (!hasOmniRouteAdminScope(whoAmI)) {
      return {
        status: "insufficient-scope",
        have: scope,
        need: OMNIROUTE_REQUIRED_SCOPE,
        message: "",
      }
    }
    // The scope-checked read doubles as the connectivity check: it fails on an
    // unreachable deployment and on a token the gateway no longer accepts.
    await listOmniRouteConnections({ baseUrl, token }, { limit: 1 }, options)
    return { status: "valid", token, scope }
  } catch (error) {
    const reason = classifyOmniRouteAuthFailure(error, "token")
    if (reason === OMNIROUTE_AUTH_FAILURE_REASONS.InsufficientScope) {
      const shortfall = readOmniRouteScopeShortfall(
        readOmniRouteFailureMessage(error),
      )
      return {
        status: "insufficient-scope",
        have: shortfall?.have ?? "",
        need: shortfall?.need ?? OMNIROUTE_REQUIRED_SCOPE,
        message: readOmniRouteFailureMessage(error),
      }
    }
    if (reason === OMNIROUTE_AUTH_FAILURE_REASONS.InvalidCredential) {
      return {
        status: "invalid-credential",
        message: readOmniRouteFailureMessage(error),
      }
    }
    return toUnreachable(error, { ...input, credential })
  }
}

/**
 * Reads one stored channel credential in plaintext.
 *
 * `GET /api/providers/client` is the only plaintext read this integration
 * performs, and it is an optional enhancement rather than an import dependency:
 * its own comment claims same-origin access that the implementation does not
 * enforce, so a future upstream tightening must degrade into "match by address
 * only" instead of breaking imports. Callers therefore treat a failure here as
 * a degraded comparison, never as an import blocker.
 */
export async function fetchOmniRouteChannelSecretKey(
  config: OmniRouteConfig,
  connectionId: string,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const connections = await listOmniRouteConnectionSecrets(config, options)
  const connection = connections.find((item) => item.id === connectionId)
  const apiKey =
    typeof connection?.apiKey === "string" ? connection.apiKey.trim() : ""
  if (!hasUsableManagedSiteChannelKey(apiKey)) {
    throw new Error("OmniRoute did not return a readable channel credential")
  }
  return apiKey
}

/** Returns whether saved preferences contain a complete OmniRoute config. */
function hasValidOmniRouteConfig(prefs: UserPreferences | null): boolean {
  if (!prefs?.omniroute) return false
  const { baseUrl, token } = prefs.omniroute
  return Boolean(baseUrl?.trim() && token?.trim())
}

/** Verifies the saved OmniRoute config can authenticate and write channels. */
export async function checkValidOmniRouteConfig(): Promise<boolean> {
  let config: OmniRouteConfig | undefined
  try {
    const prefs = await userPreferences.getPreferences()
    if (!hasValidOmniRouteConfig(prefs) || !prefs.omniroute) return false
    config = prefs.omniroute
    const result = await validateOmniRouteCredential({
      baseUrl: config.baseUrl,
      credential: config.token,
    })
    return result.status === "valid"
  } catch (error) {
    logger.warn(
      "OmniRoute config validation failed",
      config
        ? toOmniRouteDisclosureError(error, config).message
        : toSanitizedErrorSummary(error, []),
    )
    return false
  }
}

/**
 * Resolves the built-in provider and base URL override for a source account.
 *
 * A source whose address is a known first-party endpoint maps to that provider
 * and keeps its static configuration: providers with their own request shaping
 * and path handling are not interchangeable with an OpenAI-compatible override.
 * Everything else keeps the OpenAI-compatible provider and overrides the
 * endpoint, which is a single-step create upstream (the connection-level
 * `providerSpecificData.baseUrl` wins over the provider's static configuration).
 *
 * A source that declares the Anthropic or Gemini protocol cannot be expressed by
 * the OpenAI-compatible provider, so the protocol picks the provider instead.
 */
export function resolveOmniRouteChannelTarget(source: {
  baseUrl: string
  apiType?: ManagedSiteChannelDraftSource["apiType"]
}): {
  provider: string
  /** Connection-level override to persist; empty keeps the provider's endpoint. */
  baseUrl: string
} {
  const baseUrl = source.baseUrl.trim()
  const knownProvider = resolveOmniRouteBuiltinProvider(baseUrl)
  const protocolProvider = source.apiType
    ? OMNIROUTE_PROTOCOL_PROVIDER_IDS[source.apiType]
    : undefined

  return {
    provider:
      knownProvider ?? protocolProvider ?? OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
    baseUrl: knownProvider ? "" : baseUrl,
  }
}

/**
 * Prefills the native OmniRoute editor from a resolved credential.
 *
 * OmniRoute stores no per-channel model list — models come from the gateway's
 * provider catalogue plus gateway-level aliases and disabled models, and a
 * connection only carries `defaultModel`. The import therefore fetches no
 * model list here, and the draft's `models` stays empty rather than pretending
 * a channel owns one.
 */
export function prepareChannelFormData(
  source: ManagedSiteChannelDraftSource,
  _options?: ManagedSiteChannelDraftRequestOptions,
): Promise<ManagedSiteChannelDraft> {
  const target = resolveOmniRouteChannelTarget(source)
  return Promise.resolve({
    name: source.name,
    type: target.provider,
    key: source.apiKey,
    base_url: target.baseUrl,
    models: [],
    groups: [],
    enabled: true,
  })
}
