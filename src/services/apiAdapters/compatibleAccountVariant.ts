import type { AccountSiteType } from "~/constants/siteType"

import type { CompatibleAccountVariant } from "./compatibleAccountVariantContract"
import { getNewApiVariantRegistration } from "./newApi/variantRegistration"
import { getShellApiVariant } from "./shellApi/variantRegistration"

/** Resolves the site dialect used by shared One API-compatible operations. */
export function getCompatibleAccountVariant(
  siteType?: AccountSiteType,
): CompatibleAccountVariant {
  return getShellApiVariant(siteType) ?? getNewApiVariantRegistration(siteType)
}
