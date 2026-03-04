/* 数据类型 */
/**
 * Dashboard tab that represents today's cashflow (consumption + income).
 *
 * Note: This is distinct from `DATA_TYPE_CONSUMPTION`, which is still used where we mean
 * consumption specifically (e.g. sorting by today's consumption).
 */
export const DATA_TYPE_CASHFLOW = "cashflow"
export const DATA_TYPE_CONSUMPTION = "consumption"
export const DATA_TYPE_INCOME = "income"
export const DATA_TYPE_BALANCE = "balance"

/* 默认语言 */
export const DEFAULT_LANG = "zh_CN"
export * from "./siteType"
export * from "./managedSite"
export * from "./optionsMenuIds"
export * from "./branding"
