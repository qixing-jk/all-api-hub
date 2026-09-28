import {
  fetchAccountAvailableModels as fetchDefaultAccountAvailableModels,
  fetchAccountTokens as fetchDefaultAccountTokens,
  fetchTokenById as fetchDefaultTokenById,
  fetchUserGroups as fetchDefaultUserGroups,
} from "~/services/apiService/newApiFamily/default/keyManagement"
import { fetchTokenSecretKeyById } from "~/services/apiService/newApiFamily/default/tokenKeyResolver"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { UserGroupInfo } from "~/services/models/userGroup"
import { AuthTypeEnum } from "~/types"

import { resolveRixApiDialect, RIX_API_DIALECT_KEYS } from "./rixApiDialects"

/** Group list endpoint Rix API 6.x serves instead of the New API path. */
const RIX_API_TOKEN_GROUP_ENDPOINT = "/api/token/group"

/**
 * Which endpoint family answers the group list on a deployment:
 * `/api/token/group` on 6.x, the New API path on earlier generations.
 */
const RIX_API_GROUP_ENDPOINTS = {
  TokenGroup: "token-group",
  NewApiPath: "new-api-path",
} as const

/** Which auth mode an endpoint accepts from this account. */
const RIX_API_GROUP_AUTH_MODES = {
  Session: "session",
  Credential: "credential",
} as const

/**
 * Group reads this product can try, most preferred first.
 *
 * The 6.x group list is a console endpoint like the account model list, so it is
 * read with the browser session first; the New API path keeps the account's own
 * credential as the fallback for older generations and for deployments that
 * accept admin keys.
 */
const buildRixApiGroupCandidates = (
  authType: ApiServiceRequest["auth"]["authType"],
): string[] => {
  const authModes =
    authType === AuthTypeEnum.Cookie
      ? [RIX_API_GROUP_AUTH_MODES.Session]
      : [RIX_API_GROUP_AUTH_MODES.Session, RIX_API_GROUP_AUTH_MODES.Credential]

  return [
    RIX_API_GROUP_ENDPOINTS.TokenGroup,
    RIX_API_GROUP_ENDPOINTS.NewApiPath,
  ].flatMap((endpoint) =>
    authModes.map((authMode) => `${endpoint}:${authMode}`),
  )
}

const readGroupCandidate = (
  candidate: string,
): { endpoint: string; authMode: string } => {
  const [endpoint = "", authMode = ""] = candidate.split(":")

  return { endpoint, authMode }
}

/** Which auth mode the console-only account model list accepts. */
const RIX_API_MODEL_LIST_AUTH_MODES = {
  Session: "session",
  Credential: "credential",
} as const

/** One record of the 6.x group list. */
interface RixApiGroupRecord {
  value?: unknown
  key?: unknown
  description?: unknown
}

/**
 * Reads a quota field Rix API may deliver as a decimal string.
 */
function readQuotaUnits(value: unknown): number | undefined {
  const coerced = typeof value === "string" ? Number(value.trim()) : value

  return typeof coerced === "number" && Number.isFinite(coerced)
    ? coerced
    : undefined
}

/**
 * Normalize the token fields Rix API delivers in a different wire type.
 *
 * Observed 2026-09-26 on platform.ephone.ai: `remain_quota` and `used_quota`
 * come back as decimal strings (`"0"`) while the shared token contract and its
 * consumers (editor defaults, update comparison, quota totals) treat them as
 * numbers, so an unnormalized row reports an uneditable, never-matching token.
 */
function normalizeRixApiToken(token: NewApiToken): NewApiToken {
  const remainQuota = readQuotaUnits(token.remain_quota) ?? 0
  const usedQuota = readQuotaUnits(token.used_quota) ?? 0

  if (token.remain_quota === remainQuota && token.used_quota === usedQuota) {
    return token
  }

  return { ...token, remain_quota: remainQuota, used_quota: usedQuota }
}

/**
 * Token columns that identify the record or hold its secret.
 *
 * A write body only carries what the caller means to change: the deployment keeps
 * the stored secret when `key` is absent, and the bookkeeping columns are the
 * server's to own. Verified 2026-09-28 on platform.ephone.ai — `key`, `key_mask`
 * and `key_format` survived a PUT that omitted them.
 */
const RIX_API_TOKEN_WRITE_IDENTITY_FIELDS = new Set([
  "id",
  "user_id",
  "key",
  "key_mask",
  "key_format",
  "created_time",
  "accessed_time",
  "used_quota",
  "DeletedAt",
])

/**
 * Reads the deployment-managed token fields Rix API 6.x owns next to the
 * shared New API projection.
 *
 * Rix API 6.x writes the columns a request carries and zeroes the rest, so an
 * update built from the New API projection alone cleared a token the console had
 * configured: `unlimited_count`, `group_only`, `group_sort`, `group_ignore`,
 * `storage_location`, `exclude_ips`, `rate_limits`, `max_channel_cost` and
 * `mj_mode` all came back emptied (verified 2026-09-28 on platform.ephone.ai),
 * while a token that was not edited kept them. Sending the row's own values back
 * preserved every one of them.
 */
export function readRixApiPreservedTokenFields(
  token: NewApiToken,
): Record<string, unknown> {
  const preserved: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(token)) {
    if (RIX_API_TOKEN_WRITE_IDENTITY_FIELDS.has(field)) continue
    preserved[field] = value
  }

  return preserved
}

/**
 * Fetch the Rix API token inventory with the shared pagination dialect.
 *
 * Rix API normalizes `p=0` to its first page, which is the same probe the
 * compatible-deployment options describe.
 */
export async function fetchAccountTokens(
  request: ApiServiceRequest,
): Promise<NewApiToken[]> {
  const tokens = await fetchDefaultAccountTokens(request, {
    startPage: 0,
    detectsNormalizedFirstPage: true,
  })

  return tokens.map(normalizeRixApiToken)
}

/** Fetch one Rix API token with its quota fields normalized. */
export async function fetchTokenById(
  request: ApiServiceRequest,
  tokenId: number,
): Promise<NewApiToken> {
  return normalizeRixApiToken(await fetchDefaultTokenById(request, tokenId))
}

/**
 * Reads the 6.x group list, failing when the deployment does not serve it.
 *
 * Each record carries `value` as the group id the token console selects by and
 * `key` as its display name; group ratios belong to the pricing capability, so
 * the ratio here stays neutral.
 */
async function fetchTokenGroupGroups(
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> {
  const groups = await newApiFamilyRequests.data<RixApiGroupRecord[]>(request, {
    endpoint: RIX_API_TOKEN_GROUP_ENDPOINT,
  })
  if (!Array.isArray(groups)) {
    throw new Error("invalid_token_group_payload")
  }

  const mappedGroups: Record<string, UserGroupInfo> = {}
  for (const group of groups) {
    const groupId = typeof group?.value === "string" ? group.value.trim() : ""
    if (!groupId) continue

    const displayName = typeof group.key === "string" ? group.key.trim() : ""
    const description =
      typeof group.description === "string" ? group.description.trim() : ""
    mappedGroups[groupId] = { desc: displayName || description, ratio: 1 }
  }

  return mappedGroups
}

/**
 * Reads a console endpoint as the browser session instead of the credential.
 *
 * The account request already carries the session cookie, so only the auth mode
 * changes; Rix 6.x refuses its console-only endpoints to account credentials.
 */
const withSessionAuth = (request: ApiServiceRequest): ApiServiceRequest =>
  request.auth.authType === AuthTypeEnum.Cookie
    ? request
    : { ...request, auth: { ...request.auth, authType: AuthTypeEnum.Cookie } }

/**
 * Read the account's token groups.
 *
 * Rix API 6.x serves the list as display records on `/api/token/group` after
 * dropping `/api/user/self/groups` (404, verified 2026-09-26), so the newer
 * endpoint is asked first and the legacy one is kept as the fallback for earlier
 * generations. Which endpoint and auth mode answered is remembered per
 * deployment, so neither the removed path nor a refused credential is offered
 * again on every group read.
 */
export async function fetchUserGroups(
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> {
  return await resolveRixApiDialect(
    request.baseUrl,
    RIX_API_DIALECT_KEYS.TokenGroups,
    buildRixApiGroupCandidates(request.auth.authType),
    (candidate) => {
      const { endpoint, authMode } = readGroupCandidate(candidate)
      const candidateRequest =
        authMode === RIX_API_GROUP_AUTH_MODES.Session
          ? withSessionAuth(request)
          : request

      return endpoint === RIX_API_GROUP_ENDPOINTS.TokenGroup
        ? fetchTokenGroupGroups(candidateRequest)
        : fetchDefaultUserGroups(candidateRequest)
    },
  )
}

/**
 * Read the models an account may use.
 *
 * Rix API 6.x refuses this console-only endpoint to admin keys ("This endpoint is
 * not available to admin keys, sign in to the console instead") while the browser
 * session reads it, so a token-authenticated account asks with its session first
 * and keeps the credential as the fallback. The account request already carries
 * the session cookie, so only the auth mode changes. Which mode answers is
 * remembered per deployment, so a deployment without a usable session is not
 * asked for one on every model read.
 * Observed 2026-09-26 on https://platform.ephone.ai/api/user/models.
 */
export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  if (request.auth.authType !== AuthTypeEnum.AccessToken) {
    return await fetchDefaultAccountAvailableModels(request)
  }

  return await resolveRixApiDialect(
    request.baseUrl,
    RIX_API_DIALECT_KEYS.ModelListAuth,
    [
      RIX_API_MODEL_LIST_AUTH_MODES.Session,
      RIX_API_MODEL_LIST_AUTH_MODES.Credential,
    ],
    (authMode) =>
      fetchDefaultAccountAvailableModels(
        authMode === RIX_API_MODEL_LIST_AUTH_MODES.Session
          ? withSessionAuth(request)
          : request,
      ),
  )
}

/**
 * Read the group that an account's own tokens inherit.
 *
 * Rix API 6.x dropped `group` from its self DTO while keeping the same concept
 * in `use_group` (empty when the account inherits nothing, verified 2026-09-26
 * on two 6.x deployments). The New API field keeps precedence, and an account
 * with neither keeps the shared failure so placement stays unknown.
 */
export async function fetchCurrentUserGroup(
  request: ApiServiceRequest,
): Promise<string> {
  const userData = await newApiFamilyRequests.data<{
    group?: unknown
    use_group?: unknown
  }>(request, {
    endpoint: "/api/user/self",
  })

  for (const candidate of [userData?.group, userData?.use_group]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  throw new Error("invalid_current_user_group_payload")
}

/**
 * Resolve the credential a user copies out of the key list.
 *
 * Rix API inventory rows carry the prefixless body of the key while the
 * deployment's own key form adds a licence prefix (`key_format: "sk-ep-"`; the
 * revealed value is that prefix plus the inventory body), so the reveal endpoint
 * is authoritative instead of the inventory key the shared resolver would return
 * unchanged. Observed 2026-09-26 on platform.ephone.ai: 18 characters in the
 * list, 24 after revealing.
 */
export async function resolveApiTokenKey(
  request: ApiServiceRequest,
  token: Pick<NewApiToken, "id" | "key">,
): Promise<string> {
  if (!Number.isFinite(token.id)) {
    throw new Error("token_secret_key_unresolvable")
  }

  return await fetchTokenSecretKeyById(request, token.id)
}
