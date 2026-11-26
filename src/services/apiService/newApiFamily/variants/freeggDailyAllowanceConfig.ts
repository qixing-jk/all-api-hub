/** Pure metadata for the verified FreeGG daily-allowance deployment. */
import { FREEGG_DAILY_ALLOWANCE_HOSTNAMES } from "~/services/accountSiteDefinitions/identifiers"

export const FREEGG_DAILY_ALLOWANCE_ORIGINS =
  FREEGG_DAILY_ALLOWANCE_HOSTNAMES.map((hostname) => `https://${hostname}`)
export const FREEGG_ALLOWANCE_LOG_ENDPOINT =
  "/api/log/self?p=1&page_size=30&type=4"
export const FREEGG_ALLOWANCE_TRIGGER_ENDPOINT = "/api/user/self"
