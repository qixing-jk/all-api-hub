import type { Sub2ApiApiKeyAccountPlatform } from "~/constants/sub2api"

export type {
  Sub2ApiApiKeyAccountPlatform,
  Sub2ApiApiKeyAccountStatus,
} from "~/constants/sub2api"

export interface Sub2ApiAdminApiKeyAccount {
  id: number
  name: string
  notes?: string | null
  platform: Sub2ApiApiKeyAccountPlatform
  type: string
  credentials?: Record<string, unknown>
  credentials_status?: Record<string, boolean>
  concurrency?: number
  priority?: number
  status?: string
}

export interface Sub2ApiAdminAccountListData {
  items: Sub2ApiAdminApiKeyAccount[]
  total?: number
  page?: number
  page_size?: number
  pages?: number
}

export interface Sub2ApiAdminDataAccount {
  name: string
  platform: Sub2ApiApiKeyAccountPlatform
  type: string
  credentials?: Record<string, unknown>
  concurrency?: number
  priority?: number
}

export interface Sub2ApiAdminDataPayload {
  exported_at?: string
  proxies?: unknown[]
  accounts?: Sub2ApiAdminDataAccount[]
}

export interface Sub2ApiAdminEnvelope<T> {
  code?: string | number
  message?: string
  data?: T
  error?: string
}
