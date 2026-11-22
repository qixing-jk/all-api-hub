import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { CURRENCIES, DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import type { Asset } from "~/services/amounts/assets"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"

/** Both reports use the same sample sites and asset identities. */
export function createReportPreviewAccounts(mixed: boolean, now: number) {
  const assets: Asset[] = mixed
    ? [
        { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
        { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        {
          kind: ASSET_KINDS.Quota,
          id: "preview-tokens",
          label: "Token",
          displayScale: 1,
          displayLabel: "Token",
        },
        { kind: ASSET_KINDS.Currency, code: CURRENCIES.CNY },
      ]
    : [
        { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      ]
  return assets.map((asset, index) => {
    const id = `dev-report-${index + 1}`
    const account: SiteAccount = {
      id,
      site_name: ["Aster API", "Birch Gateway", "Cedar Tokens", "Dawn API"][
        index
      ]!,
      site_url: `https://${id}.example.invalid`,
      site_type: "unknown",
      health: { status: SiteHealthStatus.Healthy },
      exchange_rate: DEFAULT_USD_TO_CNY_RATE,
      notes: "",
      tagIds: [],
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      authType: AuthTypeEnum.None,
      created_at: now,
      updated_at: now,
      user_updated_at: now,
      last_sync_time: now,
      checkIn: {
        automaticExecutionEnabled: false,
        methodKnowledge: { methods: {} },
        selection: { mode: CHECK_IN_SELECTION_MODES.Automatic },
      },
      account_info: {
        id,
        username: id,
        access_token: "",
        quota: 0,
        today_income: 0,
        today_quota_consumption: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_requests_count: 0,
      },
    }
    return { account, asset }
  })
}
