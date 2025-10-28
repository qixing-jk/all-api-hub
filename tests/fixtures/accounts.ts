import {
  AuthTypeEnum,
  SiteHealthStatus,
  type CheckInConfig,
  type DisplaySiteData,
  type SiteAccount
} from "~/types"

type CheckInOverrides = Partial<CheckInConfig>

type DisplaySiteDataOverrides = Partial<Omit<DisplaySiteData, "checkIn">> & {
  checkIn?: CheckInOverrides
}

type SiteAccountOverrides = Partial<
  Omit<SiteAccount, "checkIn" | "account_info">
> & {
  checkIn?: CheckInOverrides
  account_info?: Partial<SiteAccount["account_info"]>
}

let accountCounter = 0

export function createCheckInConfig(
  overrides: CheckInOverrides = {}
): CheckInConfig {
  return {
    enableDetection: true,
    isCheckedInToday: false,
    customCheckInUrl: undefined,
    customRedeemUrl: undefined,
    lastCheckInDate: undefined,
    openRedeemWithCheckIn: true,
    ...overrides
  }
}

export function createDisplaySiteData(
  overrides: DisplaySiteDataOverrides = {}
): DisplaySiteData {
  const id = overrides.id ?? `display-${++accountCounter}`
  const {
    checkIn: checkInOverrides,
    balance,
    todayConsumption,
    todayIncome,
    todayTokens,
    health,
    ...rest
  } = overrides

  return {
    id,
    icon: rest.icon ?? `icon-${id}`,
    name: rest.name ?? `Account ${id}`,
    username: rest.username ?? `user-${id}`,
    balance: balance ?? {
      USD: 100,
      CNY: 700
    },
    todayConsumption: todayConsumption ?? {
      USD: 10,
      CNY: 70
    },
    todayIncome: todayIncome ?? {
      USD: 5,
      CNY: 35
    },
    todayTokens: todayTokens ?? {
      upload: 1000,
      download: 2000
    },
    health: health ?? { status: SiteHealthStatus.Healthy },
    last_sync_time: rest.last_sync_time,
    siteType: rest.siteType ?? "one-api",
    baseUrl: rest.baseUrl ?? `https://example.com/${id}`,
    token: rest.token ?? `token-${id}`,
    userId: rest.userId ?? accountCounter,
    notes: rest.notes,
    checkIn: createCheckInConfig(checkInOverrides),
    authType: rest.authType ?? AuthTypeEnum.AccessToken,
    can_check_in: rest.can_check_in,
    supports_check_in: rest.supports_check_in
  }
}

export function createSiteAccount(
  overrides: SiteAccountOverrides = {}
): SiteAccount {
  const id = overrides.id ?? `account-${++accountCounter}`
  const {
    checkIn: checkInOverrides,
    account_info: accountInfoOverrides,
    ...rest
  } = overrides

  const now = Date.now()

  return {
    id,
    emoji: rest.emoji ?? "",
    site_name: rest.site_name ?? `Site ${id}`,
    site_url: rest.site_url ?? `https://example.com/${id}`,
    health: rest.health ?? { status: SiteHealthStatus.Healthy },
    site_type: rest.site_type ?? "one-api",
    exchange_rate: rest.exchange_rate ?? 7,
    notes: rest.notes,
    checkIn: createCheckInConfig(checkInOverrides),
    account_info: {
      id: accountInfoOverrides?.id ?? accountCounter,
      access_token: accountInfoOverrides?.access_token ?? `token-${id}`,
      username: accountInfoOverrides?.username ?? `user-${id}`,
      quota: accountInfoOverrides?.quota ?? 1000,
      today_prompt_tokens: accountInfoOverrides?.today_prompt_tokens ?? 100,
      today_completion_tokens:
        accountInfoOverrides?.today_completion_tokens ?? 50,
      today_quota_consumption:
        accountInfoOverrides?.today_quota_consumption ?? 10,
      today_requests_count: accountInfoOverrides?.today_requests_count ?? 2,
      today_income: accountInfoOverrides?.today_income ?? 0
    },
    last_sync_time: rest.last_sync_time ?? now,
    updated_at: rest.updated_at ?? now,
    created_at: rest.created_at ?? now,
    authType: rest.authType ?? AuthTypeEnum.AccessToken,
    can_check_in: rest.can_check_in,
    supports_check_in: rest.supports_check_in,
    configVersion: rest.configVersion
  }
}
