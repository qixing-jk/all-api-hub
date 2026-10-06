import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import type { ManagedResourceRegistration } from "~/services/apiAdapters/contracts/managedResourceNative"

import { axonHubManagedResourceRegistration } from "./axonHub"
import { claudeCodeHubManagedResourceRegistration } from "./claudeCodeHub"
import { cliProxyApiManagedResourceRegistration } from "./cliProxyApi"
import { doneHubManagedResourceRegistration } from "./doneHub"
import { gptLoadManagedResourceRegistration } from "./gptLoad"
import { newApiManagedResourceRegistration } from "./newApi"
import { octopusManagedResourceRegistration } from "./octopus"
import { omniRouteManagedResourceRegistration } from "./omniroute"
import { sub2ApiManagedResourceRegistration } from "./sub2api"
import { veloeraManagedResourceRegistration } from "./veloera"

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
