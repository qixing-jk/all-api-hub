import type {
  AxonHubChannelStatus,
  AxonHubChannelType,
} from "~/constants/axonHub"

export interface AxonHubModelMapping {
  from?: string | null
  to: string
}

export interface AxonHubChannelSettings {
  modelMappings?: AxonHubModelMapping[] | null
  autoTrimedModelPrefixes?: string[] | null
  extraModelPrefix?: string | null
  hideOriginalModels?: boolean | null
  hideMappedModels?: boolean | null
  [key: string]: unknown
}

export interface AxonHubChannelCredentials {
  apiKey?: string | null
  apiKeys?: string[] | null
  [key: string]: unknown
}

export interface AxonHubChannel {
  id: string
  name: string
  type: AxonHubChannelType | string
  status: AxonHubChannelStatus | string
  baseURL: string
  credentials?: AxonHubChannelCredentials | null
  supportedModels?: string[] | null
  manualModels?: string[] | null
  defaultTestModel?: string | null
  settings?: AxonHubChannelSettings | null
  createdAt?: string | null
  updatedAt?: string | null
  orderingWeight?: number | null
  remark?: string | null
  errorMessage?: string | null
}

export interface AxonHubCreateChannelInput {
  type: AxonHubChannelType | string
  name: string
  baseURL: string
  credentials: AxonHubChannelCredentials
  supportedModels: string[]
  manualModels?: string[] | null
  defaultTestModel: string
  settings?: AxonHubChannelSettings | null
  orderingWeight?: number | null
  remark?: string | null
}

export type AxonHubUpdateChannelInput = Partial<AxonHubCreateChannelInput>
