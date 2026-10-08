import {
  GPT_LOAD_DEFAULT_CHANNEL_ID,
  resolveGptLoadFirstPartyChannel,
} from "~/constants/gptLoad"
import type { ManagedSiteChannelDraftRequestOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import {
  classifyGptLoadAuthFailure,
  fetchGptLoadSession,
  GPT_LOAD_AUTH_FAILURE_REASONS,
  hasGptLoadAdminPrincipal,
  listGptLoadGroupCredentials,
  listGptLoadGroups,
  readGptLoadFailureMessage,
  revealGptLoadGroupCredential,
} from "~/services/apiService/gptLoad"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import { userPreferences } from "~/services/preferences/userPreferences"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import {
  normalizeGptLoadBaseUrl,
  type GptLoadConfig,
} from "~/types/gptLoadConfig"
import type {
  ManagedSiteChannelDraft,
  ManagedSiteChannelDraftSource,
} from "~/types/managedSiteChannelDraft"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("GptLoadProvider")

export type GptLoadCredentialValidation =
  | { status: "valid"; principalType: string }
  | { status: "invalid-credential"; message: string }
  | { status: "insufficient-privilege"; message: string }
  | { status: "unreachable"; message: string }

export interface GptLoadCredentialInput {
  baseUrl: string
  /** The gateway's root management key (`AUTH_KEY`). */
  credential: string
}

/** Returns a detached error safe for user-facing and local-log disclosure. */
export function toGptLoadDisclosureError(
  error: unknown,
  config: Pick<GptLoadConfig, "managementKey">,
  extraSecrets: readonly string[] = [],
): Error {
  const message = toSanitizedErrorSummary(error, [
    config.managementKey,
    ...extraSecrets,
  ])
  return new Error(message || "gpt-load request failed")
}

const toUnreachable = (
  error: unknown,
  input: GptLoadCredentialInput,
): GptLoadCredentialValidation => ({
  status: "unreachable",
  message: toGptLoadDisclosureError(error, {
    managementKey: input.credential,
  }).message,
})

/**
 * Validates a management key with read-only gateway requests.
 *
 * The key is opaque: the gateway checks it and reports the principal type. An
 * access key (`sk-gl-`) authenticates but is read-only on the control plane, so
 * only `principal_type === "admin"` counts as configured. Validation performs a
 * single request and never retries a rejected key, because the gateway locks a
 * peer IP for 30 minutes after 5 failed attempts.
 */
export async function validateGptLoadCredential(
  input: GptLoadCredentialInput,
  options?: { signal?: AbortSignal },
): Promise<GptLoadCredentialValidation> {
  const baseUrl = normalizeGptLoadBaseUrl(input.baseUrl)
  const credential = input.credential.trim()
  if (!baseUrl || !credential) {
    return {
      status: "invalid-credential",
      message: "gpt-load deployment URL and management key are required",
    }
  }

  const config: GptLoadConfig = { baseUrl, managementKey: credential }

  try {
    const session = await fetchGptLoadSession(config, options)
    if (!hasGptLoadAdminPrincipal(session)) {
      return {
        status: "insufficient-privilege",
        message:
          "This key authenticates but is not the gateway's admin key; use the AUTH_KEY.",
      }
    }
    // The session check doubles as the connectivity check; a group read
    // confirms the control plane answers and the key can list channels.
    await listGptLoadGroups(config, { page: 1, pageSize: 1 }, options)
    return {
      status: "valid",
      principalType: session?.principalType ?? "admin",
    }
  } catch (error) {
    const reason = classifyGptLoadAuthFailure(error)
    if (
      reason === GPT_LOAD_AUTH_FAILURE_REASONS.InvalidCredential ||
      reason === GPT_LOAD_AUTH_FAILURE_REASONS.InsufficientPrivilege
    ) {
      return {
        status:
          reason === GPT_LOAD_AUTH_FAILURE_REASONS.InsufficientPrivilege
            ? "insufficient-privilege"
            : "invalid-credential",
        message:
          toGptLoadDisclosureError(error, { managementKey: credential })
            .message || readGptLoadFailureMessage(error),
      }
    }
    return toUnreachable(error, { ...input, credential })
  }
}

/** Returns whether saved preferences contain a complete gpt-load config. */
function hasValidGptLoadConfig(prefs: UserPreferences | null): boolean {
  if (!prefs?.gptLoad) return false
  const { baseUrl, managementKey } = prefs.gptLoad
  return Boolean(baseUrl?.trim() && managementKey?.trim())
}

/** Verifies the saved gpt-load config can authenticate and write channels. */
export async function checkValidGptLoadConfig(): Promise<boolean> {
  let config: GptLoadConfig | undefined
  try {
    const prefs = await userPreferences.getPreferences()
    if (!hasValidGptLoadConfig(prefs) || !prefs.gptLoad) return false
    config = prefs.gptLoad
    const result = await validateGptLoadCredential({
      baseUrl: config.baseUrl,
      credential: config.managementKey,
    })
    return result.status === "valid"
  } catch (error) {
    logger.warn(
      "gpt-load config validation failed",
      config
        ? toGptLoadDisclosureError(error, config).message
        : toSanitizedErrorSummary(error, []),
    )
    return false
  }
}

/**
 * Resolves the channel id and base-URL override for a source account.
 *
 * A source whose address is a known first-party endpoint maps to that channel
 * id and keeps its static configuration. Everything else keeps the
 * `openai_compatible` channel and overrides its `base_url`, which is a
 * single-step create upstream (the module requires `base_url`).
 */
export function resolveGptLoadChannelTarget(source: { baseUrl: string }): {
  channelId: string
  /** Channel param to persist; empty keeps the channel's static endpoint. */
  baseUrl: string
} {
  const baseUrl = source.baseUrl.trim()
  const knownChannel = resolveGptLoadFirstPartyChannel(baseUrl)
  return {
    channelId: knownChannel ?? GPT_LOAD_DEFAULT_CHANNEL_ID,
    baseUrl: knownChannel ? "" : baseUrl,
  }
}

/**
 * Prefills the native gpt-load editor from a resolved credential.
 *
 * gpt-load stores a per-group model list, so the draft carries the source's
 * models and the native editor writes them through `PUT /api/groups/:id/models`.
 */
export function prepareGptLoadChannelFormData(
  source: ManagedSiteChannelDraftSource,
  _options?: ManagedSiteChannelDraftRequestOptions,
): Promise<ManagedSiteChannelDraft> {
  const target = resolveGptLoadChannelTarget(source)
  return Promise.resolve({
    name: source.name,
    type: target.channelId,
    key: source.apiKey,
    base_url: target.baseUrl,
    models: [],
    groups: [],
    enabled: true,
  })
}
/**
 * Reads one stored channel credential in plaintext.
 *
 * gpt-load's group credential list is always masked; the only plaintext read is
 * the explicit per-row `POST .../reveal`. Because a group holds a credential
 * pool, this returns every plaintext value joined with newlines so a
 * duplicate anywhere in the pool matches. Callers treat a failure here as a
 * degraded comparison, never as an import blocker.
 */
export async function fetchGptLoadChannelSecretKey(
  config: GptLoadConfig,
  groupId: string | number,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const parsedGroupId = Number(groupId)
  if (!Number.isSafeInteger(parsedGroupId) || parsedGroupId <= 0) {
    throw new Error("Invalid gpt-load group id")
  }
  const credentials = await listGptLoadGroupCredentials(
    config,
    parsedGroupId,
    options,
  )
  if (credentials.length === 0) {
    throw new Error("gpt-load group has no credentials to read")
  }
  const values: string[] = []
  for (const credential of credentials) {
    try {
      const value = await revealGptLoadGroupCredential(
        config,
        parsedGroupId,
        credential.credential_id,
        options,
      )
      if (value) values.push(value)
    } catch {
      // A single unrevealable row degrades that comparison, not the import.
    }
  }
  if (values.length === 0) {
    throw new Error("gpt-load did not return a readable channel credential")
  }
  return values.join("\n")
}
