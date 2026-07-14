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

export interface VendorRule {
  providerID: string
  displayName: string
  pattern: RegExp
}

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
