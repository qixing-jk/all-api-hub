/**
 * gpt-load authentication.
 *
 * Two credential families exist on the control plane, and only one can
 * administer channels:
 *
 * | credential | shape | usable here |
 * | --- | --- | --- |
 * | root management key | `AUTH_KEY` env / generated `auth.key` | yes |
 * | access key | `sk-gl-...` issued to downstream clients | no - read-only routes |
 *
 * The gateway accepts the management key as `Authorization: Bearer <AUTH_KEY>`
 * on every `/api/*` route. An access key authenticates too, but
 * `principalCanAccessControlRoute` limits it to a fixed set of read-only GET
 * routes and rejects every mutation with 403, so validating with
 * `principal_type === "admin"` keeps a read-only key from looking configured.
 *
 * The gateway also rate-limits failed authentication per peer IP (5 failures in
 * 30 minutes locks the address for 30 minutes), so validation must not retry a
 * rejected key.
 *
 * Verified against a live v2 control plane on 2026-10-03.
 */

import type { GptLoadConfig } from "~/types/gptLoadConfig"

import { readGptLoadSession } from "./parsing"
import {
  callGptLoad,
  GptLoadApiError,
  readGptLoadErrorMessage,
  type GptLoadRequestOptions,
} from "./request"

export const GPT_LOAD_AUTH_FAILURE_REASONS = {
  /** The key is wrong, expired, or the address is locked out (401/423). */
  InvalidCredential: "invalid-credential",
  /** The key is valid but is a downstream access key, not the admin key (403). */
  InsufficientPrivilege: "insufficient-privilege",
} as const

export type GptLoadAuthFailureReason =
  (typeof GPT_LOAD_AUTH_FAILURE_REASONS)[keyof typeof GPT_LOAD_AUTH_FAILURE_REASONS]

const GPT_LOAD_PRINCIPALS = {
  Admin: "admin",
  AccessKey: "access_key",
} as const

/** Returns the gateway's message for a failed call, or an empty string. */
export function readGptLoadFailureMessage(error: unknown): string {
  if (error instanceof GptLoadApiError) return error.message
  return readGptLoadErrorMessage(error, "")
}

/** Classifies key authentication and privilege failures. */
export function classifyGptLoadAuthFailure(
  error: unknown,
): GptLoadAuthFailureReason | null {
  if (!(error instanceof GptLoadApiError)) return null
  if (error.status === 403) {
    return GPT_LOAD_AUTH_FAILURE_REASONS.InsufficientPrivilege
  }
  if (error.status === 401 || error.status === 423) {
    return GPT_LOAD_AUTH_FAILURE_REASONS.InvalidCredential
  }
  return null
}

/** Reads the current key's identity and principal type. */
export async function fetchGptLoadSession(
  config: GptLoadConfig,
  options?: GptLoadRequestOptions,
) {
  return readGptLoadSession(
    await callGptLoad<unknown>({
      baseUrl: config.baseUrl,
      path: "/api/auth/session",
      method: "GET",
      managementKey: config.managementKey,
      options,
    }),
  )
}

/** Returns whether the gateway reports the root admin principal for this key. */
export function hasGptLoadAdminPrincipal(
  session: {
    authenticated?: boolean | null
    principalType?: string | null
  } | null,
): boolean {
  return (
    session?.authenticated === true &&
    session.principalType === GPT_LOAD_PRINCIPALS.Admin
  )
}
