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
 * The panel password can mint an `oma_` token through the public
 * `POST /api/cli/connect` route, so the password is a one-time input and the
 * minted token is the only thing worth storing.
 *
 * Verified against the `release/v3.8.51` line on 2026-09-29:
 * - scopes: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/server/authz/accessScopes.ts
 * - failures: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/lib/api/requireManagementAuth.ts
 * - exchange: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/app/api/cli/connect/route.ts
 */

import { OMNIROUTE_ACCESS_TOKEN_SCOPES } from "~/types/omniroute"
import type {
  OmniRouteAccessTokenScope,
  OmniRouteMintedToken,
  OmniRouteWhoAmI,
} from "~/types/omniroute"
import type { OmniRouteConfig } from "~/types/omnirouteConfig"

import { readOmniRouteMintedToken, readOmniRouteWhoAmI } from "./parsing"
import {
  callOmniRoute,
  OmniRouteApiError,
  readOmniRouteErrorMessage,
  type OmniRouteRequestOptions,
} from "./request"

export const OMNIROUTE_AUTH_FAILURE_REASONS = {
  /** The credential is wrong or expired (401, or a rejected password). */
  InvalidCredential: "invalid-credential",
  /** The token is valid but lacks the scope this route requires (403). */
  InsufficientScope: "insufficient-scope",
  /** The deployment still uses the well-known default panel password (403). */
  DefaultPasswordRejected: "default-password-rejected",
} as const

export type OmniRouteAuthFailureReason =
  (typeof OMNIROUTE_AUTH_FAILURE_REASONS)[keyof typeof OMNIROUTE_AUTH_FAILURE_REASONS]

export type OmniRouteCredentialPhase = "token" | "password"

export interface OmniRouteScopeShortfall {
  have: string
  need: string
}

const INSUFFICIENT_SCOPE_PATTERN =
  /Access token scope '([^']*)' is insufficient; '([^']*)' required\./i

const DEFAULT_PASSWORD_HINT =
  "The management password is still set to the well-known default"

const NO_PASSWORD_HINT = "No password configured"

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

/**
 * Classifies a management-auth failure into the three reasons a user can act on.
 *
 * The phase decides what a 403 means: on an access-token call it is a scope
 * shortfall, while on the public password exchange it is the deployment's own
 * default-password gate.
 */
export function classifyOmniRouteAuthFailure(
  error: unknown,
  phase: OmniRouteCredentialPhase,
): OmniRouteAuthFailureReason | null {
  if (!(error instanceof OmniRouteApiError)) return null
  const message = error.message
  const status = error.status

  if (readOmniRouteScopeShortfall(message)) {
    return OMNIROUTE_AUTH_FAILURE_REASONS.InsufficientScope
  }
  if (phase === "password" && status === 403) {
    if (
      message.includes(DEFAULT_PASSWORD_HINT) ||
      message.includes(NO_PASSWORD_HINT)
    ) {
      return OMNIROUTE_AUTH_FAILURE_REASONS.DefaultPasswordRejected
    }
    // The public connect route only refuses with 403 for its own default
    // password/onboarding gate, so treat any other 403 there the same way.
    return OMNIROUTE_AUTH_FAILURE_REASONS.DefaultPasswordRejected
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

export interface OmniRouteTokenMintInput {
  baseUrl: string
  password: string
  /** Label recorded on the gateway so the user can revoke the token later. */
  name: string
  scope?: OmniRouteAccessTokenScope
  expiresInDays?: number
}

/**
 * Exchanges the panel password for a scoped access token.
 *
 * The route is public and returns the plaintext token exactly once; callers
 * must persist only the returned token.
 */
export async function mintOmniRouteAccessToken(
  input: OmniRouteTokenMintInput,
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteMintedToken> {
  const payload = await callOmniRoute<unknown>({
    baseUrl: input.baseUrl,
    path: "/api/cli/connect",
    method: "POST",
    body: {
      password: input.password,
      name: input.name,
      scope: input.scope ?? OMNIROUTE_ACCESS_TOKEN_SCOPES.Admin,
      ...(input.expiresInDays === undefined
        ? {}
        : { expiresInDays: input.expiresInDays }),
    },
    options,
  })

  const minted = readOmniRouteMintedToken(payload)
  if (!minted) {
    throw new OmniRouteApiError(
      "OmniRoute did not return an access token",
      undefined,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
        raw: payload,
      },
    )
  }
  return minted
}

/** Returns whether the gateway reports the `admin` scope for this token. */
export function hasOmniRouteAdminScope(
  whoAmI: OmniRouteWhoAmI | null,
): boolean {
  return whoAmI?.scope === OMNIROUTE_ACCESS_TOKEN_SCOPES.Admin
}
