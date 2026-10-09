import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import type { ManagedResourceRegistration } from "~/services/apiAdapters/contracts/managedResourceNative"
import { axonHubManagedResourceRegistration } from "~/services/apiAdapters/managedResources/axonHub"
import { claudeCodeHubManagedResourceRegistration } from "~/services/apiAdapters/managedResources/claudeCodeHub"
import { cliProxyApiManagedResourceRegistration } from "~/services/apiAdapters/managedResources/cliProxyApi"
import { doneHubManagedResourceRegistration } from "~/services/apiAdapters/managedResources/doneHub"
import { gptLoadManagedResourceRegistration } from "~/services/apiAdapters/managedResources/gptLoad"
import { magpieManagedResourceRegistration } from "~/services/apiAdapters/managedResources/magpie"
import { newApiManagedResourceRegistration } from "~/services/apiAdapters/managedResources/newApi"
import { octopusManagedResourceRegistration } from "~/services/apiAdapters/managedResources/octopus"
import { omniRouteManagedResourceRegistration } from "~/services/apiAdapters/managedResources/omniRoute"
import { sub2ApiManagedResourceRegistration } from "~/services/apiAdapters/managedResources/sub2api"
import { veloeraManagedResourceRegistration } from "~/services/apiAdapters/managedResources/veloera"

/** Native registrations, also used to verify completeness against product declarations. */
export const managedResourceRegistrations: readonly ManagedResourceRegistration[] =
  [
    cliProxyApiManagedResourceRegistration,
    newApiManagedResourceRegistration,
    octopusManagedResourceRegistration,
    axonHubManagedResourceRegistration,
    claudeCodeHubManagedResourceRegistration,
    doneHubManagedResourceRegistration,
    sub2ApiManagedResourceRegistration,
    veloeraManagedResourceRegistration,
    omniRouteManagedResourceRegistration,
    gptLoadManagedResourceRegistration,
    magpieManagedResourceRegistration,
  ]

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
    managedResourceRegistrations.find(
      (registration) =>
        managedResourceKey(registration.siteType, registration.kind) === key,
    ) ?? null
  )
}
