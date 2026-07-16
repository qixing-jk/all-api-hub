import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import type { ManagedResourceRegistration } from "~/services/apiAdapters/contracts/managedResourceNative"

import { axonHubManagedResourceRegistration } from "./axonHub"

const MANAGED_RESOURCE_REGISTRATIONS = [
  axonHubManagedResourceRegistration,
] satisfies readonly ManagedResourceRegistration[]

const managedResourceKey = (
  siteType: ManagedSiteType,
  kind: ManagedResourceKind,
) => `${siteType}:${kind}`

/** Returns the native managed-resource registration for an exact site/kind. */
export function getManagedResourceRegistration(
  siteType: ManagedSiteType,
  kind: ManagedResourceKind,
): ManagedResourceRegistration | null {
  const key = managedResourceKey(siteType, kind)
  return (
    MANAGED_RESOURCE_REGISTRATIONS.find(
      (registration) =>
        managedResourceKey(registration.siteType, registration.kind) === key,
    ) ?? null
  )
}
