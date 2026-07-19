export interface ModelMetadata {
  id: string
  name: string
  provider_id: string
  family?: string
  description?: string
  capabilities?: ModelMetadataCapabilities
  modalities?: ModelMetadataModalities
  open_weights?: boolean
  limits?: ModelMetadataLimits
  release_date?: string
  last_updated?: string
}

export type ModelIdentityLookupResult =
  | {
      state: "resolved"
      match: "exact" | "normalized-alias"
      metadata: ModelMetadata
    }
  | { state: "ambiguous" }
  | { state: "unmatched" }

export interface ModelMetadataCache {
  models: ModelMetadata[]
  lastUpdated: number
  version: string
}

export type ModelVendorProvenance =
  | { source: "metadata"; identityMatch: "exact" | "normalized-alias" }
  | {
      source:
        | "publisher-evidence"
        | "deployment-alias"
        | "curated-rule"
        | "routing-alias"
      identityMatch?: never
    }

export type ModelVendorCandidate =
  | ({
      state: "candidate"
      kind: "known"
      key: `known:${string}`
      knownId: string
      labelCandidate: string
    } & ModelVendorProvenance)
  | ({
      state: "candidate"
      kind: "custom"
      key: `custom:${string}`
      labelCandidate: string
    } & ModelVendorProvenance)
  | { state: "unknown" }

export type ResolvedModelVendor =
  | ({
      state: "resolved"
      kind: "known"
      key: `known:${string}`
      knownId: string
      label: string
    } & ModelVendorProvenance)
  | ({
      state: "resolved"
      kind: "custom"
      key: `custom:${string}`
      label: string
    } & ModelVendorProvenance)
  | { state: "unknown" }

export type ModelVendorCatalogEntry =
  | {
      kind: "known"
      key: `known:${string}`
      knownId: string
      label: string
    }
  | { kind: "custom"; key: `custom:${string}`; label: string }

export interface ModelMetadataCapabilities {
  attachment?: boolean
  reasoning?: boolean
  toolCall?: boolean
  structuredOutput?: boolean
  temperature?: boolean
}

export interface ModelMetadataModalities {
  input: string[]
  output: string[]
}

export interface ModelMetadataLimits {
  context?: number
  input?: number
  output?: number
}
