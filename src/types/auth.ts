export enum AuthTypeEnum {
  AccessToken = "access_token",
  Cookie = "cookie",
  None = "none",
}

export const ACCOUNT_AUTH_HEALTH_STATUS_CODES = {
  AUTHENTICATION_REQUIRED: "authentication_required",
} as const

export type AccountAuthHealthStatusCode =
  (typeof ACCOUNT_AUTH_HEALTH_STATUS_CODES)[keyof typeof ACCOUNT_AUTH_HEALTH_STATUS_CODES]
