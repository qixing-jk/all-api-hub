import type { ManagedSiteType } from "~/constants/siteType"

/** Persisted resource identity for model filters and preferences; its serialized shape is stable. */
export type ManagedUpstreamResourceRef = {
  managedSiteType: ManagedSiteType
  /**
   * Stable non-secret scope identity, such as a normalized admin origin.
   * Do not include credential-bearing URLs, tokens, or other secrets.
   */
  scopeKey: string
  /**
   * Stable non-secret native resource identity, such as an internal id.
   * Do not include credential-bearing URLs, tokens, or other secrets.
   */
  resourceId: string
}

type ManagedUpstreamResourceRefInput = Omit<
  ManagedUpstreamResourceRef,
  "resourceId"
> & {
  resourceId: string | number
}

/**
 * Builds a resource ref while preserving the public contract that resource ids are strings.
 */
export function createManagedUpstreamResourceRef(
  input: ManagedUpstreamResourceRefInput,
): ManagedUpstreamResourceRef {
  return {
    managedSiteType: input.managedSiteType,
    scopeKey: normalizeManagedUpstreamResourceScopeKey(input.scopeKey),
    resourceId: String(input.resourceId),
  }
}

/**
 * Canonicalizes a managed-resource scope so refs omit incidental URL paths and trailing slashes.
 */
export function normalizeManagedUpstreamResourceScopeKey(
  scopeKey: string,
): string {
  const trimmed = scopeKey.trim()
  if (!trimmed) {
    return ""
  }

  try {
    return new URL(trimmed).origin
  } catch {
    return trimmed.replace(/\/+$/, "")
  }
}

/**
 * Derives a stable key from non-secret resource identity fields.
 */
export function getManagedUpstreamResourceRefKey(
  ref: ManagedUpstreamResourceRef,
): string {
  return [
    ref.managedSiteType,
    encodeURIComponent(ref.scopeKey),
    encodeURIComponent(ref.resourceId),
  ].join(":")
}
