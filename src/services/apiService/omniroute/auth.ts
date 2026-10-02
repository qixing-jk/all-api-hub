/**
 * OmniRoute authentication.
 *
 * Four credential families exist upstream, and only one is usable remotely:
 *
 * | credential | shape | usable here |
 * | --- | --- | --- |
 * | dashboard JWT | `auth_token` cookie | no — same-origin/CSRF bound |
 * | CLI machine-id token | derived from a local secret | no — host-only |
 * | scoped access token | `oma_…` bearer | yes |
 * | inference API key | `sk-…` | no — needs a `manage`/`admin` metadata flag |
 *
 * Verified against the `release/v3.8.51` line on 2026-09-29:
 * - scopes: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/server/authz/accessScopes.ts
 * - failures: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/lib/api/requireManagementAuth.ts
 */

import { OMNIROUTE_ACCESS_TOKEN_SCOPES } from "~/types/omniroute"
import type { OmniRouteWhoAmI } from "~/types/omniroute"
import type { OmniRouteConfig } from "~/types/omnirouteConfig"

import { readOmniRouteWhoAmI } from "./parsing"
import {
  callOmniRoute,
  OmniRouteApiError,
  readOmniRouteErrorMessage,
  type OmniRouteRequestOptions,
} from "./request"

export const OMNIROUTE_AUTH_FAILURE_REASONS = {
  /** The token is wrong or expired (401). */
  InvalidCredential: "invalid-credential",
  /** The token is valid but lacks the scope this route requires (403). */
  InsufficientScope: "insufficient-scope",
} as const

export type OmniRouteAuthFailureReason =
  (typeof OMNIROUTE_AUTH_FAILURE_REASONS)[keyof typeof OMNIROUTE_AUTH_FAILURE_REASONS]

export interface OmniRouteScopeShortfall {
  have: string
  need: string
}

const INSUFFICIENT_SCOPE_PATTERN =
  /Access token scope '([^']*)' is insufficient; '([^']*)' required\./i

/** Parses the gateway's scope-shortfall message, if this failure is one. */
export function readOmniRouteScopeShortfall(
  message: string,
): OmniRouteScopeShortfall | null {
  const match = INSUFFICIENT_SCOPE_PATTERN.exec(message)
  if (!match) return null
  return {
    have: match[1] ?? "",
    need: match[2] ?? OMNIROUTE_ACCESS_TOKEN_SCOPES.Admin,
  }
}

/** Returns the gateway's message for a failed call, or an empty string. */
export function readOmniRouteFailureMessage(error: unknown): string {
  if (error instanceof OmniRouteApiError) return error.message
  return readOmniRouteErrorMessage(error, "")
}

/** Classifies token authentication and scope failures. */
export function classifyOmniRouteAuthFailure(
  error: unknown,
): OmniRouteAuthFailureReason | null {
  if (!(error instanceof OmniRouteApiError)) return null
  const message = error.message
  const status = error.status

  if (readOmniRouteScopeShortfall(message)) {
    return OMNIROUTE_AUTH_FAILURE_REASONS.InsufficientScope
  }
  if (status === 401) {
    return OMNIROUTE_AUTH_FAILURE_REASONS.InvalidCredential
  }
  return null
}

/** Reads the current credential's identity and scope. */
export async function fetchOmniRouteWhoAmI(
  config: OmniRouteConfig,
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteWhoAmI | null> {
  return readOmniRouteWhoAmI(
    await callOmniRoute<unknown>({
      baseUrl: config.baseUrl,
      path: "/api/cli/whoami",
      method: "GET",
      token: config.token,
      options,
    }),
  )
}

/** Returns whether the gateway reports the `admin` scope for this token. */
export function hasOmniRouteAdminScope(
  whoAmI: OmniRouteWhoAmI | null,
): boolean {
  return whoAmI?.scope === OMNIROUTE_ACCESS_TOKEN_SCOPES.Admin
}
