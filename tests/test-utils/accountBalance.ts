import { CURRENCIES } from "~/constants/money"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"

/** A known balance returned by the balance source in refresh orchestration tests. */
export function buildAccountBalanceObservation(value: string) {
  const scope = accountBalanceScope({ baseUrl: "https://example.com" })
  const observedAt = Date.UTC(2026, 0, 1)

  return accountBalanceObservation(
    scope,
    [
      balancePosition({
        id: "wallet",
        scope,
        value,
        observedAt,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        source: {
          adapter: "test",
          operation: "balance",
          contractVersion: "test/v1",
          kind: EVIDENCE_KINDS.Reported,
        },
      }),
    ],
    observedAt,
    FINANCIAL_ENUMERATION.Complete,
  )
}
