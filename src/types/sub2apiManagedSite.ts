export const SUB2API_API_KEY_ACCOUNT_PLATFORMS = [
  "openai",
  "anthropic",
  "gemini",
  "grok",
  "antigravity",
] as const

export type Sub2ApiApiKeyAccountPlatform =
  (typeof SUB2API_API_KEY_ACCOUNT_PLATFORMS)[number]

export type Sub2ApiApiKeyAccountStatus = "active" | "inactive" | "error"

export interface Sub2ApiAdminApiKeyAccount {
  id: number
  name: string
  notes?: string | null
  platform: Sub2ApiApiKeyAccountPlatform
  type: "apikey"
  credentials?: Record<string, unknown>
  credentials_status?: Record<string, boolean>
  concurrency?: number
  priority?: number
  status?: Sub2ApiApiKeyAccountStatus | string
}

export interface Sub2ApiAdminAccountListData {
  items: Sub2ApiAdminApiKeyAccount[]
  total: number
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
