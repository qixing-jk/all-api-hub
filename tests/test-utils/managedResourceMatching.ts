import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"

/** Matching fixtures declare the managed deployment independently of upstream wire records. */
export const matchingResourceRef = (
  resourceId: string | number,
  overrides: Partial<Omit<ManagedResourceRef, "resourceId">> = {},
): ManagedResourceRef => ({
  siteType: SITE_TYPES.NEW_API,
  kind: "channel",
  scopeKey: "https://managed.example",
  ...overrides,
  resourceId: String(resourceId),
})

export const buildManagedResourceMatchCandidate = (
  overrides: Partial<ManagedResourceMatchCandidate> = {},
): ManagedResourceMatchCandidate => ({
  ref: matchingResourceRef(1),
  type: 1,
  name: "Test Channel",
  base_url: "https://example.com",
  models: "",
  key: "",
  ...overrides,
})
