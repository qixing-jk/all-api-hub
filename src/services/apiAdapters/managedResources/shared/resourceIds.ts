import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { assertManagedResourceRefForSite } from "~/services/managedSites/managedResourceIdentity"

/** Numeric providers accept only canonical positive integer identifiers. */
export function requireNumericManagedResourceId(id: number | string): number {
  if (typeof id === "string" && /^[1-9]\d*$/.test(id)) id = Number(id)
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0)
    throw new TypeError("Invalid numeric resource id")
  return id
}

/** Validates the public identity before exposing a numeric provider locator. */
export function requireManagedResourceChannelId(
  siteType: ManagedSiteType,
  config: { baseUrl: string },
  ref: ManagedResourceRef,
): number {
  assertManagedResourceRefForSite(ref, { siteType, config })
  return requireNumericManagedResourceId(ref.resourceId)
}

/**
 * Validates the public identity before exposing an opaque string locator.
 *
 * Providers whose resource ids are UUIDs (rather than New API-family integers)
 * keep the identifier as-is; only the site/kind/scope assertion is shared.
 */
export function requireOpaqueManagedResourceChannelId(
  siteType: ManagedSiteType,
  config: { baseUrl: string },
  ref: ManagedResourceRef,
): string {
  assertManagedResourceRefForSite(ref, { siteType, config })
  return ref.resourceId
}
