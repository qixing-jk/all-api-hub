export const VOAPI_V2_ENDPOINTS = {
  UserInfo: "/api/user/info",
  DashboardStatistics: "/api/dash/statistics",
  InviteInfo: "/api/user/invite-info",
  Keys: "/api/keys",
  KeyTemplate: "/api/keys/template",
  CheckInTemplate: "/api/check_in/template",
  CheckInStats: "/api/check_in/stats",
  CheckInRecords: "/api/check_in",
  CheckInSubmit: "/api/check_in",
} as const

export const VOAPI_V2_PROTOCOL_CODES = {
  Success: 0,
  AlreadySigned: 1,
  AuthExpired: 2,
} as const

export const VOAPI_V2_SYSTEM_NAME = "VoAPI"

export type VoApiV2Envelope<TData = unknown> = {
  code: number
  data?: TData
  msg?: string
  message?: string
  token?: string
  rid?: string
}

export type VoApiV2UserInfo = {
  id: number | string
  username?: string
  nickname?: string
  basicBalance?: string | number
  bindBalance?: string | number
  usedBasicBalance?: string | number
  usedBindBalance?: string | number
  currency?: string
  totalRequest?: number
  totalToken?: number
}

export type VoApiV2DashboardStatistics = {
  d?: {
    requests?: number | string
    usedBasicBalance?: string | number
    usedBindBalance?: string | number
    errors?: number
    maxRpm?: number
  }
}

export type VoApiV2InviteInfo = {
  url?: unknown
}

export type VoApiV2Key = {
  id: number
  name?: string
  tokenMasked?: string
  groups?: Array<string | number>
  enable?: boolean
  expireTime?: number
  boundlessAmount?: boolean
  amount?: string | number
  used?: string | number
  note?: string
}

export type VoApiV2KeyTemplate = {
  groups?: Array<{
    id: string | number
    name?: string
    ratio?: number
    timeRatio?: number
    chargingType?: string
    subBalanceType?: string
    note?: string
  }>
  models?: Array<{
    idKey?: string
    enable?: boolean
    hidden?: boolean
  }>
  ssb?: boolean
}

export type VoApiV2CheckInStats = {
  todaySigned?: boolean
  nextAmount?: string | number
  todayRecord?: unknown
  consecutiveDays?: number
}

export type VoApiV2CheckInSubmitData = {
  amount?: string | number
  bonusAmount?: string | number
}
