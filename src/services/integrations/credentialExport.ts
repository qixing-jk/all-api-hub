import { normalizeList } from "~/utils/core/string"

/** Provider metadata and a resolved API key required by external integrations. */
export interface CredentialExportData {
  providerId: string
  providerName: string
  baseUrl: string
  /** Target-specific Anthropic SDK address when it differs from `baseUrl`. */
  anthropicBaseUrl?: string
  apiKey: string
}

/**
 * A selected credential whose secret is resolved only when an export workflow
 * needs it. Resource inventories and account authentication stay with its owner.
 */
export interface CredentialExportSource {
  /** Headers for model discovery inside the extension, not external configuration. */
  requestHeaders?: Record<string, string>
  /** Stable credential selection identity, including native scope when present. */
  id: string
  /** Provider identity used by account/profile-based desktop integrations. */
  providerId: string
  providerName: string
  credentialName: string
  baseUrl: string
  /** Target-specific Anthropic SDK address when available. */
  anthropicBaseUrl?: string
  notes?: string
  /** Changes when endpoint or credential-resolution inputs change. */
  cacheKey: string
  resolveApiKey: () => Promise<string>
}

/** Resolve only the credential fields accepted by external integrations. */
export async function resolveCredentialExport(
  source: CredentialExportSource,
): Promise<CredentialExportData> {
  return {
    providerId: source.providerId,
    providerName: source.providerName,
    baseUrl: source.baseUrl,
    apiKey: await source.resolveApiKey(),
  }
}

/**
 * Default provider name every desktop export target prefills.
 *
 * Account-token sources name the site and the key separately, so the default
 * says which of that site's keys is being exported. A stored profile already
 * names itself after its site and key, so its two labels are identical and
 * collapse into one instead of repeating the whole name.
 */
export function buildCredentialExportDisplayName(
  source: Pick<CredentialExportSource, "providerName" | "credentialName">,
): string {
  return normalizeList([source.providerName, source.credentialName]).join(" - ")
}
