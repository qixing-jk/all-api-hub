/** Provider metadata and a resolved API key required by external integrations. */
export interface CredentialExportData {
  providerId: string
  providerName: string
  baseUrl: string
  apiKey: string
}

/**
 * A selected credential whose secret is resolved only when an export workflow
 * needs it. Resource inventories and account authentication stay with its owner.
 */
export interface CredentialExportSource {
  /** Stable credential selection identity, including native scope when present. */
  id: string
  /** Provider identity used by account/profile-based desktop integrations. */
  providerId: string
  providerName: string
  credentialName: string
  baseUrl: string
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
