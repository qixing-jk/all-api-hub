/**
 * Which credential contract a New API deployment issues, for the endpoint that
 * was replaced in `v1.0.0-rc.41`.
 *
 * Up to rc.40 an account credential was minted by `GET /api/user/token`, which
 * rotated the dashboard personal access token held on the user row. rc.41
 * removed every `/api/user/token*` route and moved credential management to
 * `/api/user/access_tokens`, where a scoped, expiring token is created only
 * against a browser session carrying a step-up security proof.
 *
 * The replacement cannot be discovered by trying the old call: on a rc.41
 * deployment `GET /api/user/token` is answered by an unrelated `/api/user/*`
 * route with 403 `AUTH_INSUFFICIENT_PRIVILEGE` rather than 404, and it is the
 * call that rotates the account credential. Nor can it be read from the reported
 * version, for the reason already recorded for Rix API in
 * `variants/rixApiDialects.ts`: deployments of one family diverge without the
 * version saying so. So the contract is probed through a read-only route and
 * remembered per deployment for the session.
 * Source: https://github.com/QuantumNous/new-api/commit/caca52f8 (verified
 * 2026-10-01 against a rc.41 deployment).
 */

import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createDeploymentProbeMemory } from "~/services/core/deploymentProbeMemory"

/**
 * Read-only route that only a scoped-access-token deployment owns.
 *
 * The probe asks with whatever credential the caller has, so the answers are:
 * 200 on a scoped build; 401 when the credential cannot authenticate (this is
 * inconclusive, since a deployment that does not own the route answers the same);
 * and, on an older build, whatever its `/api/user/:id` route makes of a
 * one-segment path — verified 2026-10-01 on the rc.41 target, where
 * `/api/user/access_tokens_nope` answers 401 and two-segment unknown paths
 * answer 404. A 404/405 therefore means "no such route here", not "older build",
 * and is the answer a fork without `/api/user/:id` gives.
 */
export const NEW_API_SCOPED_ACCESS_TOKENS_ENDPOINT = "/api/user/access_tokens"

/** The `AUTH_INSUFFICIENT_PRIVILEGE` code a route the caller may not use answers. */
const AUTH_INSUFFICIENT_PRIVILEGE = "AUTH_INSUFFICIENT_PRIVILEGE"

export const NEW_API_ACCESS_TOKEN_DIALECTS = {
  /** rc.22-rc.40: `GET /api/user/token` rotates the dashboard access token. */
  DASHBOARD_PAT: "dashboard-pat",
  /** rc.41+: `POST /api/user/access_tokens` issues a scoped, expiring token. */
  SCOPED_ACCESS_TOKENS: "scoped-access-tokens",
} as const

export type NewApiAccessTokenDialect =
  (typeof NEW_API_ACCESS_TOKEN_DIALECTS)[keyof typeof NEW_API_ACCESS_TOKEN_DIALECTS]

const dialectMemory = createDeploymentProbeMemory<NewApiAccessTokenDialect>()

/**
 * Whether an error says the deployment does not own the route at all, as opposed
 * to refusing this attempt on a route it does own.
 *
 * Only a definite answer may replace a remembered dialect: a transport failure
 * leaves the deployment's contract unknown, and treating it as "the old route is
 * gone" would spend the rotating legacy call on a guess.
 */
export function isAccessTokenContractAbsent(error: unknown): boolean {
  if (!(error instanceof ApiError) || typeof error.statusCode !== "number") {
    return false
  }

  return (
    error.statusCode === 404 ||
    error.statusCode === 405 ||
    (error.statusCode === 403 &&
      error.upstreamCode === AUTH_INSUFFICIENT_PRIVILEGE)
  )
}

/**
 * Probes the read-only route and classifies the answer.
 * @returns The dialect this deployment proved, or `undefined` when the probe did
 * not reach a definite answer and the caller should keep the current behaviour.
 */
async function probeAccessTokenDialect(
  request: ApiServiceRequest,
): Promise<NewApiAccessTokenDialect | undefined> {
  try {
    await newApiFamilyRequests.data<unknown>(request, {
      endpoint: NEW_API_SCOPED_ACCESS_TOKENS_ENDPOINT,
    })
    return NEW_API_ACCESS_TOKEN_DIALECTS.SCOPED_ACCESS_TOKENS
  } catch (error) {
    return isAccessTokenContractAbsent(error)
      ? NEW_API_ACCESS_TOKEN_DIALECTS.DASHBOARD_PAT
      : undefined
  }
}

/**
 * Resolves which credential contract this deployment issues, probing once per
 * deployment and remembering only a definite answer.
 *
 * An inconclusive probe keeps the contract every older deployment uses, which is
 * also what the caller did before this dialect existed.
 */
export async function resolveNewApiAccessTokenDialect(
  request: ApiServiceRequest,
): Promise<NewApiAccessTokenDialect> {
  const remembered = dialectMemory.read(request.baseUrl)
  if (remembered) return remembered

  const probed = await probeAccessTokenDialect(request)
  if (probed) dialectMemory.remember(request.baseUrl, probed)

  return probed ?? NEW_API_ACCESS_TOKEN_DIALECTS.DASHBOARD_PAT
}

/** Drops one deployment's probe result so the next resolution asks again. */
export function forgetNewApiAccessTokenDialect(baseUrl: string): void {
  dialectMemory.forget(baseUrl)
}

/** Clears every probed dialect between unit tests. */
export function clearNewApiAccessTokenDialectsForTests(): void {
  dialectMemory.clear()
}
