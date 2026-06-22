import { ACCOUNT_SITE_TYPE_ORDER, MANAGED_SITE_TYPE_ORDER } from "./definitions"
import { SITE_TYPES } from "./identifiers"
import { getAccountSiteTypeValues, getManagedSiteTypeValues } from "./registry"

export {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  AIHUBMIX_WEB_ORIGIN,
} from "./identifiers"

export { SITE_TYPES }

export type AccountSiteType = (typeof ACCOUNT_SITE_TYPE_ORDER)[number]
export const ACCOUNT_SITE_TYPES = getAccountSiteTypeValues() as readonly [
  ...typeof ACCOUNT_SITE_TYPE_ORDER,
]
export const ACCOUNT_SITE_TYPE_VALUES = [...ACCOUNT_SITE_TYPES]

export type ManagedSiteType = (typeof MANAGED_SITE_TYPE_ORDER)[number]
export const MANAGED_SITE_TYPES = getManagedSiteTypeValues() as readonly [
  ...typeof MANAGED_SITE_TYPE_ORDER,
]
