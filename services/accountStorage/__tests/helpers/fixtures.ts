import { SiteHealthStatus } from "~/types"
import type { SiteAccount, UserPreferences } from "~/types"
import { DEFAULT_ACCOUNT_AUTO_REFRESH } from "~/types/accountAutoRefresh"

/**
 * Helper to create a minimal SiteAccount fixture for testing
 */
export const createSiteAccount = (
  overrides: Partial<SiteAccount> = {}
): SiteAccount => ({
  id: "test-account-1",
  emoji: "🧪",
  site_name: "Test Site",
  site_url: "https://test.com",
  health: { status: SiteHealthStatus.Healthy },
  site_type: "test-site",
  exchange_rate: 7.0,
  account_info: {
    id: 1,
    access_token: "test-token",
    username: "test-user",
    quota: 1000,
    today_prompt_tokens: 100,
    today_completion_tokens: 200,
    today_quota_consumption: 50,
    today_requests_count: 5,
    today_income: 10
  },
  last_sync_time: Date.now(),
  updated_at: Date.now(),
  created_at: Date.now(),
  authType: "access_token" as const,
  checkIn: {
    enableDetection: true,
    isCheckedInToday: false
  },
  ...overrides
})

/**
 * Helper to create mock user preferences for testing
 */
export const createMockPreferences = (
  overrides: Partial<UserPreferences> = {}
): UserPreferences => ({
  themeMode: "light",
  activeTab: "balance" as const,
  currencyType: "USD" as const,
  sortField: "name" as const,
  sortOrder: "asc" as const,
  accountAutoRefresh: DEFAULT_ACCOUNT_AUTO_REFRESH,
  showHealthStatus: true,
  webdav: {
    enabled: false,
    url: "",
    username: "",
    password: "",
    path: "/"
  },
  newApi: {
    baseUrl: "",
    adminToken: "",
    userId: ""
  },
  newApiModelSync: {
    enabled: false,
    interval: 300000,
    concurrency: 3,
    maxRetries: 3,
    rateLimit: {
      requestsPerMinute: 60,
      burst: 10
    }
  },
  autoCheckin: {
    enabled: false,
    schedule: "09:00",
    randomDelay: 30,
    openInBackground: false
  },
  modelRedirect: {
    enabled: false,
    mappings: []
  },
  preferencesVersion: 5,
  ...overrides
})

/**
 * Helper to create mock refresh account result
 */
export const createMockRefreshResult = (overrides: Partial<any> = {}) => ({
  success: true,
  data: {
    quota: 2000,
    today_prompt_tokens: 150,
    today_completion_tokens: 250,
    today_quota_consumption: 75,
    today_requests_count: 8,
    today_income: 15,
    checkIn: {
      enableDetection: true,
      isCheckedInToday: false
    },
    ...overrides
  },
  healthStatus: {
    status: SiteHealthStatus.Healthy,
    message: "Account is healthy"
  }
})

/**
 * Helper to create mock today income result
 */
export const createMockIncomeResult = (income: number = 20) => ({
  today_income: income
})
