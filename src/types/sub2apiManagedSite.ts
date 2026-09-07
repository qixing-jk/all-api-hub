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
  schedulable?: boolean
  group_ids?: number[]
  groups?: { id: number; name: string }[]
  extra?: Record<string, unknown>
  proxy_id?: number | null
  rate_multiplier?: number
  load_factor?: number | null
  expires_at?: number | null
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
