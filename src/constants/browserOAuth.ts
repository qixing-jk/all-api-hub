/** Compatibility name for existing OAuth callers; account login owns the outcomes. */
export { BROWSER_LOGIN_STATUS as BROWSER_OAUTH_STATUS } from "./browserLogin"

/** Parsing outcomes before the browser executor accepts account authentication. */
export const BROWSER_OAUTH_COMPLETION_STATUS = {
  Verified: "verified",
  Invalid: "invalid",
} as const
