import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"

/**
 * Returns true when a managed-site channel key can be used directly as a real
 * credential rather than a masked inventory placeholder.
 */
export function hasUsableManagedSiteChannelKey(key?: string | null): boolean {
  const trimmed = key?.trim() ?? ""
  return hasUsableApiTokenKey(trimmed)
}
