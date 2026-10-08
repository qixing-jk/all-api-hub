import type {
  AccountKeyScope,
  AccountKeyScopeInventory,
  ResourceFailure,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"

import {
  mapOperation,
  toAccountKeyResourceError,
  unexpectedFailure,
  validationFailure,
} from "./operationErrors"
import { isBoundedNonBlankString, isRecord } from "./validation"

const normalizeScope = (value: unknown): AccountKeyScope => {
  if (!isRecord(value)) throw unexpectedFailure()

  const { scopeKey, routeKey, displayName, isDefault, secondaryLabel } = value
  if (
    !isBoundedNonBlankString(scopeKey, 2048) ||
    !isBoundedNonBlankString(routeKey, 512) ||
    !isBoundedNonBlankString(displayName, 512) ||
    typeof isDefault !== "boolean" ||
    (secondaryLabel !== undefined &&
      !isBoundedNonBlankString(secondaryLabel, 512))
  ) {
    throw unexpectedFailure()
  }

  return Object.freeze({
    scopeKey,
    routeKey,
    displayName,
    isDefault,
    ...(secondaryLabel === undefined ? {} : { secondaryLabel }),
  })
}

const normalizeScopes = (value: unknown): readonly AccountKeyScope[] => {
  if (!Array.isArray(value) || value.length === 0) throw unexpectedFailure()

  const scopes = value.map(normalizeScope)
  const scopeKeys = new Set<string>()
  const routeKeys = new Set<string>()
  for (const scope of scopes) {
    if (scopeKeys.has(scope.scopeKey) || routeKeys.has(scope.routeKey)) {
      throw unexpectedFailure()
    }
    scopeKeys.add(scope.scopeKey)
    routeKeys.add(scope.routeKey)
  }
  return Object.freeze(scopes)
}

export const cloneScope = (scope: AccountKeyScope): AccountKeyScope =>
  Object.freeze({
    scopeKey: scope.scopeKey,
    routeKey: scope.routeKey,
    displayName: scope.displayName,
    isDefault: scope.isDefault,
    ...(scope.secondaryLabel === undefined
      ? {}
      : { secondaryLabel: scope.secondaryLabel }),
  })

const FAILURE_CODES = new Set<string>(
  Object.values(ACCOUNT_KEY_RESOURCE_FAILURE_CODES),
)

const normalizeScopeInventory = (
  value: AccountKeyScopeInventory,
): AccountKeyScopeInventory => {
  if (!isRecord(value)) throw unexpectedFailure()
  const scopes = normalizeScopes(value.scopes)
  const partialFailure = value.partialFailure
  if (partialFailure === undefined) return Object.freeze({ scopes })
  if (
    !isRecord(partialFailure) ||
    typeof partialFailure.code !== "string" ||
    !FAILURE_CODES.has(partialFailure.code) ||
    (partialFailure.message !== undefined &&
      !isBoundedNonBlankString(partialFailure.message, 8192)) ||
    (partialFailure.upstreamCode !== undefined &&
      !isBoundedNonBlankString(partialFailure.upstreamCode, 512))
  ) {
    throw unexpectedFailure()
  }
  return Object.freeze({
    scopes,
    partialFailure: Object.freeze({
      code: partialFailure.code as ResourceFailure["code"],
      ...(partialFailure.message === undefined
        ? {}
        : { message: partialFailure.message }),
      ...(partialFailure.upstreamCode === undefined
        ? {}
        : { upstreamCode: partialFailure.upstreamCode }),
    }),
  })
}

/** Owns scope snapshots, shared reads, caller cancellation and inventory refresh. */
export function createAccountKeyScopeInventory({
  read,
  resolveDefaultScopeKey,
  mapFailure,
}: {
  read: (
    options?: ResourceOperationOptions,
  ) => Promise<AccountKeyScopeInventory>
  resolveDefaultScopeKey: (scopes: readonly AccountKeyScope[]) => string
  mapFailure: (error: unknown) => ResourceFailure
}) {
  let cachedScopeInventory: AccountKeyScopeInventory | undefined
  let sharedScopeLoad: Promise<AccountKeyScopeInventory> | undefined
  const loadScopeInventory = (
    scopeOptions?: ResourceOperationOptions,
    replaceCached = false,
  ) =>
    mapOperation(async () => {
      const normalized = normalizeScopeInventory(await read(scopeOptions))
      if (replaceCached || !cachedScopeInventory) {
        cachedScopeInventory = normalized
      }
      return cachedScopeInventory
    }, mapFailure)
  const getScopeInventory = (scopeOptions?: ResourceOperationOptions) => {
    if (cachedScopeInventory) return Promise.resolve(cachedScopeInventory)
    if (scopeOptions?.signal) return loadScopeInventory(scopeOptions)
    if (!sharedScopeLoad) {
      const run = loadScopeInventory(scopeOptions)
      const tracked = run.finally(() => {
        if (sharedScopeLoad === tracked) sharedScopeLoad = undefined
      })
      sharedScopeLoad = tracked
    }
    return sharedScopeLoad
  }
  const getScopes = async (scopeOptions?: ResourceOperationOptions) =>
    (await getScopeInventory(scopeOptions)).scopes
  const resolveScope = async (
    scopeKey: string | undefined,
    scopeOptions?: ResourceOperationOptions,
  ) => {
    const scopes = await getScopes(scopeOptions)
    let desiredScopeKey: string
    try {
      desiredScopeKey = scopeKey ?? resolveDefaultScopeKey(scopes)
    } catch (error) {
      throw toAccountKeyResourceError(error, mapFailure)
    }
    if (!isBoundedNonBlankString(desiredScopeKey, 2048)) {
      throw validationFailure()
    }
    const scope = scopes.find((item) => item.scopeKey === desiredScopeKey)
    if (!scope) throw validationFailure()
    return scope
  }

  return {
    getScopes,
    getScopeInventory,
    resolveScope,
    refresh: (options?: ResourceOperationOptions) =>
      loadScopeInventory(options, true),
    get snapshot() {
      return cachedScopeInventory
    },
  }
}
