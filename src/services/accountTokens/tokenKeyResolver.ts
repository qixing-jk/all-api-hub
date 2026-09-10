import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
  normalizeApiTokenKeyValue,
} from "~/services/accountTokens/apiTokenKey"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken } from "~/types"

type TokenKeyLike = Pick<ApiToken, "id" | "key">
type TokenSecretKeyFetcher = (
  request: ApiServiceRequest,
  tokenId: number,
) => Promise<string>

const resolvedTokenKeyPromises = new Map<string, Promise<string>>()

const buildTokenResolutionScopeKey = (request: ApiServiceRequest) =>
  [
    request.baseUrl.trim(),
    request.accountId ?? "",
    request.auth?.userId ?? "",
  ].join("|")

const buildTokenResolutionCacheKey = (
  request: ApiServiceRequest,
  tokenId: number,
  inventoryKey: string,
) =>
  [
    buildTokenResolutionScopeKey(request),
    Number.isFinite(tokenId) ? tokenId : "unknown",
    inventoryKey,
  ].join("|")

const deleteTokenResolutionScopeEntries = (
  request: ApiServiceRequest,
  predicate?: (cacheKey: string) => boolean,
) => {
  const scopePrefix = `${buildTokenResolutionScopeKey(request)}|`

  for (const cacheKey of resolvedTokenKeyPromises.keys()) {
    if (!cacheKey.startsWith(scopePrefix)) continue
    if (predicate && !predicate(cacheKey)) continue
    resolvedTokenKeyPromises.delete(cacheKey)
  }
}

/**
 * Resolves a usable token secret key while preserving pass-through behavior for
 * legacy backends that still return full keys in inventory APIs.
 */
export async function resolveApiTokenKeyWithFetcher(
  request: ApiServiceRequest,
  token: TokenKeyLike,
  fetchTokenSecretKey: TokenSecretKeyFetcher,
): Promise<string> {
  const normalizedInventoryKey = normalizeApiTokenKeyValue(token.key ?? "")
  if (!normalizedInventoryKey) {
    return normalizedInventoryKey
  }

  if (hasUsableApiTokenKey(normalizedInventoryKey)) {
    return normalizedInventoryKey
  }

  if (!isMaskedApiTokenKey(normalizedInventoryKey)) {
    return normalizedInventoryKey
  }

  if (!Number.isFinite(token.id)) {
    throw new Error("token_secret_key_unresolvable")
  }

  const cacheKey = buildTokenResolutionCacheKey(
    request,
    token.id,
    normalizedInventoryKey,
  )
  const cachedPromise = resolvedTokenKeyPromises.get(cacheKey)
  if (cachedPromise) {
    return cachedPromise
  }

  const promise = fetchTokenSecretKey(request, token.id).catch((error) => {
    resolvedTokenKeyPromises.delete(cacheKey)
    throw error
  })

  resolvedTokenKeyPromises.set(cacheKey, promise)
  return promise
}

/**
 * Clears every resolved-key cache entry for the current account scope.
 */
export function invalidateResolvedApiTokenKeyCache(request: ApiServiceRequest) {
  deleteTokenResolutionScopeEntries(request)
}

/**
 * Removes stale resolved-key cache entries when a token inventory reload shows a
 * different set of ids or masked inventory values.
 */
export function syncResolvedApiTokenKeyCache(
  request: ApiServiceRequest,
  tokens: readonly TokenKeyLike[],
) {
  const validEntries = new Set(
    tokens
      .filter((token) => Number.isFinite(token.id))
      .map((token) =>
        buildTokenResolutionCacheKey(
          request,
          token.id,
          normalizeApiTokenKeyValue(token.key ?? ""),
        ),
      ),
  )

  deleteTokenResolutionScopeEntries(
    request,
    (cacheKey) => !validEntries.has(cacheKey),
  )
}
