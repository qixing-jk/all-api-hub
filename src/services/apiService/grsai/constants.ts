import {
  GRSAI_API_BASE_URL,
  GRSAI_CONSOLE_API_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"

export { GRSAI_API_BASE_URL, GRSAI_CONSOLE_API_ORIGIN }

/**
 * Console API routes, verified against the deployment on 2026-09-29.
 *
 * Every console call is a `POST` to `https://eb.grsaiapi.com`; the console
 * origin (`https://grsai.com`) only serves the Next.js frontend. Route strings
 * are taken from the console's own bundle
 * (`_next/static/chunks/dbc7289c88ff1382.js`).
 */
export const GRSAI_ENDPOINTS = {
  /** Issues the per-call session token and the request-signature material. */
  config: "/client/common/getConfig",
  userInfo: "/client/grsai/getUserInfo",
  credits: "/client/grsai/getCredits",
  dashboard: "/client/grsai/getDashboardData",
  creditLogs: "/client/grsai/getCreditsLogList",
  apiKeyList: "/client/grsai/getAPIKeyList",
  apiKeyCreate: "/client/grsai/createAPIKey",
  /** Renames/requotes an existing key; addresses it by its plaintext secret. */
  apiKeyUpdate: "/client/grsai/updateAPIKeyInfo",
  apiKeyDelete: "/client/grsai/deleteAPIKey",
  modelList: "/client/serverGrsai/getModelList",
  modelListV2: "/client/serverGrsai/getModelListV2",
  modelGroups: "/client/serverGrsai/getModelGroupList",
} as const

/** Success code of the console's `{ code, data, msg }` envelope. */
export const GRSAI_SUCCESS_CODE = 0

/**
 * The console answers an unauthenticated call with HTTP 200 and this code,
 * with an empty `msg`.
 */
export const GRSAI_UNAUTHENTICATED_CODE = -10000

/** `type` value of a key that is not limited to a credit budget. */
export const GRSAI_KEY_TYPE_UNLIMITED = 0

/** `type` value of a key whose `credits` is the remaining budget. */
export const GRSAI_KEY_TYPE_LIMITED = 1

/** `expireTime` value meaning the key never expires. */
export const GRSAI_NO_EXPIRY = 0
