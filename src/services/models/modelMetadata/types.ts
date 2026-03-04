export interface ModelMetadata {
  id: string
  name: string
  provider_id: string
}

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
