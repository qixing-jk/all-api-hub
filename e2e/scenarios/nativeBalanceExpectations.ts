import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"

/** Category and amount pairs for rows with distinct inline native positions. */
export const categorizedNativeBalances: Partial<
  Record<AccountSiteType, ReadonlyArray<readonly [string, string]>>
> = {
  [SITE_TYPES.CUBENCE]: [
    ["Normal balance", "$12.50"],
    ["Charity balance", "$9.00"],
  ],
  [SITE_TYPES.VO_API_V2]: [
    ["Basic balance", "$2.00"],
    ["Bound balance", "$10.00"],
  ],
  [SITE_TYPES.RELAYFOR]: [
    ["Permanent credit", "$1.88"],
    ["Timed credit", "$3.76"],
  ],
}

/** Display expectations independent of the dev generator and its formatters. */
export const nativeBalanceExpectations: Record<
  AccountSiteType,
  readonly string[]
> = {
  [SITE_TYPES.ONE_API]: ["$10.00"],
  [SITE_TYPES.NEW_API]: ["$10.00"],
  [SITE_TYPES.APIYI]: ["$10.00"],
  [SITE_TYPES.LAOZHANG]: ["$10.00"],
  [SITE_TYPES.SHELL_API]: ["$10.00"],
  [SITE_TYPES.MODELFLARE]: ["$10.00"],
  [SITE_TYPES.ANYROUTER]: ["$10.00"],
  [SITE_TYPES.VELOERA]: ["$10.00"],
  [SITE_TYPES.ONE_HUB]: ["$10.00"],
  [SITE_TYPES.DONE_HUB]: ["$10.00"],
  [SITE_TYPES.V_API]: ["$10.00"],
  [SITE_TYPES.VO_API]: ["$10.00"],
  [SITE_TYPES.SUPER_API]: ["$10.00"],
  [SITE_TYPES.RIX_API]: ["$12.34"],
  [SITE_TYPES.NEO_API]: ["$10.00"],
  [SITE_TYPES.WONG_GONGYI]: ["$10.00"],
  [SITE_TYPES.UNKNOWN]: ["5M quota"],
  [SITE_TYPES.SUB2API]: ["$12.34"],
  [SITE_TYPES.AIHUBMIX]: ["$12.34"],
  [SITE_TYPES.DAYA]: ["$12.34"],
  [SITE_TYPES.PMAPI]: ["$12.34"],
  [SITE_TYPES.AIMLAPI]: ["$12.34"],
  [SITE_TYPES.REQUESTY]: ["$12.34"],
  [SITE_TYPES.VERCEL_AI_GATEWAY]: ["$12.34"],
  [SITE_TYPES.OPENROUTER]: ["$12.34"],
  [SITE_TYPES.KIMI]: ["¥8.00"],
  [SITE_TYPES.KIMI_GLOBAL]: ["$8.00"],
  [SITE_TYPES.CUBENCE]: [
    "$12.50",
    "$9.00",
    "Normal balance",
    "Charity balance",
  ],
  [SITE_TYPES.VO_API_V2]: ["$2.00", "$10.00", "Basic balance", "Bound balance"],
  [SITE_TYPES.RELAYFOR]: ["$1.88", "$3.76", "Permanent credit", "Timed credit"],
  [SITE_TYPES.NOVITA]: ["$12.30"],
  [SITE_TYPES.DAHL]: ["2.5 M Token"],
  [SITE_TYPES.EMRANK]: ["2.5 M Token"],
  [SITE_TYPES.GRSAI]: ["66.6K Credits"],
  [SITE_TYPES.XIAOEN]: ["1,250 Credits"],
  [SITE_TYPES.NANOGPT]: ["$42.75", "1.25 XNO"],
  [SITE_TYPES.FREEMODEL]: ["$17.34"],
  [SITE_TYPES.FOXCODE]: ["Daily"],
  [SITE_TYPES.SHAREDCHAT]: ["$8.00", "Daily"],
  [SITE_TYPES.KRILL]: ["$12.34"],
  [SITE_TYPES.RIGHT_CODE]: ["$12.34"],
}
