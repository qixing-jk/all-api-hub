import {
  adaptManagedCredentialPolicy,
  MANAGED_RESOURCE_SECTION_ORDER,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"

/** Validates provider descriptors against production credential adaptation and field policy. */
export function resolveManagedResourceTestPolicy(
  descriptors: Parameters<typeof adaptManagedCredentialPolicy>[0],
  policy: Parameters<typeof adaptManagedCredentialPolicy>[1],
) {
  return resolveResourceFieldPolicy(
    descriptors,
    adaptManagedCredentialPolicy(descriptors, policy),
    MANAGED_RESOURCE_SECTION_ORDER,
  )
}
