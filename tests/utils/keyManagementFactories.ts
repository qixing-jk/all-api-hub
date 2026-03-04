import { AuthTypeEnum, SiteHealthStatus } from "~/types"

export const createAccount = (overrides: Partial<any>) => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: "new-api",
  baseUrl: "https://example.com/v1",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

export const createToken = (overrides: Partial<any>) => ({
  id: 1,
  user_id: 1,
  key: "sk-test",
  status: 1,
  name: "Token",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: false,
  used_quota: 0,
  accountId: "acc",
  accountName: "Account",
  ...overrides,
})
