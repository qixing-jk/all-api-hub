import { CURRENCIES } from "~/constants/money"
import {
  ACCOUNT_SITE_TYPE_VALUES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { DEV_SITE_FINANCIAL_STATES } from "~/features/DevPanel/fixtureScenarioKinds"
import {
  accountAllowanceObservation,
  ALLOWANCE_IDENTITY_KINDS,
  type AccountAllowanceSnapshot,
} from "~/services/accounts/allowances"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
} from "~/services/accounts/balanceSnapshot"
import {
  balancePosition,
  observeAmount,
  staleObservation,
  type BalancePosition,
  type BalanceSnapshot,
} from "~/services/amounts/balance"
import {
  budgetConstraint,
  staleBudgetConstraint,
} from "~/services/amounts/budgets"
import {
  ASSET_KINDS,
  BALANCE_CASH_CLASSIFICATIONS,
  BALANCE_FUNDING,
  BALANCE_LABEL_KEYS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_ENUMERATION,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import { DAHL_TOKEN_ASSET } from "~/services/apiService/dahl/constants"
import { EMRANK_TOKEN_ASSET } from "~/services/apiService/emrank/constants"
import { GRSAI_CREDIT_ASSET } from "~/services/apiService/grsai/constants"
import { parseKimiFinancialData } from "~/services/apiService/kimiOpenPlatform/balance"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"

const STANDARD_QUOTA_TYPES = new Set<AccountSiteType>([
  SITE_TYPES.ONE_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.APIYI,
  SITE_TYPES.LAOZHANG,
  SITE_TYPES.MODELFLARE,
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.ONE_HUB,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.V_API,
  SITE_TYPES.VO_API,
  SITE_TYPES.SUPER_API,
  SITE_TYPES.NEO_API,
  SITE_TYPES.WONG_GONGYI,
  SITE_TYPES.UNKNOWN,
])
const USD = { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD } as const

export type DevSiteFinancialState =
  (typeof DEV_SITE_FINANCIAL_STATES)[keyof typeof DEV_SITE_FINANCIAL_STATES]

/**
 * Offline examples of each registered account type's default financial shape.
 * Amounts are illustrative; unknown scope/nature stay unknown as in real adapters.
 * These fixtures never use a real deployment or imply a live provider observation.
 */
export function buildDevSiteFinancialScenarios(
  now: number,
  state: DevSiteFinancialState = DEV_SITE_FINANCIAL_STATES.Default,
): {
  label: string
  siteType: AccountSiteType
  baseUrl: string
  observedAt: number
  balance: BalanceSnapshot
  allowances?: AccountAllowanceSnapshot
}[] {
  if (state === DEV_SITE_FINANCIAL_STATES.Requests) {
    // The native subscription is a singleton: amount and count are alternatives.
    return buildDevSiteFinancialScenarios(now)
      .filter((example) => example.siteType === SITE_TYPES.SHAREDCHAT)
      .map((example) => ({
        ...example,
        label: `${example.siteType} · requests`,
        allowances: example.allowances && {
          ...example.allowances,
          entries: example.allowances.entries.map((entry) => ({
            ...entry,
            constraint: {
              ...entry.constraint,
              asset: {
                kind: ASSET_KINDS.Quota,
                id: "sharedchat:codex-requests",
                label: "requests",
                displayScale: 1,
                displayLabel: "requests",
              },
            },
          })),
        },
      }))
  }
  if (state !== DEV_SITE_FINANCIAL_STATES.Default) {
    const examples = buildDevSiteFinancialScenarios(
      state === DEV_SITE_FINANCIAL_STATES.Stale ? now - 3600000 : now,
    )
    return examples.map((example) => {
      const amount = (previous: BalancePosition["amount"]) => {
        if (state === DEV_SITE_FINANCIAL_STATES.Stale)
          return staleObservation(previous)
        const { amountInputs: _inputs, ...source } = previous.source
        return observeAmount(
          state === DEV_SITE_FINANCIAL_STATES.Zero ? "0" : undefined,
          {
            ...source,
            operation: `dev-fixture/${state}`,
          },
          now,
        )
      }
      return {
        ...example,
        label: `${example.siteType} · ${state}`,
        balance: {
          ...example.balance,
          coverage:
            state === DEV_SITE_FINANCIAL_STATES.Zero
              ? ("complete" as const)
              : ("partial" as const),
          positions: example.balance.positions.map((p) => ({
            ...p,
            amount: amount(p.amount),
          })),
        },
        allowances: example.allowances && {
          ...example.allowances,
          entries: example.allowances.entries.map((entry) => ({
            ...entry,
            constraint:
              state === DEV_SITE_FINANCIAL_STATES.Stale
                ? staleBudgetConstraint(entry.constraint)
                : {
                    ...entry.constraint,
                    used: amount(entry.constraint.used),
                    remaining: amount(entry.constraint.remaining),
                  },
          })),
        },
      }
    })
  }
  return ACCOUNT_SITE_TYPE_VALUES.map((siteType) => {
    const baseUrl = `https://site-balance-${siteType.toLowerCase()}.invalid`
    const scope = accountBalanceScope({ baseUrl })
    const source = {
      adapter: siteType,
      operation: "dev-fixture/balance",
      contractVersion: "1",
      kind: EVIDENCE_KINDS.Reported,
    } as const
    const position = (
      id: string,
      value: unknown,
      extra: Partial<BalancePosition> = {},
    ) =>
      balancePosition({
        id,
        value,
        scope,
        source,
        asset: USD,
        observedAt: now,
        ...extra,
      })
    let positions: BalancePosition[]
    let allowances:
      ReturnType<typeof accountAllowanceObservation>["allowances"] | undefined
    const plans = (
      periods: readonly (
        | (typeof BUDGET_PERIODS)[keyof typeof BUDGET_PERIODS]
        | typeof BUDGET_WINDOW_KINDS.Lifetime
      )[],
      asset: BalancePosition["asset"] = USD,
    ) =>
      accountAllowanceObservation(
        scope,
        [
          {
            source,
            collectionKey: "plans",
            enumeration: FINANCIAL_ENUMERATION.Complete,
            entries: periods.map((period, index) => ({
              id: `plan:${period}`,
              identityKind: ALLOWANCE_IDENTITY_KINDS.Upstream,
              collectionKey: "plans",
              label: siteType,
              validity: { kind: BALANCE_VALIDITY_KINDS.Unknown },
              constraint: budgetConstraint({
                scope,
                source,
                observedAt: now,
                asset,
                limitState: BUDGET_LIMIT_STATES.Finite,
                limit: index === 0 ? "20" : "100",
                used: index === 0 ? "12" : "35",
                remaining: index === 0 ? "8" : "65",
                enabled: true,
                window:
                  period === BUDGET_WINDOW_KINDS.Lifetime
                    ? { kind: BUDGET_WINDOW_KINDS.Lifetime }
                    : { kind: BUDGET_WINDOW_KINDS.Periodic, period },
              }),
            })),
          },
        ],
        now,
      ).allowances
    if (STANDARD_QUOTA_TYPES.has(siteType)) {
      const amount = newApiFinancialAmount("5000000", baseUrl, siteType)
      const available = position("available", amount.value, {
        asset: amount.asset,
      })
      available.amount.source = {
        ...source,
        contractVersion: amount.contractVersion,
        ...(amount.amountInputs ? { amountInputs: amount.amountInputs } : {}),
      }
      positions = [available]
    } else
      switch (siteType) {
        // Verified wallets share USD presentation, while their wire contracts
        // remain in the owning adapters (quota, cents, or direct USD).
        case SITE_TYPES.SUB2API:
          positions = [
            position("balance", "12.34", {
              collectionKey: WALLET_BALANCE_COLLECTION_KEY,
              nature: BALANCE_NATURES.Prepaid,
            }),
          ]
          positions[0]!.amount.source = {
            ...source,
            operation: "/api/v1/auth/me:balance",
            contractVersion: "usd/v1",
          }
          break
        case SITE_TYPES.AIHUBMIX:
        case SITE_TYPES.DAYA:
        case SITE_TYPES.PMAPI:
        case SITE_TYPES.AIMLAPI:
        case SITE_TYPES.REQUESTY:
        case SITE_TYPES.VERCEL_AI_GATEWAY:
        case SITE_TYPES.RIX_API:
          positions = [position("available", "12.34")]
          break
        case SITE_TYPES.OPENROUTER:
          positions = [
            position("credits", "12.34", { role: BALANCE_ROLES.Ledger }),
            position("available", "12.34", {
              parentId: "credits",
              relation: BALANCE_RELATIONS.Summary,
            }),
          ]
          break
        case SITE_TYPES.KIMI:
        case SITE_TYPES.KIMI_GLOBAL:
          positions = parseKimiFinancialData(
            { code: 0, data: { cur: -200000, voucher_cur: 1000000 } },
            scope,
            siteType === SITE_TYPES.KIMI ? CURRENCIES.CNY : CURRENCIES.USD,
            "console",
          ).balance.positions
          break
        case SITE_TYPES.CUBENCE:
          positions = [
            position("normal", "12.5", {
              labelKey: BALANCE_LABEL_KEYS.Normal,
              nature: BALANCE_NATURES.Prepaid,
              funding: BALANCE_FUNDING.Purchased,
            }),
            position("charity", "9", {
              labelKey: BALANCE_LABEL_KEYS.Charity,
              funding: BALANCE_FUNDING.Granted,
            }),
          ]
          break
        case SITE_TYPES.VO_API_V2:
          positions = [
            position("basicBalance", "2", {
              labelKey: BALANCE_LABEL_KEYS.Basic,
            }),
            position("bindBalance", "10", {
              labelKey: BALANCE_LABEL_KEYS.Bound,
            }),
          ]
          break
        case SITE_TYPES.RELAYFOR:
          positions = [
            position("permanent", "1.88", {
              labelKey: BALANCE_LABEL_KEYS.Permanent,
              nature: BALANCE_NATURES.Prepaid,
            }),
            position("timed", "3.76", { labelKey: BALANCE_LABEL_KEYS.Timed }),
          ]
          break
        case SITE_TYPES.NOVITA:
          positions = [
            position("available", "12.3", { nature: BALANCE_NATURES.Mixed }),
            position("cash", "-2", {
              role: BALANCE_ROLES.Ledger,
              nature: BALANCE_NATURES.Prepaid,
              cashClassification: BALANCE_CASH_CLASSIFICATIONS.ReportedCash,
            }),
            position("credit-limit", "20", {
              role: BALANCE_ROLES.CreditLimit,
              nature: BALANCE_NATURES.Credit,
            }),
            position("pending", "3.7", {
              role: BALANCE_ROLES.PendingCharge,
            }),
            position("debt", "2", {
              role: BALANCE_ROLES.Debt,
            }),
          ]
          break
        case SITE_TYPES.DAHL:
          {
            const asset = {
              kind: ASSET_KINDS.Quota,
              ...DAHL_TOKEN_ASSET,
            } as const
            positions = [
              position("total", "2500000", {
                asset,
                labelKey: BALANCE_LABEL_KEYS.TotalTokens,
              }),
              position("pool", "1500000", {
                asset,
                labelKey: BALANCE_LABEL_KEYS.PoolTokens,
                parentId: "total",
                relation: BALANCE_RELATIONS.Component,
              }),
              position("keys", "1000000", {
                asset,
                labelKey: BALANCE_LABEL_KEYS.AllocatedTokens,
                parentId: "total",
                relation: BALANCE_RELATIONS.Allocation,
              }),
            ]
          }
          break
        case SITE_TYPES.EMRANK:
          positions = [
            position("tokens", "2500000", {
              asset: {
                kind: ASSET_KINDS.Quota,
                ...EMRANK_TOKEN_ASSET,
              },
            }),
          ]
          break
        case SITE_TYPES.GRSAI:
          positions = [
            position("credits", "66600", {
              asset: { kind: ASSET_KINDS.Quota, ...GRSAI_CREDIT_ASSET },
            }),
          ]
          break
        case SITE_TYPES.XIAOEN: {
          const asset = {
            kind: ASSET_KINDS.Quota,
            id: `${baseUrl}:credits`,
            label: "Credits",
            displayLabel: "Credits",
            displayScale: 1,
          } as const
          positions = [
            position("total", "1250", { asset }),
            position("permanent", "1000", {
              labelKey: BALANCE_LABEL_KEYS.Permanent,
              asset,
              parentId: "total",
              relation: BALANCE_RELATIONS.Component,
            }),
            position("daily", "250", {
              labelKey: BALANCE_LABEL_KEYS.Daily,
              asset,
              parentId: "total",
              relation: BALANCE_RELATIONS.Component,
            }),
          ]
          break
        }
        case SITE_TYPES.NANOGPT:
          positions = [
            position("usd", "42.75"),
            position("xno", "1.25", {
              asset: { kind: ASSET_KINDS.Crypto, id: "XNO" },
            }),
          ]
          allowances = plans([BUDGET_PERIODS.Day, BUDGET_PERIODS.Week], {
            kind: ASSET_KINDS.Quota,
            id: "nanogpt:input-token",
            label: "Input Token",
            displayScale: 1,
            displayLabel: "Input Token",
          })
          allowances.entries.push({
            ...plans([BUDGET_PERIODS.Day], {
              kind: ASSET_KINDS.Quota,
              id: "nanogpt:image",
              label: "Image",
              displayScale: 1,
              displayLabel: "Image",
            }).entries[0]!,
            id: "dailyImages",
          })
          break
        case SITE_TYPES.FREEMODEL:
          positions = [
            position("available", "17.34"),
            position("paid", "12.34", {
              parentId: "available",
              relation: BALANCE_RELATIONS.Component,
              funding: BALANCE_FUNDING.Purchased,
            }),
            position("signup", "5", {
              parentId: "available",
              relation: BALANCE_RELATIONS.Component,
              funding: BALANCE_FUNDING.Granted,
            }),
          ]
          allowances = plans([BUDGET_PERIODS.FiveHours, BUDGET_PERIODS.Week])
          break
        case SITE_TYPES.FOXCODE:
          positions = []
          allowances = plans([
            BUDGET_PERIODS.Day,
            BUDGET_PERIODS.Week,
            BUDGET_PERIODS.Month,
            BUDGET_PERIODS.Year,
            BUDGET_WINDOW_KINDS.Lifetime,
          ])
          break
        case SITE_TYPES.SHAREDCHAT: {
          positions = []
          allowances = plans([BUDGET_PERIODS.Day])
          break
        }
        case SITE_TYPES.KRILL:
          positions = [position("available", "12.34")]
          allowances = plans([BUDGET_PERIODS.Day])
          break
        case SITE_TYPES.RIGHT_CODE:
          positions = [position("available", "12.34")]
          allowances = plans([BUDGET_PERIODS.Day])
          break
        default:
          throw new Error(`No native balance fixture for ${siteType}`)
      }
    return {
      label: siteType,
      siteType,
      baseUrl,
      observedAt: now,
      balance: accountBalanceSnapshot(
        scope,
        positions,
        now,
        FINANCIAL_COVERAGE.Complete,
      ),
      allowances,
    }
  })
}
