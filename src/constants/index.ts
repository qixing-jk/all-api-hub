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
export const DATA_TYPE_CREATED_AT = "created_at"

export * from "./branding"
export * from "./i18n"
export * from "./optionsMenuIds"
export * from "./siteType"
