import type { ManagedSiteType } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRef,
  isManagedResourceRefFor,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  createManagedUpstreamResourceRef,
  normalizeManagedUpstreamResourceScopeKey,
} from "~/types/managedUpstreamResource"

/** Shared identity for native channel workflows; only adapters interpret resourceId. */
export function createManagedChannelResourceRef(
  siteType: ManagedSiteType,
  baseUrl: string,
  resourceId: string | number,
): ManagedResourceRef {
  return {
    siteType,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: normalizeManagedUpstreamResourceScopeKey(baseUrl),
    resourceId: String(resourceId),
  }
}

/** Compares complete native identities without conflating sites, scopes or kinds. */
export const getManagedResourceRefKey = (ref: ManagedResourceRef): string =>
  JSON.stringify([ref.siteType, ref.kind, ref.scopeKey, ref.resourceId])

/** Missing references never establish resource equality. */
export const areManagedResourceRefsEqual = (
  left: ManagedResourceRef | null | undefined,
  right: ManagedResourceRef | null | undefined,
): boolean =>
  Boolean(
    left &&
      right &&
      getManagedResourceRefKey(left) === getManagedResourceRefKey(right),
  )

/** Reads an optional resource deep link without coercing native identifiers. */
export function parseManagedResourceRef(
  value: string | undefined,
): ManagedResourceRef | null {
  if (!value) return null
  try {
    const ref: unknown = JSON.parse(value)
    return isManagedResourceRef(ref) ? ref : null
  } catch {
    return null
  }
}

/** Matches a resource against a captured deployment configuration. */
export const isManagedResourceRefForSite = (
  ref: unknown,
  target: { siteType: ManagedSiteType; config: { baseUrl: string } },
): ref is ManagedResourceRef =>
  isManagedResourceRefFor(ref, {
    siteType: target.siteType,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: normalizeManagedUpstreamResourceScopeKey(target.config.baseUrl),
  })

/** Rejects stale or foreign selections before any provider operation. */
export function assertManagedResourceRefForSite(
  ref: unknown,
  target: { siteType: ManagedSiteType; config: { baseUrl: string } },
): asserts ref is ManagedResourceRef {
  if (!isManagedResourceRefForSite(ref, target)) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  }
}

/** Retains the existing serialized model-filter identity format. */
export const toManagedUpstreamResourceRef = (ref: ManagedResourceRef) =>
  createManagedUpstreamResourceRef({
    managedSiteType: ref.siteType,
    scopeKey: ref.scopeKey,
    resourceId: ref.resourceId,
  })
