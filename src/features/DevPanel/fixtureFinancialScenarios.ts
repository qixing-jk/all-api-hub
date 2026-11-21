import { CURRENCIES } from "~/constants/money"
import { accountAllowanceObservation } from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import { staleBalancePosition } from "~/services/accounts/refresh/balanceAcceptance"
import {
  balancePosition,
  type BalancePosition,
} from "~/services/amounts/balance"
import { budgetConstraint } from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_FUNDING,
  BALANCE_INSTRUMENTS,
  BALANCE_NATURES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_ENFORCEMENT,
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  FINANCIAL_OBSERVATION_REASONS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"

const DAY_MS = 86_400_000
const USD = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const
const SOURCE = {
  adapter: "dev-fixture",
  operation: "wallets",
  contractVersion: "1",
  kind: EVIDENCE_KINDS.Reported,
} as const

/** Canonical local observations exercise the real account UI without a provider. */
export function buildDevFinancialScenarios(now: number) {
  const labels = [
    "USD wallet",
    "Zero balance",
    "Negative balance",
    "Multiple assets",
    "Expiring voucher",
    "Model restriction",
    "Independent plans",
    "Stale balance",
    "Unavailable balance",
  ]
  return labels.map((label, index) => {
    const baseUrl = `https://balance-${index + 1}.invalid`
    // The account mutation binds the actual local UUID on save.
    const scope = accountBalanceScope({ baseUrl })
    scope.models =
      scope.groups =
      scope.keys =
      scope.projects =
        { kind: SCOPE_SELECTION_KINDS.All }
    const observedAt = index === 7 ? now - 3 * DAY_MS : now
    const position = (
      id: string,
      value: unknown,
      overrides: Partial<BalancePosition> = {},
    ) =>
      balancePosition({
        id,
        scope,
        source: SOURCE,
        asset: USD,
        value,
        observedAt,
        nature: BALANCE_NATURES.Prepaid,
        funding: BALANCE_FUNDING.Purchased,
        validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
        ...overrides,
      })
    let positions = [position("wallet", "120.5")]
    switch (index) {
      case 1:
        positions = [position("wallet", "0")]
        break
      case 2:
        positions = [position("wallet", "-8.25")]
        break
      case 3:
        positions = [
          position("usd", "42.75"),
          position("gbp", "18.2", {
            asset: { kind: ASSET_KINDS.Currency, code: "GBP" },
          }),
          position("credits", "1250", {
            asset: {
              kind: ASSET_KINDS.Quota,
              id: "dev:credits",
              label: "Credits",
              displayScale: 1,
              displayLabel: "Credits",
            },
            funding: BALANCE_FUNDING.Granted,
          }),
        ]
        break
      case 4:
        positions = [
          position("voucher", "15", {
            instrument: BALANCE_INSTRUMENTS.Voucher,
            validity: {
              kind: BALANCE_VALIDITY_KINDS.Expires,
              at: now + 7 * DAY_MS,
            },
          }),
        ]
        break
      case 5:
        positions = [
          position("restricted", "30", {
            scope: {
              ...scope,
              models: {
                kind: SCOPE_SELECTION_KINDS.Restricted,
                ids: ["gpt-4.1"],
              },
            },
          }),
        ]
        break
      case 6:
        positions = []
        break
      case 7:
        positions = [
          staleBalancePosition(
            position("wallet", "64.8"),
            FINANCIAL_OBSERVATION_REASONS.RefreshUnavailable,
          ),
        ]
        break
      case 8:
        positions = [position("wallet", undefined)]
        break
    }
    const planSource = { ...SOURCE, operation: "plans" }
    const allowances =
      index === 6
        ? accountAllowanceObservation(
            scope,
            [
              {
                source: planSource,
                collectionKey: "plans",
                enumeration: FINANCIAL_ENUMERATION.Complete,
                entries: (["day", "week", "month"] as const).map(
                  (period, planIndex) => ({
                    id: `plan:${period}`,
                    identityKind: "upstream",
                    collectionKey: "plans",
                    label: ["Daily plan", "Weekly plan", "Unlimited plan"][
                      planIndex
                    ],
                    validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
                    constraint: budgetConstraint({
                      scope,
                      source: planSource,
                      asset: USD,
                      observedAt,
                      limitState:
                        planIndex === 2
                          ? BUDGET_LIMIT_STATES.Unlimited
                          : BUDGET_LIMIT_STATES.Finite,
                      limit:
                        planIndex === 0
                          ? "20"
                          : planIndex === 1
                            ? "100"
                            : undefined,
                      remaining:
                        planIndex === 0
                          ? "8"
                          : planIndex === 1
                            ? "65"
                            : undefined,
                      used:
                        planIndex === 0 ? "12" : planIndex === 1 ? "35" : "7",
                      enabled: true,
                      enforcement: BUDGET_ENFORCEMENT.Hard,
                      window: { kind: BUDGET_WINDOW_KINDS.Unknown, period },
                    }),
                  }),
                ),
              },
            ],
            observedAt,
          ).allowances
        : undefined
    return {
      label,
      baseUrl,
      observedAt,
      balance: accountBalanceSnapshot(
        scope,
        positions,
        observedAt,
        FINANCIAL_COVERAGE.Complete,
      ),
      allowances,
    }
  })
}
