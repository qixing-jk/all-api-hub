import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"

/** Explicit model-workflow identity independent of provider protocol fixtures. */
export const modelResourceRef = (
  resourceId: string | number,
  overrides: Partial<Omit<ManagedResourceRef, "resourceId">> = {},
): ManagedResourceRef => ({
  siteType: SITE_TYPES.NEW_API,
  kind: "channel",
  scopeKey: "https://example.com",
  ...overrides,
  resourceId: String(resourceId),
})
